"""API 라우터 모음. 주소와 응답 모양은 docs/03-architecture.md 7장과 화면(frontend)이 함께 쓰는 계약이다.

    auth.py      /api/me, /api/guest, /auth/logout, (2단계 자리) /auth/login
    settings.py  /api/settings, /api/settings/upstream, /api/greeting
    chat.py      /api/chat (SSE), /api/extract
    tasks.py     /api/tasks ...
    diary.py     /api/diary/summary, (2단계 자리) /api/diary/save, /api/diary/recent
    export.py    /api/export
    admin.py     /health, /api/metrics/client, /api/admin/metrics
    stubs.py     2단계 기능의 자리 (501)

오류 모양: {"error": {"code": "...", "message": "한국어 안내"}}
변경 요청(GET이 아닌 것)은 헤더 `X-TH: 1`이 필요하다(security/middleware.py).
"""
