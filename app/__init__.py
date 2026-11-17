"""Task Hive 백엔드 패키지.

구조 (docs/03-architecture.md 4장):
    config.py     환경변수 읽기와 검사
    errors.py     오류 응답 모양 통일
    deps.py       라우터가 함께 쓰는 의존성 (세션, 저장소, 설정)
    security/     세션 쿠키, CSRF, 보안 헤더, 요청 제한, 업스트림 주소 검사
    store/        저장소 (메모리 구현 + Postgres 자리)
    services/     업스트림(Colab) 호출, 추출 검증, 날씨, 지표
    prompts/      시스템 프롬프트와 추출 지시문
    routers/      API 주소별 처리
"""
