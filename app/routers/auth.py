"""로그인 상태: /api/me, /api/guest, /auth/logout.

손님 모드 (R-AUTH-2, D-07)
    - 이름만 적고 시작한다. 무작위 세션 ID가 든 암호화 쿠키를 받는다.
    - 손님은 "사람"이 아니라 이 쿠키로만 구분된다. 쿠키를 잃으면 데이터를 다시 볼 수 없다.

세션 고정 방지
    - 손님으로 시작할 때마다 세션 ID를 새로 만든다(이전 쿠키를 이어 쓰지 않는다).

아직 안 된 것
    - 구글 로그인(/auth/login, /auth/callback)은 2단계. → stubs.py
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.deps import Ctx, get_settings, get_store, optional_user
from app.routers.common import me_payload
from app.security.sanitize import clean_name
from app.security.session import clear_session, new_guest_session, owner_id, write_session
from app.store.base import Store

router = APIRouter()


class GuestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=100)


@router.get("/api/me")
def me(ctx: Ctx | None = Depends(optional_user), settings: Settings = Depends(get_settings), store: Store = Depends(get_store)):
    return me_payload(ctx, settings, store)


@router.post("/api/guest")
def start_guest(body: GuestIn, response: Response, settings: Settings = Depends(get_settings), store: Store = Depends(get_store)):
    name = clean_name(body.name)
    session = new_guest_session(name)  # 항상 새 세션 ID
    store.ensure_owner(owner_id(session), name)
    write_session(response, settings, session)
    return me_payload(Ctx(session=session, owner=owner_id(session)), settings, store)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, ctx: Ctx | None = Depends(optional_user), settings: Settings = Depends(get_settings), store: Store = Depends(get_store)):
    """쿠키를 지운다. 손님은 쿠키가 없으면 데이터를 다시 볼 수 없으므로 데이터도 함께 지운다."""
    if ctx and ctx.session["mode"] == "guest":
        store.delete_owner(ctx.owner)
    response = Response(status_code=204)
    clear_session(response, settings)
    return response
