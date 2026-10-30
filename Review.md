[Review.md](https://github.com/user-attachments/files/34167635/Review.md)
# AIFFEL Campus Code Peer Review Templete
- 코더 : 승희님
- 리뷰어 : 조준엽

> 리뷰 대상: [task-hive](https://github.com/xktkf147/task-hive) `main` 브랜치, 커밋 [`2b04c39`](https://github.com/xktkf147/task-hive/tree/2b04c39) (길 A: Express + SQLite)
> 이 리뷰는 맞다 틀리다를 가리기보다 서로 의견을 나누려고 썼습니다. 코드를 직접 실행하지는 않았고, 코드와 `docs/` 문서를 읽고 정리했습니다.


# PRT(Peer Review Template)
[x]  **1. 주어진 문제를 해결하는 완성된 코드가 제출되었나요?**
- 문제에서 요구하는 기능이 정상적으로 작동하는지?
    - 해당 조건을 만족하는 부분의 코드 및 결과물을 근거로 첨부

과제 요구사항인 "CRUD가 동작하고, 앱을 껐다 켜도 데이터가 남는다"를 만족합니다. PRD에 직접 추가한 기능(하위 태스크, 마감일, 중복 금지, 90일 자동 삭제)도 모두 구현되어 있습니다.

| 기능 | 근거 코드 |
|---|---|
| 할 일 CRUD | [`server.js:62-99`](https://github.com/xktkf147/task-hive/blob/2b04c39/server.js#L62-L99) |
| 태스크 CRUD | [`server.js:101-132`](https://github.com/xktkf147/task-hive/blob/2b04c39/server.js#L101-L132) |
| 데이터 영구 저장 (SQLite 파일) | [`db.js:1-12`](https://github.com/xktkf147/task-hive/blob/2b04c39/db.js#L1-L12), `data/todo.db` |
| 안 끝난 태스크가 있으면 확인 후 강제 완료 | [`server.js:86-91`](https://github.com/xktkf147/task-hive/blob/2b04c39/server.js#L86-L91), [`public/app.js:158-174`](https://github.com/xktkf147/task-hive/blob/2b04c39/public/app.js#L158-L174) |
| 완료 90일 후 자동 삭제 | [`db.js:178-183`](https://github.com/xktkf147/task-hive/blob/2b04c39/db.js#L178-L183), [`server.js:148-153`](https://github.com/xktkf147/task-hive/blob/2b04c39/server.js#L148-L153) |

결과물로는 README의 화면 캡처(`docs/images/screenshot.png`)와 GitHub Pages 데모가 있습니다. `docs/testing.md`에도 API 시나리오 14개를 테스트한 기록이 표로 남아 있습니다.

```js
// server.js:86-91 — 안 끝난 태스크가 있으면 409와 개수를 돌려주고, 화면이 확인을 받은 뒤 force로 다시 요청
if (completed && req.body?.force !== true) {
  const openTasks = db.countOpenTasks(id);
  if (openTasks > 0) {
    throw new HttpError(409, `완료하지 않은 태스크가 ${openTasks}개 있습니다.`, { open_tasks: openTasks });
  }
}
```


[x]  **2. 핵심적이거나 복잡하고 이해하기 어려운 부분에 작성된 설명을 보고 해당 코드가 잘 이해되었나요?**
- 해당 코드 블럭에 doc string/annotation/markdown이 달려 있는지 확인
- 해당 코드가 무슨 기능을 하는지, 왜 그렇게 짜여진건지, 작동 메커니즘이 뭔지 기술.
- 주석을 보고 코드 이해가 잘 되었는지 확인
    - 잘 작성되었다고 생각되는 부분을 근거로 첨부합니다.

주석이 "무엇을 하는지"보다 **"왜 그렇게 했는지"**를 설명해서 이해하기 쉬웠습니다.

```js
// server.js:118-124
// 태스크를 되돌리면 완료된 Todo도 되살아나므로 같은 중복 검사를 한다
if (!completed) {
  const todo = db.getTodo(task.todo_id);
  if (todo.completed === 1 && db.hasOpenTodoWithTitle(todo.title, todo.id)) { ... }
}
```
→ 저라면 놓쳤을 것 같은 경우인데, 한 줄 주석으로 이유가 바로 이해됐습니다.

```sql
-- db/schema.sql
-- SQLite는 외래키 검사가 기본으로 꺼져 있다. 연결할 때마다 켜야 한다.
PRAGMA foreign_keys = ON;
...
-- 완료 여부와 완료 시각이 서로 어긋나지 않게
CHECK ((completed = 1) = (completed_at IS NOT NULL))
```

코드 밖 문서도 잘 정리되어 있습니다.
- `docs/business-rules.md`: 규칙마다 **화면 / 백엔드 / DB 중 어디서 막는지**를 표로 정리했습니다.
- `docs/decisions.md`: "상황 → 결정 → 이유 → **포기한 것**" 형식이라, 코드만 봐서는 알 수 없는 선택의 이유를 알 수 있었습니다.


[x]  **3. 에러가 난 부분을 디버깅하여 "문제를 해결한 기록"을 남겼나요? 또는 "새로운 시도 및 추가 실험"을 해봤나요?**
- 문제 원인 및 해결 과정을 잘 기록하였는지 확인
- 문제에서 요구하는 조건에 더해 추가적으로 수행한 나만의 시도, 실험이 기록되어 있는지 확인
    - 잘 작성되었다고 생각되는 부분을 캡쳐해 근거로 첨부합니다.

**문제 해결 기록**
- `decisions.md` 001: 강의 예시인 `better-sqlite3`가 Windows에서 빌드 에러가 잦다는 문제를 Node 내장 `node:sqlite`로 해결했습니다.
- `decisions.md` 006: "사용해 보니 지난 날짜가 실수로 등록됐다"는 문제를 발견하고, 마감일 필수와 지난 날짜 금지 규칙을 추가했습니다.
- `decisions.md` 007: 중복 금지를 DB UNIQUE 제약으로 걸면 기존 중복 데이터 때문에 서버가 안 켜지는 문제를 미리 생각해서, 검사를 백엔드에서 하기로 했습니다.

**추가 실험**
- `docs/security.md`: SQL 주입을 직접 시도한 기록이 있습니다.

  | 입력 | 결과 |
  |---|---|
  | 제목에 `x'); DROP TABLE todos;--` | 글자 그대로 저장, 표는 멀쩡 |
  | 검색에 `' OR 1=1 --` | 0건 |
  | 검색에 `50%`, `a_b` | 와일드카드가 아닌 글자로 검색 |
- GitHub Pages에서 서버 없이 도는 **데모 모드**(`public/demo-api.js`)를 만들었습니다.
- 길 B(Supabase + Auth + RLS)를 진행 중이고, 계정 두 개로 RLS를 확인하는 계획(`npm run check:rls`)도 세웠습니다.


[x]  **4. 회고를 잘 작성했나요?**
- 프로젝트 결과물에 대해 배운점과 아쉬운점, 느낀점 등이 상세히 기록 되어 있나요?
	- 딥러닝 모델의 경우, 인풋이 들어가 최종적으로 아웃풋이 나오기까지의 전체 흐름을 도식화하여 모델 아키텍쳐에 대한 이해를 돕고 있는지 확인

`docs/retrospective.md`에 강의의 회고 질문 7개에 각각 답했습니다.
- 내 데이터로 SQL 풀어 읽기: `SELECT title FROM tasks WHERE todo_id = 3 AND completed = false;`가 "완료하지 않은 태스크가 N개 있습니다" 확인창으로 이어진다는 설명이 좋았습니다.
- 클로드와 나눈 대화를 원문 그대로 인용해서, 어떤 질문이 어떤 보안 조치로 이어졌는지 과정이 보입니다.
- "배운 것 / 어려운 것 / TO-DO"로 정리했습니다. 특히 *"AI는 빠르다. 느린 것은 내 눈과 타자를 치는 내 손이다. 그리고 고민하고 결정하는 내 머리였다."*는 문장이 인상 깊었습니다.
- 전체 흐름(화면 → API → DB)은 `docs/architecture.md`에 따로 정리되어 있습니다.


[x]  **5. 코드가 간결하고 효율적인가요?**
- 파이썬 스타일 가이드 (PEP8)를 준수하였는지 확인
- 코드 중복을 최소화하고 범용적으로 사용할 수 있도록 모듈화(함수화) 했는지
    - 잘 작성되었다고 생각되는 부분을 근거로 첨부합니다.

JavaScript 프로젝트라 PEP8 대신 코드 스타일의 일관성을 봤습니다. 들여쓰기, 따옴표, 이름 짓는 방식이 파일 전체에서 일정합니다.

**모듈화가 잘 된 부분**
- **DB 접근을 `db.js` 한 파일에 모음** (`decisions.md` 003): 길 B에서 저장소를 바꿀 때 이 파일만 고치면 됩니다.
- **입력 검사 함수**: `parseId`, `parseTitle`, `parseDueDate`, `parseCompleted`([`server.js:23-52`](https://github.com/xktkf147/task-hive/blob/2b04c39/server.js#L23-L52))로 나누고, 실패하면 `HttpError`를 던져 에러 처리 함수 한 곳에서 응답합니다.
- **`transaction()` 헬퍼**([`db.js:17-27`](https://github.com/xktkf147/task-hive/blob/2b04c39/db.js#L17-L27)): 여러 쿼리를 "전부 되거나 전부 안 되거나"로 묶는 부분을 함수로 만들어 다시 썼습니다.
- **`el()` 헬퍼**([`public/app.js:47-52`](https://github.com/xktkf147/task-hive/blob/2b04c39/public/app.js#L47-L52)): 화면 요소를 만들 때 `textContent`만 쓰게 해서 XSS 방어와 코드 간결함을 함께 얻었습니다.

**효율**
- 목록 조회에서 할 일마다 태스크를 따로 조회하지 않고, `IN (...)` 한 번으로 모아 가져옵니다. N+1 쿼리 문제를 피했습니다([`db.js:79-86`](https://github.com/xktkf147/task-hive/blob/2b04c39/db.js#L79-L86)).

**아쉬운 점**
- 규칙이 `server.js`와 `demo-api.js` 두 곳에 중복되어 있습니다(아래 개선 제안 4 참고). `decisions.md` 009에서 본인도 인정한 부분입니다.


# 참고 링크 및 코드 개선

## 1.코드 리뷰 시 참고한 링크가 있다면 링크와 간략한 설명을 첨부합니다.

- [SQLite: Partial Indexes](https://www.sqlite.org/partialindex.html) / [PostgreSQL: Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html): "미완료 할 일끼리만 제목 중복 금지"를 DB 제약으로 거는 방법 (개선 제안 2)
- [Express: app.listen](https://expressjs.com/en/5x/api.html#app.listen): 접속을 받을 주소(host) 지정 (개선 제안 3)
- [Node.js: node:sqlite](https://nodejs.org/api/sqlite.html): `DatabaseSync`가 동기식으로 동작한다는 점 확인
- [Node.js: Test runner (node:test)](https://nodejs.org/api/test.html): 별도 설치 없이 쓸 수 있는 테스트 도구 (개선 제안 5)
- [Supabase: pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron): 길 B에서 90일 자동 삭제를 DB 예약 작업으로 옮기는 방법
- [OWASP: SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html): 파라미터화 쿼리 방식이 권장 방법과 같은지 확인

## 2.코드 리뷰를 통해 개선을 제안할 코드가 있다면 코드와 간략한 설명을 첨부합니다.

정답이라기보다 같이 이야기해 보고 싶은 제안들입니다.

**제안 1. "오늘"이 누구의 오늘인지 (길 C 대비)**

`localToday()`는 서버 컴퓨터의 시간대를 쓰고, `completed_at`은 `datetime('now')`라서 UTC입니다. 지금처럼 내 컴퓨터에서 쓰면 문제없습니다. 하지만 Render(보통 UTC)에 배포하면 한국 시간 00시~09시 사이에는 "오늘 할 일만"이 어제 날짜로 걸러질 수 있습니다.

```js
// public/app.js — 화면이 자기 날짜를 같이 보낸다
if (todayOnly.checked) params.set('today', localToday());   // 예: 2026-10-30

// server.js — 형식만 검사하고 그 날짜를 쓴다
const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today ?? '') ? req.query.today : null;
```

**제안 2. 길 B에서는 중복 금지를 DB가 막게**

지금은 `node:sqlite`가 동기식이라 "중복 확인 → 등록" 사이에 다른 요청이 끼어들 수 없습니다. 그래서 `decisions.md` 007의 동시 요청 걱정은 길 A에서는 실제로 생기지 않습니다. 하지만 길 B에서 Supabase 호출이 `await`로 바뀌면 생길 수 있습니다.

```sql
-- 미완료 할 일끼리만, 사용자별로, 대소문자 무시하고 제목 중복 금지
CREATE UNIQUE INDEX todos_open_title_uq
  ON todos (user_id, lower(title))
  WHERE completed = false;
```

**제안 3. 내 컴퓨터에서만 접속되게**

`app.listen(PORT)`는 모든 네트워크 주소에서 접속을 받습니다. 로그인이 없는 길 A에서는 같은 와이파이의 다른 기기가 할 일을 지울 수 있습니다. 폰에서 접속하려고 일부러 열어 둔 거라면 그대로도 괜찮습니다.

```js
// server.js:155
app.listen(PORT, '127.0.0.1', () => { ... });
```

**제안 4. 서버와 데모의 검사 함수를 하나로**

이미 차이가 생겼습니다. 서버는 `2027-02-30` 같은 없는 날짜를 거르지만, 데모의 `parseDueDate`([`public/demo-api.js:83-88`](https://github.com/xktkf147/task-hive/blob/2b04c39/public/demo-api.js#L83-L88))는 통과시킵니다. 검사 함수를 공용 파일로 빼면 두 곳이 어긋나지 않습니다.

```js
// public/rules.js — 서버(import)와 데모(import)가 같이 사용
export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
```

**제안 5. testing.md의 표를 자동 테스트로**

API 시나리오 표가 이미 잘 정리되어 있어서, Node 내장 `node:test`로 옮기면 길 B로 바꾼 뒤에도 같은 규칙이 지켜지는지 바로 확인할 수 있습니다.

```js
// test/api.test.js  (실행: node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('지난 날짜는 400', async () => {
  const res = await fetch('http://localhost:3999/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'a', due_date: '2026-10-01' }),
  });
  assert.equal(res.status, 400);
});
```

**질문. 완료 규칙이 한쪽 방향만 있는 건 의도인가요?**

태스크를 되돌리면 할 일도 미완료가 되지만, 태스크를 전부 체크해도 할 일이 자동으로 완료되지는 않습니다. 또 할 일을 되돌려도 태스크는 완료 상태로 남습니다. 둘 다 충분히 그럴 만한 선택이니, `decisions.md` 005에 한 줄 덧붙이면 더 분명해질 것 같습니다.


# 총평

규칙을 **화면·백엔드·DB 세 곳에서 지킨다**는 원칙이 문서(`business-rules.md`)와 코드에서 일관되게 보여서 인상 깊었습니다. 특히 `decisions.md`의 "포기한 것" 항목 덕분에, 코드를 읽으며 생긴 "왜?"라는 질문의 답을 대부분 문서에서 찾을 수 있었습니다. 기능 구현에 그치지 않고 SQL 주입 테스트, 데모 모드, 길 B 계획까지 스스로 넓혀 간 점도 좋았습니다.

제안한 내용은 대부분 **길 B·C로 넘어갈 때** 의미가 커지는 것들입니다(시간대, 비동기에서의 중복 검사, 서버·데모 규칙 공유). 원격에 아직 없는 `feature/path-b-supabase` 브랜치가 올라오면 그 코드도 같이 보면서 이야기해 보고 싶습니다.
