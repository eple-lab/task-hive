"""사용자의 Colab 게이트웨이(업스트림) 호출.

이 파일이 하는 일
    - OpenAI 호환 API를 부른다(llm-chatbot/server.py 방식).
        GET  {url}/v1/models             모델 목록 (연결 확인에도 쓴다)
        POST {url}/v1/chat/completions   대화 (스트리밍 / 한 번에 받기)
    - 보낼 때마다 주소를 다시 검사한다(url_guard: DNS 바꿔치기 방지).

지키는 것 (docs/05 5장)
    - 리다이렉트를 따라가지 않는다(follow_redirects=False). 허용된 주소가 내부 주소로 넘기는 것을 막는다.
    - 연결·읽기 시간 제한을 둔다.
    - 업스트림 응답은 믿지 않는 자료다. 오류 본문을 사용자에게 그대로 보여 주지 않고, 로그에도 남기지 않는다.
    - 헤더: Authorization: Bearer <접속 키>(D-22), ngrok-skip-browser-warning: 1 (docs/09 2.7)

thinking 모델 대응 (llm-chatbot의 "알려진 이슈")
    - Qwen 계열은 생각 과정을 먼저 낸다. `chat_template_kwargs: {"enable_thinking": false}`를 넣어 끈다.
    - 그래도 본문에 <think>…</think>가 섞여 나오는 경우가 있어 ThinkFilter로 걸러 낸다.

테스트
    - transport를 바꿔 끼우면(httpx.MockTransport) 실제 네트워크 없이 가짜 업스트림으로 돌릴 수 있다.

아직 안 된 것
    - Colab TTS(/tts), Whisper(/stt) 호출은 2단계. 지금은 LLM만 부른다.
"""

from __future__ import annotations

import json
import time
from typing import Any, AsyncIterator

import httpx

from app.config import Settings
from app.security.url_guard import Resolver, UrlRejected, validate_upstream_url

THINK_OPEN = "<" + "think" + ">"
THINK_CLOSE = "<" + "/" + "think" + ">"


class UpstreamError(Exception):
    """업스트림 호출 실패. kind는 지표용 분류, message는 사용자에게 보여 줄 한국어 안내."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


class ThinkFilter:
    """스트리밍 본문에서 <think>…</think> 구간을 빼고 나머지만 내보낸다.

    조각이 태그 중간에서 잘려 올 수 있으므로, 태그일 가능성이 있는 꼬리는 잠깐 붙들어 둔다.
    """

    def __init__(self) -> None:
        self._buf = ""
        self._in_think = False
        self._skip_newlines = False  # </think> 바로 뒤의 줄바꿈은 조각이 나뉘어 와도 버린다

    def feed(self, text: str) -> str:
        self._buf += text
        out: list[str] = []
        while self._buf:
            if self._in_think:
                idx = self._buf.find(THINK_CLOSE)
                if idx < 0:
                    # 닫는 태그가 아직 안 왔다. 태그가 잘려 있을 수 있으니 꼬리만 남기고 버린다.
                    self._buf = self._buf[-(len(THINK_CLOSE) - 1):]
                    break
                self._buf = self._buf[idx + len(THINK_CLOSE):].lstrip("\n")
                self._in_think = False
                self._skip_newlines = True
            else:
                if self._skip_newlines:
                    self._buf = self._buf.lstrip("\n")
                    if not self._buf:
                        break
                    self._skip_newlines = False
                idx = self._buf.find(THINK_OPEN)
                if idx >= 0:
                    out.append(self._buf[:idx])
                    self._buf = self._buf[idx + len(THINK_OPEN):]
                    self._in_think = True
                    continue
                # 여는 태그의 앞부분으로 끝나면 그만큼은 다음 조각까지 기다린다
                hold = 0
                for n in range(min(len(THINK_OPEN) - 1, len(self._buf)), 0, -1):
                    if THINK_OPEN.startswith(self._buf[-n:]):
                        hold = n
                        break
                out.append(self._buf[: len(self._buf) - hold])
                self._buf = self._buf[len(self._buf) - hold:]
                break
        return "".join(out)

    def flush(self) -> str:
        """스트림이 끝났을 때 붙들고 있던 꼬리를 내보낸다(생각 구간 안이면 버린다)."""
        rest = "" if self._in_think else self._buf
        self._buf = ""
        return rest


def strip_think(text: str) -> str:
    """한 번에 받은 본문에서 생각 구간을 뺀다."""
    f = ThinkFilter()
    return (f.feed(text) + f.flush()).strip()


class UpstreamClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None, resolver: Resolver | None = None):
        self.settings = settings
        self._transport = transport
        self._resolver = resolver

    def _client(self) -> httpx.AsyncClient:
        s = self.settings
        timeout = httpx.Timeout(connect=s.upstream_connect_timeout, read=s.upstream_read_timeout, write=30, pool=10)
        return httpx.AsyncClient(timeout=timeout, follow_redirects=False, transport=self._transport)

    @staticmethod
    def _headers(key: str) -> dict[str, str]:
        headers = {"ngrok-skip-browser-warning": "1", "Accept": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def _checked_url(self, url: str) -> str:
        """보낼 때마다 주소를 다시 검사한다."""
        try:
            return await validate_upstream_url(url, self.settings, self._resolver)
        except UrlRejected as exc:
            raise UpstreamError("rejected_url", exc.message) from None

    @staticmethod
    def _status_error(status: int) -> UpstreamError:
        if status in (401, 403):
            return UpstreamError("upstream_auth", "접속 키가 맞지 않아요. Colab 노트북에 나온 키를 다시 확인해 주세요.")
        if 300 <= status < 400:
            return UpstreamError("upstream_redirect", "이 주소로는 연결할 수 없습니다.")
        return UpstreamError("upstream_error", "Colab 서버가 요청을 처리하지 못했어요. 노트북이 실행 중인지 확인해 주세요.")

    @staticmethod
    def _network_error(exc: Exception) -> UpstreamError:
        if isinstance(exc, httpx.TimeoutException):
            return UpstreamError("timeout", "Colab 서버의 응답이 너무 늦어요. 잠시 뒤에 다시 해 주세요.")
        return UpstreamError("upstream_unreachable", "Colab 서버에 연결할 수 없어요. 노트북과 ngrok이 켜져 있는지 확인해 주세요.")

    async def list_models(self, url: str, key: str) -> tuple[list[str], int]:
        """모델 목록과 걸린 시간(ms). 연결 확인에 쓴다."""
        base = await self._checked_url(url)
        started = time.perf_counter()
        try:
            async with self._client() as client:
                resp = await client.get(f"{base}/v1/models", headers=self._headers(key))
        except httpx.HTTPError as exc:
            raise self._network_error(exc) from None
        if resp.status_code != 200:
            raise self._status_error(resp.status_code)
        try:
            data = resp.json()
            models = [str(m["id"])[:200] for m in data["data"] if isinstance(m, dict) and m.get("id")][:50]
        except (ValueError, KeyError, TypeError):
            # ngrok 경고 페이지(HTML)가 오는 경우도 여기로 온다
            raise UpstreamError("upstream_bad_response", "Task Hive용 Colab 서버가 아닌 것 같아요. 주소를 확인해 주세요.") from None
        return models, int((time.perf_counter() - started) * 1000)

    def _payload(self, messages: list[dict], *, model: str | None, temperature: float, max_tokens: int, stream: bool, response_schema: dict | None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            # thinking 모델이 바로 답하게 한다(지원하지 않는 서버는 무시한다)
            "chat_template_kwargs": {"enable_thinking": False},
        }
        if model:
            payload["model"] = model
        if response_schema is not None:
            # 구조화 출력: 정해진 JSON 모양으로만 답하게 한다(vLLM, Ollama 모두 지원)
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "result", "schema": response_schema, "strict": True},
            }
        return payload

    async def stream_chat(self, url: str, key: str, messages: list[dict], *, model: str | None, temperature: float, max_tokens: int) -> AsyncIterator[str]:
        """답을 조각으로 내보낸다. 실패하면 UpstreamError."""
        base = await self._checked_url(url)
        payload = self._payload(messages, model=model, temperature=temperature, max_tokens=max_tokens, stream=True, response_schema=None)
        think = ThinkFilter()
        try:
            async with self._client() as client:
                async with client.stream("POST", f"{base}/v1/chat/completions", json=payload, headers=self._headers(key)) as resp:
                    if resp.status_code != 200:
                        raise self._status_error(resp.status_code)
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            delta = json.loads(data)["choices"][0].get("delta") or {}
                        except (ValueError, KeyError, IndexError, TypeError):
                            continue  # 모양이 다른 줄은 건너뛴다
                        content = delta.get("content")
                        if isinstance(content, str) and content:
                            piece = think.feed(content)
                            if piece:
                                yield piece
            tail = think.flush()
            if tail:
                yield tail
        except httpx.HTTPError as exc:
            raise self._network_error(exc) from None

    async def complete(self, url: str, key: str, messages: list[dict], *, model: str | None, temperature: float, max_tokens: int, response_schema: dict | None = None) -> str:
        """답을 한 번에 받는다(추출, 요약용)."""
        base = await self._checked_url(url)
        payload = self._payload(messages, model=model, temperature=temperature, max_tokens=max_tokens, stream=False, response_schema=response_schema)
        try:
            async with self._client() as client:
                resp = await client.post(f"{base}/v1/chat/completions", json=payload, headers=self._headers(key))
        except httpx.HTTPError as exc:
            raise self._network_error(exc) from None
        if resp.status_code != 200:
            raise self._status_error(resp.status_code)
        try:
            content = resp.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            raise UpstreamError("upstream_bad_response", "Colab 서버의 응답을 읽을 수 없어요.") from None
        return strip_think(content if isinstance(content, str) else "")
