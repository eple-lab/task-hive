"""일기: /api/diary/summary.

흐름 (R-DIARY-2, docs/03 6.5)
    1. 화면이 오늘 대화를 보낸다.
    2. 서버는 저장하지 않고 사용자의 Colab에 요약을 맡긴다.
    3. 요약을 화면으로 돌려준다. 화면이 "오늘은 이런 일이 있었네요"와 "등록해 / 나중에"를 보여 준다.

아직 안 된 것 (2단계)
    - /api/diary/save: 구글 시트·Docs에 저장 (D-15). → stubs.py
    - /api/diary/recent: 최근 3일 요약 (R-GREET-2). → stubs.py
    - 지금은 화면이 요약을 MD 파일로 내려받게 한다(손님과 같은 방식, R-DIARY-6).
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.deps import Ctx, get_metrics, get_settings, get_store, get_upstream, require_upstream, today_text
from app.errors import ApiError
from app.prompts.diary import DIARY_SCHEMA, build_diary_messages
from app.routers.chat import Message, pick_model, trim_messages
from app.services.extraction import parse_diary
from app.services.metrics import Metrics
from app.services.upstream import UpstreamClient, UpstreamError
from app.store.base import Store

router = APIRouter()


class DiaryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[Message] = Field(min_length=1, max_length=400)


@router.post("/api/diary/summary")
async def diary_summary(
    body: DiaryIn,
    ctx: Ctx = Depends(require_upstream),
    settings: Settings = Depends(get_settings),
    store: Store = Depends(get_store),
    upstream: UpstreamClient = Depends(get_upstream),
    metrics: Metrics = Depends(get_metrics),
):
    dialog = trim_messages(body.messages, settings)
    if not any(m["role"] == "user" for m in dialog):
        raise ApiError(422, "empty_dialog", "아직 나눈 이야기가 없어요. 조금 이야기한 뒤에 다시 눌러 주세요.")
    messages = build_diary_messages(dialog, today_text())
    model = pick_model(ctx, None, (store.get_prefs(ctx.owner).get("llm") or {}).get("model"))
    up = ctx.upstream
    started = time.perf_counter()
    try:
        raw = await upstream.complete(up["url"], up["key"], messages, model=model, temperature=0.3, max_tokens=900, response_schema=DIARY_SCHEMA)
    except UpstreamError as exc:
        metrics.record("diary", status=exc.kind, total_ms=int((time.perf_counter() - started) * 1000))
        raise ApiError(400 if exc.kind == "rejected_url" else 502, exc.kind, exc.message) from None
    result = parse_diary(raw)
    elapsed = int((time.perf_counter() - started) * 1000)
    if result is None:
        metrics.record("diary", status="bad_json", total_ms=elapsed)
        raise ApiError(502, "bad_summary", "일기를 정리하지 못했어요. 한 번 더 눌러 주세요.")
    metrics.record("diary", total_ms=elapsed)
    return result
