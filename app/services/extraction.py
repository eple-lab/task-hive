"""LLM이 낸 추출 결과 검증.

이 파일의 `parse_and_validate`는 eval/run_eval.py도 쓴다. 이름과 인자를 바꾸지 말 것.

왜 검증하나 (P-06, docs/05 6장)
    - LLM 출력은 믿을 수 없는 입력이다. 형식이 깨질 수 있고, 지어낼 수 있고,
      대화 속 문장에 속아 엉뚱한 번호를 낼 수 있다.
    - 그래서 LLM은 "제안"만 하고, 여기서 모양·길이·소유를 확인한 것만 화면으로 보낸다.
    - 여기서 통과해도 후보는 사용자가 "담기"를 눌러야 등록된다. 완료 신호는 D-21 규칙대로 화면이 처리한다.

검증 내용
    candidates
        - title: 글자여야 하고, 다듬은 뒤 1~200자. 아니면 그 후보를 버린다.
        - 이미 등록된 할 일과 제목이 같으면 버린다(등록할 때 409가 나기 때문).
        - 같은 제목이 두 번 나오면 하나만 남긴다.
        - due_date: 실제로 있는 날짜(YYYY-MM-DD)가 아니면 null로 바꾼다(버리지 않는다).
        - subtasks: 글자인 것만, 중복 제거, 최대 30개.
        - evidence: 300자까지. confidence: 0~1로 자른다. 숫자가 아니면 0.5.
    completions
        - task_id가 넘겨받은 tasks(이 사용자의 것)에 없으면 버린다. ← 소유 검사
        - 이미 끝났거나 보관한 태스크는 버린다.
        - subtask_id가 그 태스크의 것이 아니면 버린다.
    공통
        - JSON으로 읽을 수 없으면 빈 결과를 돌려준다(오류를 내지 않는다).
        - 각각 최대 10개.
        - 스키마에 없는 칸(예: "delete": true)은 무시한다. LLM은 삭제를 제안할 수 없다.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from app.errors import ApiError
from app.security.sanitize import clean_title

MAX_ITEMS = 10
MAX_SUBTASKS = 30
EVIDENCE_MAX = 300

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def _empty() -> dict:
    return {"candidates": [], "completions": []}


def _load_json(raw: str) -> Any:
    """코드펜스나 앞뒤 설명이 섞여 있어도 JSON 객체 하나를 찾아 읽는다. 못 읽으면 None."""
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except ValueError:
        pass
    # 앞뒤에 설명이 붙은 경우: 첫 '{'부터 마지막 '}'까지를 다시 시도
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        try:
            return json.loads(text[start : end + 1])
        except ValueError:
            return None
    return None


def _title_or_none(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    try:
        return clean_title(raw)
    except ApiError:
        return None


def _due_or_none(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    try:
        return date.fromisoformat(raw.strip()).isoformat()
    except ValueError:
        return None


def _confidence(raw: Any) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return 0.5
    return round(min(1.0, max(0.0, float(raw))), 3)


def _evidence(raw: Any) -> str:
    return " ".join(raw.split())[:EVIDENCE_MAX] if isinstance(raw, str) else ""


def _norm(title: str) -> str:
    return title.strip().casefold()


def parse_and_validate(raw: str, tasks: list[dict]) -> dict:
    """LLM 출력(raw)을 검증해 {"candidates": [...], "completions": [...]}로 돌려준다.

    tasks는 "이 사용자의" 태스크 목록이다(API 계약의 태스크 모양). 소유 검사의 기준이 된다.
    """
    data = _load_json(raw)
    if not isinstance(data, dict):
        return _empty()

    existing_titles = {_norm(t["title"]) for t in tasks if isinstance(t.get("title"), str)}
    task_by_id = {t["id"]: t for t in tasks if isinstance(t.get("id"), int)}

    candidates: list[dict] = []
    seen: set[str] = set()
    raw_candidates = data.get("candidates")
    for item in raw_candidates if isinstance(raw_candidates, list) else []:
        if len(candidates) >= MAX_ITEMS:
            break
        if not isinstance(item, dict):
            continue
        title = _title_or_none(item.get("title"))
        if title is None or _norm(title) in existing_titles or _norm(title) in seen:
            continue
        seen.add(_norm(title))

        subtasks: list[str] = []
        sub_seen: set[str] = set()
        raw_subs = item.get("subtasks")
        for sub in raw_subs if isinstance(raw_subs, list) else []:
            st = _title_or_none(sub)
            if st is None or _norm(st) in sub_seen or len(subtasks) >= MAX_SUBTASKS:
                continue
            sub_seen.add(_norm(st))
            subtasks.append(st)

        candidates.append(
            {
                "title": title,
                "due_date": _due_or_none(item.get("due_date")),
                "subtasks": subtasks,
                "evidence": _evidence(item.get("evidence")),
                "confidence": _confidence(item.get("confidence")),
            }
        )

    completions: list[dict] = []
    done_seen: set[tuple[int, int | None]] = set()
    raw_completions = data.get("completions")
    for item in raw_completions if isinstance(raw_completions, list) else []:
        if len(completions) >= MAX_ITEMS:
            break
        if not isinstance(item, dict):
            continue
        task_id = item.get("task_id")
        if isinstance(task_id, bool) or not isinstance(task_id, int):
            continue
        task = task_by_id.get(task_id)
        if task is None or task.get("completed") or task.get("archived"):
            continue  # 남의 태스크, 없는 번호, 이미 끝난 것은 버린다

        subtask_id = item.get("subtask_id")
        if isinstance(subtask_id, bool) or not isinstance(subtask_id, int):
            subtask_id = None
        if subtask_id is not None:
            sub_ids = {s["id"] for s in task.get("subtasks") or [] if not s.get("completed")}
            if subtask_id not in sub_ids:
                continue  # 그 태스크의 하위 태스크가 아니거나 이미 끝난 것
        key = (task_id, subtask_id)
        if key in done_seen:
            continue
        done_seen.add(key)

        completions.append(
            {
                "task_id": task_id,
                "subtask_id": subtask_id,
                # 특정 하위 태스크를 가리켰으면 "전부"는 아니다
                "all_subtasks": bool(item.get("all_subtasks") is True and subtask_id is None),
                "evidence": _evidence(item.get("evidence")),
                "confidence": _confidence(item.get("confidence")),
            }
        )

    return {"candidates": candidates, "completions": completions}


def parse_diary(raw: str) -> dict | None:
    """일기 요약 결과 검증. 못 읽으면 None."""
    data = _load_json(raw)
    if not isinstance(data, dict):
        return None

    def _text(value: Any, limit: int) -> str:
        return value.strip()[:limit] if isinstance(value, str) else ""

    def _items(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [" ".join(v.split())[:200] for v in value if isinstance(v, str) and v.strip()][:20]

    body = _text(data.get("body"), 3000)
    summary = " ".join(_text(data.get("summary_line"), 200).split())
    if not body and not summary:
        return None
    return {"summary_line": summary, "body": body, "did": _items(data.get("did")), "todo": _items(data.get("todo"))}
