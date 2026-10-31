# 저장·보안 확인 기록

과제 평가 기준 "로컬과 Supabase에서 각각 데이터 저장을 확인한 결과와 클라우드 전환·RLS 확인 기록"을 위한 문서.

## 한 줄 요약

| 항목 | 결과 |
|---|---|
| 길 A - 로컬 SQLite 저장 | ✅ 서버를 껐다 켜도 할 일·태스크가 그대로 남음 (2026-10-30) |
| 길 B - 클라우드 전환 | ✅ 코드 전환 완료: 저장소 SQLite → Supabase, 로그인 추가 (커밋 B-1~B-4) |
| 길 B - RLS 정책 | ✅ 메모리 Postgres에서 두 사용자로 검증 ([testing.md](testing.md#supabase-스키마rls-테스트-기록-길-b)) |
| 길 B - Supabase 실제 저장 | ✅ Render 운영 서버에서 추가 → 새로고침 후에도 유지 (2026-10-31). Table Editor 확인과 서버 재시작 후 확인은 ⏳ |
| 길 B - 실제 계정 두 개 RLS | ✅ `npm run check:rls` **19/19 통과** (2026-10-31, 계정 `aaa@`·`bbb@email.com`) |
| 길 C - Render 배포 | ✅ https://todo-0vru.onrender.com/ (Supabase 모드, [render.yaml](../render.yaml)) |

## 길 B - Supabase

연결 순서는 [supabase-setup.md](supabase-setup.md). 테스트 전체 기록은 [test-report-2026-10-31.md](test-report-2026-10-31.md).

### 0. 설정 화면 (2026-10-31 캡처)
| 화면 | 확인한 것 | 위치 |
|---|---|---|
| Supabase SQL Editor | `01_schema.sql` 실행 결과 `Success. No rows returned` | [supabase-setup.md 3단계](supabase-setup.md#3-표-만들기) |
| Supabase Auth 설정 | 가입 허용 켜짐, 익명 로그인 꺼짐, Confirm email은 캡처 시점 켜짐 (테스트 계정은 끈 상태에서 만듦) | [supabase-setup.md 2단계](supabase-setup.md#2-로그인-설정-이메일-인증-끄기) |
| Render 서비스 | Blueprint managed, Free, Live, 커밋마다 Auto-Deploy | [deployment.md](deployment.md#실제-배포-화면) |

### 1. 저장 확인
- [x] 할 일 추가 → 새로고침해도 그대로 (Render 운영 서버, 로그인 상태, 2026-10-31). 화면 → 서버 → Supabase에 저장된 값을 다시 읽어 온 것
- [ ] Table Editor의 `todos`에 행이 있고 `user_id`가 채워졌는지 (대시보드에서 직접 확인 필요)
- [ ] 서버 재시작 후에도 그대로 (Render 재배포 전후 비교는 아직 하지 않음)

### 2. RLS 확인
- [x] `npm run check:rls` **19/19 통과** (2026-10-31, 로컬 서버 + 실제 Supabase 프로젝트)
  - 계정 A가 할 일·태스크를, 계정 B가 대조군 할 일을 만든 뒤 **우리 서버 API**와 **Supabase 직접 호출(서버 우회)** 양쪽에서 확인
  - B는 자기 것은 보고(대조군), A의 것은 보기·검색·수정·완료·태스크 추가·삭제 모두 불가
  - 반대 방향: A도 B의 것을 못 봄
  - 로그인 안 한 사용자는 표 조회 자체가 거절(`permission denied for table todos`)
  - 끝난 뒤 A의 데이터 그대로, 확인용 데이터는 삭제

```
PASS  [서버] B의 목록에 B의 할 일은 있다 (대조군)  (B가 받은 할 일 1개)
PASS  [서버] B의 목록에 A의 할 일이 없다  (A의 #7 없음)
PASS  [서버] A의 목록에 B의 할 일이 없다 (반대 방향)  (A가 받은 할 일 1개)
PASS  [서버] B가 A의 제목으로 검색해도 안 나온다  (0건)
PASS  [서버] B가 A의 할 일 완료 처리 → 거절  (HTTP 404)
PASS  [서버] B가 A의 태스크 완료 처리 → 거절  (HTTP 404)
PASS  [서버] B가 A의 할 일에 태스크 추가 → 거절  (HTTP 404)
PASS  [서버] B가 A의 태스크 삭제 → 거절  (HTTP 404)
PASS  [서버] B가 A의 할 일 삭제 → 거절  (HTTP 404)
PASS  [직접] B가 자기 할 일 조회 → 1행 (대조군)  (1행)
PASS  [직접] B가 A의 할 일 조회 → 0행  (0행)
PASS  [직접] A가 B의 할 일 조회 → 0행 (반대 방향)  (0행)
PASS  [직접] B가 A의 할 일 제목 수정 → 0행  (0행)
PASS  [직접] B가 A의 할 일 삭제 → 0행  (0행)
PASS  [직접] B가 A의 할 일에 태스크 추가 → RLS 거절  (new row violates row-level security policy for table "tasks")
PASS  [직접] B가 완료 함수로 A의 할 일 완료 → 효과 없음  (에러 없이 0행 처리)
PASS  [직접] 로그인 안 한 사용자의 조회 → 거절  (permission denied for table todos)
PASS  [확인] A의 할 일이 그대로 있다  (제목 그대로, 완료=false)
PASS  [확인] A의 태스크도 그대로 1개  (태스크 1개)

결과: 19/19 통과
```

- 이 결과에 이르기까지: 1차 15/15 → B 쪽 대조군·반대 방향이 없다는 약점을 찾아 보강 → 2차 18/19(테스트 버그) → 수정 후 3차 19/19. 경과는 [BUG-002](bugfix.md#bug-002).
- [ ] 화면 캡처: B로 로그인한 화면에 A의 할 일이 안 보이는 장면 (A에 할 일이 있는 상태에서 찍어야 의미가 있음)

### 3. 운영 서버 (Render)
![Render에 배포된 TODO 로그인 화면](images/render-login.png)

- 비로그인 상태에서 할 일·태스크 API 7개 모두 401, 화면 파일에 Supabase 주소·키 없음, 서버 파일(`server.js`, `.env`, `render.yaml` 등) 404 → [test-report T4](test-report-2026-10-31.md#t4-render-비로그인-1919)

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
