"""환경변수 읽기와 검사.

이 파일이 하는 일
    - 모든 설정을 환경변수에서만 읽어 Settings 객체 하나로 만든다. (비밀값은 코드 밖에: docs/05 8장)
    - 운영(APP_ENV=production)에서 비밀값이 빠지면 서버가 켜지지 않게 한다.
    - 개발에서는 비밀값이 없으면 실행할 때마다 임시값을 만든다(honey-voice-log 방식).

왜 pydantic-settings를 쓰지 않았나
    - 의존성을 줄이려고 표준 라이브러리(dataclass + os.environ)만 썼다.

관련 결정
    - D-24 HIVE_MAX_RINGS: 벌집 한도는 "고리 수"로 받는다. 칸 수 = 1 + 3n(n+1). 3단=37칸, 4단=61칸.
    - D-07 GUEST_TTL_HOURS: 손님 데이터는 마지막 활동 24시간 뒤 삭제.
    - D-23 DONE_TASK_TTL_DAYS: 완료한 태스크는 90일 뒤 삭제.
    - D-19 GOOGLE_TOKEN_MODE: access_only(1시간 토큰만) | refresh. 구글 로그인은 2단계라 값 검사만 한다.
    - D-04 UPSTREAM_*: 사용자가 넣는 ngrok 주소의 허용 범위.
    - D-26 DATABASE_URL: 비면 메모리 저장소.

아직 안 된 것
    - .env 파일을 직접 읽지 않는다. 로컬에서는 `uvicorn --env-file .env`로 넘긴다.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from dataclasses import dataclass, field
from urllib.parse import urlparse


class ConfigError(RuntimeError):
    """설정이 잘못되어 서버를 켤 수 없을 때."""


def hive_max_cells(rings: int) -> int:
    """고리 수 → 벌집 칸 수. 중심 1칸 + n번째 고리 6n칸 = 1 + 3n(n+1)."""
    return 1 + 3 * rings * (rings + 1)


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _int(env: dict, key: str, default: int, lo: int, hi: int, alias: str | None = None) -> int:
    """정수 환경변수. 범위를 벗어나면 서버를 켜지 않는다(조용히 고치지 않는다).

    alias: .env.example에 적힌 이름이 코드의 이름과 다를 때 그 이름도 읽는다(key가 우선).
    """
    raw = (env.get(key) or (env.get(alias) if alias else "") or "").strip()
    if raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{key}는 정수여야 합니다: {raw!r}") from exc
    if not lo <= value <= hi:
        raise ConfigError(f"{key}는 {lo}~{hi} 사이여야 합니다: {value}")
    return value


@dataclass(frozen=True)
class Settings:
    app_env: str = "development"
    public_base_url: str = "http://localhost:8000"

    # 비밀값
    session_secret: str = ""
    data_enc_key: str = ""
    sub_hash_key: str = ""
    database_url: str = ""

    # 구글 (2단계. 지금은 값 검사만)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_token_mode: str = "access_only"
    admin_sub_hashes: tuple[str, ...] = ()

    # 벌집·보관 기간
    hive_max_rings: int = 3
    guest_ttl_hours: int = 24
    done_task_ttl_days: int = 90
    session_hours: int = 8

    # 업스트림(사용자의 Colab) 주소 검사
    upstream_allowed_host_suffixes: tuple[str, ...] = (".ngrok-free.app", ".ngrok-free.dev")
    upstream_allow_localhost: bool = False
    upstream_connect_timeout: int = 10
    upstream_read_timeout: int = 120

    # 입력·요청 제한
    max_messages: int = 40
    max_message_chars: int = 2000  # .env.example의 MAX_MESSAGE_CHARS 기본값과 같게
    max_body_bytes: int = 200_000
    rate_limit_chat_per_min: int = 20
    rate_limit_extract_per_min: int = 30
    rate_limit_general_per_min: int = 240

    # 그 밖에
    weather_default_city: str = "서울"
    dev_extra_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    frontend_dist: str = "frontend/dist"

    # 개발에서 임시로 만든 비밀값인지(로그 안내용)
    ephemeral_secrets: tuple[str, ...] = field(default_factory=tuple)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def hive_max_cells(self) -> int:
        return hive_max_cells(self.hive_max_rings)

    @property
    def public_origin(self) -> str:
        p = urlparse(self.public_base_url)
        return f"{p.scheme}://{p.netloc}"

    @property
    def session_fernet_key(self) -> bytes:
        """SESSION_SECRET(아무 문자열)에서 Fernet 키(32바이트 base64)를 만든다."""
        return base64.urlsafe_b64encode(hashlib.sha256(self.session_secret.encode()).digest())


def load_settings(env: dict | None = None) -> Settings:
    """환경변수(또는 테스트가 준 dict)에서 Settings를 만든다. 잘못되면 ConfigError."""
    env = dict(os.environ if env is None else env)
    app_env = (env.get("APP_ENV") or "development").strip().lower()
    if app_env not in ("development", "production"):
        raise ConfigError("APP_ENV는 development 또는 production이어야 합니다.")
    production = app_env == "production"

    public_base_url = (env.get("PUBLIC_BASE_URL") or "http://localhost:8000").strip().rstrip("/")
    if production and not public_base_url.startswith("https://"):
        raise ConfigError("production에서는 PUBLIC_BASE_URL이 https://로 시작해야 합니다.")

    # 비밀값: 운영에서는 필수, 개발에서는 없으면 임시값
    ephemeral: list[str] = []
    secrets_out: dict[str, str] = {}
    for key in ("SESSION_SECRET", "DATA_ENC_KEY", "SUB_HASH_KEY"):
        value = (env.get(key) or "").strip()
        if not value:
            if production:
                raise ConfigError(f"production에서는 {key}가 필요합니다.")
            value = secrets.token_urlsafe(48)
            ephemeral.append(key)
        elif len(value) < 32:
            raise ConfigError(f"{key}는 32자 이상이어야 합니다.")
        secrets_out[key] = value

    token_mode = (env.get("GOOGLE_TOKEN_MODE") or "access_only").strip().lower()
    if token_mode not in ("access_only", "refresh"):
        raise ConfigError("GOOGLE_TOKEN_MODE는 access_only 또는 refresh여야 합니다.")

    allow_localhost = _bool(env.get("UPSTREAM_ALLOW_LOCALHOST"))
    if allow_localhost and production:
        # 운영 서버가 자기 내부 주소를 찌르게 되므로 금지 (SSRF 방어, docs/05 5장)
        raise ConfigError("production에서는 UPSTREAM_ALLOW_LOCALHOST를 켤 수 없습니다.")

    suffix_raw = env.get("UPSTREAM_ALLOWED_HOST_SUFFIXES") or ".ngrok-free.app,.ngrok-free.dev"
    suffixes = tuple(s.strip().lower() for s in suffix_raw.split(",") if s.strip())
    for s in suffixes:
        if not s.startswith(".") or s.count(".") < 2:
            # ".app"처럼 너무 넓은 값은 허용 목록의 의미가 없어진다
            raise ConfigError(f"UPSTREAM_ALLOWED_HOST_SUFFIXES 값이 너무 넓습니다: {s!r}")

    return Settings(
        app_env=app_env,
        public_base_url=public_base_url,
        session_secret=secrets_out["SESSION_SECRET"],
        data_enc_key=secrets_out["DATA_ENC_KEY"],
        sub_hash_key=secrets_out["SUB_HASH_KEY"],
        database_url=(env.get("DATABASE_URL") or "").strip(),
        google_client_id=(env.get("GOOGLE_CLIENT_ID") or "").strip(),
        google_client_secret=(env.get("GOOGLE_CLIENT_SECRET") or "").strip(),
        google_token_mode=token_mode,
        admin_sub_hashes=tuple(s.strip() for s in (env.get("ADMIN_SUB_HASHES") or "").split(",") if s.strip()),
        # .env.example: 허용 범위 1~6
        hive_max_rings=_int(env, "HIVE_MAX_RINGS", 3, 1, 6),
        guest_ttl_hours=_int(env, "GUEST_TTL_HOURS", 24, 1, 168),
        done_task_ttl_days=_int(env, "DONE_TASK_TTL_DAYS", 90, 1, 3650),
        session_hours=_int(env, "SESSION_HOURS", 8, 1, 72),
        upstream_allowed_host_suffixes=suffixes,
        upstream_allow_localhost=allow_localhost,
        upstream_connect_timeout=_int(env, "UPSTREAM_CONNECT_TIMEOUT", 10, 1, 60, alias="UPSTREAM_CONNECT_TIMEOUT_SECONDS"),
        upstream_read_timeout=_int(env, "UPSTREAM_READ_TIMEOUT", 120, 5, 600, alias="UPSTREAM_READ_TIMEOUT_SECONDS"),
        max_messages=_int(env, "MAX_MESSAGES", 40, 2, 200, alias="MAX_HISTORY_MESSAGES"),
        max_message_chars=_int(env, "MAX_MESSAGE_CHARS", 2000, 100, 20000),
        max_body_bytes=_int(env, "MAX_BODY_BYTES", 200_000, 1_000, 5_000_000),
        rate_limit_chat_per_min=_int(env, "RATE_LIMIT_CHAT_PER_MIN", 20, 1, 1000),
        rate_limit_extract_per_min=_int(env, "RATE_LIMIT_EXTRACT_PER_MIN", 30, 1, 1000),
        rate_limit_general_per_min=_int(env, "RATE_LIMIT_GENERAL_PER_MIN", 240, 10, 10000),
        weather_default_city=(env.get("WEATHER_DEFAULT_CITY") or "서울").strip(),
        frontend_dist=(env.get("FRONTEND_DIST") or "frontend/dist").strip(),
        ephemeral_secrets=tuple(ephemeral),
    )
