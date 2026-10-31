# Supabase 연결하기 (길 B 준비)

처음 한 번만 하면 된다. 20분 정도. 대시보드 메뉴 이름은 Supabase가 화면을 바꾸면서 조금 달라질 수 있다.

## 1. 프로젝트 만들기
1. https://supabase.com 가입 → **New project**
2. 이름: `todo` (아무거나)
3. Database Password: 자동 생성 버튼으로 만들고 **비밀번호 관리자에 보관**. 이 앱은 쓰지 않지만 DB 관리에 필요하다.
4. Region: **Northeast Asia (Seoul)** — 가까울수록 빠르다
5. Plan: **Free**
6. 만들어지는 데 1~2분

## 2. 로그인 설정 (이메일 인증 끄기)
테스트 계정을 빨리 만들기 위해 가입 즉시 로그인되게 한다.

- **Authentication → Sign In / Providers → Email** → **Confirm email** 끄기 → Save

> 실제 서비스라면 켜 두는 게 맞다. 켜 두면 가입 후 받은 메일의 링크를 눌러야 로그인할 수 있고, 앱은 "인증 메일을 보냈어요"라고 안내한다.
> 켠 상태에서 테스트 계정 두 개가 필요하면 `내아이디+a@gmail.com`, `내아이디+b@gmail.com`처럼 `+`를 붙이면 같은 메일함으로 받을 수 있다.

![Supabase Authentication → Sign In / Providers 화면: User Signups 설정](images/supabase-auth-settings.png)

- 이 프로젝트의 설정 화면 (2026-10-31 캡처). **Allow new users to sign up** 켜짐, **Confirm email**은 캡처 시점에 **켜짐**.
- 테스트 계정 두 개(`aaa@`, `bbb@email.com`)는 Confirm email을 **끈 상태에서** 만들었다. 켜 둔 지금은 새로 가입하면 메일 인증을 마쳐야 로그인할 수 있고, `@email.com` 같은 받을 수 없는 주소로는 가입을 끝낼 수 없다.
- Anonymous sign-ins(익명 로그인)는 꺼져 있다. 켜면 가입 없이도 `authenticated` 역할의 사용자가 만들어진다. RLS는 `auth.uid()` 기준이라 익명 사용자도 자기 것만 보지만, 가입하지 않은 사람이 데이터를 쓸 수 있게 된다. 이 앱은 익명 로그인 화면이 없으므로 꺼 둔다.

## 3. 표 만들기
1. 왼쪽 **SQL Editor** → New query
2. 이 저장소의 [db/supabase/01_schema.sql](../db/supabase/01_schema.sql) 내용을 전부 붙여 넣고 **Run**
3. "Success. No rows returned"가 나오면 성공
4. **Table Editor**에 `todos`, `tasks` 표가 생겼는지 확인. 표 이름 옆에 RLS가 켜져 있다는 표시가 있다.

![Supabase SQL Editor에서 01_schema.sql 실행 결과: Success. No rows returned](images/supabase-sql-editor.png)

이 프로젝트에서 실제로 실행한 화면 (2026-10-31 캡처). 저장한 쿼리 이름은 `todo create table`, 결과는 `Success. No rows returned`.

(선택) 완료 후 90일 지난 할 일을 매일 지우는 예약 작업: [db/supabase/02_cron.sql](../db/supabase/02_cron.sql)을 같은 방법으로 실행.
실행하지 않아도 앱이 목록을 불러올 때 그 사용자의 지난 항목을 지운다.

## 4. 접속 정보를 .env에
1. 대시보드 위쪽 **Connect** 버튼, 또는 **Project Settings → API Keys / Data API**
2. 두 가지를 복사해 프로젝트 폴더의 `.env`에 넣는다(없으면 `.env.example`을 복사해 만든다).
   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
   ```
   - 예전 프로젝트 화면이면 "anon public" 키를 넣어도 된다.
   - **secret 키 / service_role 키는 넣지 않는다.** RLS를 무시하는 관리자 키다.
3. `.env`는 Git에 올라가지 않는다(`git status`에 안 보이면 정상).

## 5. 실행
```bash
npm install
npm start
```
http://localhost:3000 → 로그인 화면이 나오면 연결 성공.
로그인 화면 없이 바로 할 일 화면이 나오고 서버 첫 줄에 `(SQLite: ...)`가 보이면 `.env`를 못 읽은 것이다. `.env`를 다시 확인하고 서버를 다시 켠다.

## 6. 테스트 계정 두 개로 RLS 확인
1. 앱에서 이메일·비밀번호(8자 이상)로 **회원가입** → 계정 A. 할 일 몇 개 추가 → 로그아웃
2. 다른 이메일로 회원가입 → 계정 B. A의 할 일이 **안 보이면** 정상
3. 자동 확인 스크립트: `.env`에 두 계정을 적고
   ```
   RLS_TEST_A_EMAIL=...
   RLS_TEST_A_PASSWORD=...
   RLS_TEST_B_EMAIL=...
   RLS_TEST_B_PASSWORD=...
   ```
   서버를 켠 채로 **다른 터미널**에서
   ```bash
   npm run check:rls
   ```
   `결과: 15/15 통과`가 나오면 B는 A의 할 일을 보지도, 고치지도, 지우지도 못한다는 뜻이다.
   결과 화면을 캡처해 [verification.md](verification.md)에 기록한다.

## 7. Supabase에서 데이터 확인
- **Table Editor → todos**: 앱에서 추가한 할 일이 행으로 보인다. `user_id` 칸에 계정마다 다른 값이 들어 있다.
- **Authentication → Users**: 가입한 계정 목록. 비밀번호는 어디에도 보이지 않는다(해시로만 저장).

## 주의
- 무료 프로젝트는 **1주일 동안 안 쓰면 일시정지**된다. 앱이 "Supabase에 연결하지 못했습니다"라고 하면 대시보드에서 Restore.
- 무료 요금제에는 **자동 백업이 없다.** 백업 방법은 [operations.md](operations.md#백업과-복구).
- Table Editor에서 직접 값을 고치면 RLS를 거치지 않는다(관리자 권한). 확인 용도로만 쓴다.
