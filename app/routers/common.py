"""라우터가 함께 쓰는 것: /api/me 응답 만들기, 기본 설정값.

설정이 저장되는 곳 (eple 결정, 2026-11-17)
    - "한 번 설정한 것은 DB에 저장한다. DB에 없으면 브라우저."
    - 서버: 저장소의 prefs(손님 행 / 사용자 행). 메모리 저장소는 서버가 꺼지면 사라진다.
    - 화면: 서버 값이 없을 때를 대비해 브라우저에도 화면 설정을 둔다(프론트 담당).

features의 값 (D-16)
    null   아직 묻지 않았다 → 화면은 토글을 "켜진 모습"으로 보여 주고 "연결할까요?"를 묻는다
    true   사용자가 연결했다
    false  사용자가 "나중에"를 눌렀거나 껐다
    서버는 true여도 실제 권한이 없으면 구글을 부르지 않는다(구글 연동은 2단계).
"""

from __future__ import annotations

from app.config import Settings
from app.deps import Ctx
from app.store.base import Store

DEFAULT_VOICE = {
    "enabled": True,       # 말하기 켬·끔 (R-CHAT-2)
    "gender": "female",    # "female" | "male" (R-PANEL-2)
    "voice": None,         # 브라우저 음성 이름. null이면 화면이 고른다
    "rate": 1.0,           # 속도
    "pitch": 1.0,          # 저음(낮을수록 굵다)
    "volume": 1.0,
    "echo": 0.0,           # Colab TTS가 붙은 뒤에만 쓴다 (D-03)
    "sentence_stream": True,   # 문장마다 바로 읽기
    "stop_on_typing": True,    # 내가 입력하면 멈추기
}
DEFAULT_LLM = {"temperature": 0.6, "max_tokens": 400, "model": None}
DEFAULT_FEATURES = {"calendar": None, "diary_google": None, "task_sheet": None}
LANGS = ("ko", "en", "ja", "zh", "es")


def me_payload(ctx: Ctx | None, settings: Settings, store: Store) -> dict:
    """GET /api/me 응답. 로그인 전에는 mode="none"."""
    prefs = store.get_prefs(ctx.owner) if ctx else {}
    up = ctx.upstream if ctx else None
    return {
        "mode": ctx.session["mode"] if ctx else "none",
        "name": ctx.session.get("name") if ctx else None,
        "lang": prefs.get("lang", "ko"),
        "city": prefs.get("city", settings.weather_default_city),
        "settings": {
            "voice": {**DEFAULT_VOICE, **(prefs.get("voice") or {})},
            "llm": {**DEFAULT_LLM, **(prefs.get("llm") or {})},
        },
        "features": {**DEFAULT_FEATURES, **(prefs.get("features") or {})},
        # 접속 키와 주소는 화면에 돌려주지 않는다. 연결 여부와 모델 이름만 알려 준다.
        "upstream": {"connected": bool(up), "models": list(up.get("models") or []) if up else []},
        "limits": {"hive_max_rings": settings.hive_max_rings, "hive_max_cells": settings.hive_max_cells},
        # 구글 로그인은 2단계. 지금은 항상 false라 화면이 구글 버튼을 숨긴다.
        "google_available": False,
    }
