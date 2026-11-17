"""보안 규칙: 세션 분리, CSRF, Origin, JSON만, 쿠키 위조, 보안 헤더, 문서 주소.

근거: docs/05 4.3, 7장, 9.2. 계약 "공통 규칙".
"""

from __future__ import annotations

import time

import pytest

from app.security.session import COOKIE_NAME
from conftest import forged_cookie, make_task

# ── 다른 세션의 데이터는 없는 것처럼(404) ────────────────────


def test_other_session_cannot_touch_task(env):
    # A의 태스크 id로 B가 수정·삭제하면 404, A의 데이터는 그대로
    a, b = env.guest("가"), env.guest("나")
    t = make_task(a, "가의 일")
    assert b.patch(f"/api/tasks/{t['id']}", json={"completed": True}).status_code == 404
    assert b.patch(f"/api/tasks/{t['id']}", json={"title": "탈취"}).status_code == 404
    assert b.patch(f"/api/tasks/{t['id']}", json={"archived": True}).status_code == 404
    assert b.delete(f"/api/tasks/{t['id']}").status_code == 404
    mine = a.get("/api/tasks").json()["tasks"]
    assert len(mine) == 1 and mine[0]["title"] == "가의 일" and mine[0]["completed"] is False and mine[0]["archived"] is False
    assert b.get("/api/tasks").json()["tasks"] == []  # 조회해도 0건


def test_other_session_cannot_touch_subtask(env):
    # A의 하위 태스크 추가·수정·삭제도 B에게는 404
    a, b = env.guest("가"), env.guest("나")
    t = a.post("/api/tasks/bulk", json={"items": [{"title": "가의 일", "subtasks": ["초안"]}]}).json()["tasks"][0]
    sid = t["subtasks"][0]["id"]
    assert b.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "침입"}).status_code == 404
    assert b.patch(f"/api/tasks/{t['id']}/subtasks/{sid}", json={"completed": True}).status_code == 404
    assert b.delete(f"/api/tasks/{t['id']}/subtasks/{sid}").status_code == 404
    again = a.get("/api/tasks").json()["tasks"][0]
    assert [s["title"] for s in again["subtasks"]] == ["초안"] and again["subtasks"][0]["completed"] is False


def test_subtask_id_of_another_task_is_404(env):
    # 같은 사용자라도 다른 태스크의 하위 태스크 id를 경로에 섞으면 404
    c = env.guest()
    a = c.post("/api/tasks/bulk", json={"items": [{"title": "A 일", "subtasks": ["초안"]}]}).json()["tasks"][0]
    b = make_task(c, "B 일")
    assert c.patch(f"/api/tasks/{b['id']}/subtasks/{a['subtasks'][0]['id']}", json={"completed": True}).status_code == 404


def test_same_title_allowed_across_sessions(env):
    # 제목 중복 검사는 사용자 안에서만(다른 손님의 제목을 알아낼 수 없다)
    a, b = env.guest("가"), env.guest("나")
    make_task(a, "같은 제목")
    assert make_task(b, "같은 제목")["title"] == "같은 제목"


# ── 세션 쿠키 위조·변조 ─────────────────────────────────────

GOOD = {"sid": "a" * 32, "mode": "guest", "name": "하루", "up": None}


def test_forged_cookie_helper_positive_control(env):
    # (대조군) 올바른 비밀값으로 만든 쿠키는 인정된다. 아래 위조 테스트가 헛돌지 않음을 보증
    c = env.client()
    c.cookies.set(COOKIE_NAME, forged_cookie(env.settings, GOOD))
    assert c.get("/api/me").json()["mode"] == "guest"


def me_mode(env, cookie_value: str) -> str:
    c = env.client()
    c.cookies.set(COOKIE_NAME, cookie_value)
    return c.get("/api/me").json()["mode"]


def test_cookie_encrypted_with_wrong_key_rejected(env):
    # 다른 비밀값으로 만든 쿠키(공격자가 만든 것)는 손님으로 인정하지 않는다
    assert me_mode(env, forged_cookie(env.settings, GOOD, key_secret="attacker-secret-0123456789abcdefghijkl")) == "none"


def test_tampered_cookie_rejected(env):
    # 정상 쿠키의 글자 하나를 바꾸면(변조) 거부
    good = forged_cookie(env.settings, GOOD)
    flipped = good[:-5] + ("A" if good[-5] != "A" else "B") + good[-4:]
    assert me_mode(env, flipped) == "none"
    assert me_mode(env, "not-a-token") == "none"
    assert me_mode(env, "") == "none"


def test_plain_json_cookie_rejected(env):
    # 암호화 없이 JSON·base64만 넣은 쿠키는 거부(서명·암호화 없는 신원 주장)
    import base64
    import json

    assert me_mode(env, json.dumps(GOOD)) == "none"
    assert me_mode(env, base64.urlsafe_b64encode(json.dumps(GOOD).encode()).decode()) == "none"


@pytest.mark.parametrize(
    "bad",
    [
        {**GOOD, "mode": "admin"},  # 모르는 mode로 권한 올리기
        {**GOOD, "sid": 123},  # sid가 글자가 아님
        {"mode": "guest", "name": "x"},  # sid 없음
    ],
)
def test_malformed_session_payload_rejected(env, bad):
    # 암호화는 맞아도 내용이 규칙에 안 맞으면 거부
    assert me_mode(env, forged_cookie(env.settings, bad)) == "none"


def test_expired_cookie_rejected(env):
    # 손님 쿠키는 24시간이 지나면 만료
    old = int(time.time()) - 25 * 3600
    assert me_mode(env, forged_cookie(env.settings, {**GOOD, "iat": old})) == "none"
    fresh = int(time.time()) - 23 * 3600
    assert me_mode(env, forged_cookie(env.settings, {**GOOD, "iat": fresh})) == "guest"


def test_forged_cookie_cannot_read_others_data(env):
    # 남의 sid를 추측해 만든 쿠키(틀린 키)로 남의 태스크를 못 본다
    a = env.guest("가")
    make_task(a, "가의 일")
    attacker = env.client()
    sid = next(iter(env.app.state.store._owners)).split(":", 1)[1]
    attacker.cookies.set(COOKIE_NAME, forged_cookie(env.settings, {**GOOD, "sid": sid}, key_secret="attacker-secret-0123456789abcdefghijkl"))
    assert attacker.get("/api/tasks").status_code == 401


def test_session_cookie_is_not_readable_plaintext(env):
    # 쿠키 값에 이름이 평문으로 보이지 않는다(암호화)
    c = env.guest("고유한이름")
    assert "고유한이름" not in c.cookies.get(COOKIE_NAME)


# ── CSRF: X-TH 헤더와 Origin ────────────────────────────────


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/api/guest", {"name": "하루"}),
        ("post", "/api/tasks/bulk", {"items": [{"title": "x"}]}),
        ("patch", "/api/tasks/1", {"completed": True}),
        ("delete", "/api/tasks/1", None),
        ("put", "/api/settings", {"city": "부산"}),
        ("post", "/auth/logout", None),
    ],
)
def test_missing_xth_header_rejected(env, method, path, body):
    # GET이 아닌 요청에 X-TH: 1이 없으면 403 csrf_rejected (라우터에 닿기 전에)
    c = env.client(csrf=False)
    r = getattr(c, method)(path, **({"json": body} if body is not None else {}))
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_rejected"


def test_wrong_xth_value_rejected(env):
    # 헤더가 있어도 값이 "1"이 아니면 거부
    r = env.client(csrf=False, headers={"X-TH": "0"}).post("/api/guest", json={"name": "하루"})
    assert r.status_code == 403


def test_csrf_rejection_creates_no_session(env):
    # 거부된 요청은 쿠키도 만들지 않는다
    c = env.client(csrf=False)
    r = c.post("/api/guest", json={"name": "하루"})
    assert "set-cookie" not in r.headers and env.app.state.store._owners == {}


def test_get_does_not_need_xth(env):
    # 읽기 요청은 헤더 없이 된다
    assert env.client(csrf=False).get("/api/me").status_code == 200


def test_foreign_origin_rejected(env):
    # X-TH가 있어도 Origin이 다른 사이트면 거부
    c = env.client(headers={"Origin": "https://evil.example"})
    r = c.post("/api/guest", json={"name": "하루"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_rejected"


def test_same_origin_allowed(env):
    # PUBLIC_BASE_URL과 같은 Origin은 통과
    c = env.client(headers={"Origin": env.settings.public_origin})
    assert c.post("/api/guest", json={"name": "하루"}).status_code == 200


def test_production_origin_must_equal_public_url(make_env):
    # 운영에서는 Host와 같다는 이유만으로는 통과하지 않고, 공개 주소와 같아야 한다
    prod = make_env(APP_ENV="production", PUBLIC_BASE_URL="https://hive.example.test")
    bad = prod.client(headers={"Origin": "http://testserver"})
    assert bad.post("/api/guest", json={"name": "하루"}).status_code == 403
    ok = prod.client(headers={"Origin": "https://hive.example.test"})
    assert ok.post("/api/guest", json={"name": "하루"}).status_code == 200
    # 운영에서는 쿠키에 Secure, HSTS 헤더
    r = prod.client().get("/health")
    assert "max-age" in r.headers["strict-transport-security"]


# ── JSON만 받는다 ───────────────────────────────────────────


def test_non_json_bodies_rejected(env):
    # 폼·평문 본문은 거부하고 세션도 만들지 않는다 (계약: 본문은 JSON만)
    c = env.client()
    for kwargs in (
        {"data": {"name": "하루"}},  # application/x-www-form-urlencoded
        {"content": "name=하루", "headers": {"Content-Type": "text/plain"}},
        {"content": b"<name>x</name>", "headers": {"Content-Type": "application/xml"}},
        {"content": "{not json", "headers": {"Content-Type": "application/json"}},
    ):
        r = c.post("/api/guest", **kwargs)
        assert 400 <= r.status_code < 500, kwargs
        assert "set-cookie" not in r.headers
    assert env.app.state.store._owners == {}


def test_oversized_body_rejected(make_env):
    # Content-Length가 한도(MAX_BODY_BYTES)를 넘으면 413
    c = make_env(MAX_BODY_BYTES=1000).guest()
    r = c.post("/api/tasks/bulk", json={"items": [{"title": "가" * 600}, {"title": "나" * 600}]})
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_large"


# ── 보안 헤더, 문서 주소 ────────────────────────────────────


@pytest.mark.parametrize("path", ["/health", "/api/me", "/", "/api/nothing"])
def test_security_headers_present(env, path):
    # 모든 응답(성공·404·화면 안내)에 CSP 등 보안 헤더
    r = env.client().get(path)
    h = r.headers
    assert "default-src 'self'" in h["content-security-policy"] and "frame-ancestors 'none'" in h["content-security-policy"]
    assert "script-src 'self'" in h["content-security-policy"] and "unsafe-inline" not in h["content-security-policy"].split("style-src")[0]
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY" and h["referrer-policy"] == "no-referrer"
    assert "microphone=()" in h["permissions-policy"]


def test_error_responses_also_have_headers(env):
    r = env.client(csrf=False).post("/api/guest", json={"name": "하루"})
    assert r.status_code == 403 and "content-security-policy" in r.headers


def test_api_responses_not_cacheable(env):
    # 개인 데이터가 든 /api 응답은 저장하지 않게
    assert env.guest().get("/api/tasks").headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"])
def test_docs_urls_are_404(env, path):
    # 계약: /docs, /openapi.json은 끈다(서버 정보 노출 방지). 화면 대체 응답(200)으로 덮이지 않는다
    r = env.client().get(path)
    assert r.status_code == 404


def test_not_found_and_validation_errors_use_contract_shape(env):
    # 오류 모양: {"error":{"code","message"}} — 내부 정보(스택, 입력값)를 돌려주지 않는다
    c = env.guest()
    r = c.post("/api/tasks/bulk", json={"items": [{"title": "비밀입력값", "due_date": 5}]})
    assert r.status_code == 422
    body = r.json()
    assert set(body) == {"error"} and set(body["error"]) == {"code", "message"}
    assert "비밀입력값" not in r.text  # 입력값을 되돌려 주지 않는다


def test_unexpected_error_is_generic_and_not_logged_with_content(env, caplog):
    # 예상 못 한 오류: 500 + 일반 안내만. 로그에는 오류 종류만 남고 내용(본문)은 없다
    import logging

    c = env.guest()
    secret = "비밀내용-로그에-남으면-안됨"

    def boom(owner):
        raise RuntimeError(secret)

    env.app.state.store.list_tasks = boom
    with caplog.at_level(logging.DEBUG):
        r = c.get("/api/tasks")
    assert r.status_code == 500 and r.json()["error"]["code"] == "server_error"
    assert secret not in r.text and secret not in caplog.text
