"""태스크와 하위 태스크: /api/tasks ...

규칙 검사는 저장소(store/memory.py)가 한다. 여기서는 입력 모양만 확인하고 넘긴다.
    - 저장소는 owner가 다른 태스크를 "없는 것"으로 본다 → 남의 id로 요청하면 404.

벌집 등록 (docs/03 6.2)
    - POST /api/tasks/bulk: "등록 예정" 목록을 한 번에 넣는다. 하나라도 규칙에 걸리면 전부 취소된다.
    - 응답에 벌집 좌표(hex_q, hex_r)가 들어 있다. 화면은 저장이 성공한 뒤에 벌 애니메이션을 시작한다.

아직 안 된 것
    - 구글 시트 내보내기(D-02, D-18)는 2단계. 등록 뒤에 시트로 보내는 자리만 주석으로 남겼다.
"""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.deps import Ctx, get_metrics, get_store, require_user, store_error
from app.services.metrics import Metrics
from app.store.base import Store, StoreError

router = APIRouter()


class TaskItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(max_length=1000)  # 실제 한도(200자)는 저장소가 다듬은 뒤에 검사한다
    due_date: str | None = Field(default=None, max_length=10)
    subtasks: list[str] = Field(default_factory=list, max_length=60)
    source: Literal["chat", "calendar", "manual"] = "chat"


class BulkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[TaskItemIn] = Field(min_length=1, max_length=50)


class TaskPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=1000)
    due_date: str | None = Field(default=None, max_length=10)
    completed: bool | None = None
    archived: bool | None = None


class SubtaskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(max_length=1000)


class SubtaskPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=1000)
    completed: bool | None = None


@router.get("/api/tasks")
def list_tasks(ctx: Ctx = Depends(require_user), store: Store = Depends(get_store)):
    return {"tasks": store.list_tasks(ctx.owner)}


@router.post("/api/tasks/bulk")
def create_tasks(body: BulkIn, ctx: Ctx = Depends(require_user), store: Store = Depends(get_store), metrics: Metrics = Depends(get_metrics)):
    started = time.perf_counter()
    try:
        created = store.create_tasks(ctx.owner, [item.model_dump() for item in body.items])
    except StoreError as exc:
        metrics.record("hive_register", status=exc.code)
        raise store_error(exc) from None
    metrics.record("hive_register", total_ms=int((time.perf_counter() - started) * 1000))
    # TODO(2단계, D-18): 시트 내보내기가 켜져 있으면 여기서 사용자의 구글 시트에 행을 추가한다.
    #   실패해도 등록은 유지하고 "시트 반영 실패"만 알린다(원본은 Neon, D-02).
    return {"tasks": created}


@router.patch("/api/tasks/{task_id}")
def update_task(task_id: int, body: TaskPatchIn, ctx: Ctx = Depends(require_user), store: Store = Depends(get_store)):
    # exclude_unset: 화면이 보낸 칸만 바꾼다. due_date를 null로 보내면 "마감일 없음"으로 바꾼다는 뜻.
    try:
        return store.update_task(ctx.owner, task_id, body.model_dump(exclude_unset=True))
    except StoreError as exc:
        raise store_error(exc) from None


@router.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, ctx: Ctx = Depends(require_user), store: Store = Depends(get_store)):
    """삭제는 화면에서 직접 누를 때만 된다. 대화(LLM)로는 지울 수 없다(D-21)."""
    try:
        store.delete_task(ctx.owner, task_id)
    except StoreError as exc:
        raise store_error(exc) from None
    return Response(status_code=204)


@router.post("/api/tasks/{task_id}/subtasks")
def add_subtask(task_id: int, body: SubtaskIn, ctx: Ctx = Depends(require_user), store: Store = Depends(get_store)):
    try:
        return store.add_subtask(ctx.owner, task_id, body.title)
    except StoreError as exc:
        raise store_error(exc) from None


@router.patch("/api/tasks/{task_id}/subtasks/{subtask_id}")
def update_subtask(task_id: int, subtask_id: int, body: SubtaskPatchIn, ctx: Ctx = Depends(require_user), store: Store = Depends(get_store)):
    try:
        return store.update_subtask(ctx.owner, task_id, subtask_id, body.model_dump(exclude_unset=True))
    except StoreError as exc:
        raise store_error(exc) from None


@router.delete("/api/tasks/{task_id}/subtasks/{subtask_id}")
def delete_subtask(task_id: int, subtask_id: int, ctx: Ctx = Depends(require_user), store: Store = Depends(get_store)):
    try:
        return store.delete_subtask(ctx.owner, task_id, subtask_id)
    except StoreError as exc:
        raise store_error(exc) from None
