"""대화와 추출: /api/chat (SSE), /api/extract.

데이터 흐름 (docs/03 6.1)
    브라우저 → (최근 대화) → 서버 → (시스템 프롬프트 + 등록된 할 일 + 대화) → 사용자의 Colab
    Colab → (토큰 스트림) → 서버 → (SSE answer 이벤트) → 브라우저

지키는 것
    - 대화 본문을 DB에도 로그에도 쓰지 않는다(D-08). 지표에는 시간과 글자 수만 남긴다.
    - 화면이 보낸 messages는 user/assistant만 받는다(system 역할을 화면이 넣지 못하게).
    - 개수·길이를 자른다(자원 고갈 방지, docs/05 6장).

SSE 이벤트 (API 계약)
    data: {"type": "answer", "text": "..."}   답 조각
    data: {"type": "done"}                     끝
    data: {"type": "error", "message": "..."}  실패 (그때까지 받은 답은 화면에 남는다)
"""

from __future__ import annotations

import json
import time
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.deps import Ctx, get_metrics, get_settings, get_store, get_upstream, require_upstream, today_text
from app.errors import ApiError
from app.prompts.chat import build_chat_messages
from app.prompts.extract import EXTRACT_SCHEMA, build_extract_messages
from app.services.extraction import parse_and_validate
from app.services.metrics import Metrics
from app.services.upstream import UpstreamClient, UpstreamError
from app.store.base import Store

router = APIRouter()

EXTRACT_CONTEXT_MESSAGES = 12  # 추출에는 최근 몇 줄만 쓴다


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20000)


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[Message] = Field(min_length=1, max_length=400)
    temperature: float | None = Field(default=None, ge=0.0, le=1.5)
    max_tokens: int | None = Field(default=None, ge=50, le=2000)
    model: str | None = Field(default=None, max_length=200)


class ExtractIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[Message] = Field(min_length=1, max_length=400)


def trim_messages(messages: list[Message], settings: Settings, keep: int | None = None) -> list[dict]:
    """빈 내용을 빼고, 최근 것만 남기고, 한 줄 길이를 자른다."""
    keep = keep or settings.max_messages
    out = [{"role": m.role, "content": m.content.strip()[: settings.max_message_chars]} for m in messages if m.content.strip()]
    return out[-keep:]


def pick_model(ctx: Ctx, requested: str | None, prefs_model: str | None) -> str | None:
    """업스트림이 알려 준 모델 목록 안에서만 고른다. 목록에 없는 이름은 무시한다."""
    models = (ctx.upstream or {}).get("models") or []
    for candidate in (requested, prefs_model):
        if candidate and candidate in models:
            return candidate
    return models[0] if models else None


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/api/chat")
async def chat(
    body: ChatIn,
    ctx: Ctx = Depends(require_upstream),
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    upstream: UpstreamClient = Depends(get_upstream),
    metrics: Metrics = Depends(get_metrics),
):
    dialog = trim_messages(body.messages, settings)
    if not dialog:
        raise ApiError(422, "empty_message", "보낼 말을 적어 주세요.")

    prefs_llm = store.get_prefs(ctx.owner).get("llm") or {}
    temperature = body.temperature if body.temperature is not None else prefs_llm.get("temperature", 0.6)
    max_tokens = body.max_tokens if body.max_tokens is not None else prefs_llm.get("max_tokens", 400)
    model = pick_model(ctx, body.model, prefs_llm.get("model"))

    # 등록된 할 일 중 아직 안 끝난 것의 제목만 프롬프트에 넣는다(R-CHAT-7)
    open_titles = [t["title"] for t in store.list_tasks(ctx.owner) if not t["completed"] and not t["archived"]]
    messages = build_chat_messages(dialog, name=ctx.session.get("name"), today=today_text(), open_task_titles=open_titles)
    up = ctx.upstream

    async def event_stream():
        started = time.perf_counter()
        first: float | None = None
        chars = 0
        status = "ok"
        try:
            async for piece in upstream.stream_chat(up["url"], up["key"], messages, model=model, temperature=temperature, max_tokens=max_tokens):
                if first is None:
                    first = time.perf_counter()
                chars += len(piece)
                yield _sse({"type": "answer", "text": piece})
            yield _sse({"type": "done"})
        except UpstreamError as exc:
            status = exc.kind
            yield _sse({"type": "error", "message": exc.message})
        except Exception:  # noqa: BLE001 - 스트림 중간의 예상 못 한 오류도 화면에는 안내만 보낸다
            status = "server_error"
            yield _sse({"type": "error", "message": "서버에서 문제가 생겼습니다."})
        finally:
            total_ms = int((time.perf_counter() - started) * 1000)
            ttfb_ms = int((first - started) * 1000) if first else None
            # 토큰 수는 업스트림이 스트림에서 알려 주지 않아 글자 수로 대략 잡는다(한국어 1토큰 ≈ 1.5자)
            metrics.record("chat", status=status, ttfb_ms=ttfb_ms, total_ms=total_ms, tokens_out=int(chars / 1.5) or None)

    headers = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}  # 프록시가 스트림을 모아 두지 않게
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


@router.post("/api/extract")
async def extract(
    body: ExtractIn,
    ctx: Ctx = Depends(require_upstream),
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    upstream: UpstreamClient = Depends(get_upstream),
    metrics: Metrics = Depends(get_metrics),
):
    """최근 대화에서 할 일 후보와 완료 신호를 뽑는다. 결과는 "제안"이다(P-06)."""
    dialog = trim_messages(body.messages, settings, keep=EXTRACT_CONTEXT_MESSAGES)
    if not dialog:
        return {"candidates": [], "completions": []}
    tasks = store.list_tasks(ctx.owner)  # 이 사용자의 것만. 소유 검사의 기준이 된다.
    messages = build_extract_messages(dialog, tasks, today_text())
    model = pick_model(ctx, None, (store.get_prefs(ctx.owner).get("llm") or {}).get("model"))
    up = ctx.upstream
    started = time.perf_counter()
    try:
        # 온도를 낮게: 같은 대화에서 같은 결과가 나와야 한다
        raw = await upstream.complete(up["url"], up["key"], messages, model=model, temperature=0.1, max_tokens=900, response_schema=EXTRACT_SCHEMA)
    except UpstreamError as exc:
        metrics.record("extract", status=exc.kind, total_ms=int((time.perf_counter() - started) * 1000))
        raise ApiError(400 if exc.kind == "rejected_url" else 502, exc.kind, exc.message) from None
    result = parse_and_validate(raw, tasks)
    # 아무것도 못 읽은 경우를 지표로 구분한다(형식 오류율을 보려고). 빈 대화의 빈 결과와 섞이지 않게 raw로 판단.
    readable = raw.strip().startswith("{") or "```" in raw or "{" in raw
    metrics.record("extract", status="ok" if readable else "bad_json", total_ms=int((time.perf_counter() - started) * 1000))
    return result
