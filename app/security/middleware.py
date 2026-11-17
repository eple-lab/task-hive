"""모든 요청이 지나는 문: 보안 헤더, CSRF, 요청 크기·횟수 제한.

순서
    1. 요청 크기 제한 (Content-Length 기준)
    2. 요청 횟수 제한 (/api, /auth만. 대화·추출은 더 엄격하게)
    3. CSRF 검사 (GET·HEAD·OPTIONS가 아닌 요청)
    4. 라우터 실행
    5. 보안 헤더 붙이기

CSRF 방어 (docs/05 4.3, honey-voice-log 방식)
    - 쿠키 SameSite=Lax
    - 사용자 정의 헤더 `X-TH: 1` 필수: 다른 사이트의 <form>은 이 헤더를 붙일 수 없다.
    - Origin 헤더가 있으면 우리 주소와 같아야 한다.

CSP에서 style-src에 'unsafe-inline'을 둔 이유
    - React가 요소의 style 속성으로 벌집 좌표·꿀 높이를 넣는다. 스크립트는 인라인을 허용하지 않는다.

주의: 여기서 돌려주는 오류도 API 계약의 모양({"error": {...}})을 따른다.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import FastAPI, Request

from app.config import Settings
from app.errors import error_response
from app.security.rate_limit import RateLimiter, client_ip

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-th"

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


def _origin_allowed(request: Request, settings: Settings) -> bool:
    """Origin 헤더가 없으면 통과(브라우저가 아닌 호출), 있으면 우리 주소여야 한다."""
    origin = request.headers.get("origin")
    if not origin:
        return True
    if origin == settings.public_origin:
        return True
    if not settings.is_production:
        if origin in settings.dev_extra_origins:  # Vite 개발 서버
            return True
        # 개발에서는 포트를 바꿔 켜는 일이 많아, 요청이 온 Host와 같으면 허용
        host = request.headers.get("host", "")
        return urlsplit(origin).netloc == host
    return False


def _limit_group(path: str, settings: Settings) -> tuple[str, int] | None:
    if path.startswith("/api/chat") or path.startswith("/api/diary"):
        return "chat", settings.rate_limit_chat_per_min
    if path.startswith("/api/extract"):
        return "extract", settings.rate_limit_extract_per_min
    if path.startswith("/api/") or path.startswith("/auth/"):
        return "general", settings.rate_limit_general_per_min
    return None


def install_security_middleware(app: FastAPI, settings: Settings, limiter: RateLimiter) -> None:
    @app.middleware("http")
    async def _security(request: Request, call_next):
        path = request.url.path

        # 1. 요청 크기
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_body_bytes:
            response = error_response(413, "too_large", "요청이 너무 큽니다.")
            return _with_headers(response, settings, path)

        # 2. 요청 횟수
        group = _limit_group(path, settings)
        if group and not limiter.allow(f"{group[0]}:{client_ip(request)}", group[1]):
            getattr(request.app.state, "metrics").record("security", status="rate_limited")
            response = error_response(429, "rate_limited", "요청이 너무 많아요. 잠시 뒤에 다시 해 주세요.")
            return _with_headers(response, settings, path)

        # 3. CSRF
        if request.method not in SAFE_METHODS:
            if request.headers.get(CSRF_HEADER) != "1" or not _origin_allowed(request, settings):
                getattr(request.app.state, "metrics").record("security", status="csrf_rejected")
                response = error_response(403, "csrf_rejected", "요청을 확인할 수 없습니다. 화면을 새로고침해 주세요.")
                return _with_headers(response, settings, path)

        response = await call_next(request)
        return _with_headers(response, settings, path)


def _with_headers(response, settings: Settings, path: str):
    h = response.headers
    h["Content-Security-Policy"] = CSP
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "no-referrer"
    # 마이크는 2단계(STT)에서 자기 사이트만 허용으로 바꾼다
    h["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    if settings.is_production:
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if path.startswith("/api/") or path.startswith("/auth/"):
        # 개인 데이터가 든 응답을 중간 서버나 브라우저가 저장하지 않게
        h["Cache-Control"] = "no-store"
    return response
