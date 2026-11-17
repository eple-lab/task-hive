# ============================================================================
# Task Hive 운영 이미지 (결정 D-32: Render 무료 + Docker 한 파일 다단계 빌드)
#
# 왜 다단계인가
#   화면(React)을 만들려면 Node가 필요하지만, 서버를 돌릴 때는 Node가 필요 없다.
#   1단계에서 화면만 빌드하고, 2단계(최종 이미지)에는 빌드 결과(frontend/dist)만 옮긴다.
#   -> 최종 이미지에 Node, node_modules, 화면 소스가 들어가지 않아 작고 공격할 면이 적다.
#
# 이 PC에는 Docker가 없어 이 파일로 실제 빌드를 해 보지 못했다.
# 대신 같은 순서로 로컬에서 흉내 내 확인했다(npm ci -> build -> pip install -> uvicorn).
# ============================================================================


# -- 1단계: 화면 빌드 --------------------------------------------------------
# 태그를 24.22.3-slim 으로 정확히 고정한 이유
#   - frontend/package.json 의 engines 가 node>=24 이고, 로컬은 v24.22.1 에서 확인했다.
#     같은 24.22 계열의 최신 패치(24.22.3)를 써서 보안 패치를 받으면서도 메이저/마이너는 고정한다.
#   - "node:24" 같은 느슨한 태그는 빌드할 때마다 달라질 수 있어 피한다.
#   - slim: 빌드에 필요한 최소 구성. alpine(musl)은 일부 도구에서 문제가 생길 수 있어 쓰지 않는다.
FROM node:24.22.3-slim AS web

# 작업 폴더. 이후 상대 경로는 모두 /build 기준이다.
WORKDIR /build

# 의존성 파일만 먼저 복사한다.
#   소스를 고쳐도 이 층은 그대로라서 npm ci 결과가 캐시된다(빌드가 빨라진다).
#   .npmrc 는 save-exact 등 공급망 설정이라 npm ci 전에 있어야 같은 규칙으로 설치된다.
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./

# npm ci: package-lock.json 에 적힌 버전 그대로만 설치한다.
#   lock 과 package.json 이 다르면 실패한다(의도치 않은 업그레이드, 변조 방지).
RUN npm ci

# 이제 화면 소스를 복사한다. (node_modules, dist 는 .dockerignore 로 제외되어 있다)
COPY frontend/ ./

# npm run build = 타입 검사(tsc) + vite build. 결과는 /build/dist 에 생긴다.
RUN npm run build


# -- 2단계: 서버(최종 이미지) ------------------------------------------------
# 태그를 3.14.7-slim-bookworm 으로 정확히 고정한 이유
#   - requirements.txt 는 Python 3.14.7 에서 설치/실행해 본 조합이다. 같은 버전을 쓴다.
#   - slim: pip 로 설치하는 패키지(cryptography 등)는 미리 빌드된 휠이 있어 컴파일러가 필요 없다(확인 못 함: 추측).
#   - bookworm 을 명시해 Debian 버전이 바뀌어 동작이 달라지는 것을 막는다.
FROM python:3.14.7-slim-bookworm

# PYTHONDONTWRITEBYTECODE: .pyc 파일을 만들지 않는다(이미지가 작아진다).
# PYTHONUNBUFFERED       : 로그를 버퍼에 쌓지 않고 바로 내보낸다(Render 로그 화면에서 바로 보인다).
# PIP_NO_CACHE_DIR, PIP_DISABLE_PIP_VERSION_CHECK: pip 캐시와 버전 확인으로 이미지가 커지거나 느려지지 않게.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 작업 폴더. app/config.py 의 FRONTEND_DIST 기본값(frontend/dist)이 이 폴더 기준이다.
WORKDIR /app

# 의존성 파일만 먼저 복사해 설치한다(서버 코드만 고칠 때 이 층이 캐시된다).
# requirements.txt 는 정확한 버전(==)으로 고정되어 있다. requirements-dev.txt(테스트용)는 넣지 않는다.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 서버 코드만 복사한다. tests, docs, eval, colab, .env 는 복사하지 않는다(.dockerignore 로도 막혀 있다).
COPY app ./app

# 1단계에서 만든 화면만 가져온다. 서버가 /app/frontend/dist 를 내준다.
COPY --from=web /build/dist ./frontend/dist

# root 가 아닌 사용자로 실행한다(서버가 뚫려도 컨테이너 안에서 할 수 있는 일을 줄인다).
#   uid 를 고정(10001)해 두면 권한 문제를 추적하기 쉽다. 파일을 쓸 곳은 없다(저장소는 메모리).
RUN useradd --create-home --uid 10001 hive
USER hive

# 문서용 표시. 실제 포트는 Render 가 PORT 환경변수로 준다.
EXPOSE 8000

# 실행 명령
#   - sh -c 를 쓰는 이유: ${PORT:-8000} 를 셸이 풀어야 해서다. PORT 가 없으면(내 PC의 docker run) 8000 을 쓴다.
#   - exec: 셸을 uvicorn 으로 바꿔서 종료 신호(SIGTERM)가 uvicorn 에 바로 가게 한다(재배포 때 깔끔히 종료).
#   - --host 0.0.0.0: 컨테이너 밖(Render 프록시)에서 들어오려면 모든 주소를 받아야 한다.
#   - --proxy-headers / --forwarded-allow-ips 는 일부러 넣지 않는다.
#       이 서버의 요청 제한은 X-Forwarded-For 헤더의 "맨 뒤 값"을 직접 읽는다(app/security/rate_limit.py).
#       uvicorn 의 proxy-headers 는 request.client 를 바꾸는 기능인데, 코드가 헤더를 먼저 쓰므로
#       켜도 달라지는 것이 없다. 모든 주소를 신뢰하는 '*' 로 두면 오히려 설정이 이중이 되어 헷갈린다.
#       (쿠키의 Secure 는 APP_ENV=production 으로 정해지며 요청의 scheme 에 기대지 않는다 - app/security/session.py)
#   - --no-server-header: 응답의 "server: uvicorn" 헤더를 없앤다(서버 정보 노출 줄이기).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header"]

# HEALTHCHECK 는 일부러 넣지 않는다.
#   Render 는 Docker 의 HEALTHCHECK 를 쓰지 않고 render.yaml 의 healthCheckPath(/health)로 직접 확인한다.
#   slim 이미지에는 curl 이 없어서, 넣으려면 파이썬으로 요청 코드를 만들어야 하는데 쓰지 않는 기능이라 둘 이유가 없다.
