"""업스트림 주소 검사(SSRF 방어). 근거: docs/05 5장, 9.2.

주소를 넣는 곳은 PUT /api/settings/upstream 하나뿐이다. 거부된 주소로는 가짜 업스트림에
요청이 한 번도 가지 않아야 한다(upstream.requests가 비어 있음).
"""

from __future__ import annotations

import asyncio

import pytest

from app.security.url_guard import UrlRejected, parse_upstream_url, validate_upstream_url
from conftest import Env, FakeUpstream, make_settings

BAD_URLS = [
    "http://demo.ngrok-free.app",  # http(암호화 없음)
    "ftp://demo.ngrok-free.app",
    "http://localhost:8000",
    "https://localhost",
    "http://127.0.0.1:11434",
    "https://127.0.0.1",
    "https://10.0.0.5",  # 사설망
    "https://192.168.0.1",
    "https://172.16.0.1",
    "https://169.254.169.254",  # 클라우드 메타데이터
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]",
    "https://0.0.0.0",
    "https://evil.example.com",  # 허용 목록 밖
    "https://ngrok-free.app",  # 접미사만 있고 이름이 없음
    "https://.ngrok-free.app",
    "https://evilngrok-free.app",  # 점 없이 이어 붙인 비슷한 이름
    "https://demo.ngrok-free.app.evil.com",  # 허용 이름이 앞에만 있음
    "https://user@demo.ngrok-free.app",  # 사용자정보
    "https://user:pass@demo.ngrok-free.app",
    "https://demo.ngrok-free.app@evil.com",  # @ 뒤가 진짜 호스트
    "https://evil.com#@demo.ngrok-free.app",
    "https://demo.ngrok-free.app:8443",  # 포트
    "https://demo.ngrok-free.app/v1/models",  # 경로
    "https://demo.ngrok-free.app?x=1",
    "https://demo.ngrok-free.app#frag",
    "https://demo.ngrok-free.app\\@evil.com",  # 역슬래시 혼동
    "https://demo.ngrok-free.app evil.com",  # 공백
    "https://demo.ngrok-free.app\r\nHost: evil",
    "",
    "demo.ngrok-free.app",  # 스킴 없음
    "javascript:alert(1)",
    "file:///etc/passwd",
]


@pytest.mark.parametrize("url", BAD_URLS)
def test_bad_upstream_url_rejected_with_400(env, upstream, url):
    # 나쁜 주소는 400. 그리고 업스트림으로 요청이 한 번도 나가지 않는다. 연결 상태도 그대로
    c = env.guest()
    r = c.put("/api/settings/upstream", json={"url": url, "key": "k"})
    assert r.status_code == 400, f"{url!r} -> {r.status_code}"
    err = r.json()["error"]
    assert err["code"] and err["message"]
    assert upstream.requests == []
    assert c.get("/api/me").json()["upstream"]["connected"] is False


def test_good_url_variants_accepted(env):
    # 대조군: 허용 접미사(.ngrok-free.app, .ngrok-free.dev), 끝 슬래시·대문자는 정규화해 통과
    for url in ("https://demo.ngrok-free.app", "https://demo.ngrok-free.dev", "https://Demo.NGROK-free.app/", "https://a-b.ngrok-free.app:443"):
        assert env.guest().put("/api/settings/upstream", json={"url": url, "key": "k"}).status_code == 200, url


def test_url_resolving_to_private_ip_rejected(upstream):
    # 허용된 이름이어도 DNS가 내부 주소로 풀리면 거부(DNS 바꿔치기). 하나라도 내부면 거부
    async def to_private(host):
        return ["10.1.2.3"]

    async def mixed(host):
        return ["93.184.216.34", "169.254.169.254"]

    for resolver in (to_private, mixed):
        e = Env(make_settings(), upstream, resolver=resolver)
        r = e.guest().put("/api/settings/upstream", json={"url": "https://demo.ngrok-free.app", "key": "k"})
        assert r.status_code == 400 and r.json()["error"]["code"] == "private_address"
    assert upstream.requests == []


def test_dns_failure_is_400(upstream):
    async def fail(host):
        raise OSError("no dns")

    e = Env(make_settings(), upstream, resolver=fail)
    r = e.guest().put("/api/settings/upstream", json={"url": "https://demo.ngrok-free.app", "key": "k"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "dns_failed"


def test_redirect_from_upstream_not_followed(env, upstream):
    # 허용된 주소가 내부 주소로 리다이렉트해도 따라가지 않는다(302 -> 연결 실패 처리)
    upstream.status = 302
    r = env.guest().put("/api/settings/upstream", json={"url": "https://demo.ngrok-free.app", "key": "k"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "upstream_redirect"
    assert len(upstream.requests) == 1  # 169.254.169.254로 가는 두 번째 요청이 없다


def test_url_rechecked_on_every_request(env, upstream):
    # 저장된 주소도 믿지 않는다: 연결 뒤 DNS가 내부 주소로 바뀌면 채팅 요청이 막힌다
    c = env.connected()
    n = len(upstream.requests)

    async def to_private(host):
        return ["127.0.0.1"]

    env.app.state.upstream._resolver = to_private
    r = c.post("/api/extract", json={"messages": [{"role": "user", "content": "안녕"}]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "rejected_url"
    assert len(upstream.requests) == n  # 새 요청이 나가지 않았다


def test_localhost_allowed_only_when_dev_flag_on(upstream):
    # 개발 예외: UPSTREAM_ALLOW_LOCALHOST=1일 때만 localhost 허용(기본은 거부)
    s = make_settings(UPSTREAM_ALLOW_LOCALHOST="1")
    assert parse_upstream_url("http://localhost:8001", s)[2] is True
    with pytest.raises(UrlRejected):
        parse_upstream_url("http://localhost:8001", make_settings())
    with pytest.raises(UrlRejected):
        parse_upstream_url("http://localhost.evil.com", s)  # 비슷한 이름은 여전히 거부


def test_too_broad_suffix_config_refused():
    # 허용 목록이 ".app"처럼 너무 넓으면 서버가 켜지지 않는다
    from app.config import ConfigError

    with pytest.raises(ConfigError):
        make_settings(UPSTREAM_ALLOWED_HOST_SUFFIXES=".app")


def test_validate_upstream_url_returns_normalized():
    # 검사 함수 단독: 정규화한 주소를 돌려준다(DNS는 가짜)
    async def ok(host):
        return ["93.184.216.34"]

    # 비동기 함수는 asyncio.run으로 부른다(별도 pytest 플러그인 없이)
    assert asyncio.run(validate_upstream_url("https://Demo.ngrok-free.app/", make_settings(), ok)) == "https://demo.ngrok-free.app"
