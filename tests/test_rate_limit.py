"""요청 제한: 분당 방식 (.env.example 10장).

센 기준은 코드상 "그룹 + 클라이언트 IP"이다(세션이 아님). X-Forwarded-For의 맨 뒤 값이 IP다.
"""

from __future__ import annotations

import app.security.rate_limit as rl
from app.security.rate_limit import RateLimiter

MSG = {"messages": [{"role": "user", "content": "안녕"}]}


def test_limiter_sliding_window(monkeypatch):
    # 단위: 한도까지만 허용하고, 창(60초)이 지나면 다시 허용. 키가 다르면 따로 센다
    now = [1000.0]
    monkeypatch.setattr(rl.time, "monotonic", lambda: now[0])
    lim = RateLimiter()
    assert [lim.allow("a", 2) for _ in range(3)] == [True, True, False]
    assert lim.allow("b", 2) is True
    now[0] += 59
    assert lim.allow("a", 2) is False
    now[0] += 2  # 61초 지남
    assert lim.allow("a", 2) is True
    lim.sweep()


def test_guest_start_limited_per_ip(env):
    # POST /api/guest: IP마다 1분 5번(기본). 6번째는 429 + 계약 모양의 한국어 오류
    c = env.client()
    codes = [c.post("/api/guest", json={"name": "하루"}).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]
    r = c.post("/api/guest", json={"name": "하루"})
    err = r.json()["error"]
    assert err["code"] == "rate_limited" and err["message"]
    # 제한에 걸린 요청은 손님을 만들지 않는다(성공한 5번만 5명)
    assert len(env.app.state.store._owners) == 5


def test_guest_start_limit_configurable(make_env):
    e = make_env(RATE_LIMIT_GUEST_START_PER_MIN=2)
    c = e.client()
    assert [c.post("/api/guest", json={"name": "하루"}).status_code for _ in range(3)] == [200, 200, 429]


def test_guest_start_limit_does_not_block_other_routes(env):
    # 손님 시작 한도를 다 써도 다른 API(내 정보 등)는 영향이 없다
    c = env.client()
    for _ in range(6):
        c.post("/api/guest", json={"name": "하루"})
    assert c.get("/api/me").status_code == 200


def test_guest_start_limit_is_per_ip_not_per_session(env):
    # 다른 IP(X-Forwarded-For 맨 뒤 값)는 따로 센다
    a = env.client(headers={"X-Forwarded-For": "203.0.113.1"})
    b = env.client(headers={"X-Forwarded-For": "203.0.113.2"})
    for _ in range(5):
        assert a.post("/api/guest", json={"name": "하루"}).status_code == 200
    assert a.post("/api/guest", json={"name": "하루"}).status_code == 429
    assert b.post("/api/guest", json={"name": "하루"}).status_code == 200


def test_forwarded_for_uses_last_value(env):
    # 앞쪽 값은 클라이언트가 마음대로 적을 수 있다 -> 맨 뒤(프록시가 붙인 값)만 본다
    for i in range(5):
        env.client(headers={"X-Forwarded-For": f"9.9.9.{i}, 203.0.113.9"}).post("/api/guest", json={"name": "하루"})
    r = env.client(headers={"X-Forwarded-For": "1.2.3.4, 203.0.113.9"}).post("/api/guest", json={"name": "하루"})
    assert r.status_code == 429


def test_chat_limit_per_minute(make_env, upstream):
    # /api/chat: 분당 한도(테스트 설정 2)를 넘으면 429. 업스트림에는 한도 안의 요청만 갔다
    e = make_env(RATE_LIMIT_CHAT_PER_MIN=2)
    c = e.connected()
    n = len(upstream.requests)
    codes = [c.post("/api/chat", json=MSG).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert len(upstream.requests) == n + 2
    assert c.post("/api/chat", json=MSG).json()["error"]["code"] == "rate_limited"


def test_extract_limit_per_minute(make_env):
    e = make_env(RATE_LIMIT_EXTRACT_PER_MIN=1)
    c = e.connected()
    assert c.post("/api/extract", json=MSG).status_code == 200
    assert c.post("/api/extract", json=MSG).status_code == 429


def test_chat_and_extract_counted_separately(make_env):
    # chat와 extract는 서로 다른 통
    e = make_env(RATE_LIMIT_CHAT_PER_MIN=1, RATE_LIMIT_EXTRACT_PER_MIN=1)
    c = e.connected()
    assert c.post("/api/chat", json=MSG).status_code == 200
    assert c.post("/api/extract", json=MSG).status_code == 200
    assert c.post("/api/chat", json=MSG).status_code == 429


def test_general_limit(make_env):
    # 그 밖의 /api 요청: 분당 일반 한도(최솟값 10)를 넘으면 429. /health는 대상이 아니다
    e = make_env(RATE_LIMIT_GENERAL_PER_MIN=10)
    c = e.client()
    codes = [c.get("/api/me").status_code for _ in range(11)]
    assert codes == [200] * 10 + [429]
    assert c.get("/health").status_code == 200


def test_rate_limited_response_has_security_headers(make_env):
    e = make_env(RATE_LIMIT_GUEST_START_PER_MIN=1)
    c = e.client()
    c.post("/api/guest", json={"name": "하루"})
    r = c.post("/api/guest", json={"name": "하루"})
    assert r.status_code == 429 and "content-security-policy" in r.headers


def test_limit_applies_before_csrf_check(make_env):
    # 알려 둔 동작: 제한은 CSRF 검사보다 먼저 센다(헤더 없는 요청도 통에 쌓인다 -> 무차별 요청을 막는다)
    e = make_env(RATE_LIMIT_GUEST_START_PER_MIN=1)
    c = e.client(csrf=False)
    assert c.post("/api/guest", json={"name": "하루"}).status_code == 403
    assert c.post("/api/guest", json={"name": "하루"}).status_code == 429
