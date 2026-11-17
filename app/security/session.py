"""암호화한 세션 쿠키.

이 파일이 하는 일
    - 세션 내용을 JSON으로 만들어 Fernet으로 "암호화"한 뒤 쿠키 하나에 넣는다.
    - 서버는 세션을 따로 저장하지 않는다(Render 무료는 재시작하면 메모리가 사라진다).

왜 서명이 아니라 암호화인가 (docs/05 4.2)
    - honey-voice-log는 서명만 해서 쿠키에 사용자 ID와 이름만 넣었다.
    - Task Hive는 쿠키에 업스트림 주소와 접속 키를 넣는다(D-04, D-22: DB에 저장하지 않음).
      서명만 하면 브라우저에서 내용이 읽히므로 반드시 암호화한다.

쿠키 속성
    HttpOnly  화면의 자바스크립트가 읽지 못한다
    SameSite=Lax  다른 사이트에서 보낸 변경 요청에 쿠키가 실리지 않는다
    Secure    운영(https)에서만 켠다. localhost(http)에서는 꺼야 동작한다

세션 내용 (짧은 키 이름: 쿠키 크기 제한 4KB)
    sid   무작위 세션 ID (손님을 구분하는 유일한 값)
    mode  "guest" | "google"(2단계)
    name  부를 이름
    up    {"url": 업스트림 주소, "key": 접속 키, "models": [모델 이름]} 또는 없음
    iat   만든 시각(초)

아직 안 된 것
    - 구글 로그인 세션(mode="google")은 2단계에서 만든다.
"""

from __future__ import annotations

import json
import secrets
import time
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Request, Response

from app.config import Settings

COOKIE_NAME = "th_session"


def new_guest_session(name: str) -> dict[str, Any]:
    return {"sid": secrets.token_hex(16), "mode": "guest", "name": name, "up": None, "iat": int(time.time())}


def _ttl_seconds(settings: Settings, mode: str) -> int:
    """손님은 24시간(D-07), 로그인 사용자는 8시간."""
    hours = settings.guest_ttl_hours if mode == "guest" else settings.session_hours
    return hours * 3600


def read_session(request: Request, settings: Settings) -> dict[str, Any] | None:
    """쿠키를 풀어 세션을 돌려준다. 없거나 변조됐거나 만료됐으면 None."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        raw = Fernet(settings.session_fernet_key).decrypt(token.encode())
        data = json.loads(raw)
    except (InvalidToken, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("sid"), str) or data.get("mode") not in ("guest", "google"):
        return None
    iat = data.get("iat")
    if not isinstance(iat, int) or time.time() - iat > _ttl_seconds(settings, data["mode"]):
        return None
    return data


def write_session(response: Response, settings: Settings, data: dict[str, Any], *, refresh: bool = True) -> None:
    """세션을 암호화해 쿠키로 내려 준다. refresh=True면 만든 시각을 지금으로 바꿔 수명을 늘린다."""
    if refresh:
        data = {**data, "iat": int(time.time())}
    token = Fernet(settings.session_fernet_key).encrypt(json.dumps(data, ensure_ascii=False).encode()).decode()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=_ttl_seconds(settings, data.get("mode", "guest")),
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
        path="/",
    )


def clear_session(response: Response, settings: Settings) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=settings.is_production)


def owner_id(session: dict[str, Any]) -> str:
    """저장소에서 "누구의 데이터인가"를 가리키는 값. 손님은 guest:<세션 ID>."""
    return f"{session['mode']}:{session['sid']}"
