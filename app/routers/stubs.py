"""2단계 기능의 자리. 지금은 모두 501을 돌려준다.

왜 자리를 미리 두나
    - 화면이 이 주소를 불러도 "없는 주소"가 아니라 "아직 준비 중"이라는 답을 받게 한다.
    - 다음 작업자가 어디에 무엇을 만들어야 하는지 한눈에 본다.

만들 때 볼 문서
    /auth/login, /auth/callback   구글 로그인. openid만 요청(P-01). state·nonce·PKCE. 가린 ID(P-02).
                                  토큰은 GOOGLE_TOKEN_MODE에 따라(D-19): access_only | refresh. 두 방식 모두 구현(eple 결정).
                                  → docs/05 4장, docs/checks/google-oauth-7day-expiry.md, honey-voice-log/app/main.py
    /auth/delete                  탈퇴: 서버 데이터 삭제 + 구글 권한 해제 (R-AUTH-5)
    /api/calendar/*               소유 캘린더만 읽기(D-14), -7일~+30일(D-11), 제목·날짜만 남긴다 → docs/03 6.4
    /api/diary/save, /recent      구글 시트·Docs 저장(D-15), 시트는 valueInputOption=RAW → docs/03 6.5
    /api/tts                      Colab TTS 중계(D-03). 지금은 브라우저 내장 음성만 쓴다.
    /api/stt                      Colab Whisper 중계(D-10).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import ApiError

router = APIRouter()


def _not_yet(what: str) -> ApiError:
    return ApiError(501, "not_implemented", f"{what}은(는) 아직 준비 중이에요.")


@router.get("/auth/login")
def google_login():
    raise _not_yet("구글 로그인")


@router.get("/auth/callback")
def google_callback():
    raise _not_yet("구글 로그인")


@router.post("/auth/delete")
def delete_account():
    raise _not_yet("탈퇴")


@router.post("/api/calendar/consent")
def calendar_consent():
    raise _not_yet("캘린더 연결")


@router.get("/api/calendar/events")
def calendar_events():
    raise _not_yet("캘린더 가져오기")


@router.post("/api/diary/save")
def diary_save():
    raise _not_yet("구글 드라이브에 일기 저장")


@router.get("/api/diary/recent")
def diary_recent():
    raise _not_yet("최근 일기 보기")


@router.post("/api/tts")
def tts():
    raise _not_yet("Colab 목소리")


@router.post("/api/stt")
def stt():
    raise _not_yet("말로 입력하기")
