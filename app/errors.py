"""오류 응답 모양 통일.

API 계약: 모든 오류는 HTTP 상태 + {"error": {"code": "...", "message": "한국어 안내"}}

원칙 (docs/05 7장 "정보 노출")
    - 예상한 오류(ApiError)만 내용을 보여 준다.
    - 예상 못 한 오류는 "서버에서 문제가 생겼습니다."만 보여 주고, 로그에는 오류 종류만 남긴다.
      (요청 본문·대화·토큰이 로그에 들어가지 않게)
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("taskhive")


class ApiError(Exception):
    """사용자에게 보여 줘도 되는 오류."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(error_body(code, message), status_code=status)


_HTTP_MESSAGES = {
    404: ("not_found", "찾을 수 없습니다."),
    405: ("method_not_allowed", "허용되지 않는 요청 방식입니다."),
}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        # 어떤 칸이 틀렸는지만 알려 준다. 입력값 자체는 되돌려 주지 않는다.
        fields = sorted({".".join(str(p) for p in e.get("loc", ())[1:]) for e in exc.errors()})
        detail = ", ".join(f for f in fields if f) or "요청"
        return error_response(422, "invalid_request", f"입력값을 확인해 주세요: {detail}")

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code, message = _HTTP_MESSAGES.get(exc.status_code, ("http_error", "요청을 처리할 수 없습니다."))
        return error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        log.error("unexpected error: %s", type(exc).__name__)  # 내용은 남기지 않는다
        return error_response(500, "server_error", "서버에서 문제가 생겼습니다.")
