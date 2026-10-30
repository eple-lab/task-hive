# 보안

강의에서 배운 보안 원칙이 이 앱에 어떻게 적용됐는지 정리했다. (길 B, Supabase 기준)

## 요약

| 위험 | 대응 | 위치 |
|---|---|---|
| 다른 사람의 할 일을 보거나 바꾸기 | 사용자 토큰으로만 DB 호출 + **RLS** | `supabase.js`, `db/supabase/01_schema.sql` |
| 비밀번호 유출 | 직접 저장하지 않는다. **Supabase Auth**가 해시로 저장 | `server.js` `/api/auth/*` |
| 로그인 토큰 탈취 (XSS) | 토큰은 **httpOnly 쿠키**에만. 화면 JS가 읽을 수 없다 | `supabase.js` |
| 다른 사이트가 내 이름으로 요청 (CSRF) | 쿠키 `SameSite=Lax` + 변경 요청은 JSON 본문만 받음 | `supabase.js`, `server.js` |
| SQL 주입 | 값은 항상 따로 전달 (Supabase 클라이언트, DB 함수 인자) | `db.js` |
| 화면 조작 (프론트는 못 믿는다) | 같은 규칙을 백엔드와 DB에서 다시 검사 | `server.js`, DB 제약 |
| 스크립트 주입 (XSS) | 사용자 입력은 `textContent`로만 화면에 넣기 | `public/app.js` |
| 키 유출 | `.env`에만, Git 제외. **관리자 키(service_role/secret)는 쓰지 않는다** | `.env`, `.gitignore` |
| 내부 정보 노출 | 예상 못 한 에러는 "서버에서 문제가 생겼습니다."로만 응답 | `server.js` |
| 큰 요청 | 요청 본문 10KB, 제목 200자, 비밀번호 72자 제한 | `server.js` |

## RLS - 진짜 방어선

서버 코드가 "내 것만 조회"하도록 짜여 있어도, 실수 하나로 남의 데이터가 새어 나갈 수 있다.
그래서 **DB 자체가** 요청한 사람을 확인하고 그 사람의 행만 허락하게 했다.

```sql
create policy "todos: own rows" on public.todos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- 서버는 Supabase를 **로그인한 사용자의 토큰으로** 부른다. Postgres는 토큰에서 `auth.uid()`를 꺼내 정책을 검사한다.
- 남의 할 일 id로 조회·수정·삭제하면 **0행**(없는 것처럼 보임), 남의 할 일에 태스크를 넣으면 **에러**.
- 로그인하지 않은 요청(`anon`)은 표 권한 자체가 없다.
- 완료 처리 함수도 `security invoker`라서 RLS를 그대로 따른다.

### 왜 관리자 키를 쓰지 않나
Supabase의 secret 키(예전 이름 service_role)는 **RLS를 무시**한다. 서버가 이 키로 DB를 부르면 정책이 아무 소용이 없고, 서버 코드의 실수가 곧 데이터 유출이 된다.
이 앱은 공개용 키(publishable/anon)와 **사용자 토큰**만 쓴다. 공개용 키는 노출돼도 RLS 때문에 남의 데이터를 볼 수 없다. 그래도 화면 코드에는 두지 않는다(강의 원칙).

### 확인 방법
- 자동: `npm run check:rls` — 계정 B로 A의 할 일을 우리 서버 경유 / Supabase 직접 두 경로로 조회·수정·삭제·태스크 추가 시도 ([scripts/rls-check.mjs](../scripts/rls-check.mjs))
- 수동: 계정 두 개로 번갈아 로그인해 서로의 할 일이 안 보이는지
- 결과 기록: [verification.md](verification.md)

## 로그인

- 회원가입·로그인·비밀번호 해시·토큰 발급은 **Supabase Auth**가 한다. 직접 만들지 않는다(강의 원칙).
- 비밀번호는 서버를 지나 Supabase로만 간다. 서버 로그나 우리 표에 남기지 않는다.
- 로그인 실패 메시지는 "이메일 또는 비밀번호가 올바르지 않습니다." 하나뿐이다. 어떤 이메일이 가입돼 있는지 캐낼 수 없게.
- 로그인 시도 횟수 제한은 Supabase Auth의 기본 제한을 따른다(넘으면 429 안내).

## 로그인 쿠키

| 속성 | 값 | 이유 |
|---|---|---|
| `HttpOnly` | 켬 | 화면의 자바스크립트(악성 스크립트 포함)가 토큰을 읽지 못하게 |
| `SameSite` | `Lax` | 다른 사이트에서 보낸 POST·PATCH·DELETE에는 쿠키가 실리지 않게 |
| `Secure` | 배포(`NODE_ENV=production`)에서만 켬 | https에서만 전송. 내 컴퓨터(http://localhost)에서는 꺼야 동작한다 |
| `Path` | `/` | 사이트 전체 |

강의 보안 메모 그대로 **localStorage에는 아무것도 저장하지 않는다.**
로그인 응답에는 캐시 금지 헤더가 붙어, 중간 서버가 다른 사람에게 그 응답을 돌려주지 않게 한다.

## SQL 주입

`db.js`는 SQL 문자열을 만들지 않고 Supabase 클라이언트 메서드로 쿼리를 만든다.
```js
sb.from('todos').insert({ title, due_date: dueDate })      // 값은 따로 전달된다
sb.rpc('set_todo_completed', { p_todo_id: id, p_completed: true })
```
DB 함수 안의 SQL도 인자(`p_todo_id`)를 값으로만 쓴다. 검색은 받아 온 목록을 서버에서 거르므로 SQL에 들어가지 않는다.

길 A에서 확인한 결과(제목에 `x'); DROP TABLE todos;--` → 글자로 저장, 표 멀쩡)는 [testing.md](testing.md)에 남아 있다.

## 프론트는 못 믿는다

화면의 검사(지난 날짜, 완료된 할 일 라디오 제외 등)는 개발자 도구로 쉽게 우회된다.
모든 규칙을 `server.js`에서 다시 검사하고, 데이터 모양과 중복은 DB 제약으로도 막는다. 전체 목록: [business-rules.md](business-rules.md).

## 스크립트 주입 (XSS)

제목에 `<script>`나 `<b>` 같은 태그를 넣어도 HTML로 해석되지 않고 글자 그대로 보인다.
`app.js`는 `innerHTML`을 쓰지 않고, 화면 요소를 만들어 `textContent`로 글자를 넣는다.
설령 스크립트가 끼어들어도 로그인 토큰은 httpOnly 쿠키라 읽을 수 없다.

## 비밀값과 파일

| 파일 | Git | 내용 |
|---|---|---|
| `.env` | ❌ 제외 | Supabase 주소·공개 키, (선택) RLS 테스트 계정 |
| `.env.example` | ✅ | 항목 이름만 적은 견본 |
| `data/` | ❌ 제외 | 길 A의 SQLite 파일 (지금은 안 씀) |

- 저장소를 처음 올리기 전에 커밋 이력 전체에 `.env`나 `.db`가 없는지 확인했다.
- 배포(Render)에서는 `.env` 파일 대신 대시보드의 환경변수 화면에 넣는다.

## 개인정보

- 모으는 것: **이메일** 하나(로그인용)와 사용자가 적은 할 일 제목.
- 저장 위치: Supabase (서울 리전 선택 권장). 비밀번호는 해시로만.
- 탈퇴(사용자 삭제) 시 그 사람의 할 일·태스크도 함께 삭제된다(`ON DELETE CASCADE`). 지금은 대시보드 **Authentication → Users**에서 관리자가 지운다.
- 실제 사용자를 받는다면 강의 내용대로 수집·이용 동의와 개인정보처리방침이 필요하다. 지금은 과제·테스트용이다.

## 데모 사이트(GitHub Pages)

데모는 서버도 DB도 없이 브라우저 메모리에서만 동작한다. 로그인도 없고, 방문자가 입력한 내용은 어디에도 전송·저장되지 않는다.
