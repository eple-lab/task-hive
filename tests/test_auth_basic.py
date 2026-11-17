"""기본 기능: 상태 확인, 손님 시작, /api/me, 로그아웃, 설정(config) 검사.

계약: docs/11 "상태와 세션".
"""

from __future__ import annotations

import pytest

from app.config import ConfigError, load_settings
from app.security.session import COOKIE_NAME
from conftest import TEST_SECRETS, forged_cookie, make_settings

ME_KEYS = {"mode", "name", "lang", "city", "settings", "features", "upstream", "limits", "google_available"}


def test_health(env):
    # 헬스 체크는 로그인 없이 {"status":"ok"}
    r = env.client().get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_me_without_cookie_is_none(env):
    # 쿠키가 없으면 401이 아니라 mode:"none"으로 답한다(화면이 로그인 화면을 보여 주려고 부른다)
    r = env.client().get("/api/me")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "none" and body["name"] is None
    assert body["upstream"] == {"connected": False, "models": []}


def test_guest_start_returns_me_shape(env):
    # 손님 시작 응답은 GET /api/me와 같은 모양이고 기본값이 계약과 같다
    c = env.client()
    r = c.post("/api/guest", json={"name": "하루"})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == ME_KEYS
    assert body["mode"] == "guest" and body["name"] == "하루" and body["lang"] == "ko" and body["city"] == "서울"
    assert body["settings"]["llm"] == {"temperature": 0.6, "max_tokens": 400, "model": None}
    assert body["features"] == {"calendar": None, "diary_google": None, "task_sheet": None}
    assert body["limits"] == {"hive_max_rings": 3, "hive_max_cells": 37}
    assert body["google_available"] is False


def test_me_after_guest_start_uses_cookie(env):
    # 쿠키가 있으면 같은 사람으로 보인다. 쿠키는 HttpOnly·SameSite=Lax
    c = env.client()
    r = c.post("/api/guest", json={"name": "하루"})
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie
    me = c.get("/api/me").json()
    assert me["mode"] == "guest" and me["name"] == "하루"


@pytest.mark.parametrize("name", ["", "   ", "가" * 21, "<b>하루</b>", 'a"b'])
def test_guest_name_rejected(env, name):
    # 이름 규칙: 비움, 20자 초과, < > " ' ` 금지 -> 422 + 계약의 오류 모양
    r = env.client().post("/api/guest", json={"name": name})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] and err["message"]


def test_guest_start_makes_new_session_each_time(env):
    # 세션 고정 방지: 손님으로 시작할 때마다 쿠키(세션 ID)가 새로 만들어진다
    c = env.client()
    c.post("/api/guest", json={"name": "하루"})
    first = c.cookies.get(COOKIE_NAME)
    c.post("/api/guest", json={"name": "하루"})
    assert c.cookies.get(COOKIE_NAME) != first


def test_tasks_require_login(env):
    # 로그인하지 않으면 401 + 오류 모양
    r = env.client().get("/api/tasks")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "not_signed_in"


def test_logout_clears_cookie_and_guest_data(env):
    # 로그아웃은 204. 손님 데이터도 함께 지워진다(쿠키를 잃으면 다시 못 보므로)
    c = env.guest()
    c.post("/api/tasks/bulk", json={"items": [{"title": "빨래 개기"}]})
    assert len(env.app.state.store._owners) == 1
    r = c.post("/auth/logout")
    assert r.status_code == 204
    assert env.app.state.store._owners == {}
    assert c.get("/api/me").json()["mode"] == "none"


def test_unknown_api_path_is_404_json(env):
    # /api 아래의 없는 주소는 화면(index.html)이 아니라 404 JSON
    r = env.client().get("/api/nothing-here")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_client_metric_kind_whitelist(env):
    # 지표는 정해진 종류만 받는다(자유 문자열로 지표를 오염시키지 못하게)
    c = env.guest()
    assert c.post("/api/metrics/client", json={"kind": "client_tts", "ms": 100}).status_code == 204
    assert c.post("/api/metrics/client", json={"kind": "whatever", "ms": 100}).status_code == 422


def test_admin_metrics_dev_only(make_env):
    # 계약: 개발 환경에서만 열리고 그 밖에는 404
    dev = make_env()
    assert dev.client().get("/api/admin/metrics").status_code == 200
    prod = make_env(APP_ENV="production", PUBLIC_BASE_URL="https://hive.example.test")
    assert prod.client().get("/api/admin/metrics").status_code == 404


def test_greeting_uses_fake_weather(env):
    # 날씨는 가짜 Open-Meteo로: 실제 네트워크 없이 계약 모양이 나온다
    c = env.guest()
    r = c.get("/api/greeting")
    assert r.status_code == 200
    body = r.json()
    assert body["weather"] == {"city": "서울", "temp_c": 12.3, "desc": "맑음"}
    assert "하루" in body["text"] and body["now"]


def test_settings_update_and_me(env):
    # 설정은 일부만 바꿀 수 있고, 바뀐 값이 /api/me에 반영된다
    c = env.guest()
    r = c.put("/api/settings", json={"city": "부산", "llm": {"temperature": 0.2}, "features": {"calendar": True}})
    assert r.status_code == 200
    body = r.json()
    assert body["city"] == "부산" and body["settings"]["llm"]["temperature"] == 0.2
    assert body["settings"]["llm"]["max_tokens"] == 400  # 안 보낸 칸은 그대로
    assert body["features"]["calendar"] is True
    assert c.put("/api/settings", json={"llm": {"temperature": 9}}).status_code == 422
    assert c.put("/api/settings", json={"city": "없는도시"}).status_code == 422


# ── 설정(config) ────────────────────────────────────────────


def test_config_defaults():
    # 기본값이 .env.example과 같다
    s = make_settings()
    assert (s.rate_limit_chat_per_min, s.rate_limit_extract_per_min, s.rate_limit_general_per_min) == (20, 30, 240)
    assert s.rate_limit_guest_start_per_min == 5 and s.max_title_chars == 200 and s.hive_max_cells == 37


@pytest.mark.parametrize("key,value", [("MAX_TITLE_CHARS", "9"), ("MAX_TITLE_CHARS", "501"), ("RATE_LIMIT_GUEST_START_PER_MIN", "0"), ("HIVE_MAX_RINGS", "7"), ("HIVE_MAX_RINGS", "abc")])
def test_config_out_of_range_refuses_to_start(key, value):
    # 범위를 벗어난 값은 조용히 고치지 않고 서버를 켜지 않는다
    with pytest.raises(ConfigError):
        make_settings(**{key: value})


def test_config_production_requires_secrets_and_https():
    # 운영에서 비밀값이 빠지거나 https가 아니면 켜지지 않는다(docs/05 9.2)
    with pytest.raises(ConfigError):
        load_settings({"APP_ENV": "production", "PUBLIC_BASE_URL": "https://x.example.test"})
    with pytest.raises(ConfigError):
        load_settings({"APP_ENV": "production", "PUBLIC_BASE_URL": "http://x.example.test", **TEST_SECRETS})
    with pytest.raises(ConfigError):
        load_settings({"APP_ENV": "production", "PUBLIC_BASE_URL": "https://x.example.test", "UPSTREAM_ALLOW_LOCALHOST": "1", **TEST_SECRETS})


def test_cookie_helper_roundtrip_sanity(env):
    # (다음 파일의 위조 테스트가 헛돌지 않게) 같은 키로 만든 정상 쿠키는 통과하는지 확인
    c = env.client()
    c.cookies.set(COOKIE_NAME, forged_cookie(env.settings, {"sid": "a" * 32, "mode": "guest", "name": "하루", "up": None}))
    assert c.get("/api/me").json()["mode"] == "guest"
