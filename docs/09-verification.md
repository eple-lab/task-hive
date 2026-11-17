# 09. 확인 기록

확인한 날: 2026-11-17 · 가격·한도·라이선스는 바뀐다. 구현 직전에 같은 링크로 다시 확인한다.

2026-11-17에 문서를 처음 쓸 때 "확인 못 한 것"으로 남긴 항목을 하나씩 확인한 결과다.

## 1. 요약

| # | 항목 | 결과 | 문서에 미친 영향 |
|---|---|---|---|
| 1 | Render 무료 한도 | 확인함 | 수치 반영. "많은 외부 요청 시 정지 가능" 위험 추가 |
| 2 | Neon 무료 한도 | 확인함 | 수치 반영. 복구 가능 기간 6시간 |
| 3 | 구글 `drive.file` 분류 | 확인함 (민감하지 않음) | 그대로 |
| 4 | 구글 캘린더 권한 분류 | **공식 문서로는 확인 못 함** | 구글 콘솔 화면에서 확인해야 함 |
| 5 | 테스트 상태 앱: 7일 만료, 100명 | 확인함 | `drive.file`만 받아도 7일 만료 대상. Q-01에 선택지 추가 |
| 6 | Docs 이미지 넣기 | 확인함 (공개 주소 필요) | P-11, Q-08의 "미검증" 해제 |
| 7 | ngrok 무료 도메인, 경고 페이지 | 확인함 | 허용 목록을 2개로 좁힘, 헤더 추가 |
| 8 | TTS 모델의 한국어 남·여 목소리, 라이선스 | **일부만 확인** | 남·여 지원 여부는 직접 실행해 봐야 앎 |
| 9 | Colab 무료 GPU에 세 모델이 올라가는지 | **확인 못 함** (실행해야 앎) | 대신 **Colab 이용 정책 위험**을 새로 발견 → Q-25 |
| 10 | mermaid 그림 | 확인함 (7개 모두 그려짐) | 없음 |
| 11 | 읽지 않았던 참고 문서 | 읽음 | 시트 수식 방어 방식 수정, PoC 검증 방식 보강 |
| 12 | Render 무료에서 Docker 서비스 | 확인함 (막는 문구 없음, 직접 허용 문구도 없음) | D-32 유지. 첫 배포 때 화면에서 최종 확인 |

자세한 주제별 문서는 [checks/](checks/README.md), 직접 실행해 확인할 것은 [poc/](poc/README.md)에 있다.

| 이 문서의 항목 | 이어지는 문서 |
|---|---|
| 2.4 캘린더 권한 분류 | [PoC-04](poc/poc-04-calendar-scope.md). 권한은 `calendar.events.owned.readonly`로 확정(D-14) |
| 2.5 테스트 상태 앱의 제약 | [checks/google-oauth-7day-expiry.md](checks/google-oauth-7day-expiry.md) |
| 2.6 Docs 이미지 | [checks/docs-image-insert.md](checks/docs-image-insert.md), [PoC-05](poc/poc-05-docs-image.md) |
| 2.8 TTS 모델 | [PoC-02](poc/poc-02-tts-korean-voices.md) |
| 2.9 Colab | [checks/colab-usage.md](checks/colab-usage.md), [PoC-01](poc/poc-01-llm-summary.md), [PoC-03](poc/poc-03-colab-gpu-memory.md). Colab은 과제용으로 확정(D-13) |

## 2. 항목별 내용

### 2.1 Render 무료 웹 서비스 (확인함)

| 내용 | 값 |
|---|---|
| 메모리, CPU | 512MB, 0.1 CPU |
| 잠드는 조건 | 들어오는 요청이 15분 동안 없으면 |
| 깨어나는 시간 | 약 1분 (그동안 브라우저에 대기 화면) |
| 월 사용 시간 | 워크스페이스당 750시간. 다 쓰면 다음 달까지 무료 서비스 정지 |
| 디스크 | 없음. 재배포·재시작·잠들 때 파일이 사라진다 |
| 인스턴스 | 1개만 |
| 재시작 | Render가 언제든 재시작할 수 있다 |
| 접속 | SSH·셸 없음 |
| 그 밖에 | 외부 API나 DB로 **비정상적으로 많은 요청**을 내면 서비스를 정지할 수 있다 |

영향:

- 서버 메모리에 둔 것(요청 횟수 제한 기록 등)은 잠들거나 재시작하면 사라진다. 세션은 쿠키에 두므로 영향이 없다.
- Task Hive 서버는 대화·음성을 Colab으로 계속 중계한다. "많은 외부 요청" 조건에 걸리지 않도록 사용자별 횟수 제한을 둔다.
- 정해진 시각 작업(cron)은 무료에 없다. 정리 작업을 "요청이 올 때" 하는 설계가 맞다.

출처: [Deploy for Free](https://render.com/docs/free), [Compute Plans](https://render.com/docs/compute-plans)

### 2.2 Neon 무료 (확인함)

| 내용 | 값 |
|---|---|
| 저장 용량 | 프로젝트당 1GB |
| 연산 | 프로젝트당 월 100 CU-시간, 최대 2 CU |
| 자동 일시정지 | 5분 동안 안 쓰면 멈춤. 무료에서는 끌 수 없다 |
| 프로젝트·브랜치 | 100개, 프로젝트당 브랜치 10개 |
| 복구 가능 기간 | **최대 6시간** |
| 전송량 | 프로젝트당 월 5GB |

영향:

- 처음 쓴 문서는 저장 용량을 0.5GB로 기억했다. 실제는 1GB다.
- 복구 가능 기간이 6시간뿐이다. 실수로 지운 것을 다음 날 되돌릴 수 없다. 로그인 사용자의 구글 시트 사본이 사실상 유일한 백업이다.
- 서버(약 1분)와 DB가 둘 다 잠들어 있으면 첫 접속이 더 느리다.
- 개발 브랜치를 따로 둘 수 있다(P-14 가능).

출처: [Neon plans](https://neon.com/docs/introduction/plans)

### 2.3 구글 `drive.file` (확인함)

- 분류: **민감하지 않음(non-sensitive)**.
- 할 수 있는 일: 앱이 만든 파일, 또는 사용자가 이 앱으로 열거나 파일 선택 창으로 고른 파일만 읽고 쓴다.
- 참고: `drive.readonly`는 제한(restricted) 권한이다. 쓰지 않는다.

출처: [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

### 2.4 구글 캘린더 권한 분류 (공식 문서로 확인 못 함)

- 구글 공식 문서의 캘린더 권한 목록에는 민감 여부 표시가 없다.
- 구글은 "캘린더 일정 읽기"를 민감한 권한의 예로 든다. 외부 자료(Nylas 안내서)는 `calendar.events.readonly`를 민감, 검증 필요, 보안 평가 불필요로 적는다. 공식 확인은 아니다.
- **확인 방법**: Google Cloud Console의 OAuth 동의 화면(Data Access)에 권한을 추가하면 분류 표시가 나온다. eple의 계정에서만 볼 수 있다.
- 새로 알게 된 더 좁은 권한: `calendar.events.owned.readonly`(내가 소유한 캘린더의 일정만 보기). 공유받은 캘린더를 읽지 않으므로 P-01의 권한을 이것으로 바꾸는 안을 Q-01에 추가했다.

출처: [Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth), [OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes), [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)

### 2.5 테스트 상태 앱의 제약 (확인함)

- 사용자 유형 "외부" + 게시 상태 "테스트"인 프로젝트는 refresh token이 **7일 뒤 만료**된다.
- 예외는 이름·이메일·프로필(`openid`, `userinfo.email`, `userinfo.profile`)만 요청할 때뿐이다. **`drive.file`은 민감하지 않은 권한이지만 예외가 아니다.** 따라서 Task Hive는 캘린더를 쓰지 않아도 7일 만료 대상이다.
- 테스트 사용자는 최대 100명. 동의 화면에 등록한 계정만 쓸 수 있다.
- 한 구글 계정이 한 클라이언트에서 받을 수 있는 refresh token은 100개. 넘으면 가장 오래된 것이 무효가 된다.

영향: 데모 기간에는 매주 다시 로그인하게 된다. `honey-voice-log`는 refresh token을 아예 받지 않고 1시간짜리 access token만 쓰는 방식으로 이 문제를 피했다. Q-01에 이 선택지를 추가했다.

출처: [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2), [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)

### 2.6 Docs에 이미지 넣기 (확인함)

- Docs API의 이미지 삽입은 **공개적으로 접근할 수 있는 주소**를 요구한다. 주소 길이 2kB 이하.
- 이미지는 50MB 미만, 25메가픽셀 이하, PNG·JPEG·GIF.

영향: 사용자의 사진을 Docs 일기에 넣으려면 잠깐이라도 공개 주소에 올려야 한다. P-11(1단계 Docs 일기는 글만)의 근거가 확인됐다.

출처: [Docs API Requests](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request)

### 2.7 ngrok 무료 (확인함)

- 무료 계정은 고정 도메인 하나를 받는다. `ngrok-free.app` 또는 `ngrok-free.dev` 중 하나다. 무료에서는 다른 도메인을 쓸 수 없다.
- 무료 주소는 브라우저로 열면 경고 페이지가 먼저 뜬다. 프로그램으로 호출할 때는 영향이 없다고 되어 있고, 요청에 `ngrok-skip-browser-warning` 헤더(값은 아무거나)를 넣으면 건너뛴다.
- 두 도메인은 HTTPS만 된다.

영향:

- 주소 허용 목록을 `*.ngrok-free.app`, `*.ngrok-free.dev` 두 개로 시작한다. 유료 도메인(`*.ngrok.app` 등)은 필요할 때 설정으로 추가한다.
- 서버가 업스트림을 부를 때 `ngrok-skip-browser-warning` 헤더를 넣는다.
- 주소가 고정이므로 Colab을 다시 켜도 같은 주소다. 사용자가 매번 다시 넣지 않아도 되게 할지는 [07 Q-26](07-open-questions.md).

출처: [Free Plan Limits](https://ngrok.com/docs/pricing-limits/free-plan-limits), [Static dev domains for all ngrok users](https://ngrok.com/blog/free-static-domains-ngrok-users)

### 2.8 TTS 모델 (일부만 확인)

| 모델 | 한국어 | 남·여 목소리 | 라이선스 | 확인 상태 |
|---|---|---|---|---|
| MeloTTS-Korean | 지원 | 예제에 한국어 화자 ID가 하나(`KR`)만 나온다. 남·여 구분은 모델 페이지에 없다 | MIT (상업 사용 가능) | 화자 수는 실행해 확인 필요 |
| XTTS-v2 | 지원 | 6초 참조 음성으로 목소리를 복제한다. 내장 목소리 목록은 페이지에 없다 | Coqui Public Model License. 상업 사용 여부는 페이지에 없고 약관 페이지는 열리지 않았다(404) | 라이선스 미확인 |
| Kokoro-82M | **미지원** (9개 언어에 한국어 없음) | - | Apache 2.0 | 후보에서 제외 |
| Supertonic 2 | 지원 (5개 언어 중 하나) | 예제에 `M1` 목소리가 나온다. 남·여 목소리 수는 페이지에 없다 | 모델은 OpenRAIL-M, 예제 코드는 MIT | 목소리 수와 사용 조건은 LICENSE 파일 확인 필요 |
| CosyVoice 등 | 모음 사이트에만 정보가 있다 | - | - | 공식 저장소 미확인 |

정리:

- **남·여 한국어 목소리를 둘 다 제공한다고 공식 페이지에서 확인된 모델은 없다.** 통과 조건이므로 실험 첫 단계에서 직접 실행해 확인한다.
- 목소리 복제 방식(XTTS-v2)은 참조 음성만 있으면 남·여를 만들 수 있지만, 라이선스와 참조 음성의 출처(누구의 목소리인가)를 먼저 정해야 한다.
- 남·여 목소리가 하나뿐인 모델이라도 음높이를 바꿔 보완할 수 있다. 품질은 들어 봐야 안다.
- 수업 요약의 원칙대로 라이선스는 **설치한 패키지의 배포 정보**로 다시 확인한다.

출처: [MeloTTS-Korean](https://huggingface.co/myshell-ai/MeloTTS-Korean), [XTTS-v2](https://huggingface.co/coqui/XTTS-v2), [Kokoro VOICES](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md), [Supertonic 2](https://huggingface.co/Supertone/supertonic-2)

### 2.9 Colab 무료 (메모리는 확인 못 함, 이용 정책 위험 발견)

확인한 것 (Colab FAQ):

- 무료 GPU 종류는 "시간에 따라 달라진다"고만 적혀 있다. 자원은 보장되지 않고 한도는 공개하지 않는다.
- 노트북은 보통 최대 12시간 실행된다. 쓰지 않으면 시간 초과로 끊긴다.
- **금지·제한 행위**에 다음이 있다.
  - Colab의 대화형 연산과 관련 없는 파일 호스팅, 미디어 제공, **웹 서비스 제공**
  - 원격 프록시 연결
  - (무료에서 종료될 수 있음) SSH·원격 데스크톱 같은 원격 제어, **노트북 화면을 거치지 않고 주로 웹 화면으로 쓰는 것**

확인 못 한 것:

- 대화 모델 + TTS + Whisper가 무료 GPU 메모리에 함께 올라가는지. 실행해서 재야 안다. 1단계에서 모델을 올린 직후 GPU 메모리 사용량을 기록한다.

영향 (중요):

- Colab에 LLM을 띄우고 ngrok으로 Task Hive에 연결하는 구조는 위 제한 문구에 **해당할 수 있다.** 세션이 경고 없이 끊길 수 있다. 수업에서 `llm-chatbot`을 같은 방식으로 만들었으므로 과제·시연 용도로는 쓰되, 계속 운영하는 서비스의 기반으로 삼기는 어렵다.
- 대비: Colab이 끊겨도 화면이 동작하게 한다(이미 설계됨). 로컬 PC의 Ollama 같은 다른 실행 위치를 선택지로 둔다. → [07 Q-25](07-open-questions.md)

출처: [Colab FAQ](https://research.google.com/colaboratory/faq.html)

### 2.10 mermaid 그림 (확인함)

- 문서의 mermaid 블록 7개(아키텍처 4, 화면 2, 보안 1)를 뽑아 mermaid 10.9.1로 실제로 그렸다. 7개 모두 오류 없이 그려졌다.
- GitHub가 쓰는 mermaid 버전은 다를 수 있다. 올린 뒤 GitHub 화면에서 한 번 더 본다.

### 2.11 읽지 않았던 참고 문서 (읽음)

읽은 것: `honey-voice-log/docs/SECURITY.md`, `honey-voice-log/docs/ARCHITECTURE.md`, `예습-요약.md` 전체. 수업 노트북은 제목 구조가 요약과 같은 것을 확인했고 본문은 요약으로 대신했다.

`honey-voice-log`에서 가져와 문서에 반영한 것:

| 내용 | 반영 |
|---|---|
| 시트 수식 주입은 `'`를 붙이는 대신 `valueInputOption=RAW`로 막는다 | [03](03-architecture.md) 6.5, [05](05-security.md) 7장 수정 |
| CSRF는 `SameSite=Lax` + 사용자 정의 헤더 + `Origin` 확인 | [05](05-security.md) 4.3 수정 |
| 요청 횟수 제한의 IP는 `X-Forwarded-For`의 맨 뒤 값을 쓴다 | [05](05-security.md) 7장 추가 |
| `/docs`, `/openapi.json`을 끈다 | [05](05-security.md) 7장 추가 |
| 외부 글은 `<external_content>`로 감싸고 가짜 닫는 태그를 지운다 | [05](05-security.md) 6장 추가 |
| refresh token을 받지 않고 1시간짜리 토큰만 쓴다 | [07 Q-01](07-open-questions.md)에 선택지로 추가 |
| 세션 쿠키가 서명만 되면 쿠키에 민감한 값을 넣으면 안 된다 | Task Hive는 쿠키에 업스트림 주소·접속 키를 넣으므로 **암호화가 필수**임을 [05](05-security.md) 4.2에 명시 |

수업 요약에서 가져와 반영한 것:

| 원칙 | 반영 |
|---|---|
| 지금 방식(기준선)을 후보에 넣는다 | [08](08-performance-review.md) 5.2, [07 Q-13](07-open-questions.md) |
| 크기가 아니라 성격(실행 위치, 목적, 결과 형태)이 다른 후보를 고른다 | [07 Q-13](07-open-questions.md) |
| 실행 위치와 라이선스는 감점이 아니라 통과/탈락 조건으로 먼저 거른다 | [07 Q-13](07-open-questions.md) |
| 정답은 모델을 돌리기 전에 적는다. 자료 10~20건 중 3~4건은 어려운 것 | [08](08-performance-review.md) 5장 |
| 숫자의 근거는 지금 사람이 하는 수준. 현행 수준부터 잰다 | [08](08-performance-review.md) 5.2 |
| 입력과 전사 유형은 오류를 알아채기 어렵다. 오류 자리를 원본에서 찾을 수 있어야 한다 | [08](08-performance-review.md) 5.1 (후보마다 근거 문장 표시) |
| 확신이 낮은 건은 사람에게 넘긴다 | [08](08-performance-review.md) 5.1 |
| 확인한 날짜를 링크와 함께 적는다 | 이 문서 |

### 2.12 Render 무료에서 Docker 서비스 (확인함, 2026-11-17)

| 확인한 것 | 공식 문서 내용(요약) |
|---|---|
| 무료가 되는 서비스 종류 | Static Site, Web Service, Postgres, Key Value. 그 밖의 종류(백그라운드 워커, 크론 등)는 무료 인스턴스가 없다 |
| Docker는 어떤 위치인가 | 웹 서비스를 만드는 방법 중 하나다. 언어 런타임 대신 `Dockerfile`로 빌드하거나 만들어 둔 이미지를 받을 수 있다 |
| 무료 웹 서비스가 못 하는 것 | 인스턴스 2개 이상, 디스크, 엣지 캐시, 일회성 작업, 셸 접속, 사설망으로 들어오는 요청, 예약 포트, SMTP 포트. **Docker는 이 목록에 없다** |
| 다단계 빌드 | Render가 다단계 빌드를 지원한다고 적혀 있다 |
| 무료 사양 | 0.1 CPU / 512MB (Blueprint 설명의 `plan: free`) |

판단: 무료 인스턴스를 런타임으로 제한하는 문구가 없으므로 Docker 웹 서비스도 무료로 만들 수 있다고 본다. 다만 "Docker도 무료"라고 직접 적은 문장은 찾지 못했다. **첫 배포 때 Render 화면에서 Docker 런타임과 Free 플랜을 함께 고를 수 있는지 확인한다.** 안 되면 대안은 (1) 화면 빌드 결과를 미리 만들어 Python 환경으로 올리기, (2) 화면은 Static Site, 서버는 Python 웹 서비스로 나누기다(이때는 쿠키·CORS 설정이 달라진다).

조심할 것: 0.1 CPU에서 Docker 다단계 빌드(npm 설치 + 화면 빌드)가 느릴 수 있다. 빌드 시간은 워크스페이스의 빌드 분에 포함된다.

출처(2026-11-17 조회): [Deploy for Free](https://render.com/docs/free), [Docker on Render](https://render.com/docs/docker), [Blueprint YAML Reference](https://render.com/docs/blueprint-spec), 문서 전체 묶음 [llms-full.txt](https://render.com/llms-full.txt)(생성일 2026-11-17)

## 3. 아직 확인하지 못한 것

| 내용 | 왜 못 했나 | 확인 방법 |
|---|---|---|
| 캘린더 권한의 민감 분류 | 공식 문서에 표시가 없다 | eple의 Google Cloud Console 동의 화면에서 확인 |
| TTS 모델별 한국어 남·여 목소리 수 | 모델 페이지에 없다 | Colab에서 직접 실행 |
| XTTS-v2, Supertonic 2의 사용 조건 | 약관 페이지가 열리지 않거나 본문을 읽지 못했다 | 설치한 패키지의 LICENSE 파일 |
| Colab 무료 GPU에 세 모델이 함께 올라가는지 | 실행해야 안다 | 1단계에서 GPU 메모리 측정 |
| Render·Neon 서버의 리전 선택 범위 | 확인하지 않았다 | 서비스 만들 때 화면에서 확인 |
| Render 화면에서 Docker 런타임 + Free 플랜이 함께 골라지는지 | 문서에 직접 적힌 문장이 없다 | 첫 배포 때 화면에서 확인 |
| GitHub에서 mermaid가 그려지는지 | 올리기 전이다 | 올린 뒤 화면 확인 |
