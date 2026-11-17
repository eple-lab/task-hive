"""날씨 (D-25: Open-Meteo, 도시 선택, 기본 서울).

왜 이렇게 했나
    - Open-Meteo는 키가 필요 없다.
    - 브라우저 위치 권한을 쓰지 않는다. 사용자가 고른 "도시"의 좌표만 밖으로 나간다(docs/05 3.1).
    - 도시 → 좌표는 작은 내장 표로 한다(지오코딩 API를 한 번 더 부르지 않는다).

실패하면 None을 돌려준다. 인사말은 날씨 없이도 만들어진다.
결과는 10분 동안 메모리에 둔다(같은 도시를 반복해 부르지 않게).
"""

from __future__ import annotations

import time

import httpx

# 도시 → (위도, 경도). 필요한 도시는 여기에 더한다.
CITIES: dict[str, tuple[float, float]] = {
    "서울": (37.5665, 126.9780),
    "부산": (35.1796, 129.0756),
    "인천": (37.4563, 126.7052),
    "대구": (35.8714, 128.6014),
    "대전": (36.3504, 127.3845),
    "광주": (35.1595, 126.8526),
    "울산": (35.5384, 129.3114),
    "세종": (36.4800, 127.2890),
    "수원": (37.2636, 127.0286),
    "춘천": (37.8813, 127.7298),
    "강릉": (37.7519, 128.8761),
    "청주": (36.6424, 127.4890),
    "전주": (35.8242, 127.1480),
    "포항": (36.0190, 129.3435),
    "창원": (35.2280, 128.6811),
    "제주": (33.4996, 126.5312),
}


def describe(code: int) -> str:
    """WMO 날씨 코드를 한국어로."""
    if code == 0:
        return "맑음"
    if code in (1, 2):
        return "구름 조금"
    if code == 3:
        return "흐림"
    if code in (45, 48):
        return "안개"
    if 51 <= code <= 57:
        return "이슬비"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "비"
    if 71 <= code <= 77 or code in (85, 86):
        return "눈"
    if 95 <= code <= 99:
        return "천둥번개"
    return "알 수 없음"


class WeatherService:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, ttl_seconds: int = 600):
        self._transport = transport
        self._ttl = ttl_seconds
        self._cache: dict[str, tuple[float, dict]] = {}

    async def current(self, city: str) -> dict | None:
        """{"city", "temp_c", "desc"} 또는 None."""
        coords = CITIES.get(city)
        if coords is None:
            return None
        cached = self._cache.get(city)
        if cached and time.monotonic() - cached[0] < self._ttl:
            return cached[1]
        try:
            async with httpx.AsyncClient(timeout=5, follow_redirects=False, transport=self._transport) as client:
                resp = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={"latitude": coords[0], "longitude": coords[1], "current": "temperature_2m,weather_code", "timezone": "Asia/Seoul"},
                )
            if resp.status_code != 200:
                return None
            current = resp.json()["current"]
            result = {"city": city, "temp_c": float(current["temperature_2m"]), "desc": describe(int(current["weather_code"]))}
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            return None
        self._cache[city] = (time.monotonic(), result)
        return result
