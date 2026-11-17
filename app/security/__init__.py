"""보안 모듈 모음.

    session.py     암호화한 세션 쿠키
    middleware.py  보안 헤더, CSRF, 요청 크기·횟수 제한 (모든 요청이 지나는 문)
    rate_limit.py  IP별 요청 횟수 제한
    url_guard.py   사용자가 넣은 업스트림(ngrok) 주소 검사 (SSRF 방어)
    sanitize.py    이름·제목 다듬기, 외부 글 감싸기

근거 문서: docs/05-security.md
"""
