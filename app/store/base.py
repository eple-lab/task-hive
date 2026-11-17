"""저장소가 제공해야 하는 함수 목록.

모든 함수의 첫 인자는 owner다: "guest:<세션 ID>" 또는 (2단계) "google:<사용자 UUID>".
저장소는 owner가 다른 데이터를 절대 돌려주거나 고치지 않는다.
    → 남의 태스크 id로 요청하면 "없는 것"으로 보인다(404). todo의 RLS와 같은 효과를 코드로 낸다.
    → Postgres 구현에서는 여기에 RLS를 한 겹 더 건다(P-04).

태스크의 모양(dict)은 API 계약(GET /api/tasks)과 같다:
    {"id", "title", "due_date", "completed", "completed_at", "archived", "source",
     "hex_q", "hex_r", "created_at", "subtasks": [{"id", "title", "completed"}]}

규칙 위반은 StoreError로 알린다. 라우터가 ApiError로 바꾼다.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

Task = dict[str, Any]


class StoreError(Exception):
    """저장소 규칙 위반. status는 HTTP 상태, code는 오류 코드."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class Store(ABC):
    # ── 사용자(손님) ─────────────────────────────────────────
    @abstractmethod
    def ensure_owner(self, owner: str, name: str) -> None:
        """owner 행이 없으면 만든다."""

    @abstractmethod
    def touch(self, owner: str) -> bool:
        """마지막 활동 시각을 지금으로 바꾼다. owner가 없으면(지워졌으면) False."""

    @abstractmethod
    def get_prefs(self, owner: str) -> dict:
        """저장된 설정(언어, 도시, 음성, LLM, 기능 켬·끔). 없으면 빈 dict."""

    @abstractmethod
    def update_prefs(self, owner: str, patch: dict) -> dict:
        """설정 일부를 바꾸고 전체를 돌려준다."""

    @abstractmethod
    def delete_owner(self, owner: str) -> None:
        """owner와 그 태스크를 모두 지운다(손님 내려받기 직후, 탈퇴)."""

    # ── 태스크 ───────────────────────────────────────────────
    @abstractmethod
    def list_tasks(self, owner: str) -> list[Task]: ...

    @abstractmethod
    def create_tasks(self, owner: str, items: list[dict]) -> list[Task]:
        """여러 태스크를 한 번에 만든다. 하나라도 규칙에 걸리면 아무것도 만들지 않는다."""

    @abstractmethod
    def update_task(self, owner: str, task_id: int, patch: dict) -> Task: ...

    @abstractmethod
    def delete_task(self, owner: str, task_id: int) -> None: ...

    # ── 하위 태스크 ──────────────────────────────────────────
    @abstractmethod
    def add_subtask(self, owner: str, task_id: int, title: str) -> Task: ...

    @abstractmethod
    def update_subtask(self, owner: str, task_id: int, subtask_id: int, patch: dict) -> Task: ...

    @abstractmethod
    def delete_subtask(self, owner: str, task_id: int, subtask_id: int) -> Task: ...

    # ── 정리 ────────────────────────────────────────────────
    @abstractmethod
    def cleanup(self, now: datetime | None = None) -> dict:
        """24시간 지난 손님과 90일 지난 완료 태스크를 지운다. 지운 개수를 돌려준다."""
