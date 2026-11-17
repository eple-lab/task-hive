"""숫자만 모으는 지표 (docs/08-performance-review.md 7장).

기록하는 것   시각, 종류(kind), 첫 글자까지 시간, 전체 시간, 낸 토큰 수(대략), 상태
기록하지 않는 것   사용자·세션 구분 값, 업스트림 주소, 대화 본문, 태스크 제목, IP

지금은 서버 메모리에만 둔다(최근 5,000건). 서버가 재시작하면 사라진다.
Postgres의 metric_events 표로 옮기는 것은 3단계다.
"""

from __future__ import annotations

import statistics
from collections import Counter, deque
from datetime import datetime, timedelta, timezone

KINDS = ("chat", "extract", "diary", "tts", "stt", "calendar", "hive_register", "upstream_check", "security", "client_tts", "client_render", "client_chat_ttfb")
# client_chat_ttfb: 화면이 잰 "보내기 → 첫 글자" 시간(실제 서버+Ollama 연결 때 화면이 보내는데 허용 목록에 없어 422였다)


def _percentile(values: list[int], pct: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(pct / 100 * (len(ordered) - 1))))
    return ordered[index]


class Metrics:
    def __init__(self, maxlen: int = 5000):
        self._events: deque[dict] = deque(maxlen=maxlen)

    def record(self, kind: str, *, status: str = "ok", ttfb_ms: int | None = None, total_ms: int | None = None, tokens_out: int | None = None) -> None:
        """기록 실패가 사용자 요청을 깨뜨리면 안 되므로 예외를 밖으로 내지 않는다."""
        try:
            self._events.append(
                {"at": datetime.now(timezone.utc), "kind": str(kind)[:40], "status": str(status)[:40], "ttfb_ms": ttfb_ms, "total_ms": total_ms, "tokens_out": tokens_out}
            )
        except Exception:  # noqa: BLE001
            pass

    def summary(self, hours: int = 24) -> dict:
        """관리자 화면용 집계. 숫자만 돌려준다."""
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        events = [e for e in self._events if e["at"] >= since]
        by_kind: dict[str, dict] = {}
        for kind in sorted({e["kind"] for e in events}):
            rows = [e for e in events if e["kind"] == kind]
            ttfb = [e["ttfb_ms"] for e in rows if e["ttfb_ms"] is not None]
            total = [e["total_ms"] for e in rows if e["total_ms"] is not None]
            errors = sum(1 for e in rows if e["status"] != "ok")
            # 초당 토큰: 토큰 수와 전체 시간이 둘 다 있는 요청만
            tps = [e["tokens_out"] / (e["total_ms"] / 1000) for e in rows if e["tokens_out"] and e["total_ms"]]
            by_kind[kind] = {
                "count": len(rows),
                "errors": errors,
                "error_rate": round(errors / len(rows), 4) if rows else 0.0,
                "ttfb_ms_p50": _percentile(ttfb, 50),
                "ttfb_ms_p95": _percentile(ttfb, 95),
                "total_ms_p50": _percentile(total, 50),
                "total_ms_p95": _percentile(total, 95),
                "tokens_per_sec_avg": round(statistics.fmean(tps), 2) if tps else None,
            }
        return {
            "range_hours": hours,
            "total": len(events),
            "by_kind": by_kind,
            "statuses": dict(Counter(e["status"] for e in events)),
        }
