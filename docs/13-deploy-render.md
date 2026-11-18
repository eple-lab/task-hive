# 13. Render 배포 절차와 기록

작성: 2026-11-18 · 상태: **배포됨** (`https://task-hive-3cmq.onrender.com`). 손님 시작 403은 `PUBLIC_BASE_URL` 수정으로 풀렸다. 대화·추출은 로컬 Ollama(ngrok)와 Colab(Qwen)으로 끝까지 확인했다 · 관련: [D-32](02-decisions.md), [09 확인 기록 2.12](09-verification.md), [03 아키텍처 8.3](03-architecture.md), `render.yaml`, `Dockerfile`

배포를 다시 할 때 이 문서 하나만 보고 따라 할 수 있게 적는다. 6장은 실제로 해 본 기록이다.

## 1. 지금 구성 (1단계)

| 무엇 | 쓰는가 | 이유 |
|---|---|---|
| Render 웹 서비스 (Docker, Free) | 쓴다 | `render.yaml`이 정한다. 화면 빌드 → Python 서버 다단계 빌드(D-32) |
| Neon Postgres | **아직 연결하지 않는다** | 아래 1.1 |
| 구글 로그인 | 아직 없다 | 2단계 |
| LLM | 각 사용자의 Colab(ngrok) | 서버에는 모델이 없다. [colab/README.md](../colab/README.md) |

### 1.1 `DATABASE_URL`을 비워 두면 어떻게 되나

- 비워 두면 **메모리 저장소**를 쓴다(D-26, `app/store/__init__.py`의 `create_store`). 캐시가 아니라 서버 프로세스 안의 dict에 손님과 태스크를 둔다.
- 그래서 **서버가 재시작·재배포되거나, 15분 동안 요청이 없어 잠들면 데이터가 모두 사라진다.** 디스크에 따로 남지 않는다(Render 무료는 디스크가 없다).
- 손님 데이터는 원래 "마지막 활동 24시간 뒤 삭제"(D-07)라서 일찍 사라져도 원칙을 어기지 않는다. 다만 24시간은 최대 보관 기간이지 보장이 아니다.
- **채우면 안 된다.** `DATABASE_URL`이 있으면 Postgres 저장소가 골라지는데, 아직 구현 전이라 서버가 켜질 때 "Postgres 저장소는 아직 구현 전"이라고 멈춘다(`app/store/postgres.py`).
- Neon 프로젝트를 미리 만들어 두는 것은 괜찮다. 만든다면 Postgres만 켜고 나머지(Object storage, Functions, AI gateway, Realtime, Better Auth)는 끈다. 쓰지 않는다.

## 2. 비밀값 만들기

운영 모드(`APP_ENV=production`, `render.yaml`이 넣는다)에서는 아래 값이 비면 서버가 켜지지 않는다(`app/config.py`).

| 키 | 뜻 | 조건 | 만드는 명령 |
|---|---|---|---|
| `PUBLIC_BASE_URL` | 배포된 주소. 화면이 보낸 요청의 Origin과 비교한다(CSRF) | `https://`로 시작, 끝에 `/` 없이, **실제 주소와 정확히 같게** | 만들 필요 없음. 3장 6~7번 |
| `SESSION_SECRET` | 세션 쿠키 암호화 키 | 32자 이상 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATA_ENC_KEY` | DB에 넣는 태스크 제목·토큰 암호화 키. 지금은 DB가 없어 쓰이지 않지만 운영 모드에서 필수 | 32자 이상, `SESSION_SECRET`과 **다른 값** | 위와 같은 명령을 한 번 더 돌린다 |
| `SUB_HASH_KEY` | 사용자 ID를 가리는 HMAC 키 | 32자 이상 | `python -c "import secrets; print(secrets.token_hex(32))"` |

- 값은 Render 화면(Environment)에만 넣는다. 저장소, 채팅, 문서에 붙이지 않는다. 로컬 `.env`와 다른 값을 쓴다.
- `cryptography`가 없으면 `python -c "import secrets; print(secrets.token_urlsafe(48))"`도 된다(32자 이상).
- `DATA_ENC_KEY`는 2단계에서 DB를 붙인 뒤 바꾸면 이미 암호화한 제목을 못 읽는다. 따로 보관한다.

## 3. 배포 순서

1. Render 로그인 → **New → Blueprint** → GitHub 저장소 `eple-lab/task-hive` 연결. 루트의 `render.yaml`을 읽어 `task-hive` 웹 서비스(Docker, Free)를 만든다.
2. 지역을 고를 수 있으면 Neon과 같은 곳(Singapore)을 고른다. `render.yaml`에는 `region`이 없다.
3. 환경변수 4개를 넣는다(2장). `PUBLIC_BASE_URL`은 이 시점에 실제 주소를 모르므로 `https://`로 시작하는 임시값을 넣는다.
4. **Deploy**. 처음 빌드는 화면 npm 설치 + 빌드 + Python 설치라 몇 분 걸린다.
5. 빌드가 끝나면 서비스 화면 위쪽에서 **실제 주소**를 확인한다. 이름이 이미 쓰였으면 뒤에 글자가 붙는다(예: `task-hive-xxxx.onrender.com`).
6. `PUBLIC_BASE_URL`이 실제 주소와 다르면 Environment에서 실제 주소로 고친다.
7. **Save and deploy**로 다시 배포한다. `autoDeployTrigger`가 `off`라서 push만으로는 배포되지 않는다. 코드를 바꾼 뒤에도 화면의 **Manual Deploy**로 배포한다.
8. 4장 확인을 한다.

## 4. 배포 뒤 확인

| 확인 | 방법 | 기대 |
|---|---|---|
| 서버가 떴다 | `https://<주소>/health` | 200 `{"status":"ok"}` |
| 화면이 빌드됐다 | `https://<주소>/` | 로그인 카드("구글로 시작", "로그인 없이 시작") |
| Origin 검사 통과 | "로그인 없이 시작" → 이름 입력 → "알겠어요, 시작할게요" | 대화 화면으로 넘어간다. 개발자 도구 Network에서 `POST /api/guest`가 200 |
| 첫 인사와 목소리 | 손님 시작 직후 | 인사 문장이 나오고 읽어 준다. **LLM이 아니다**: 문장은 서버가 시각·날씨로 만들고(`app/routers/settings.py`의 `_greeting_text`), 목소리는 브라우저 내장 음성(Web Speech API, `frontend/src/features/voice/speech.ts`)이다. Colab 없이도 된다 |
| 대화 보내기 (Colab 없이) | 대화창에 글을 보낸다 | Colab이 연결되지 않았다는 안내. 대화는 Colab LLM이 있어야 한다(`require_upstream`) |
| Colab 연결 | 오른쪽 상태창 "연결"에 ngrok 주소와 접속 키 → "연결 확인" | Colab을 켜 둔 때만. [colab/README.md](../colab/README.md) |

## 5. 막혔을 때

| 증상 | 원인 | 할 일 |
|---|---|---|
| 손님 시작에서 "요청을 확인할 수 없습니다. 화면을 새로고침해 주세요." (`POST /api/guest` 403) | 운영 모드는 브라우저의 Origin이 `PUBLIC_BASE_URL`과 정확히 같아야 받는다(`app/security/middleware.py`의 `_origin_allowed`). 임시값이나 끝의 `/` 때문에 다르다 | 3장 6~7번 |
| 배포 로그에 "production에서는 ○○가 필요합니다" | 비밀값이 비었다 | 2장 |
| 배포 로그에 "○○는 32자 이상이어야 합니다" | 값이 짧다 | 2장 명령으로 다시 만든다 |
| 배포 로그에 "PUBLIC_BASE_URL이 https://로 시작해야" | `http://`이거나 비었다 | `https://…`로 넣는다 |
| 배포 로그에 "Postgres 저장소는 아직 구현 전" | `DATABASE_URL`을 넣었다 | 지운다(1.1) |
| 배포 앱의 "연결"에 `http://localhost:11434`(로컬 Ollama)를 넣었더니 거절 | 배포 앱에서 모델을 부르는 것은 Render 서버라 `localhost`는 서버 자신이다. 운영 모드는 SSRF 방어로 localhost를 막고(`UPSTREAM_ALLOW_LOCALHOST`를 켜면 서버가 안 켜짐), `.ngrok-free.app`/`.ngrok-free.dev`만 받는다(`app/config.py`) | 배포 앱은 Colab 주소로 연결한다. Colab을 못 쓸 때는 로컬 Ollama를 ngrok으로 열어(`.ngrok-free.dev`) 넣을 수 있다(6장 기록). 단 Ollama에는 접속 키 검사가 없어 주소를 아는 누구나 쓸 수 있으므로 시험이 끝나면 ngrok을 끈다 |
| "연결 확인"을 누르면 "접속 키를 입력해 주세요." (요청이 서버로 가지 않는다) | 화면이 접속 키 칸을 필수로 검사한다. Ollama는 키를 보지 않는다 | Ollama일 때는 아무 글자나 넣는다. Colab일 때는 노트북이 보여 준 키 |
| 대화를 보내면 "Colab에 연결되지 않았어요" | Colab을 연결하지 않았다. 대화는 LLM이 있어야 한다. 첫 인사와 목소리는 LLM 없이 나온다 | Colab 0~6번 셀 실행 후 주소·키 입력 |
| 첫 접속이 수십 초 걸린다 | 무료 서버가 잠들어 있었다 | 기다린다. 잠들면 메모리 데이터도 사라진다 |

## 6. 실행 기록

| 날짜 | 한 것 | 결과 |
|---|---|---|
| 2026-11-18 | eple: Blueprint로 서비스 생성, 환경변수 4개 입력, Deploy | 빌드 성공. 주소 `https://task-hive-3cmq.onrender.com` (이름 `task-hive`가 이미 쓰여 뒤에 글자가 붙음) |
| 2026-11-18 | Claude: `/health`, `/` 요청 | `/health` 200 `{"status":"ok"}`(0.6초), `/` 200 화면 HTML |
| 2026-11-18 | Claude: 브라우저로 "로그인 없이 시작" → 이름 "테스트" | **`POST /api/guest` 403**, 화면에 "요청을 확인할 수 없습니다". 5장 첫 줄 원인으로 본다(입력한 임시값은 보지 못했다) |
| 2026-11-18 | eple: `PUBLIC_BASE_URL` 수정 후 다시 배포(추측: eple이 인사 목소리를 들었다고 해서 손님 시작이 통과한 것으로 본다) | eple 화면에서 3단 화면과 첫 인사가 나오고 브라우저 음성으로 읽힘. 대화를 보내면 "Colab에 연결되지 않았어요. 오른쪽 상태창에서 주소와 접속 키를 넣어 주세요." (Colab을 켜지 않았으므로 기대대로) |
| 2026-11-18 | Claude: 같은 Chrome에서 주소를 다시 열기 | eple의 손님 세션 쿠키로 3단 화면이 바로 열렸고 `GET /api/greeting` 200. 손님 시작 `POST`를 Claude가 새로 다시 보내 보지는 않았다 |
| 2026-11-18 | eple: Colab이 "대기열에 추가됨"에서 시작되지 않아, 로컬 Ollama(`llama3.2`)를 ngrok(`.ngrok-free.dev`)으로 열었다 | eple은 키 칸을 비워 연결이 안 됐다 |
| 2026-11-18 | Claude: 그 ngrok 주소에 `GET /v1/models`, 작은 `POST /v1/chat/completions` | 둘 다 200. 5토큰 대화에 24.7초(모델을 처음 올리는 시간 포함으로 추측) |
| 2026-11-18 | Claude: 배포 앱에서 주소만 넣고 "연결 확인" | "접속 키를 입력해 주세요." 화면 검사에서 멈춰 서버로 요청이 가지 않음 |
| 2026-11-18 | Claude: 키 칸에 아무 글자를 넣고 "연결 확인" → 대화 1번("배포 테스트예요. 내일까지 과제 제출해야 해요.") | `PUT /api/settings/upstream` 200 "모델 1개 · 응답 773ms". `POST /api/chat` 200, 답이 왔다(20초 남짓). `POST /api/extract` 200까지 약 1분 반, 후보 1개 "배포 테스트 · 2026-11-18". **배포 앱 → ngrok → 모델 전체 흐름이 된다.** 후보 내용은 틀렸다(과제 제출을 "배포 테스트"로, 마감 "내일"을 오늘 날짜로). llama3.2가 PoC-01 기준을 못 넘은 것과 같은 모습 |
| 2026-11-18 | eple: 다른 구글 계정의 Colab으로 노트북 실행(`MODEL_NAME` 그대로) 후 배포 앱에 연결. Claude: 대화 1번 | "대화 모델 연결됨". 대화·추출이 8초 안에 끝남. 해요체 답. 후보 "집 청소"는 맞았으나 "모레"를 11-25로(틀림) |
| 2026-11-18 | Claude: 같은 세션 페이지에서 20건 측정 | 대화 중앙값 1.6초, 추출 2.3초, 재현율 0.68. [eval/results/20261118-171033_app-render-colab.md](../eval/results/20261118-171033_app-render-colab.md) |

화면 캡처와 내려받은 MD: [test-records/20261118-deploy](test-records/20261118-deploy/README.md)

이 기록으로 확인된 것:
- **Docker 다단계 빌드가 실제로 된다.** 이 PC에 Docker가 없어 그동안 한 번도 빌드해 보지 못했다.
- **Render 무료 플랜에서 Docker 런타임 웹 서비스가 된다.** [09](09-verification.md) 2.12에서 "첫 배포 때 확인"으로 남긴 항목이다.

## 7. 알아 둘 것

- 무료 서버: 512MB, 0.1 CPU, 인스턴스 1개, 디스크 없음, 15분 동안 요청이 없으면 잠들고 깨는 데 수십 초~1분([09](09-verification.md) 1번).
- 고른 지역은 기록하지 못했다. Blueprint에서 지역을 고르지 않으면 기본값은 Oregon(미국)으로 알고 있다(추측, 공식 문서로 다시 확인하지 않음). 2단계에서 Neon(Singapore)을 붙이면 지역이 같아야 DB 지연이 작다. 국외 이전 안내([05](05-security.md))에도 지역이 들어간다.
- 공개 주소는 누구나 열 수 있다. 손님 데이터는 그 브라우저 세션에만 묶이지만, 서버 하나를 모두가 함께 쓴다.
