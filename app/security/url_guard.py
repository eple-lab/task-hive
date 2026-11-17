"""사용자가 넣은 업스트림(ngrok) 주소 검사: SSRF 방어.

왜 필요한가 (D-04, docs/05 5장)
    - 사용자마다 자기 Colab 주소를 넣고, 우리 서버가 그 주소로 요청을 보낸다.
    - 아무 주소나 받으면 서버가 내부망이나 클라우드 관리 주소(169.254.169.254 등)를 찌르게 된다.

검사 순서
    1. 형식: https만. 포트, 사용자 정보(user@), 경로, 쿼리, 조각(#) 금지.
    2. 도메인 허용 목록: 설정의 접미사(.ngrok-free.app, .ngrok-free.dev)로 끝나야 한다.
    3. DNS로 풀린 IP가 사설·루프백·링크로컬·예약 대역이면 거부.
    4. (호출하는 쪽에서) 리다이렉트를 따라가지 않는다. → services/upstream.py
    5. 저장할 때만이 아니라 "요청을 보낼 때마다" 다시 검사한다(DNS 바꿔치기 방지).

개발 예외
    - UPSTREAM_ALLOW_LOCALHOST=true(개발에서만 허용)면 http://localhost:포트, http://127.0.0.1:포트를 받는다.
      로컬 PC의 게이트웨이나 Ollama로 시험할 때 쓴다. 운영에서는 설정 단계에서 막힌다(config.py).

테스트
    - DNS 조회 함수(resolver)를 바꿔 끼울 수 있다. 테스트는 실제 DNS를 부르지 않는다.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from typing import Awaitable, Callable
from urllib.parse import urlsplit

from app.config import Settings

Resolver = Callable[[str], Awaitable[list[str]]]

_LOCAL_HOSTS = {"localhost", "127.0.0.1"}


class UrlRejected(Exception):
    """주소가 규칙에 맞지 않을 때. message는 사용자에게 보여 줄 한국어 안내."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


async def system_resolver(host: str) -> list[str]:
    """실제 DNS 조회. 이벤트 루프를 막지 않게 스레드에서 돌린다."""
    infos = await asyncio.to_thread(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM)
    return sorted({info[4][0] for info in infos})


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def parse_upstream_url(url: str, settings: Settings) -> tuple[str, str, bool]:
    """형식과 도메인만 검사한다(DNS 없음). (정규화한 주소, 호스트, 로컬 여부)를 돌려준다."""
    if not isinstance(url, str) or len(url) > 300:
        raise UrlRejected("bad_url", "주소 형식을 확인해 주세요.")
    raw = url.strip()
    # 공백·제어문자·역슬래시가 섞인 주소는 해석이 갈릴 수 있어 통째로 거부
    if any(ch.isspace() or ord(ch) < 0x20 or ch == "\\" for ch in raw):
        raise UrlRejected("bad_url", "주소 형식을 확인해 주세요.")
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise UrlRejected("bad_url", "주소 형식을 확인해 주세요.") from None
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise UrlRejected("bad_url", "주소 형식을 확인해 주세요.")
    if parts.username or parts.password or "@" in parts.netloc:
        raise UrlRejected("bad_url", "주소에 계정 정보를 넣을 수 없습니다.")
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        raise UrlRejected("bad_url", "주소 뒤의 경로는 빼고 넣어 주세요. (예: https://이름.ngrok-free.app)")

    # 개발 예외: 로컬 게이트웨이
    if settings.upstream_allow_localhost and host in _LOCAL_HOSTS:
        if parts.scheme not in ("http", "https"):
            raise UrlRejected("bad_scheme", "http 또는 https 주소만 넣을 수 있습니다.")
        netloc = f"{host}:{port}" if port else host
        return f"{parts.scheme}://{netloc}", host, True

    if parts.scheme != "https":
        raise UrlRejected("bad_scheme", "https:// 로 시작하는 주소만 넣을 수 있습니다.")
    if port not in (None, 443):
        raise UrlRejected("bad_port", "포트 번호는 넣을 수 없습니다.")
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False
    if is_ip:
        raise UrlRejected("host_not_allowed", "숫자 주소(IP)는 넣을 수 없습니다.")
    if not any(host.endswith(suffix) and len(host) > len(suffix) for suffix in settings.upstream_allowed_host_suffixes):
        allowed = ", ".join("*" + s for s in settings.upstream_allowed_host_suffixes)
        raise UrlRejected("host_not_allowed", f"허용된 주소가 아닙니다. ({allowed} 만 넣을 수 있어요)")
    return f"https://{host}", host, False


async def validate_upstream_url(url: str, settings: Settings, resolver: Resolver | None = None) -> str:
    """형식 → 도메인 → DNS 순서로 검사하고 정규화한 주소를 돌려준다. 실패하면 UrlRejected.

    요청을 보낼 때마다 이 함수를 다시 부른다(저장된 주소도 믿지 않는다).
    """
    normalized, host, is_local = parse_upstream_url(url, settings)
    if is_local:
        return normalized
    try:
        ips = await (resolver or system_resolver)(host)
    except OSError:
        raise UrlRejected("dns_failed", "주소를 찾을 수 없습니다. Colab이 켜져 있는지 확인해 주세요.") from None
    if not ips or not all(_is_public_ip(ip) for ip in ips):
        # 하나라도 내부 주소로 풀리면 거부한다
        raise UrlRejected("private_address", "이 주소로는 연결할 수 없습니다.")
    return normalized
