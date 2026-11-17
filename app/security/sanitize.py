"""입력 다듬기와 외부 글 감싸기.

    clean_name      부를 이름 검사 (honey-voice-log 규칙: 20자, < > " ' ` 금지)
    clean_title     태스크·하위 태스크 제목 검사 (todo 규칙: 비움 금지, 200자)
    wrap_external   LLM에 넘기는 "자료"를 <external_content>로 감싼다 (프롬프트 주입 방어, docs/05 6장)

제목에 <script> 같은 글자가 있어도 지우지 않는다.
    - 사용자가 적은 글자를 그대로 저장하고, 화면에서 글자로만 보여 주는 것이 원칙이다(React가 이스케이프).
    - 제어문자만 뺀다.
"""

from __future__ import annotations

import re
import unicodedata

from app.errors import ApiError

TITLE_MAX = 200
NAME_MAX = 20
_NAME_FORBIDDEN = set("<>\"'`")
_EXTERNAL_TAG = re.compile(r"</?\s*external_content[^>]*>", re.IGNORECASE)


def _strip_controls(text: str) -> str:
    """줄바꿈·탭을 공백으로 바꾸고 나머지 제어문자를 뺀다."""
    out = []
    for ch in text:
        if ch in "\r\n\t":
            out.append(" ")
        elif unicodedata.category(ch) in ("Cc", "Cf") and ch != "‍":
            continue
        else:
            out.append(ch)
    return re.sub(r" {2,}", " ", "".join(out)).strip()


def clean_name(name: str) -> str:
    name = _strip_controls(name or "")
    if not name:
        raise ApiError(422, "invalid_name", "이름을 적어 주세요.")
    if len(name) > NAME_MAX:
        raise ApiError(422, "invalid_name", f"이름은 {NAME_MAX}자까지 적을 수 있어요.")
    if any(ch in _NAME_FORBIDDEN for ch in name):
        raise ApiError(422, "invalid_name", "이름에 쓸 수 없는 기호가 있어요.")
    return name


def clean_title(title: str, what: str = "제목") -> str:
    title = _strip_controls(title or "")
    if not title:
        raise ApiError(422, "empty_title", f"{what}을 적어 주세요.")
    if len(title) > TITLE_MAX:
        raise ApiError(422, "title_too_long", f"{what}은 {TITLE_MAX}자까지 적을 수 있어요.")
    return title


def wrap_external(text: str, label: str) -> str:
    """외부에서 온 글(대화 원문, 태스크 제목, 캘린더 일정)을 자료 구역으로 감싼다.

    안에 들어 있는 가짜 여는·닫는 태그를 지워, 자료가 구역 밖으로 "탈출"해 지시처럼 보이지 않게 한다.
    """
    safe = _EXTERNAL_TAG.sub("", text)
    return f'<external_content label="{label}">\n{safe}\n</external_content>'
