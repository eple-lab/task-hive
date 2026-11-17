"""앱 조립.

실행
    python -m uvicorn app.main:create_app --factory --port 8000
    (환경변수 파일을 쓰려면 --env-file .env 를 붙인다)

create_app이 하는 일
    1. 설정을 읽는다(운영에서 비밀값이 없으면 여기서 멈춘다).
    2. 저장소, 업스트림 클라이언트, 날씨, 지표, 요청 제한기를 만들어 app.state에 넣는다.
    3. 보안 미들웨어와 오류 처리기를 건다.
    4. 라우터를 등록한다.
    5. 화면 빌드 결과(frontend/dist)가 있으면 내준다.

테스트는 create_app에 settings, upstream_transport, resolver, weather_transport를 넘겨
실제 네트워크 없이 돌린다(tests/conftest.py).

/docs, /openapi.json은 끈다(서버 정보 노출 방지, docs/05 7장).
"""

from __future__ import annotations

import logging
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse

from app.config import Settings, load_settings
from app.errors import error_response, install_error_handlers
from app.routers import admin, auth, chat, diary, export, settings as settings_router, stubs, tasks
from app.security.middleware import install_security_middleware
from app.security.rate_limit import RateLimiter
from app.security.url_guard import Resolver
from app.services.metrics import Metrics
from app.services.upstream import UpstreamClient
from app.services.weather import WeatherService
from app.store import create_store

log = logging.getLogger("taskhive")


def create_app(
    settings: Settings | None = None,
    *,
    upstream_transport: httpx.AsyncBaseTransport | None = None,
    resolver: Resolver | None = None,
    weather_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    settings = settings or load_settings()

    app = FastAPI(title="Task Hive", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.store = create_store(settings)
    app.state.upstream = UpstreamClient(settings, transport=upstream_transport, resolver=resolver)
    app.state.weather = WeatherService(transport=weather_transport)
    app.state.metrics = Metrics()
    app.state.limiter = RateLimiter()
    app.state.last_cleanup = 0.0

    if settings.ephemeral_secrets:
        # 값은 찍지 않고 이름만 알린다
        log.warning("개발용 임시 비밀값을 만들었습니다(서버를 다시 켜면 세션이 풀립니다): %s", ", ".join(settings.ephemeral_secrets))

    install_error_handlers(app)
    install_security_middleware(app, settings, app.state.limiter)

    for module in (admin, auth, settings_router, chat, tasks, diary, export, stubs):
        app.include_router(module.router)

    _mount_frontend(app, settings)
    return app


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    """화면(React 빌드 결과)을 내준다. 빌드 전이면 안내만 돌려준다.

    React는 한 페이지 앱이라, /admin 같은 화면 주소로 바로 들어와도 index.html을 내줘야 한다.
    /api, /auth로 시작하는 없는 주소는 화면이 아니라 404 JSON을 돌려준다.
    """
    dist = Path(settings.frontend_dist).resolve()
    index = dist / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith(("api/", "auth/")) or path in ("api", "auth"):
            return error_response(404, "not_found", "찾을 수 없습니다.")
        if not index.is_file():
            return JSONResponse(
                {
                    "status": "frontend_not_built",
                    "message": "화면이 아직 빌드되지 않았습니다. frontend/ 에서 npm ci 후 npm run build 를 실행해 주세요.",
                }
            )
        if path:
            target = (dist / path).resolve()
            # dist 폴더 밖의 파일을 내주지 않는다(../ 같은 경로 막기)
            if target.is_file() and dist in target.parents:
                return FileResponse(target)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
