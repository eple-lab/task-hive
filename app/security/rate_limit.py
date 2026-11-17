"""IP별 요청 횟수 제한 (서버 메모리).

왜 필요한가
    - 남용을 막고, Render 무료가 "비정상적으로 많은 외부 요청"으로 정지되는 것을 피한다(docs/09 2.1).

알고 받아들인 한계 (docs/05 11장)
    - 기록이 서버 메모리에 있어 재시작하면 초기화된다. 인스턴스 1개 기준이다.

IP는 X-Forwarded-For의 "맨 뒤" 값을 쓴다 (honey-voice-log 방식).
    - 맨 앞 값은 클라이언트가 마음대로 적어 보낼 수 있다. 맨 뒤 값은 우리 앞의 프록시(Render)가 붙인다.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip() or "unknown"
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """1분 창(sliding window) 제한. key는 "그룹:IP"."""

    def __init__(self, window_seconds: int = 60):
        self.window = window_seconds
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int) -> bool:
        now = time.monotonic()
        bucket = self._buckets[key]
        while bucket and bucket[0] < now - self.window:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True

    def sweep(self) -> None:
        """오래된 빈 기록을 지워 메모리가 계속 늘지 않게 한다."""
        now = time.monotonic()
        for key in [k for k, b in self._buckets.items() if not b or b[-1] < now - self.window]:
            del self._buckets[key]
