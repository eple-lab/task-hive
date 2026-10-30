# 저장·보안 확인 기록

과제 평가 기준 "로컬과 Supabase에서 각각 데이터 저장을 확인한 결과와 클라우드 전환·RLS 확인 기록"을 위한 문서.

## 한 줄 요약

| 항목 | 결과 |
|---|---|
| 길 A - 로컬 SQLite 저장 | ✅ 서버를 껐다 켜도 할 일·태스크가 그대로 남음 (2026-10-30) |
| 길 B - Supabase 저장 | ⏳ 진행 예정 |
| 길 B - RLS (다른 계정 접근 차단) | ⏳ 진행 예정 |

## 길 A - 로컬 SQLite

- 코드 버전: `path-a` 태그 (`git checkout path-a`로 이 상태를 다시 볼 수 있다)
- 방법: 캡처용 DB 파일을 지정해 서버 실행(`DB_PATH`) → 할 일 4개·태스크 8개 등록 → 화면 캡처 → 서버 종료 → 같은 DB 파일로 서버 다시 실행 → 화면 캡처 → DB 파일을 직접 조회

### 1. 등록 직후
![서버를 끄기 전 화면: 할 일 4개와 하위 태스크](images/path-a-1-before-restart.png)

### 2. 서버를 껐다 다시 켠 뒤
![서버 재시작 후 화면: 같은 할 일과 태스크가 그대로 남아 있음](images/path-a-2-after-restart.png)

### 3. DB 파일 직접 조회
화면이 아니라 DB 파일에 실제로 행이 저장됐는지 확인했다.
![SQLite DB 파일 조회 결과: todos 4행, tasks 8행](images/path-a-3-db-rows.png)

- `todos` 4행, `tasks` 8행
- 완료한 할 일은 `completed = 1`과 `completed_at`이 함께 기록됨
- 태스크의 `todo_id`가 각 할 일의 `id`를 가리킴 (1:N)

### 삭제·완료 동작
삭제·완료와 규칙 검사 결과는 [testing.md](testing.md)의 API·화면 테스트 기록.
