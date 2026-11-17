"""라우터가 함께 쓰는 의존성.

app.state에 들어 있는 것 (main.create_app이 넣는다)
    settings   Settings
    store      Store (메모리 또는 Postgres)
    upstream   UpstreamClient
    weather    WeatherService
    metrics    Metrics
    limiter    RateLimiter

require_user: 로그인(손님 포함)한 요청만 통과시키고 Ctx를 돌려준다.
    - 세션이 없으면 401.
    - 하는 김에 마지막 활동 시각을 갱신하고, 10분에 한 번 정리 작업을 돌린다.
      (Render 무료는 정해진 시각 작업이 없어 "요청이 올 때" 정리한다: docs/03 5.3)
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, Request

from app.config import Settings
from app.errors import ApiError
from app.security.session import owner_id, read_session
from app.services.metrics import Metrics
from app.services.upstream import UpstreamClient
from app.services.weather import WeatherService
from app.store.base import Store, StoreError

KST = timezone(timedelta(hours=9))
CLEANUP_INTERVAL_SECONDS = 600


def now_kst() -> datetime:
    """날짜 계산은 항상 한국 시각 기준(llm-chatbot과 같다)."""
    return datetime.now(KST)


def today_text() -> str:
    """프롬프트에 넣는 오늘 날짜. 요일을 붙여 "다음 주 금요일" 계산을 돕는다."""
    now = now_kst()
    return f"{now:%Y-%m-%d} ({'월화수목금토일'[now.weekday()]}요일)"


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_upstream(request: Request) -> UpstreamClient:
    return request.app.state.upstream


def get_weather(request: Request) -> WeatherService:
    return request.app.state.weather


def get_metrics(request: Request) -> Metrics:
    return request.app.state.metrics


@dataclass
class Ctx:
    """요청 한 번의 "누구인가"."""

    session: dict[str, Any]
    owner: str

    @property
    def upstream(self) -> dict | None:
        """세션에 든 업스트림 정보 {"url", "key", "models"} 또는 None."""
        up = self.session.get("up")
        return up if isinstance(up, dict) and up.get("url") else None


def _maybe_cleanup(request: Request) -> None:
    state = request.app.state
    now = time.monotonic()
    if now - getattr(state, "last_cleanup", 0.0) < CLEANUP_INTERVAL_SECONDS:
        return
    state.last_cleanup = now
    state.store.cleanup()
    state.limiter.sweep()


def optional_user(request: Request) -> Ctx | None:
    """세션이 있으면 Ctx, 없으면 None. (/api/me처럼 로그인 전에도 부르는 곳에서 쓴다)"""
    settings: Settings = request.app.state.settings
    session = read_session(request, settings)
    if session is None:
        return None
    owner = owner_id(session)
    store: Store = request.app.state.store
    if not store.touch(owner):
        # 쿠키는 유효한데 데이터가 없다: 서버가 재시작했거나(메모리 저장소) 정리 작업이 지웠다.
        # 빈 상태로 다시 만든다. 화면에는 태스크가 없는 것으로 보인다.
        store.ensure_owner(owner, session.get("name") or "손님")
    _maybe_cleanup(request)
    return Ctx(session=session, owner=owner)


def require_user(ctx: Ctx | None = Depends(optional_user)) -> Ctx:
    if ctx is None:
        raise ApiError(401, "not_signed_in", "먼저 이름을 적고 시작해 주세요.")
    return ctx


def require_upstream(ctx: Ctx = Depends(require_user)) -> Ctx:
    """Colab 연결이 필요한 기능(대화, 추출, 요약)에서 쓴다."""
    if ctx.upstream is None:
        raise ApiError(409, "upstream_not_connected", "Colab에 연결되지 않았어요. 오른쪽 상태창에서 주소와 접속 키를 넣어 주세요.")
    return ctx


def store_error(exc: StoreError) -> ApiError:
    """저장소 규칙 오류를 API 오류로 바꾼다."""
    return ApiError(exc.status, exc.code, exc.message)
