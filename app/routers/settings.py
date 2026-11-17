"""설정: /api/settings, /api/settings/upstream, /api/greeting.

업스트림 주소와 접속 키 (D-04, D-22)
    - 사용자마다 자기 Colab 주소와 접속 키를 넣는다.
    - 검사(url_guard) → 연결 확인(/v1/models) → 통과하면 "암호화한 세션 쿠키"에 넣는다.
    - DB에 저장하지 않는다. 화면에도 돌려주지 않는다(연결 여부와 모델 이름만).
    - 대화를 보낼 때마다 주소를 다시 검사한다(services/upstream.py).

설정값 범위는 화면에서도 막지만 여기서 다시 검사한다(화면은 믿지 않는다).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.deps import Ctx, get_metrics, get_settings, get_store, get_upstream, get_weather, now_kst, require_user, store_error
from app.errors import ApiError
from app.routers.common import LANGS, me_payload
from app.security.session import write_session
from app.security.url_guard import UrlRejected, validate_upstream_url
from app.services.metrics import Metrics
from app.services.upstream import UpstreamClient, UpstreamError
from app.services.weather import CITIES, WeatherService
from app.store.base import Store, StoreError

router = APIRouter()

MAX_MODELS_IN_COOKIE = 8  # 쿠키 크기(4KB) 때문에 모델 이름은 몇 개만 둔다


class VoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    gender: Literal["female", "male"] | None = None
    voice: str | None = Field(default=None, max_length=120)
    rate: float | None = Field(default=None, ge=0.5, le=2.0)
    pitch: float | None = Field(default=None, ge=0.0, le=2.0)
    volume: float | None = Field(default=None, ge=0.0, le=1.0)
    echo: float | None = Field(default=None, ge=0.0, le=1.0)
    sentence_stream: bool | None = None
    stop_on_typing: bool | None = None


class LlmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    temperature: float | None = Field(default=None, ge=0.0, le=1.5)
    max_tokens: int | None = Field(default=None, ge=50, le=2000)
    model: str | None = Field(default=None, max_length=200)


class FeaturesIn(BaseModel):
    """D-16: null(아직 묻지 않음) → true(연결) / false(나중에)."""

    model_config = ConfigDict(extra="forbid")
    calendar: bool | None = None
    diary_google: bool | None = None
    task_sheet: bool | None = None


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lang: str | None = None
    city: str | None = None
    voice: VoiceIn | None = None
    llm: LlmIn | None = None
    features: FeaturesIn | None = None


class UpstreamIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(max_length=300)
    key: str = Field(default="", max_length=200)


@router.put("/api/settings")
def update_settings(body: SettingsIn, ctx: Ctx = Depends(require_user), settings: Settings = Depends(get_settings), store: Store = Depends(get_store)):
    patch: dict = {}
    if body.lang is not None:
        if body.lang not in LANGS:
            raise ApiError(422, "invalid_lang", "지원하지 않는 언어입니다.")
        patch["lang"] = body.lang
    if body.city is not None:
        if body.city not in CITIES:
            raise ApiError(422, "invalid_city", "고를 수 없는 도시입니다.")
        patch["city"] = body.city
    # exclude_unset: 화면이 보낸 칸만 바꾼다. (model을 null로 보내면 "기본 모델"로 되돌린다는 뜻)
    for key in ("voice", "llm", "features"):
        part = getattr(body, key)
        if part is not None:
            patch[key] = part.model_dump(exclude_unset=True)
    try:
        store.update_prefs(ctx.owner, patch)
    except StoreError as exc:
        raise store_error(exc) from None
    return me_payload(ctx, settings, store)


@router.put("/api/settings/upstream")
async def connect_upstream(
    body: UpstreamIn,
    response: Response,
    ctx: Ctx = Depends(require_user),
    settings: Settings = Depends(get_settings),
    upstream: UpstreamClient = Depends(get_upstream),
    metrics: Metrics = Depends(get_metrics),
):
    """주소 검사 → 연결 확인 → 세션 쿠키에 저장."""
    try:
        url = await validate_upstream_url(body.url, settings, upstream._resolver)  # noqa: SLF001 (같은 검사기를 쓴다)
    except UrlRejected as exc:
        metrics.record("upstream_check", status="rejected_url")
        raise ApiError(400, exc.code, exc.message) from None
    try:
        models, latency_ms = await upstream.list_models(url, body.key)
    except UpstreamError as exc:
        metrics.record("upstream_check", status=exc.kind)
        status = 400 if exc.kind == "rejected_url" else 502
        raise ApiError(status, exc.kind, exc.message) from None

    models = models[:MAX_MODELS_IN_COOKIE]
    session = {**ctx.session, "up": {"url": url, "key": body.key, "models": models}}
    write_session(response, settings, session)
    metrics.record("upstream_check", total_ms=latency_ms)
    return {"connected": True, "models": models, "latency_ms": latency_ms}


@router.delete("/api/settings/upstream", status_code=204)
def disconnect_upstream(ctx: Ctx = Depends(require_user), settings: Settings = Depends(get_settings)):
    response = Response(status_code=204)
    write_session(response, settings, {**ctx.session, "up": None})
    return response


def _greeting_text(name: str | None, hour: int, weather: dict | None) -> str:
    """시각·날씨에 맞춘 다정한 첫 인사 (R-GREET-1). LLM을 부르지 않고 서버가 만든다:
    Colab이 연결되기 전에도 인사할 수 있어야 하기 때문이다."""
    who = f"{name}님, " if name else ""
    if 5 <= hour < 11:
        hello = f"{who}좋은 아침이에요."
        ask = "오늘은 어떤 하루가 될 것 같아요?"
    elif 11 <= hour < 17:
        hello = f"{who}안녕하세요."
        ask = "오늘 하루는 어떻게 흘러가고 있어요?"
    elif 17 <= hour < 22:
        hello = f"{who}오늘 하루도 수고 많았어요."
        ask = "오늘은 어땠어요?"
    else:
        hello = f"{who}늦은 시간까지 고생했어요."
        ask = "오늘은 어땠어요?"
    middle = f" 지금 {weather['city']}은 {weather['desc']}, {weather['temp_c']:.0f}도예요." if weather else ""
    return f"{hello}{middle} {ask}"


@router.get("/api/greeting")
async def greeting(ctx: Ctx = Depends(require_user), settings: Settings = Depends(get_settings), store: Store = Depends(get_store), weather: WeatherService = Depends(get_weather)):
    now = now_kst()
    city = store.get_prefs(ctx.owner).get("city", settings.weather_default_city)
    current = await weather.current(city)
    return {"now": now.isoformat(timespec="seconds"), "weather": current, "text": _greeting_text(ctx.session.get("name"), now.hour, current)}
