"""상태 확인과 지표: /health, /api/metrics/client, /api/admin/metrics.

/health
    - Render 헬스 체크용. 로그인 없이 열려 있고 개인 정보가 없다.

/api/metrics/client
    - TTS 지연처럼 브라우저에서만 알 수 있는 숫자를 받는다. 종류와 범위를 검사한다(docs/08 7.2).

/api/admin/metrics (docs/08 7.3)
    - 지금은 개발(APP_ENV=development)에서만 열린다. 그 밖에는 "없는 주소"(404)로 보인다.
    - 3단계에서 구글 로그인 + ADMIN_SUB_HASHES 검사로 바꾼다(P-15).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.deps import Ctx, get_metrics, get_settings, require_user
from app.errors import ApiError
from app.services.metrics import Metrics

router = APIRouter()


class ClientMetricIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["client_tts", "client_render"]
    ms: int = Field(ge=0, le=600_000)


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/api/metrics/client", status_code=204)
def client_metric(body: ClientMetricIn, _: Ctx = Depends(require_user), metrics: Metrics = Depends(get_metrics)):
    metrics.record(body.kind, total_ms=body.ms)
    return Response(status_code=204)


@router.get("/api/admin/metrics")
def admin_metrics(hours: int = Query(default=24, ge=1, le=720), settings: Settings = Depends(get_settings), metrics: Metrics = Depends(get_metrics)):
    if settings.is_production:
        raise ApiError(404, "not_found", "찾을 수 없습니다.")
    return metrics.summary(hours)
