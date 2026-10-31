# 운영 가이드

설치, 실행, 설정, 백업과 복구, 자주 막히는 문제.
처음 Supabase를 연결하는 방법은 [supabase-setup.md](supabase-setup.md).

## 설치와 실행

필요한 것: **Node.js 24 이상** (`node --version`), Supabase 프로젝트와 `.env` 설정.

```bash
npm install     # 처음 한 번
npm start       # 서버 켜기 → http://localhost:3000
```

| 명령 | 하는 일 |
|---|---|
| `npm start` | 서버 실행 |
| `npm run dev` | 코드를 고치면 서버가 자동으로 다시 켜진다 (`node --watch`) |
| `npm run check:rls` | 계정 두 개로 RLS 확인 (서버가 켜져 있어야 함) |
| `Ctrl + C` | 서버 끄기 (실행 중인 터미널에서) |

## 설정 (.env)

`.env.example`을 복사해 `.env`를 만들고 값을 채운다.

| 항목 | 필수 | 뜻 |
|---|:-:|---|
| `SUPABASE_URL` | ✅ | 프로젝트 주소 `https://xxxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | 공개용 키 (예전 프로젝트는 `SUPABASE_ANON_KEY`도 인식) |
| `PORT` | | 서버 포트. 기본 3000 |
| `NODE_ENV` | | 배포 때 `production` → 쿠키에 `Secure` |
| `RLS_TEST_A_EMAIL` 등 4개 | | `npm run check:rls`용 테스트 계정 |

- `.env`를 고치면 서버를 껐다 켜야 반영된다.
- **secret / service_role 키는 넣지 않는다.**

## 자동 삭제

- 완료한 지 90일이 지난 할 일은 사용자가 **목록을 불러올 때** 그 사용자 것만 지워진다(태스크도 함께).
- [db/supabase/02_cron.sql](../db/supabase/02_cron.sql)을 실행해 두면 Supabase가 **매일 03:00(UTC)** 모든 사용자의 지난 항목을 지운다. 오래 접속하지 않은 사람의 데이터도 정리된다.
- 화면의 완료한 할 일 오른쪽에 삭제 예정일이 보인다.

## 백업과 복구

Supabase **무료 요금제에는 자동 백업이 없다.** 직접 사본을 받아 둔다.

### 방법 1: 표를 CSV로 (가장 쉬움)
1. 대시보드 **Table Editor → todos** → 오른쪽 위 **Export → Export table as CSV**
2. `tasks`도 같은 방법으로
3. 파일 이름에 날짜를 붙여 보관 (`todos-20261030.csv`)

### 방법 2: 전체 DB 덤프 (Postgres 도구)
DB 비밀번호와 접속 문자열(대시보드 **Connect**)이 필요하다.
```bash
pg_dump "postgresql://postgres.[프로젝트ID]:[DB비밀번호]@...pooler.supabase.com:5432/postgres" --schema=public > backup.sql
```
`pg_dump`는 PostgreSQL을 설치하면 함께 생긴다. 접속 문자열에는 비밀번호가 들어 있으니 셸 기록·문서에 남지 않게 주의한다.

### 3-2-1 규칙에 맞추기
| | 예 |
|---|---|
| 3벌 | Supabase 원본 + CSV 사본 2개 |
| 2종류 매체 | 노트북 디스크 + 외장하드·USB |
| 1벌은 다른 곳 | 구글 드라이브 같은 클라우드 |

### 복구
- CSV: Table Editor → **Insert → Import data from CSV**. `id`, `user_id`를 그대로 넣어야 주인과 태스크 연결이 유지된다. `todos`를 먼저, `tasks`를 나중에.
- 덤프: SQL Editor 또는 `psql`로 `backup.sql` 실행.
- 복구한 뒤 앱에 로그인해 할 일이 돌아왔는지 **눈으로 확인**한다. 열어 본 적 없는 백업은 백업이 아니다.

### 길 A(SQLite) 백업
`path-a` 태그로 돌아가 쓴다면: 서버를 끄고 `data/todo.db`를 복사하면 그게 백업이다.

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
|---|---|---|
| `Supabase 접속 정보가 없습니다.` 후 종료 | `.env`에 `SUPABASE_URL`이나 키가 없다 | [supabase-setup.md](supabase-setup.md) 4단계 |
| `.env not found. Continuing without it.` | `.env` 파일이 없다는 안내 | `.env.example`을 `.env`로 복사해 채운다 |
| 로그인하면 "Supabase에 연결하지 못했습니다" | 인터넷 문제 또는 무료 프로젝트 **일시정지**(1주 미사용) | 대시보드에서 프로젝트 Restore |
| 회원가입 후 "인증 메일을 보냈어요" | Supabase의 Confirm email이 켜져 있다 | 메일 링크를 누르거나, 설정에서 끈다 |
| "이메일 인증을 먼저 완료해 주세요" | 메일 인증을 안 했다 | 받은 편지함(스팸함 포함) 확인 |
| "요청이 너무 많습니다" | Supabase Auth 요청 제한 | 잠시 뒤 다시 |
| 목록이 안 나오고 서버 로그에 `permission denied` 또는 `relation "public.todos" does not exist` | `01_schema.sql`을 실행하지 않았다 | SQL Editor에서 실행 |
| 로그인했는데 새로고침하면 다시 로그인 화면 | 쿠키가 저장되지 않았다. `NODE_ENV=production`으로 http에서 실행 중일 수 있다 | 내 컴퓨터에서는 `NODE_ENV`를 비운다 |
| `EADDRINUSE` / `address already in use :::3000` | 이전 서버가 아직 켜져 있다 | 그 터미널에서 `Ctrl + C`, 또는 `PORT` 변경 |
| `bad option: --env-file-if-exists` | Node 버전이 낮다 | Node 24 이상 |
| `Cannot find package '@supabase/...'` | `npm install`을 안 했다 | `npm install` |
| 코드를 고쳤는데 반영이 안 된다 | 서버는 시작할 때 코드를 읽는다 | 재시작, 또는 `npm run dev` |
| 화면만 예전 그대로 | 브라우저 캐시 | `Ctrl + Shift + R` |
| 터미널 `curl`로 보낸 한글이 깨진다 | Windows 터미널 인코딩 | 브라우저 콘솔이나 Node 스크립트로 ([api.md](api.md#직접-호출해-보기)) |
| PowerShell에서 큰따옴표가 든 `git commit -m`이 깨진다 | PowerShell 5.1의 인자 전달 방식 | 메시지를 파일에 쓰고 `git commit -F 파일` |
