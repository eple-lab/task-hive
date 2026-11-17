"""내려받기: GET /api/export.

손님 규칙 (D-07, R-AUTH-3)
    - 손님이 태스크를 Markdown 파일로 내려받으면, 응답을 보낸 "뒤에" 그 손님의 데이터를 지우고 쿠키도 지운다.
    - 화면은 내려받기 전에 "내려받으면 여기 내용은 지워져요"라고 알려야 한다(프론트 담당).

Markdown에 사용자 글을 넣을 때
    - 줄 맨 앞의 #, > 같은 기호가 문서 구조를 깨지 않게 앞에 역슬래시를 붙인다(honey-voice-log 방식).

GET인데 데이터를 지우는 것에 대해
    - 파일 내려받기라서 GET으로 두었다(API 계약).
    - SameSite=Lax 쿠키는 다른 사이트의 "주소 이동"에는 실린다. 누군가 이 주소로 가는 링크를 누르게 하면
      손님 데이터가 내려받아지고 지워질 수 있다.
    - 그래서 브라우저가 붙이는 `Sec-Fetch-Site` 헤더가 "cross-site"면(다른 사이트에서 넘어온 요청)
      내려받기를 거절한다. 우리 화면에서 부른 요청(same-origin)과 주소창에 직접 친 요청(none)은 통과한다.
"""

from __future__ import annotations

import re
from datetime import date

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from starlette.background import BackgroundTask

from app.config import Settings
from app.deps import Ctx, get_settings, get_store, now_kst, require_user
from app.errors import ApiError
from app.security.session import clear_session
from app.store.base import Store

router = APIRouter()

_MD_SPECIAL_START = re.compile(r"^(\s*)([#>\-+*]|\d+\.)")


def _md(text: str) -> str:
    """사용자 글이 Markdown 구조로 해석되지 않게 한다."""
    # "<"도 막는다: <script> 같은 글자가 HTML을 허용하는 Markdown 뷰어에서 태그로 해석되지 않게 한다
    text = text.replace("\\", "\\\\").replace("`", "\\`").replace("[", "\\[").replace("]", "\\]").replace("<", "\\<")
    return _MD_SPECIAL_START.sub(lambda m: f"{m.group(1)}\\{m.group(2)}", text)


def _dday(due: str | None, today: date) -> str:
    if not due:
        return ""
    diff = (date.fromisoformat(due) - today).days
    label = "D-DAY" if diff == 0 else (f"D-{diff}" if diff > 0 else f"D+{-diff}")
    return f" · {due} ({label})"


def build_markdown(name: str | None, tasks: list[dict]) -> str:
    today = now_kst().date()
    lines = ["# Task Hive 할 일", "", f"- 내려받은 날: {today.isoformat()}"]
    if name:
        lines.append(f"- 이름: {_md(name)}")
    active = [t for t in tasks if not t["archived"]]
    archived = [t for t in tasks if t["archived"]]
    for heading, group in (("벌집", active), ("보관함", archived)):
        if not group:
            continue
        lines += ["", f"## {heading}", ""]
        for t in group:
            box = "x" if t["completed"] else " "
            lines.append(f"- [{box}] {_md(t['title'])}{_dday(t['due_date'], today)}")
            for s in t["subtasks"]:
                lines.append(f"    - [{'x' if s['completed'] else ' '}] {_md(s['title'])}")
    if not tasks:
        lines += ["", "등록한 할 일이 없습니다."]
    return "\n".join(lines) + "\n"


@router.get("/api/export")
def export(request: Request, ctx: Ctx = Depends(require_user), settings: Settings = Depends(get_settings), store: Store = Depends(get_store)):
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise ApiError(403, "cross_site", "이 화면에서 직접 내려받아 주세요.")
    body = build_markdown(ctx.session.get("name"), store.list_tasks(ctx.owner))
    filename = f"task-hive-{now_kst():%Y%m%d}.md"
    response = Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
    # 손님은 응답을 보낸 뒤 데이터를 지운다(D-07)
    if ctx.session["mode"] == "guest":
        response.headers["X-TH-Deleted"] = "1"  # 화면이 "지워졌어요" 안내를 띄울 수 있게
        clear_session(response, settings)
        response.background = BackgroundTask(store.delete_owner, ctx.owner)  # 응답을 보낸 뒤에 지운다
    return response
