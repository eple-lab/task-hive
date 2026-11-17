"""테스트 공통 도구.

원칙
    - 테스트마다 create_app()으로 새 앱을 만든다(전역 상태 없음, 요청 제한 기록·메모리 저장소도 새로).
    - 외부 네트워크를 절대 부르지 않는다:
        * 업스트림(Colab/ngrok)  -> FakeUpstream (httpx.MockTransport)
        * 날씨(Open-Meteo)       -> fake_weather_transport
        * DNS 조회               -> fake_resolver (공개 IP를 돌려준다)
    - 테스트 데이터는 지어낸 짧은 한국어 문장이다. 실제 비밀값·대화는 없다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import create_app

# 32자 이상(config가 요구). 테스트 전용 가짜 값이다.
TEST_SECRETS = {
    "SESSION_SECRET": "test-session-secret-0123456789abcdef-xx",
    "DATA_ENC_KEY": "test-data-enc-key-0123456789abcdef-xxxxx",
    "SUB_HASH_KEY": "test-sub-hash-key-0123456789abcdef-xxxxx",
}
UPSTREAM_URL = "https://demo.ngrok-free.app"
UPSTREAM_KEY = "test-upstream-key-1234"


def make_settings(**env):
    """테스트용 Settings. 환경변수 이름 그대로 덮어쓴다: make_settings(HIVE_MAX_RINGS="1")."""
    base = {"APP_ENV": "development", **TEST_SECRETS}
    base.update({k: str(v) for k, v in env.items()})
    return load_settings(base)


@dataclass
class FakeUpstream:
    """가짜 Colab 게이트웨이. 테스트가 속성을 바꿔 상황(성공/실패)을 만든다."""

    models: list[str] = field(default_factory=lambda: ["fake-model"])
    chat_chunks: list[str] = field(default_factory=lambda: ["안녕", "하세요"])
    completion: str = '{"candidates": [], "completions": []}'
    status: int = 200  # 200이 아니면 모든 경로가 이 상태로 답한다
    models_body: str | None = None  # /v1/models 응답을 통째로 바꿀 때(예: HTML)
    raise_connect_error: bool = False
    requests: list[httpx.Request] = field(default_factory=list)

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.raise_connect_error:
            raise httpx.ConnectError("연결 실패", request=request)
        if self.status != 200:
            return httpx.Response(self.status, text="x", headers={"location": "http://169.254.169.254/"} if 300 <= self.status < 400 else {})
        path = request.url.path
        if path == "/v1/models":
            if self.models_body is not None:
                return httpx.Response(200, text=self.models_body)
            return httpx.Response(200, json={"data": [{"id": m} for m in self.models]})
        if path == "/v1/chat/completions":
            body = json.loads(request.content)
            if body.get("stream"):
                lines = [f"data: {json.dumps({'choices': [{'delta': {'content': c}}]}, ensure_ascii=False)}\n\n" for c in self.chat_chunks]
                lines.append("data: [DONE]\n\n")
                return httpx.Response(200, text="".join(lines), headers={"content-type": "text/event-stream"})
            return httpx.Response(200, json={"choices": [{"message": {"content": self.completion}}]})
        return httpx.Response(404)

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)


async def fake_resolver(host: str) -> list[str]:
    """DNS 대신: 항상 공개 IP(문서용 예약 대역이 아닌 임의의 공인 주소)로 풀린다."""
    return ["93.184.216.34"]


def fake_weather_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"current": {"temperature_2m": 12.3, "weather_code": 0}})

    return httpx.MockTransport(handler)


class Env:
    """테스트가 쓰는 묶음: 앱, 가짜 업스트림, 클라이언트 만들기."""

    def __init__(self, settings, upstream: FakeUpstream, resolver=fake_resolver):
        self.settings = settings
        self.upstream = upstream
        self.app = create_app(
            settings,
            upstream_transport=upstream.transport(),
            resolver=resolver,
            weather_transport=fake_weather_transport(),
        )

    def client(self, *, csrf: bool = True, headers: dict | None = None) -> TestClient:
        """새 브라우저(쿠키 보관함이 따로)처럼 동작하는 클라이언트. csrf=False면 X-TH 헤더를 붙이지 않는다."""
        h = {"X-TH": "1"} if csrf else {}
        h.update(headers or {})
        return TestClient(self.app, headers=h, raise_server_exceptions=False)

    def guest(self, name: str = "하루", **kw) -> TestClient:
        """손님으로 시작한 클라이언트."""
        c = self.client(**kw)
        r = c.post("/api/guest", json={"name": name})
        assert r.status_code == 200, r.text
        return c

    def connected(self, name: str = "하루") -> TestClient:
        """손님 + 가짜 Colab 연결까지 끝낸 클라이언트."""
        c = self.guest(name)
        r = c.put("/api/settings/upstream", json={"url": UPSTREAM_URL, "key": UPSTREAM_KEY})
        assert r.status_code == 200, r.text
        return c


@pytest.fixture
def upstream() -> FakeUpstream:
    return FakeUpstream()


@pytest.fixture
def make_env(upstream):
    """설정을 바꿔 가며 새 환경을 만드는 공장: make_env(HIVE_MAX_RINGS=1)."""

    def _make(**env) -> Env:
        return Env(make_settings(**env), upstream)

    return _make


@pytest.fixture
def env(make_env) -> Env:
    return make_env()


@pytest.fixture
def client(env) -> TestClient:
    """손님으로 시작한 클라이언트 하나."""
    return env.guest()


def bulk(client: TestClient, *titles: str, **extra):
    """제목들을 한 번에 등록하는 도우미. 응답을 그대로 돌려준다."""
    items = [{"title": t, **extra} for t in titles]
    return client.post("/api/tasks/bulk", json={"items": items})


def make_task(client: TestClient, title: str = "빨래 개기", **extra) -> dict:
    r = bulk(client, title, **extra)
    assert r.status_code == 200, r.text
    return r.json()["tasks"][0]


def parse_sse(text: str) -> list[dict]:
    """SSE 본문에서 data: 줄을 JSON으로 읽는다."""
    events = []
    for line in text.splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


def forged_cookie(settings, data: dict, key_secret: str | None = None) -> str:
    """세션 쿠키 값을 직접 만든다(위조 테스트용). key_secret을 주면 그 비밀값으로 암호화한다(= 틀린 키).

    data에 iat가 없으면 지금 시각을 넣는다.
    """
    import base64
    import hashlib
    import time

    from cryptography.fernet import Fernet

    secret = key_secret if key_secret is not None else settings.session_secret
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    payload = {"iat": int(time.time()), **data}
    return Fernet(key).encrypt(json.dumps(payload, ensure_ascii=False).encode()).decode()
