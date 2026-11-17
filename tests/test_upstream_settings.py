"""PUT/DELETE /api/settings/upstream: 연결 성공, 연결 실패, 연결 끊기.

(주소 검사 SSRF 규칙은 test_security_ssrf.py)
"""

from __future__ import annotations

from conftest import UPSTREAM_KEY, UPSTREAM_URL


def put(c, url=UPSTREAM_URL, key=UPSTREAM_KEY):
    return c.put("/api/settings/upstream", json={"url": url, "key": key})


def test_upstream_connect_success(env, upstream):
    # 성공: {"connected":true,"models":[...],"latency_ms":숫자}. 가짜 업스트림의 /v1/models가 불렸다
    c = env.guest()
    upstream.models = ["m-a", "m-b"]
    r = put(c)
    assert r.status_code == 200
    body = r.json()
    assert body["connected"] is True and body["models"] == ["m-a", "m-b"] and isinstance(body["latency_ms"], int)
    assert [req.url.path for req in upstream.requests] == ["/v1/models"]
    assert upstream.requests[0].headers["authorization"] == f"Bearer {UPSTREAM_KEY}"


def test_me_shows_connection_but_never_url_or_key(env):
    # /api/me는 연결 여부와 모델 이름만. 주소와 접속 키는 화면에 돌려주지 않는다(D-22)
    c = env.guest()
    put(c)
    r = c.get("/api/me")
    assert r.json()["upstream"] == {"connected": True, "models": ["fake-model"]}
    assert UPSTREAM_KEY not in r.text and "ngrok" not in r.text


def test_upstream_cookie_is_encrypted(env):
    # 접속 키·주소는 세션 쿠키 안에 있지만 암호화돼 있어 쿠키 값에서 읽히지 않는다
    c = env.guest()
    put(c)
    raw = c.cookies.get("th_session")
    assert UPSTREAM_KEY not in raw and "ngrok" not in raw


def test_upstream_connect_failure_is_502(env, upstream):
    # Colab에 닿지 않으면 502 upstream_unreachable, 연결 상태는 바뀌지 않는다
    c = env.guest()
    upstream.raise_connect_error = True
    r = put(c)
    assert r.status_code == 502 and r.json()["error"]["code"] == "upstream_unreachable"
    assert c.get("/api/me").json()["upstream"]["connected"] is False


def test_upstream_bad_key_and_bad_server(env, upstream):
    # 401 -> 502 upstream_auth, HTML(ngrok 경고 페이지 등) -> 502 upstream_bad_response, 500 -> 502
    c = env.guest()
    upstream.status = 401
    assert put(c).json()["error"]["code"] == "upstream_auth"
    upstream.status = 200
    upstream.models_body = "<html>ngrok warning</html>"
    r = put(c)
    assert r.status_code == 502 and r.json()["error"]["code"] == "upstream_bad_response"
    upstream.models_body = None
    upstream.status = 500
    assert put(c).status_code == 502


def test_upstream_requires_login(env):
    assert put(env.client()).status_code == 401


def test_upstream_disconnect(env):
    # 끊기: 204, 이후 /api/me는 connected:false, 채팅은 409
    c = env.connected()
    assert c.delete("/api/settings/upstream").status_code == 204
    assert c.get("/api/me").json()["upstream"]["connected"] is False
    r = c.post("/api/chat", json={"messages": [{"role": "user", "content": "안녕"}]})
    assert r.status_code == 409
