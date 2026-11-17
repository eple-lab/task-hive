# 11. API 계약

작성일: 2026-11-17 · 백엔드(`app/`)와 화면(`frontend/`)이 함께 지키는 약속이다. 한쪽만 바꾸지 않는다. 바꿔야 하면 이 문서를 먼저 고치고 양쪽을 함께 고친다.

MVP(1단계: 손님 모드로 대화 → 할 일 후보 → 벌집 등록) 기준이다. 구글 로그인, 캘린더, 드라이브, Colab TTS, STT는 아직 없다.

## 공통 규칙

| 항목 | 규칙 |
|---|---|
| 인증 | 암호화한 세션 쿠키. 화면은 `credentials: 'same-origin'`으로 보낸다 |
| 변경 요청 | GET이 아닌 요청은 헤더 `X-TH: 1`이 있어야 한다. 서버는 `Origin`도 확인한다 |
| 본문 | JSON만 받는다 |
| 오류 | HTTP 상태 코드 + `{"error":{"code":"...","message":"한국어 안내"}}`. 화면은 `message`만 보여 준다 |
| 날짜 | `YYYY-MM-DD`. 시각은 ISO 8601 |
| 문서 주소 | `/docs`, `/openapi.json`은 끈다 |

## 상태와 세션

### `GET /health`

`{"status":"ok"}`

### `GET /api/me`

```json
{
  "mode": "none | guest | google",
  "name": "문자열 또는 null",
  "lang": "ko",
  "city": "서울",
  "settings": {
    "voice": {
      "enabled": true,
      "gender": "female",
      "voice": null,
      "rate": 1.0,
      "pitch": 1.0,
      "volume": 1.0,
      "echo": 0.0,
      "sentence_stream": true,
      "stop_on_typing": true
    },
    "llm": {"temperature": 0.6, "max_tokens": 400, "model": null}
  },
  "features": {"calendar": null, "diary_google": null, "task_sheet": null},
  "upstream": {"connected": false, "models": []},
  "limits": {"hive_max_rings": 3, "hive_max_cells": 37},
  "google_available": false
}
```

- `features`의 값: `null`은 "아직 묻지 않음", `true`는 켬, `false`는 끔(D-16, D-28).
- `google_available`이 `false`면 화면은 구글 기능을 "2단계에 연결돼요"로 안내한다.
- `settings.voice`는 서버의 지금 모양을 기준으로 한다(eple 결정, 2026-11-17). 화면도 같은 이름을 쓴다.

| 필드 | 값 | 뜻 |
|---|---|---|
| `enabled` | true/false | 말하기 켬·끔 |
| `gender` | `"female"` / `"male"` | 목소리 성별(브라우저 음성을 고를 때 참고) |
| `voice` | 문자열(120자까지) 또는 `null` | 브라우저 음성 이름(`voiceURI`). `null`이면 화면이 한국어 기본 음성을 고른다 |
| `rate` | 0.5 ~ 2.0 | 속도 |
| `pitch` | 0.0 ~ 2.0 | 높낮이(낮을수록 굵다) |
| `volume` | 0.0 ~ 1.0 | 크기 |
| `echo` | 0.0 ~ 1.0 | 울림. Colab TTS가 붙은 뒤에만 쓴다(D-03) |
| `sentence_stream` | true/false | 문장마다 바로 읽기 |
| `stop_on_typing` | true/false | 내가 입력하면 읽기 멈추기 |

`PUT /api/settings`의 `voice`는 이 중 바꿀 필드만 보낸다. 표에 없는 필드나 범위 밖 값은 422다.

### `POST /api/guest`

요청 `{"name": "문자열"}` → `GET /api/me`와 같은 모양.

### `POST /auth/logout`

204.

## 설정

| 메서드·주소 | 요청 | 응답 |
|---|---|---|
| `PUT /api/settings` | `{"lang"?, "city"?, "voice"?, "llm"?, "features"?}` | `GET /api/me`와 같은 모양 |
| `PUT /api/settings/upstream` | `{"url": "https://….ngrok-free.app", "key": "접속 키"}` | `{"connected": true, "models": ["…"], "latency_ms": 123}` |
| `DELETE /api/settings/upstream` | - | 204 |

`PUT /api/settings/upstream`은 주소 검사에 실패하면 400, Colab에 연결하지 못하면 502를 준다. 주소와 키는 세션 쿠키 안에만 둔다.

## 인사와 대화

### `GET /api/greeting`

`{"now": "ISO 시각", "weather": {"city": "서울", "temp_c": 12.3, "desc": "맑음"} | null, "text": "인사말"}`

### `POST /api/chat`

요청:

```json
{
  "messages": [{"role": "user | assistant", "content": "문자열"}],
  "temperature": 0.6,
  "max_tokens": 400,
  "model": null
}
```

응답은 `text/event-stream`이다. 줄마다 하나씩 온다.

```
data: {"type":"answer","text":"조각"}
data: {"type":"done"}
data: {"type":"error","message":"한국어 안내"}
```

서버는 대화 본문을 저장하지 않고 로그에도 남기지 않는다(D-08).

### `POST /api/extract`

요청 `{"messages": [최근 몇 줄]}` →

```json
{
  "candidates": [
    {"title": "문자열", "due_date": "YYYY-MM-DD 또는 null", "subtasks": ["문자열"], "evidence": "근거가 된 대화 문장", "confidence": 0.0}
  ],
  "completions": [
    {"task_id": 1, "subtask_id": null, "all_subtasks": false, "evidence": "문자열", "confidence": 0.0}
  ]
}
```

- `candidates`는 후보일 뿐이다. 사용자가 담아야 등록된다.
- `completions`는 "그건 한 것 같아"에 해당한다. 화면은 D-21대로 처리한다: 하위 태스크가 없거나 특정 항목이면 바로 체크하고 "되돌리기"를 보여 주고, `all_subtasks`가 `true`면 확인받는다.
- LLM은 삭제를 제안할 수 없다. 서버가 `task_id`가 이 사용자의 것인지 확인한다.

## 태스크

태스크 모양:

```json
{
  "id": 1,
  "title": "문자열",
  "due_date": "YYYY-MM-DD 또는 null",
  "completed": false,
  "completed_at": null,
  "archived": false,
  "source": "chat | calendar | manual",
  "hex_q": 0,
  "hex_r": 0,
  "created_at": "ISO 시각",
  "subtasks": [{"id": 11, "title": "문자열", "completed": false}]
}
```

| 메서드·주소 | 요청 | 응답 |
|---|---|---|
| `GET /api/tasks` | - | `{"tasks": [태스크]}` |
| `POST /api/tasks/bulk` | `{"items": [{"title", "due_date"?, "subtasks"?: ["문자열"], "source"?}]}` | `{"tasks": [만든 태스크]}` |
| `PATCH /api/tasks/{id}` | `{"title"?, "due_date"?, "completed"?, "archived"?}` | 태스크 |
| `DELETE /api/tasks/{id}` | - | 204 |
| `POST /api/tasks/{id}/subtasks` | `{"title"}` | 태스크 |
| `PATCH /api/tasks/{id}/subtasks/{sid}` | `{"completed"?, "title"?}` | 태스크 |
| `DELETE /api/tasks/{id}/subtasks/{sid}` | - | 태스크 |

규칙(서버가 검사):

- 제목은 비울 수 없고 200자까지다.
- 태스크 제목은 중복할 수 없다. 하위 태스크 제목은 같은 태스크 안에서만 중복할 수 없다.
- `due_date`는 없어도 된다.
- 벌집 칸 수 한도(`HIVE_MAX_RINGS`, 기본 37칸)를 넘으면 409. 보관(`archived`)한 태스크는 칸을 차지하지 않는다.
- 다른 세션의 태스크는 없는 것처럼 404를 준다.
- 좌표 `(hex_q, hex_r)`는 서버가 정한다. 가운데부터 바깥 고리 순서이고 같은 고리 안에서는 무작위다.

## 일기와 내려받기

| 메서드·주소 | 요청 | 응답 |
|---|---|---|
| `POST /api/diary/summary` | `{"messages": [...]}` | `{"summary_line": "한 줄", "body": "본문", "did": ["한 일"], "todo": ["할 일"]}` |
| `GET /api/export` | - | Markdown 파일. 손님은 응답을 보낸 뒤 데이터를 지운다(D-07) |

## 지표

| 메서드·주소 | 요청 | 응답 |
|---|---|---|
| `POST /api/metrics/client` | `{"kind": "문자열", "ms": 123}` | 204 |
| `GET /api/admin/metrics` | - | 집계 JSON. 개발 환경에서만 열린다. 그 밖에는 404 |

## 백엔드 안에서 이름을 지켜야 하는 것

`eval/run_eval.py`가 불러 쓴다. 이름이나 인자를 바꾸면 측정 스크립트도 함께 고친다.

| 위치 | 이름 |
|---|---|
| `app/prompts/extract.py` | `EXTRACT_SYSTEM_PROMPT`, `EXTRACT_SCHEMA`, `build_extract_messages(dialog_messages, tasks, today)` |
| `app/services/extraction.py` | `parse_and_validate(raw, tasks)` |

## 화면 개발 환경

- Vite 개발 서버가 `/api`, `/auth`, `/health`를 `http://localhost:8000`으로 넘긴다.
- 빌드 결과는 `frontend/dist`. FastAPI가 이 폴더를 내준다. 없으면 `/`에서 "화면이 아직 빌드되지 않았다"는 안내를 준다.
- `VITE_USE_MOCK=1`이면 `src/shared/api/mock.ts`의 가짜 응답을 쓴다(백엔드 없이 화면만 볼 때).

## 2단계에 추가할 것 (아직 계약 없음)

구글 로그인(`/auth/login`, `/auth/callback`), 캘린더(`/api/calendar/*`), 일기 저장(`/api/diary/save`, `/api/diary/recent`), 말하기·받아쓰기(`/api/tts`, `/api/stt`), 구글 토큰 남은 시간. 만들 때 이 문서에 먼저 적는다.
