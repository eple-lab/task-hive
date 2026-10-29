# 운영 가이드

설치, 실행, 설정, 백업과 복구, 자주 막히는 문제.

## 설치와 실행

필요한 것: **Node.js 24 이상** (`node --version`으로 확인). SQLite는 Node에 내장되어 따로 설치하지 않는다.

```bash
npm install     # 처음 한 번 (Express 설치)
npm start       # 서버 켜기 → http://localhost:3000
```

| 명령 | 하는 일 |
|---|---|
| `npm start` | 서버 실행 |
| `npm run dev` | 코드를 고치면 서버가 자동으로 다시 켜진다 (`node --watch`) |
| `Ctrl + C` | 서버 끄기 (실행 중인 터미널에서) |

## 설정 (.env)

`.env.example`을 복사해 `.env`를 만들고 값을 바꾼다. 없으면 기본값을 쓴다.

| 항목 | 기본값 | 뜻 |
|---|---|---|
| `PORT` | `3000` | 서버 주소의 포트 번호 |
| `DB_PATH` | `./data/todo.db` | DB 파일 위치 (프로젝트 폴더 기준) |

- `.env`를 고치면 서버를 껐다 켜야 반영된다.
- 경로는 내 컴퓨터의 절대 경로가 아니라 **프로젝트 폴더 기준**이라, 다른 사람이 받아도 그대로 동작한다.

## 자동 삭제

- 완료한 지 90일이 지난 할 일은 **서버가 켜질 때**와 **켜져 있는 동안 6시간마다** 지워진다(태스크도 함께).
- 지워지면 서버 터미널에 `완료 후 90일 지난 할 일 N개를 삭제했습니다.`가 찍힌다.
- 서버를 오래 꺼 두었다면 다음에 켤 때 한꺼번에 지워진다.
- 화면의 완료한 할 일 오른쪽에 삭제 예정일이 보인다.

## 백업과 복구

SQLite는 DB 전체가 파일 하나라서 **파일 복사가 곧 백업**이다.

### 백업
1. 서버를 끈다(`Ctrl + C`). 켜진 채로 복사하면 저장 중이던 내용이 빠질 수 있다.
2. `data/todo.db`를 다른 곳에 복사한다. 파일 이름에 날짜를 붙이면 구분하기 좋다.
   ```powershell
   Copy-Item data\todo.db "D:\backup\todo-$(Get-Date -Format yyyyMMdd).db"
   ```
3. `todo.db-wal`, `todo.db-shm` 파일이 남아 있으면 함께 복사한다(서버를 정상 종료하면 보통 없다).

### 3-2-1 규칙에 맞추기
| | 예 |
|---|---|
| 3벌 | 원본 `data/todo.db` + 사본 2개 |
| 2종류 매체 | 노트북 디스크 + 외장하드 또는 USB |
| 1벌은 다른 곳 | 구글 드라이브 같은 클라우드 |

### 복구
1. 서버를 끈다.
2. 지금 `data/todo.db`를 혹시 몰라 다른 이름으로 바꿔 둔다.
3. 백업 파일을 `data/todo.db`로 복사한다.
4. 서버를 켜고 화면에서 할 일이 돌아왔는지 **눈으로 확인**한다. 열어 본 적 없는 백업은 백업이 아니다.

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
|---|---|---|
| `.env not found. Continuing without it.` | `.env`가 없다는 **안내**일 뿐 에러가 아니다 | 그대로 써도 된다. 없애려면 `.env.example`을 `.env`로 복사 |
| `ExperimentalWarning: SQLite is an experimental feature` | Node 내장 SQLite가 아직 실험 기능이라는 안내 | 무시해도 된다 |
| `EADDRINUSE` / `address already in use :::3000` | 이전 서버가 아직 켜져 있다 | 그 터미널에서 `Ctrl + C`, 또는 `.env`에서 `PORT` 변경 |
| `bad option: --env-file-if-exists` | Node 버전이 낮다 | Node 24 이상 설치 |
| `Cannot find package 'express'` | `npm install`을 안 했다 | `npm install` |
| 화면에 "목록을 불러오지 못했습니다" | 서버가 꺼져 있거나 다른 주소로 열었다 | `npm start` 후 http://localhost:3000 으로 연다 |
| 코드를 고쳤는데 반영이 안 된다 | 서버는 시작할 때 코드를 읽는다 | 서버 재시작, 또는 `npm run dev` 사용 |
| 화면만 바뀌고 서버 변경은 안 된다 | 브라우저 캐시 | `Ctrl + Shift + R` 강력 새로고침 |
| 터미널 `curl`로 보낸 한글이 깨진다 | Windows 터미널 인코딩 | 브라우저 콘솔이나 Node 스크립트로 테스트 ([api.md](api.md#직접-호출해-보기)) |
| PowerShell에서 `git commit -m`에 큰따옴표가 든 메시지가 깨진다 | PowerShell 5.1의 인자 전달 방식 | 메시지를 파일에 쓰고 `git commit -F 파일` |
