# API

백엔드(`server.js`)가 화면에 열어 주는 창구 목록. 주소는 "무엇"(명사), 동작은 메서드로 나눈다(REST).
모든 요청·응답 본문은 JSON이다.

## 한눈에 보기

| CRUD | 메서드 | 주소 | 하는 일 |
|---|---|---|---|
| Read | GET | `/api/todos` | 할 일 목록(태스크 포함). 검색·오늘 필터 |
| Create | POST | `/api/todos` | 할 일 추가 |
| Update | PATCH | `/api/todos/:id` | 할 일 완료/미완료 |
| Delete | DELETE | `/api/todos/:id` | 할 일 삭제(태스크도 함께) |
| Create | POST | `/api/todos/:id/tasks` | 태스크 추가 |
| Update | PATCH | `/api/tasks/:id` | 태스크 완료/미완료 |
| Delete | DELETE | `/api/tasks/:id` | 태스크 삭제 |

## 공통

### 상태 코드

| 코드 | 뜻 | 언제 |
|---|---|---|
| 200 | 성공 | 목록 조회 |
| 201 | 만들어짐 | 추가 성공. 본문 `{ "id": 새 번호 }` |
| 204 | 성공, 본문 없음 | 수정·삭제 성공 |
| 400 | 요청이 잘못됨 | 빈 제목, 날짜 없음·지난 날짜·형식 오류, 숫자가 아닌 id, JSON이 아닌 본문 |
| 404 | 없음 | 없는 할 일·태스크, 없는 API 주소 |
| 409 | 규칙과 충돌 | 중복 제목, 안 끝난 태스크가 있는데 완료 시도, 완료된 할 일에 태스크 추가 |
| 500 | 서버 문제 | 예상 못 한 에러. 내부 내용은 응답에 담지 않고 서버 로그에만 남긴다 |

### 에러 응답 모양
```json
{ "error": "같은 이름의 할 일이 이미 있습니다." }
```
안 끝난 태스크 때문에 완료가 막힌 경우만 개수가 함께 온다.
```json
{ "error": "완료하지 않은 태스크가 2개 있습니다.", "open_tasks": 2 }
```

### 입력 제한
- 제목: 앞뒤 공백을 지운 뒤 1~200자
- 마감일: `YYYY-MM-DD`, 실제 있는 날짜, 오늘 이후
- 요청 본문: 10KB 이하

---

## GET /api/todos

할 일 목록과 각 할 일의 태스크를 함께 돌려준다.

| 쿼리 | 뜻 |
|---|---|
| `q` | 검색어. 할 일 제목이나 **태스크 제목**에 들어 있으면 그 할 일이 나온다 |
| `today=1` | 마감일이 오늘(서버 컴퓨터 기준)인 할 일만 |

정렬: 미완료 먼저 → 마감일 빠른 순 → 최근 등록 순.

```http
GET /api/todos?q=자료&today=1
```
```json
{
  "today": "2026-10-30",
  "todos": [
    {
      "id": 1,
      "title": "보고서 쓰기",
      "due_date": "2026-10-30",
      "completed": false,
      "completed_at": null,
      "delete_on": null,
      "created_at": "2026-10-30 01:20:00",
      "tasks": [
        { "id": 1, "todo_id": 1, "title": "자료 찾기", "completed": true },
        { "id": 2, "todo_id": 1, "title": "초안 쓰기", "completed": false }
      ]
    }
  ]
}
```
- `today`: 서버 기준 오늘. 화면이 "오늘 마감", 지난 마감(빨간 글씨)을 표시할 때 쓴다.
- `delete_on`: 완료된 할 일이 자동 삭제될 날짜(완료일 + 90일). 미완료면 `null`.

## POST /api/todos

```http
POST /api/todos
Content-Type: application/json

{ "title": "장보기", "due_date": "2026-11-04" }
```
| 결과 | 응답 |
|---|---|
| 성공 | `201 { "id": 7 }` |
| 날짜 없음 | `400 { "error": "날짜를 등록해주세요." }` |
| 지난 날짜 | `400 { "error": "지난 날짜는 등록할 수 없습니다." }` |
| 미완료 할 일 중 같은 제목 | `409 { "error": "같은 이름의 할 일이 이미 있습니다." }` |

## PATCH /api/todos/:id

```json
{ "completed": true, "force": false }
```
| 상황 | 응답 |
|---|---|
| 태스크가 모두 끝났거나 없음 | `204` 완료 처리 |
| 안 끝난 태스크가 있고 `force`가 없음 | `409 { "error": "...", "open_tasks": N }` → 화면이 확인창을 띄움 |
| 안 끝난 태스크가 있고 `force: true` | `204` 할 일과 **남은 태스크까지 함께** 완료 |
| `completed: false` (되돌리기) | `204` 미완료로. 단, 같은 제목의 미완료 할 일이 있으면 `409` |

## DELETE /api/todos/:id

`204`. 태스크도 함께 지워진다(DB의 `ON DELETE CASCADE`).
"하위 태스크 N개도 함께 삭제됩니다" 확인창은 화면이 띄운다.

## POST /api/todos/:id/tasks

```json
{ "title": "자료 찾기" }
```
| 결과 | 응답 |
|---|---|
| 성공 | `201 { "id": 3 }` |
| 할 일이 없음 | `404` |
| 완료된 할 일 | `409 { "error": "완료된 할 일에는 태스크를 추가할 수 없습니다." }` |
| 같은 할 일 안에 같은 제목 | `409 { "error": "이 할 일에 같은 이름의 태스크가 이미 있습니다." }` |

## PATCH /api/tasks/:id

```json
{ "completed": false }
```
- 완료로: `204`
- 미완료로: `204`. 속한 할 일이 완료 상태였다면 **할 일도 미완료로 돌아간다**. 이때 같은 제목의 미완료 할 일이 있으면 `409`.

## DELETE /api/tasks/:id

`204`. 확인 없이 바로 지운다.

---

## 직접 호출해 보기

서버를 켠 상태에서(`npm start`) 브라우저 개발자 도구(F12) → Console에 붙여 넣는다.
```js
await (await fetch('/api/todos')).json()

await fetch('/api/todos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '콘솔에서 추가', due_date: new Date().toLocaleDateString('sv-SE') }),
}).then((r) => r.json())
```
> Windows 터미널의 `curl`로 한글을 보내면 인코딩이 깨질 수 있다. 한글 테스트는 브라우저 콘솔이나 Node 스크립트로 한다.
