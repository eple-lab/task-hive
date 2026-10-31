# 테스트 결과 보고 (2026-10-31)

길 A·B 통합(`.env`로 SQLite / Supabase 선택)과 Render 배포 후 실행한 테스트와 검토 결과.

## 요약

| 구분 | 대상 | 결과 |
|---|---|---|
| T1. SQLite 모드 API | 로컬 (`localhost`, 임시 DB) | **14/14 통과** |
| T2. 모드 선택·설정 오류 | 로컬 | **3/3 통과** |
| T3. 화면 3종 표시 | 로컬 SQLite / 로컬 Supabase / 데모(`?demo`) | **통과** |
| T4. 비로그인 보안·입력 검사 | Render (https://todo-0vru.onrender.com) | **19/19 통과** |
| T5. 로그인 후 API | Render, 계정 `aaa@email.com` | **17/17 통과** |
| T6. 화면 조작 (추가·새로고침·삭제·로그아웃) | Render | **통과** |
| T7. 로그아웃 후 이메일 칸 | Render / 로컬 수정본 | 버그 발견 → 수정 → **통과** ([BUG-001](bugfix.md#bug-001)) |
| 미실시 | 계정 2개 간 RLS 교차 확인 (`npm run check:rls`) | 계정 2개를 `.env`에 넣고 eple이 실행할 예정 |

## 환경

| 항목 | 값 |
|---|---|
| 코드 | `main` (`c968f87` 이후 + BUG-001 수정) |
| 런타임 | Node.js 24, Express 5 |
| DB | SQLite(`node:sqlite`) / Supabase Postgres (서울) |
| 운영 서버 | Render Free, Singapore, [render.yaml](../render.yaml) |
| 방법 | Node `fetch` 스크립트로 API 호출, 브라우저 패널에서 화면 조작 |

## T1. SQLite 모드 API (14/14)
`.env` 없이 실행 (`DB_PATH`=임시 파일).

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| 1 | `GET /api/auth/me` | 200, `email: null`, `mode: sqlite` | OK |
| 2 | `POST /api/auth/login` | 404 (SQLite 모드에는 로그인 없음) | OK |
| 3 | 할 일 추가 | 201 | OK |
| 4 | 같은 제목 할 일 추가 | 409 | OK |
| 5 | 태스크 추가 | 201 | OK |
| 6 | 같은 할 일에 같은 제목 태스크 | 409 | OK |
| 7 | 남은 태스크가 있는 할 일 완료 | 409 + `open_tasks: 1` | OK |
| 8 | `force: true`로 완료 | 204 | OK |
| 9 | 완료 시 태스크도 완료, `delete_on` 표시 | 값 확인 | OK |
| 10 | 완료된 할 일과 같은 제목으로 새로 추가 | 201 (미완료끼리만 중복 금지) | OK |
| 11 | 태스크를 되돌려 할 일이 미완료가 될 때 같은 제목 미완료가 있음 | 409 | OK |
| 12 | 태스크 제목 검색 `?q=` | 해당 할 일 포함 | OK |
| 13 | 오늘만 보기 `?today=1` | 모두 오늘 마감 | OK |
| 14 | 삭제 | 204 | OK |

## T2. 모드 선택·설정 오류 (3/3)

| # | 설정 | 기대 | 결과 |
|---|---|---|---|
| 1 | Supabase 주소·키 없음 | `(SQLite: …)`로 시작 | OK |
| 2 | 둘 다 있음 | `(Supabase)`로 시작, 비로그인 API 401 | OK |
| 3 | 주소만 있음 | "접속 정보가 반만 있습니다" 출력 후 종료 코드 1 | OK |

## T3. 화면 표시

| 화면 | 기대 | 결과 |
|---|---|---|
| 로컬 SQLite | 로그인 없이 목록 | OK |
| 로컬 Supabase | 로그인 화면 | OK |
| 데모 `?demo` | 안내 문구 + 예시 데이터, 로그인 없음 | OK |
| GitHub Pages 배포본 | 데모와 같음 (Actions 배포 success) | OK |

## T4. Render 비로그인 (19/19)
계정을 만들거나 로그인하지 않고 확인할 수 있는 항목.

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| 1 | `GET /` | 200, 제목 TODO | OK |
| 2 | 화면 파일(`/`, `app.js`, `demo-api.js`)에 Supabase 주소·키 | 없음 | OK |
| 3–9 | 할 일·태스크 API 7개(GET/POST/PATCH/DELETE) | 401 | OK |
| 10 | `GET /api/auth/me` | 401 (Supabase 모드) | OK |
| 11 | 회원가입: 이메일 형식 오류 | 400 | OK |
| 12 | 회원가입: 비밀번호 8자 미만 | 400 (서버에서 차단, Supabase로 안 보냄) | OK |
| 13 | 깨진 JSON | 400/401, 내부 정보 노출 없음 | OK |
| 14–18 | `/server.js`, `/db/supabase.js`, `/.env`, `/package.json`, `/render.yaml` | 404 | OK |
| 19 | 없는 API | 404 | OK |

## T5. Render 로그인 후 API (17/17)
eple이 브라우저에서 로그인한 세션으로 같은 출처에서 호출. 테스트 데이터는 `[테스트]` 접두어로 만들고 마지막에 삭제.

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| 1 | `GET /api/auth/me` | 200, 이메일, `mode: supabase` | OK |
| 2 | 할 일 추가 | 201 | OK |
| 3 | 같은 제목 추가 | 409 (DB UNIQUE 색인 23505 → 409) | OK |
| 4 | 지난 날짜 | 400 | OK |
| 5 | 태스크 추가 | 201 | OK |
| 6 | 대소문자만 다른 같은 태스크 | 409 | OK |
| 7 | 남은 태스크 있는 할 일 완료 | 409 + `open_tasks: 1` | OK |
| 8 | 강제 완료 (`set_todo_completed` RPC) | 204 | OK |
| 9 | 태스크도 완료, `delete_on` 계산 | 값 확인 | OK |
| 10–11 | 태스크 되돌리기 → 할 일도 미완료 (`set_task_completed` RPC) | 204, 둘 다 미완료 | OK |
| 12 | 태스크 제목 검색 | 포함 | OK |
| 13 | 오늘만 보기 | 모두 오늘 마감 | OK |
| 14–15 | 태스크·할 일 삭제 | 204 | OK |
| 16 | 지운 할 일 다시 삭제 | 404 | OK |
| 17 | 정리 후 `[테스트]` 데이터 | 없음 | OK |

## T6. Render 화면 조작

| 단계 | 기대 | 결과 |
|---|---|---|
| 등록창에 입력 → 추가 | 목록에 표시, 오늘 마감 노란 배경 | OK |
| 새로고침 | 그대로 남음 (Supabase 저장) | OK |
| X로 삭제 | 빈 목록 안내 | OK |
| 로그아웃 | 로그인 화면, 이후 `GET /api/todos` 401, `document.cookie`에서 토큰 안 보임(httpOnly) | OK |

## T7. 로그아웃 후 이메일 칸
- 발견: eple이 회원가입 → 로그아웃했을 때 로그인 화면 이메일 칸에 가입한 이메일이 남음.
- 재현과 수정 확인: 페이지 안에서 `fetch`를 가짜 응답으로 바꿔 로그인 → 로그아웃 흐름만 실행. 네트워크로 계정 정보를 보내지 않음.

| 대상 | 로그아웃 후 이메일 칸 | 결과 |
|---|---|---|
| Render (수정 전 코드) | `mock@example.com` 남음 | 재현 |
| 로컬 (수정본) | 빈 칸 | 수정 확인 |

자세한 원인과 수정은 [bugfix.md](bugfix.md#bug-001).

## 검토 의견

| 구분 | 내용 |
|---|---|
| 보안 | 키는 서버(`.env`, Render 환경변수)에만 있고 화면 파일에 없음. 비로그인 API 전부 401. 로그인 토큰은 httpOnly 쿠키라 JS로 읽을 수 없음 |
| 규칙 | 중복 제목·지난 날짜·남은 태스크 확인·완료 연쇄가 SQLite와 Supabase 양쪽에서 같게 동작 |
| 배포 | Render Blueprint로 Free·Singapore·헬스 체크 `/`가 코드로 고정됨 |
| 남은 위험 | 계정 간 RLS 교차 확인은 아직 자동 스크립트로 실행하지 않음. Render 무료 서버는 잠들었다 깨어날 때 첫 응답이 느림 |

## 남은 일
- [ ] 계정 2개를 `.env`의 `RLS_TEST_*`에 넣고 `npm run check:rls` → [verification.md](verification.md)에 기록
- [ ] BUG-001 수정본이 Render에 자동 배포된 뒤 실제 로그아웃으로 한 번 더 확인
