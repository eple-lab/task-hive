"""메모리 저장소 (DATABASE_URL이 없을 때 쓴다, D-26).

이 파일이 하는 일
    - 손님과 태스크를 서버 메모리(dict)에 둔다. 서버를 끄면 사라진다.
    - 태스크 규칙을 여기서 검사한다(화면에서도 검사하지만 화면은 믿지 않는다: docs/05 7장).

태스크 규칙 (todo/docs/business-rules.md에서 이어받음, docs/01 5.5)
    - 제목은 비울 수 없고 200자까지 (sanitize.clean_title, 길이는 MAX_TITLE_CHARS)
    - 태스크 제목은 같은 사용자 안에서 중복 불가 (대소문자·앞뒤 공백 무시)
    - 하위 태스크 제목은 "같은 태스크 안에서만" 중복 불가
    - 마감일(due_date)은 없어도 된다 (todo와 다른 점, R-HIVE-5)
    - 벌집 칸 수 한도를 넘으면 409 (D-24: 보관함으로 옮기라고 안내)

완료 규칙
    - 태스크를 완료하면 하위 태스크도 모두 완료로 바꾼다(화면이 미리 확인받는다, D-21).
    - 하위 태스크가 모두 완료되면 태스크도 완료된다(꿀이 가득 → DONE).
    - 완료된 태스크의 하위 태스크를 하나라도 풀면 태스크도 미완료로 돌아간다.

보관(archived, D-24)
    - 보관하면 벌집 칸을 비운다(hex_q, hex_r = null). 리스트(보관함)에서만 보인다.
    - 보관을 풀면 빈 칸을 새로 배정한다. 빈 칸이 없으면 409.

동시성
    - FastAPI는 같은 프로세스에서 요청을 번갈아 처리한다. 여기 함수는 모두 await 없이 끝나므로
      중간에 끼어들 수 없다. 스레드에서 부를 경우를 대비해 Lock을 하나 둔다.

아직 안 된 것
    - 제목 암호화(P-03)는 Postgres 구현에서 한다. 메모리 저장소는 평문이다.
"""

from __future__ import annotations

import copy
import random
import threading
from datetime import date, datetime, timedelta, timezone

from app.config import Settings
from app.errors import ApiError
from app.security.sanitize import clean_title
from app.store.base import Store, StoreError, Task
from app.store.hive import pick_free_cell

MAX_SUBTASKS = 30
MAX_BULK = 50
SOURCES = ("chat", "calendar", "manual")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


def _norm(title: str) -> str:
    """중복 비교용: 앞뒤 공백 제거 + 소문자."""
    return title.strip().casefold()


def _title(raw, what: str, max_chars: int = 200) -> str:
    """제목 검사. ApiError(화면용)를 StoreError(저장소용)로 바꿔 한 종류로 맞춘다."""
    if not isinstance(raw, str):
        raise StoreError(422, "empty_title", f"{what}을 적어 주세요.")
    try:
        return clean_title(raw, what, max_chars)
    except ApiError as exc:
        raise StoreError(exc.status, exc.code, exc.message) from None


def _due(raw) -> str | None:
    """마감일 검사. 없으면 None, 있으면 실제로 있는 날짜(YYYY-MM-DD)여야 한다."""
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str):
        raise StoreError(422, "invalid_due_date", "마감일 형식을 확인해 주세요. (예: 2026-11-30)")
    try:
        return date.fromisoformat(raw).isoformat()
    except ValueError:
        raise StoreError(422, "invalid_due_date", "마감일 형식을 확인해 주세요. (예: 2026-11-30)") from None


class MemoryStore(Store):
    def __init__(self, settings: Settings, rng: random.Random | None = None):
        self.settings = settings
        self._rng = rng or random.Random()
        self._lock = threading.Lock()
        # owner → {"name", "prefs", "last_activity", "tasks": [내부 태스크 dict]}
        self._owners: dict[str, dict] = {}
        self._next_id = 1

    # ── 내부 도우미 ─────────────────────────────────────────
    def _owner(self, owner: str) -> dict:
        row = self._owners.get(owner)
        if row is None:
            # 쿠키는 살아 있는데 데이터가 지워진 손님(24시간 경과, 서버 재시작)
            raise StoreError(401, "session_expired", "이전 내용은 지워졌어요. 새로 시작해 주세요.")
        return row

    def _new_id(self) -> int:
        value = self._next_id
        self._next_id += 1
        return value

    def _find(self, owner: str, task_id: int) -> dict:
        for task in self._owner(owner)["tasks"]:
            if task["id"] == task_id:
                return task
        # 남의 태스크 id도 여기로 온다: "없는 것"으로 보이게 한다
        raise StoreError(404, "task_not_found", "할 일을 찾을 수 없습니다.")

    def _occupied(self, tasks: list[dict]) -> set[tuple[int, int]]:
        return {(t["hex_q"], t["hex_r"]) for t in tasks if not t["archived"] and t["hex_q"] is not None}

    def _assign_cell(self, tasks: list[dict], extra: set[tuple[int, int]] | None = None) -> tuple[int, int]:
        occupied = self._occupied(tasks) | (extra or set())
        cell = pick_free_cell(occupied, self.settings.hive_max_rings, self._rng)
        if cell is None:
            raise StoreError(
                409,
                "hive_full",
                f"벌집이 가득 찼어요({self.settings.hive_max_cells}칸). 끝낸 할 일을 보관함으로 옮겨 주세요.",
            )
        return cell

    @staticmethod
    def _public(task: dict) -> Task:
        """밖으로 내보낼 모양(API 계약). 내부 dict를 그대로 주지 않고 복사한다."""
        out = copy.deepcopy(task)
        out["completed_at"] = _iso(task["completed_at"])
        out["created_at"] = _iso(task["created_at"])
        return out

    def _sync_completion(self, task: dict) -> None:
        """하위 태스크 상태에 맞춰 태스크 완료 여부를 맞춘다."""
        subs = task["subtasks"]
        if not subs:
            return
        all_done = all(s["completed"] for s in subs)
        if all_done and not task["completed"]:
            task["completed"], task["completed_at"] = True, _now()
        elif not all_done and task["completed"]:
            task["completed"], task["completed_at"] = False, None

    # ── 사용자(손님) ────────────────────────────────────────
    def ensure_owner(self, owner: str, name: str) -> None:
        with self._lock:
            if owner not in self._owners:
                self._owners[owner] = {"name": name, "prefs": {}, "last_activity": _now(), "tasks": []}

    def touch(self, owner: str) -> bool:
        with self._lock:
            row = self._owners.get(owner)
            if row is None:
                return False
            row["last_activity"] = _now()
            return True

    def get_prefs(self, owner: str) -> dict:
        with self._lock:
            row = self._owners.get(owner)
            return copy.deepcopy(row["prefs"]) if row else {}

    def update_prefs(self, owner: str, patch: dict) -> dict:
        with self._lock:
            prefs = self._owner(owner)["prefs"]
            for key, value in patch.items():
                # voice, llm, features는 일부만 바꿀 수 있게 한 단계 합친다
                if isinstance(value, dict) and isinstance(prefs.get(key), dict):
                    prefs[key] = {**prefs[key], **value}
                else:
                    prefs[key] = value
            return copy.deepcopy(prefs)

    def delete_owner(self, owner: str) -> None:
        with self._lock:
            self._owners.pop(owner, None)

    # ── 태스크 ──────────────────────────────────────────────
    def list_tasks(self, owner: str) -> list[Task]:
        with self._lock:
            return [self._public(t) for t in self._owner(owner)["tasks"]]

    def create_tasks(self, owner: str, items: list[dict]) -> list[Task]:
        with self._lock:
            tasks = self._owner(owner)["tasks"]
            if not items:
                raise StoreError(422, "empty_items", "등록할 할 일이 없습니다.")
            if len(items) > MAX_BULK:
                raise StoreError(422, "too_many_items", f"한 번에 {MAX_BULK}개까지 등록할 수 있어요.")

            # 1단계: 전부 검사한다. 하나라도 걸리면 아무것도 만들지 않는다.
            existing = {_norm(t["title"]) for t in tasks}
            prepared: list[dict] = []
            taken: set[tuple[int, int]] = set()
            for item in items:
                title = _title(item.get("title"), "할 일 제목", self.settings.max_title_chars)
                if _norm(title) in existing:
                    raise StoreError(409, "duplicate_title", f"같은 제목의 할 일이 이미 있어요: {title}")
                existing.add(_norm(title))

                sub_titles: list[str] = []
                seen: set[str] = set()
                for raw in item.get("subtasks") or []:
                    st = _title(raw, "하위 할 일 제목", self.settings.max_title_chars)
                    if _norm(st) in seen:
                        raise StoreError(409, "duplicate_subtask", f"같은 하위 할 일이 두 번 들어 있어요: {st}")
                    seen.add(_norm(st))
                    sub_titles.append(st)
                if len(sub_titles) > MAX_SUBTASKS:
                    raise StoreError(422, "too_many_subtasks", f"하위 할 일은 {MAX_SUBTASKS}개까지 넣을 수 있어요.")

                source = item.get("source") or "chat"
                if source not in SOURCES:
                    raise StoreError(422, "invalid_source", "출처 값을 확인해 주세요.")

                cell = self._assign_cell(tasks, taken)  # 칸이 모자라면 여기서 409
                taken.add(cell)
                prepared.append(
                    {"title": title, "due_date": _due(item.get("due_date")), "subs": sub_titles, "source": source, "cell": cell}
                )

            # 2단계: 만든다.
            created: list[dict] = []
            for p in prepared:
                task = {
                    "id": self._new_id(),
                    "title": p["title"],
                    "due_date": p["due_date"],
                    "completed": False,
                    "completed_at": None,
                    "archived": False,
                    "source": p["source"],
                    "hex_q": p["cell"][0],
                    "hex_r": p["cell"][1],
                    "created_at": _now(),
                    "subtasks": [{"id": self._new_id(), "title": s, "completed": False} for s in p["subs"]],
                }
                tasks.append(task)
                created.append(task)
            return [self._public(t) for t in created]

    def update_task(self, owner: str, task_id: int, patch: dict) -> Task:
        with self._lock:
            tasks = self._owner(owner)["tasks"]
            task = self._find(owner, task_id)

            if "title" in patch and patch["title"] is not None:
                title = _title(patch["title"], "할 일 제목", self.settings.max_title_chars)
                if any(_norm(t["title"]) == _norm(title) and t["id"] != task_id for t in tasks):
                    raise StoreError(409, "duplicate_title", f"같은 제목의 할 일이 이미 있어요: {title}")
                task["title"] = title

            if "due_date" in patch:
                task["due_date"] = _due(patch["due_date"])

            if "completed" in patch and patch["completed"] is not None:
                done = bool(patch["completed"])
                if done != task["completed"]:
                    task["completed"] = done
                    task["completed_at"] = _now() if done else None
                    if done:
                        for sub in task["subtasks"]:
                            sub["completed"] = True

            if "archived" in patch and patch["archived"] is not None:
                archive = bool(patch["archived"])
                if archive and not task["archived"]:
                    task["archived"], task["hex_q"], task["hex_r"] = True, None, None
                elif not archive and task["archived"]:
                    q, r = self._assign_cell(tasks)  # 빈 칸이 없으면 409
                    task["archived"], task["hex_q"], task["hex_r"] = False, q, r

            return self._public(task)

    def delete_task(self, owner: str, task_id: int) -> None:
        with self._lock:
            task = self._find(owner, task_id)
            self._owner(owner)["tasks"].remove(task)

    # ── 하위 태스크 ─────────────────────────────────────────
    def add_subtask(self, owner: str, task_id: int, title: str) -> Task:
        with self._lock:
            task = self._find(owner, task_id)
            title = _title(title, "하위 할 일 제목", self.settings.max_title_chars)
            if len(task["subtasks"]) >= MAX_SUBTASKS:
                raise StoreError(422, "too_many_subtasks", f"하위 할 일은 {MAX_SUBTASKS}개까지 넣을 수 있어요.")
            if any(_norm(s["title"]) == _norm(title) for s in task["subtasks"]):
                raise StoreError(409, "duplicate_subtask", f"같은 하위 할 일이 이미 있어요: {title}")
            task["subtasks"].append({"id": self._new_id(), "title": title, "completed": False})
            self._sync_completion(task)  # 완료된 태스크에 새 항목이 생기면 미완료로 돌아간다
            return self._public(task)

    def _find_sub(self, task: dict, subtask_id: int) -> dict:
        for sub in task["subtasks"]:
            if sub["id"] == subtask_id:
                return sub
        raise StoreError(404, "subtask_not_found", "하위 할 일을 찾을 수 없습니다.")

    def update_subtask(self, owner: str, task_id: int, subtask_id: int, patch: dict) -> Task:
        with self._lock:
            task = self._find(owner, task_id)
            sub = self._find_sub(task, subtask_id)
            if "title" in patch and patch["title"] is not None:
                title = _title(patch["title"], "하위 할 일 제목", self.settings.max_title_chars)
                if any(_norm(s["title"]) == _norm(title) and s["id"] != subtask_id for s in task["subtasks"]):
                    raise StoreError(409, "duplicate_subtask", f"같은 하위 할 일이 이미 있어요: {title}")
                sub["title"] = title
            if "completed" in patch and patch["completed"] is not None:
                sub["completed"] = bool(patch["completed"])
                self._sync_completion(task)
            return self._public(task)

    def delete_subtask(self, owner: str, task_id: int, subtask_id: int) -> Task:
        with self._lock:
            task = self._find(owner, task_id)
            task["subtasks"].remove(self._find_sub(task, subtask_id))
            self._sync_completion(task)
            return self._public(task)

    # ── 정리 ────────────────────────────────────────────────
    def cleanup(self, now: datetime | None = None) -> dict:
        """D-07: 마지막 활동 24시간 지난 손님 삭제. D-23: 완료 후 90일 지난 태스크 삭제."""
        now = now or _now()
        guest_cutoff = now - timedelta(hours=self.settings.guest_ttl_hours)
        done_cutoff = now - timedelta(days=self.settings.done_task_ttl_days)
        with self._lock:
            stale = [o for o, row in self._owners.items() if o.startswith("guest:") and row["last_activity"] < guest_cutoff]
            for owner in stale:
                del self._owners[owner]
            removed_tasks = 0
            for row in self._owners.values():
                keep = [t for t in row["tasks"] if not (t["completed_at"] and t["completed_at"] < done_cutoff)]
                removed_tasks += len(row["tasks"]) - len(keep)
                row["tasks"] = keep
            return {"guests": len(stale), "done_tasks": removed_tasks}
