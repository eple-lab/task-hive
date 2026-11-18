# 이어받기 노트

마지막 갱신: 2026-11-18 (Opus 이어받기 세션, 제출 직전) · 다음 세션이 이 파일부터 읽는다.

## 0. 누가 무엇을 하나 (eple 지정)

| 역할 | 모델 | 하는 일 |
|---|---|---|
| 이어받기 (지휘) | **Opus** | 이 노트를 읽고 작업 순서를 정한다. eple에게 확인받는다. 코드 작성을 맡길 지시문을 쓴다. 결과를 직접 확인한다. 문서를 고치고 커밋·push한다 |
| 코드 생성 | **Sonnet** | Opus가 준 지시문대로 코드를 쓴다. 범위 밖 파일을 건드리지 않는다. git 명령을 쓰지 않는다 |

### Opus가 Sonnet에게 맡기는 방법

- Agent 도구로 **새 하위 세션**을 만들고 `model: "sonnet"`을 지정한다.
- `subagent_type: "fork"`는 쓰지 않는다. fork는 부모와 같은 모델로 돌고 `model` 지정이 무시된다.
- 새 하위 세션은 이 대화를 모른다. 지시문에 **읽을 파일 경로**를 적는다: 이 노트, `docs/11-api-contract.md`, 관련 설계 문서, 이미 있는 코드.
- 지시문에 꼭 넣는다: 범위(만들 폴더·파일), 하지 말 것, "다 됐다"의 기준(돌려 볼 명령), 보고 형식(한 것 / 직접 확인한 것 / 확인 못 한 것), 한국어 주석을 많이 달 것.
- **한 번에 하나씩 맡긴다.** 2026-11-17에 세 갈래를 동시에 돌렸다가 5시간 한도를 한꺼번에 써서 두 갈래가 시작 직후 끊겼다(한 갈래가 약 46만 토큰을 썼다). 맡기기 전에 eple에게 대략의 규모를 알리고 확인받는다.
- 하위 세션이 끝났다고 하면 그대로 믿지 않는다. 테스트와 빌드를 Opus가 직접 다시 돌려 본 뒤 eple에게 보고한다.
- 큰 덩어리 하나로 맡기지 않는다. 아래 6장의 작업 단위대로 나눈다.

## 1. 지금 어디까지 왔나

| 항목 | 상태 |
|---|---|
| 기획 문서 (`docs/00`~`11`, `checks/`, `poc/`) | 끝. 원격 `main`에 있다 |
| 문제 정의서 (`docs/00-problem-definition.md`) | 끝 (검증 전) |
| `.env.example`, `.gitignore`, 루트 `README.md` | 끝 |
| Colab 노트북, 검증 자료 20건, 측정 스크립트 (`colab/`, `eval/`) | 끝. **2026-11-18 Colab 무료 T4에서 0~8번 셀 모두 실행 확인**(eple). 0번 셀 토큰 검사 개선은 9a7725f |
| 백엔드 (`app/`) | 돈다. 테스트 214개 통과(`pytest -q`). 커밋 be8997b, b31929b, 82df71f |
| 화면 (`frontend/`) | 빌드·타입 검사 통과, 테스트 37개. 시작 화면, 3단 배치, 상태창, "후보 찾는 중" 표시. 커밋 26e11c3, a92ddf6, e6cb0d0, 3f0d21a |
| 실제 연결 | 실제 서버 + 로컬 Ollama(llama3.2)로 대화 → 후보 → 담기 → 벌집 등록 → 새로고침 유지까지 브라우저에서 확인(2026-11-17, 82df71f). 배포 앱 ↔ Colab(Qwen) 연결도 확인(2026-11-18, 20건 측정) |
| 배포 | Render 무료에 배포함(2026-11-18, `https://task-hive-3cmq.onrender.com`). Docker 빌드 성공, 손님 시작·인사 확인. 로컬 Ollama(llama3.2)를 ngrok으로 붙여 대화·추출까지 확인(접속 키 칸은 아무 글자). Colab(Qwen)으로 20건 측정까지 함(재현율 0.68, 기계 시간 한 건당 약 7초). 절차와 기록은 `docs/13-deploy-render.md` |
| 검증 (PoC-01) | 기준선(손 입력) 재현율 1.00·69초/건, llama3.2(CPU) **못 넘음**, **Qwen3.5 4B AWQ(Colab T4) 넘음**(재현율 0.84, 지어냄 1, 없는 대화 3/3). 등록 시간 비교는 아직. `docs/poc/poc-01-llm-summary.md` |
| 보안 | 공개 전 점검 끝(2026-11-18). pre-commit 개인정보 검사 훅 설치(50aa871, 새 clone은 `git config core.hooksPath .githooks`) |
| 과제 제출 | 기한 2026-11-18. 구글폼에 저장소 주소를 낸다(eple). 제출 요건 문서는 모두 있다 |

## 2. 프로젝트 한 줄

저녁에 일기 쓰듯 AI와 대화하면 AI가 할 일을 뽑아 후보로 보여 주고, 고른 것을 벌집에 쌓는 서비스. AIFFEL 메인 퀘스트 2(내 도메인에서 AI 개선 지점 찾아 PoC 만들기) 제출물이다.

## 3. eple과 일하는 규칙 (꼭 지킨다)

- 사용자를 "eple"이라고 부른다.
- 작업 전에 무엇을·왜·어떻게를 말하고 확인받는다. 물음표가 붙은 말은 승인이 아니다.
- 임의로 정하지 않는다. 빈 곳은 추천을 붙여 **설명으로** 묻는다(문서 링크만 주지 않는다. eple은 수업 중에 답한다).
- 커밋 메시지는 자세히 쓴다. 묶음 하나가 끝나면 바로 커밋하고 올린다.
- 결과 보고는 "한 것 / 직접 확인한 것 / 확인 못 한 것"으로 나눈다.
- 코드에는 한국어 주석을 많이 단다.
- 사용량이 많이 드는 작업은 시작 전에 규모를 알리고 확인받는다.
- 가이드 저장소(`claude-code-guides`)의 문서를 처음 읽을 때는 먼저 묻는다.
- 실제 일기, 실제 대화, 비밀값, eple의 메일 주소를 파일에 쓰지 않는다.

## 4. 꼭 알아야 할 결정 (전체는 `docs/02-decisions.md`)

| 주제 | 결정 |
|---|---|
| 구조 | FastAPI + React(Vite, TypeScript) + Neon + Render. LLM은 사용자의 Colab(ngrok) |
| 데이터 | 대화 원문은 서버에 저장하지 않는다. 태스크 원본은 Neon, 구글 시트는 사본 |
| 손님 | 세션 ID로 저장, 내려받기 직후 또는 24시간 뒤 삭제 |
| Colab 주소 | 사용자마다 입력. 접속 키 사용. 서버가 주소를 검사한다(SSRF 방어) |
| 벌집 | SVG, 기본 3단 37칸, `HIVE_MAX_RINGS`로 변경. 꽉 차면 보관함 |
| 완료 체크 | "그건 한 것 같아"는 일괄 완료만 확인, 삭제는 대화로 못 함 |
| 구글 (2단계) | 로그인은 `openid`만. 기능을 연결할 때 권한 요청. 캘린더는 소유 캘린더만. 토글로 켜고 끔 |
| 구글 토큰 | `GOOGLE_TOKEN_MODE`로 고른다. **1시간 토큰 방식을 먼저 구현한다**(`honey-voice-log`에 이미 있는 코드를 본받는다). refresh token 방식은 그다음이다 (eple 지시, 2026-11-17) |
| 말하기 | 지금은 브라우저 내장 음성. Colab TTS는 자리만 |
| Colab | 과제용 실험 환경. LLM이 대화를 요약·추출할 수 있는지 테스트 |
| 성공 기준 | 가상 대화 20건: 할 일 80% 이상 추출, 지어낸 것 3개 이하, 할 일 없는 대화 3건 중 2건 통과, 손 입력보다 빠름 |
| 화면과 서버의 약속 | `docs/11-api-contract.md`. 한쪽만 바꾸지 않는다 |

## 5. 코드 상태

### 5.0 2026-11-17 ~ 18 Opus 이어받기 세션에서 확인한 것 (최신)

2026-11-18에 한 것 (문서·노트북 중심, 코드는 바꾸지 않음):

| 일 | 커밋 | 확인 |
|---|---|---|
| pre-commit 훅 + README 라이선스·Copyright | 50aa871 | 임시 저장소에서 10가지 경우 시험. 훅이 자기 `PATTERN=` 줄을 막아 예외 추가, 가이드 `proposals/`에 제안 파일(가이드는 커밋 안 함) |
| GitHub에서 깨지는 글자 상자 그림 교체 | 2bd1b33 | GitHub 화면에서 사진·표·Mermaid 확인 |
| Open in Colab 배지 | 964576e (+eple 1c687a6, 2bf11ce) | eple이 배지로 Colab을 열었다 |
| Colab 0번 셀이 ngrok 토큰을 먼저 읽고 검사, `docs/12-fixes.md` 시작 | 9a7725f | 가짜 모듈로 5가지 경우 시험, Colab에서 6·7번 셀 200 |
| Qwen 결과 파일 (eple이 Colab에서 올림) | 3ab9064 | 키·주소·이메일 패턴 없음 |
| PoC-01·README에 Qwen 결과, 라이선스 Apache-2.0 | c3f8e4c, 4abf034 | 결과 파일·모델 카드와 대조 |

버그·개선은 이제 [`docs/12-fixes.md`](12-fixes.md)에 F-번호로 적는다(eple, 2026-11-18). 새 항목은 위에 더한다.

2026-11-17에 한 것:

| 단위 | 커밋 | 확인 |
|---|---|---|
| C-1 백엔드 살리기 | be8997b | `/health` 200, `uvicorn app.main:app`, `/docs` 404 |
| C-2 백엔드 테스트 | b31929b | `pytest -q` 214 passed. 요청 제한은 분당 방식으로 통일(eple), "종류 + 접속 IP"로 센다 |
| C-3 화면 뼈대 | 26e11c3 | build·typecheck 통과, 시작 화면 → 손님 시작 → 3단 |
| 목소리 설정 계약 | a92ddf6 | 서버 모양(9개 필드)을 계약에 적고 화면 이름 맞춤(eple) |
| C-4 상태창 | e6cb0d0 | 가짜 응답으로 연결 → 후보 → 담기 → 옮기기 → 벌집 |
| C-5 서버·화면 연결 | 82df71f | 실제 서버 + Ollama로 끝까지. 지표 이름 불일치 고침, 벌집 크기 조정 |
| C-6 배포 파일 | 3f0d21a | 이 PC에 Docker가 없어 이미지 빌드는 못 함. 운영 모드 로컬 실행으로 흉내만 확인 |

로컬 실행 (저장소 루트):
- 서버: `APP_ENV=development UPSTREAM_ALLOW_LOCALHOST=true .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000` (빌드한 화면도 함께 내준다)
- 화면 개발: `cd frontend && npm run dev` (가짜 응답만: `npm run dev:mock`)
- 로컬 LLM: 연결 칸에 `http://localhost:11434` + 아무 키(Ollama, llama3.2). Colab은 ngrok 주소 + 접속 키.

관찰: llama3.2는 두 할 일 중 하나를 놓치는 일이 있었다. 이 PC(CPU)에서 답 약 1분, 추출 2~3분.
남은 작은 것: 대화로 완료 처리(`completions`) 경로는 실제 모델로 시험하지 않음, 도시 목록이 서버·화면에 따로 있음, 요청 크기 검사가 `Content-Length`만 봄, 계약에 상태 코드(중복 409, 형식 422)·지표 종류 적기.

### 5.1 처음 이어받을 때의 기록 (2026-11-17 15:35, 지금은 지난 내용)

파일 목록을 확인했고, `app/`의 파이썬 파일 35개는 구문 분석에서 문법 오류가 없었다. **내용을 읽거나 실행해 보지는 않았다.** 쓰다가 끊긴 파일이라 중간에 잘렸을 수 있다. 이어서 쓰기 전에 먼저 읽고 문법 검사부터 한다.

### 백엔드 `app/` ("작업 중" 커밋에 있음)

| 있는 것 | 없는 것 |
|---|---|
| `config.py`, `main.py`, `deps.py`, `errors.py` | `tests/` 전체 |
| `routers/`: admin, auth, chat, common, diary, export, settings, stubs, tasks | `requirements.txt`, `requirements-dev.txt` |
| `security/`: middleware, rate_limit, sanitize, session, url_guard | `Dockerfile`, `render.yaml` |
| `services/`: extraction, metrics, upstream, weather | pytest 설정 |
| `store/`: base, hive, memory, postgres(자리만), `migrations/001_init.sql` | |
| `prompts/`: chat, diary, extract | |

- `.venv/`가 만들어져 있다(Git에는 안 올라간다). 무엇이 설치됐는지는 확인하지 않았다.
- `eval/run_eval.py`가 `app/prompts/extract.py`와 `app/services/extraction.py`를 불러 쓰는 것은 확인됐다(연습 실행에서 동작).

### 화면 `frontend/` ("작업 중" 커밋에 있음)

| 있는 것 | 없는 것 |
|---|---|
| `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `.npmrc` | `src/main.tsx` (시작점) |
| `src/shared/api/`: client, types, mock | `src/app/`: App, routes |
| `src/shared/state/store.tsx` | `src/features/auth/` (시작 화면, 손님 시작) |
| `src/shared/ui/controls.tsx`, `src/shared/i18n/ko.ts` | `src/features/panel/` (상태창 전체) |
| `src/features/chat/`: ChatPanel, useConversation | `src/features/admin/` |
| `src/features/hive/`: layout(+테스트), dday, HiveView, Bee, HivePanel, ListView, TaskDetail | `src/styles/` (테마, 3단 배치) |
| `src/features/voice/`: speech, useVoice | ESLint 설정 |

- `node_modules/`가 설치돼 있다. `npm run build`, 타입 검사, 테스트는 한 번도 돌리지 않았다.

## 6. 다음에 할 일 (위에서부터)

### 6.0 제출 뒤 남은 일 (2026-11-18 기준, 최신)

6.1 ~ 6.4는 끝났다(지난 기록). 지금 남은 것:

| 순서 | 할 일 | 메모 |
|---|---|---|
| 1 | **구글폼 제출** | eple이 직접. 저장소 주소 `https://github.com/eple-lab/task-hive` |
| 2 | 드라이런 테스트 방법 문서 + 예시 파일 | eple 요청, "나중에"(2026-11-18). `eval/samples/`에 둔다. 예시는 `eval/results/20261117-154705_dry-run.*`(커밋 안 함)을 쓰거나 새로 만든다 |
| 3 | 1단계 기본 모델 결정 | Qwen3.5 4B AWQ로 할 근거가 생겼다(PoC-01 9.1). `docs/02-decisions.md`에 적는 것은 eple 확인 뒤 |
| 4 | 등록 시간 비교 (PoC-01 판정 4번째 기준) | 기계 몫은 쟀다(배포 앱 20건, 한 건당 약 7.3초, `eval/results/20261118-171033_app-render-colab.md`). 남은 것: eple이 화면에서 몇 건을 직접 처리한 사람 시간. 그리고 앱 흐름 재현율 0.68(PoC-01 0.84)의 원인 가리기: 정해진 대화를 앱 `/api/extract`에 넣어 비교 |
| 5 | 날짜 계산 약점 | Qwen이 "목요일까지", "모레"를 하루 늦게 계산. 서버가 요일을 계산하는 방법 검토(PoC-01 9.1, 추측) |
| 6 | 작은 것 | 화면에 Open-Meteo 출처 표시(CC BY 4.0), `python-dotenv`를 requirements에 넣을지(`--env-file` 안내), 요청 크기 검사가 `Content-Length`만 봄, 지시문 예시 복사(llama3.2에서만 보임) |
| 7 | Colab 노트북 결과 올리기 셀 | eple이 Colab에서 바로 push하길 원함. 토큰은 보안 비밀, `pull --rebase` 먼저, 올리기 전 패턴 검사. 하면 12-fixes에 다음 F-번호로 적는다 |
| 8 | 2단계 | 구글 1시간 토큰 로그인(`honey-voice-log` 본받기), 7장 |

### 6.1 먼저 eple에게 확인받을 것 (끝, 지난 기록)

1. "작업 중"으로 커밋해 둔 `app/`, `frontend/`를 그대로 이어 쓸지. → **이어 쓴다**(eple, 2026-11-17). 순서는 검증 흐름(6.4) 먼저, 코드(6.3)는 그 사이사이에 하나씩
2. 코드 작업의 순서와 규모(아래 6.3). 한 번에 하나씩.
3. 구글 다시 연결 방식(6.2의 3번). → **정함**(아래)

### 6.2 eple이 남긴 숙제

1. **[확인함 2026-11-17]** 공식 문서에 무료를 런타임으로 막는 문구가 없다. 첫 배포 때 화면에서 최종 확인(`docs/09-verification.md` 2.12). 아래는 원래 숙제 내용. **Render 무료에서 Docker 서비스가 되는지 확인한다.** 배포 흐름이 중요하다. Render 공식 문서를 한 번 조회하면 된다. 결과를 `docs/09-verification.md`와 `docs/03-architecture.md` 8.3에 적는다. 안 되면 대안(Node 환경에서 빌드 후 Python 실행이 가능한지, 화면을 따로 정적 사이트로 올릴지)을 추천과 함께 묻는다.
2. **구글 로그인은 1시간 토큰 방식을 먼저 한다.** `honey-voice-log/app/main.py`, `store.py`의 방식을 본받는다. refresh 방식은 그다음.
3. **[정함 2026-11-17]** eple이 아래 의견대로 정했다: 남은 시간 표시 + "연장"을 눌렀을 때만 조용한 재로그인 + 팝업. D-27, `.env.example`에 반영함. 아래는 정하기 전 기록. **구글 다시 연결 방식은 아직 정하지 않았다.** eple의 생각: 조용한 재로그인도 가능하지 않은가, 오른쪽 위에 구글 토큰 남은 시간을 보여 주면 될 것 같다. Claude(Fable)의 의견은 아래와 같다. eple의 답을 받지 못했다.
   - 남은 시간 표시는 넣는다(추천).
   - 조용한 재로그인은 자동이 아니라 "연장" 버튼을 눌렀을 때만 한다. 구글이 화면이 필요하다고 답하면 그때 계정 선택 화면을 띄운다.
   - 연장은 작은 새 창(팝업)에서 한다. 페이지가 구글로 이동하면 메모리에만 있는 대화가 사라지기 때문이다.
   - 조용한 요청이 실제로 얼마나 잘 통하는지는 돌려 본 적이 없다.
   - 지금 문서(`docs/02-decisions.md` D-27, `.env.example`)에는 "조용한 재로그인을 쓰지 않는다"고 적혀 있다. eple이 정하면 고친다.

### 6.3 코드 작업 단위 (Sonnet에게 하나씩 맡긴다)

각 단위가 끝나면 Opus가 직접 돌려 확인하고 커밋한다.

| 순서 | 단위 | 범위 | 다 됐다의 기준 |
|---|---|---|---|
| 1 | 백엔드 살리기 | `app/` 읽고 문법·import 오류 고치기, `requirements*.txt` 만들기 | 서버가 켜지고 `GET /health`가 200 |
| 2 | 백엔드 테스트 | `tests/`: 기본 기능 먼저(손님 시작, 태스크 등록·중복·한도·완료·하위 태스크, 벌집 좌표 겹침 없음, 추출 검증, 내려받기 후 삭제), 그다음 보안 규칙(다른 세션 접근 불가, `X-TH` 없으면 거부, 주소 검사 거부 사례, XSS 문자열이 글자 그대로) | `pytest -q` 통과. 실패가 남으면 그대로 보고 |
| 3 | 화면 뼈대 | `src/main.tsx`, `src/app/`, `src/styles/`, `src/features/auth/` | `npm run build`와 타입 검사 통과, 가짜 응답(`VITE_USE_MOCK=1`)으로 시작 화면이 뜬다 |
| 4 | 상태창 | `src/features/panel/`: 연결, 후보, 등록 예정과 옮기기 버튼, 목소리 설정, 대화 설정, 도시 | 빌드 통과, 가짜 응답으로 후보 담기 → 옮기기 → 벌집 칸 생성 |
| 5 | 서버와 화면 연결 | 실제 서버로 대화 → 후보 → 등록. 계약과 어긋난 곳 고치기 | 로컬에서 끝까지 한 번 해 본다(가짜 업스트림 또는 실제 Colab) |
| 6 | 배포 파일 | `Dockerfile`(다단계), `render.yaml` | 6.2의 1번 확인 결과에 따라 |

지시문에 넣을 읽을거리: `docs/HANDOFF.md`, `docs/11-api-contract.md`, `docs/03-architecture.md`(폴더 구조, 데이터 이동), `docs/04-screens.md`(화면), `docs/05-security.md`(보안 규칙), `docs/10-frontend-architecture.md`(화면 구성), `.env.example`. 본받을 코드: `C:\project\workspace\git_project\honey-voice-log\app\`, `C:\project\workspace\git_project\llm-chatbot\server.py`, `C:\project\workspace\git_project\todo\docs\business-rules.md`.

### 6.4 검증과 제출 (2026-11-18, 1~8번 끝. 9번 제출은 eple)

과제 평가 문항 순서다.

1. **검증 자료 검토**: `eval/samples/dialogs.jsonl`은 Claude가 쓴 초안이다. eple이 말투와 정답을 검토한다. 특히 d03, d06, d09, d10, d19의 정답 해석(`eval/samples/README.md`). 정답은 모델을 돌리기 전에 확정한다.
2. **기준선 재기**: 같은 20건을 `todo` 앱에 손으로 넣으며 시간과 놓친 개수를 잰다(`eval/baseline_template.md`). eple이 직접 해야 한다.
3. **Colab 실행**: `colab/task_hive_server.ipynb`를 eple의 계정으로 실행한다. 한 번도 실행해 보지 못했다. vLLM 실행 명령, 설치, ngrok 고정 도메인 옵션은 추측으로 적혀 있다(`colab/README.md`의 표). 셀마다 확인하며 고친다.
4. **후보 모델 돌리기**: 아래 명령. 접속 키는 환경변수 `TASK_HIVE_EVAL_API_KEY`로 넘긴다.
   - `python eval/run_eval.py --base-url https://<주소>.ngrok-free.app --model cyankiwi/Qwen3.5-4B-AWQ-4bit --label qwen4b-colab --completions eval/samples/completions.jsonl`
   - `python eval/run_eval.py --base-url http://localhost:11434 --model llama3.2 --label llama32-ollama --completions eval/samples/completions.jsonl`
   - 채점 로직만 볼 때: `python eval/run_eval.py --dry-run`
5. **결과 정리**: `docs/poc/poc-01-llm-summary.md`의 7~10장을 채운다. 못 넘은 기준은 못 넘었다고 적고 실패 사례를 종류별로 묶는다.
6. **화면 시연**: 로컬에서 대화 → 후보 → 벌집 등록을 해 보고 캡처나 영상을 `README.md`에 넣는다(실제 개인정보가 찍히지 않게).
7. **README 갱신**: "지금 상태: 기획 단계"를 고치고 실제 실행 명령, 시연 자료, 검증 결과 요약을 넣는다.
8. **공개 전 점검**: `eple-security-check` 체크리스트. 노트북 출력, `.env`, 실제 대화가 올라가지 않았는지 본다.
9. **제출**: 구글폼에 저장소 주소.

화면이 내일까지 안 되면: 과제 평가 문항은 문제 정의서, 모델 선정 근거, 입력 → AI 처리 → 결과 출력, 개선 효과 검증, 한계 정리다. `colab/` 노트북과 `eval/run_eval.py`만으로 "대화 입력 → 할 일 추출 → 채점 결과 출력"이 이어지므로, 4번과 5번을 먼저 끝내면 제출 요건은 채울 수 있다. 화면은 추가 시도로 적는다.

## 7. 아직 안 만든 것 (MVP 다음)

| 항목 | 메모 |
|---|---|
| 구글 로그인 | 1시간 토큰 먼저, refresh 다음. `docs/checks/google-oauth-7day-expiry.md` |
| 캘린더 가져오기 | 소유 캘린더만, -7일 ~ +30일, 일별 체크박스 |
| 일기를 구글 시트·Docs에 저장, 최근 3일 요약 | 파일 구조는 아직 미정(열린 질문 Q-07) |
| Neon 저장소 구현, RLS, 제목 암호화 | 보호 수준은 아직 미정(Q-02) |
| Colab TTS, Whisper | PoC-02, PoC-03 |
| 성능 검토 화면 완성 | `docs/08-performance-review.md` |
| CI와 보안 파이프라인 | `docs/05-security.md` 9장 |

## 8. 확인하지 못한 것 (그대로 믿지 말 것)

- ~~`app/`, `frontend/`의 코드가 도는지~~ → 돈다(2026-11-17, 테스트와 브라우저로 확인)
- ~~Colab 노트북이 실제로 도는지~~ → 돈다(2026-11-18, T4, 0~8번 셀)
- ~~4B급 모델이 한국어 대화에서 할 일을 얼마나 뽑는지~~ → 재현율 0.84(PoC-01)
- ~~앱 화면에서 Colab(Qwen) 주소로 연결해 대화·추출이 되는지~~ → 된다(2026-11-18, 배포 앱)
- 배포 앱 흐름에서 재현율이 0.68로 PoC-01(0.84)보다 낮은 이유(한 번만 잼, 추측: 실제 모델 답이 섞임)
- ~~Docker 이미지가 실제로 빌드·실행되는지~~ → Render에서 빌드·실행됨(2026-11-18, `docs/13-deploy-render.md`)
- 대화로 완료 처리(`completions`) 경로를 실제 모델로 화면에서 시험하지 않음
- ~~Render 화면에서 Docker 런타임 + Free 플랜이 함께 골라지는지~~ → 됨(2026-11-18)
- 배포된 서버의 지역(Blueprint 기본값이 Oregon인지 공식 문서로 다시 확인 안 함)
- 구글 캘린더 권한의 민감 분류(콘솔에서만 확인 가능)
- 한국어 남·여 목소리를 주는 TTS 모델이 있는지
- Docs에 사진을 공개하지 않고 넣는 방법(`docs/poc/poc-05-docs-image.md`)
- 조용한 구글 재로그인이 실제로 통하는지

## 9. 저장소와 계정

- 원격: `https://github.com/eple-lab/task-hive` (공개), 브랜치 `main`
- 커밋 작성자는 저장소 로컬 설정에 있다(전역 설정과 다르다). 새로 clone했다면 다시 설정한다.
- 커밋 메시지 끝에 그 세션의 `Co-Authored-By` 줄을 붙인다.
- 올리기 전에 매번 확인한다: 문서 사이 링크, 결정 번호 참조, 메일·토큰·실제 주소가 없는지.
