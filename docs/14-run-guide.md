# 14. 실행 안내: 배포 앱으로 쓰기, 로컬에서 띄우기

작성: 2026-11-18 · README의 "실행 방법"을 옮겨 오고, 배포 앱 쓰는 법을 더했다. 배포를 **하는** 방법은 [13 Render 배포](13-deploy-render.md).

## 1. 두 가지 길

| 길 | 언제 | 필요한 것 | LLM |
|---|---|---|---|
| **A. 배포 앱으로 쓰기** | 설치 없이 바로 써 볼 때 | 브라우저 | 내 Colab(권장) 또는 내 PC의 Ollama를 ngrok으로 연 주소 |
| **B. 로컬에서 띄우기** | 코드를 고치거나 테스트·측정할 때 | Python 3.14, Node 24 | `http://localhost:11434` Ollama 또는 내 Colab |

어느 길이든 Task Hive 서버에는 모델이 없다. 대화는 사용자가 연결한 LLM이 답한다. 첫 인사와 목소리는 LLM 없이 나온다(서버가 만든 문장 + 브라우저 내장 음성).

## 2. A. 배포 앱으로 쓰기

데모 주소: **https://task-hive-3cmq.onrender.com**

- Render 무료라 15분 동안 안 쓰면 잠든다. 첫 접속이 수십 초 걸릴 수 있다.
- 데이터는 서버 메모리에만 있다. 서버가 잠들거나 재배포되면 사라진다. 남길 것은 "MD로 내려받기"로 받는다.

### 2.1 시작

1. 주소를 열고 "로그인 없이 시작" → 부를 이름을 적는다. ("구글로 시작"은 2단계라 막혀 있다: [이슈 #3](https://github.com/eple-lab/task-hive/issues/3))
2. 오른쪽 상태창 "연결"에 LLM 주소와 접속 키를 넣고 "연결 확인". "대화 모델 연결됨"이 나오면 된다.

### 2.2 연결할 LLM

배포 앱은 `https://….ngrok-free.app` 또는 `https://….ngrok-free.dev` 주소만 받는다. `localhost`는 넣을 수 없다(모델을 부르는 쪽이 Render 서버라서, [13](13-deploy-render.md) 5장).

| LLM | 주소 | 접속 키 | 비고 |
|---|---|---|---|
| **내 Colab (권장)** | 노트북 6번 셀이 보여 주는 ngrok 주소 | 노트북이 보여 준 키 | Qwen3.5 4B. PoC-01 판정 기준을 넘은 모델. 사용법 [colab/README.md](../colab/README.md) |
| 내 PC의 Ollama + ngrok | PC에서 `ngrok http 11434`로 연 주소 | **아무 글자** (칸이 비면 화면이 막는다. Ollama는 키를 보지 않는다) | Colab이 안 될 때. 2026-11-18 이 방법으로 대화·추출까지 확인([13](13-deploy-render.md) 6장) |

Ollama + ngrok을 쓸 때:
- Ollama에는 접속 키 검사가 없다. **주소를 아는 누구나 내 PC의 모델을 쓸 수 있다.** 주소를 채팅·문서에 붙이지 말고, 다 쓰면 ngrok을 끈다.
- Ollama가 ngrok으로 온 요청을 403으로 거절하면 `ngrok http 11434 --host-header="localhost:11434"`로 연다(추측, 이 저장소에서 확인하지 않음).
- `llama3.2` 3B는 한국어가 약하다. 답에 영어·스페인어 단어가 섞이고, 할 일을 틀리게 뽑는 일이 잦다([이슈 #2](https://github.com/eple-lab/task-hive/issues/2), [PoC-01](poc/poc-01-llm-summary.md)). CPU에서는 답 하나에 수십 초, 할 일 추출에 1분 넘게 걸린다.

### 2.3 Colab을 쓸 때 알아 둘 것

- Colab은 **과제용 실험 환경**으로 쓴다. LLM이 한국어 대화를 요약하고 할 일을 뽑을 수 있는지 확인하는 것이 목적이다([checks/colab-usage.md](checks/colab-usage.md)).
- Colab 무료는 GPU를 보장하지 않고 세션이 끊길 수 있다. 셀이 "대기열에 추가됨"에서 멈추면 GPU를 아직 받지 못한 것이다. 계속 켜 두는 서비스의 기반으로 쓰지 않는다.
- 본인이 띄운 Colab 주소만 넣는다. 남의 주소를 넣으면 대화가 그 사람에게 간다.
- 다 쓰면 9번 셀로 끄고 `런타임 연결 해제 및 삭제`.

## 3. B. 로컬에서 띄우기

Windows 기준이다(Git Bash). 필요한 것: Python 3.14, Node 24.

### 3.1 설치

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
cd frontend && npm ci && npm run build && cd ..
```

### 3.2 서버 켜기

```bash
APP_ENV=development UPSTREAM_ALLOW_LOCALHOST=true .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```

- `http://localhost:8000`을 연다. 서버가 빌드한 화면(`frontend/dist`)도 함께 내준다.
- 개발 환경에서는 비밀값이 없으면 실행할 때마다 임시값을 만든다. `.env` 파일은 없어도 된다. 다른 설정은 위처럼 명령 앞에 환경변수로 붙인다(이름과 뜻은 `.env.example`). uvicorn의 `--env-file`은 `python-dotenv`가 필요한데 `requirements.txt`에 없어서 지금은 쓰지 않는다.
- `UPSTREAM_ALLOW_LOCALHOST=true`는 개발에서만 `http://localhost` LLM 주소를 받게 하는 설정이다. 운영(`APP_ENV=production`)에서 켜면 서버가 켜지지 않는다.
- 화면을 고치면서 볼 때: `cd frontend && npm run dev` (Vite가 `/api`를 8000으로 넘긴다). 서버 없이 화면만: `npm run dev:mock`.

### 3.3 LLM 연결

이름을 적고 "로그인 없이 시작" → 오른쪽 상태창 "연결"에 주소와 접속 키를 넣는다.

| LLM | 주소 | 접속 키 |
|---|---|---|
| 로컬 Ollama | `http://localhost:11434` (`ollama pull llama3.2` 필요) | 아무 글자 |
| 내 Colab | 노트북 6번 셀이 보여 주는 ngrok 주소 | 노트북이 보여 준 키 |

## 4. 테스트

```bash
.venv/Scripts/python.exe -m pytest -q
```

```bash
cd frontend && npm run typecheck && npm test
```

## 5. 모델 측정 (PoC-01)

```bash
.venv/Scripts/python.exe eval/run_eval.py --base-url http://localhost:11434 --model llama3.2 --label llama32-ollama --timeout 300 --completions eval/samples/completions.jsonl
```

- Colab이면 `--base-url`에 ngrok 주소, 접속 키는 환경변수 `TASK_HIVE_EVAL_API_KEY`로 넘긴다. Colab 노트북 8번 셀이 같은 측정을 노트북 안에서 한다.
- 모델 없이 채점 로직만 볼 때: `--dry-run`.
- 결과는 `eval/results/`에 `.md`와 `.json`으로 남는다. 자료 설명: [eval/samples/README.md](../eval/samples/README.md)

## 6. 막혔을 때

| 증상 | 할 일 |
|---|---|
| "연결 확인"에 "접속 키를 입력해 주세요." | 키 칸이 비었다. Ollama면 아무 글자 |
| 배포 앱에서 `localhost` 주소가 거절된다 | 배포 앱은 ngrok 주소만 받는다(2.2) |
| 대화에 "Colab에 연결되지 않았어요" | 연결을 하지 않았거나 Colab·ngrok이 꺼졌다. 다시 연결한다 |
| "응답이 너무 늦어요" | 서버는 첫 응답을 120초까지 기다린다. CPU Ollama는 짧게 말하거나 Colab을 쓴다 |
| 화면이 창 높이를 채우지 않고 페이지 스크롤이 생긴다 | 알려진 문제 [이슈 #1](https://github.com/eple-lab/task-hive/issues/1) |
| 배포 쪽 문제(403, 비밀값, 빌드) | [13](13-deploy-render.md) 5장 |
| Colab 노트북 오류 | [colab/README.md](../colab/README.md) "끊겼을 때" |
