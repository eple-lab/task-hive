"""벌집 좌표 계산.

육각 격자 좌표 (q, r) — "축 좌표(axial)"라고 부른다.
    - 가운데 칸이 (0, 0)이다.
    - n번째 고리에는 6n칸이 있다. 3단까지 1 + 6 + 12 + 18 = 37칸 (docs/04 4장).
    - 좌표를 DB에 저장하므로 다시 열어도 같은 자리에 있다.

배정 규칙 (R-HIVE-5, 초안의 "랜덤스럽게")
    - 비어 있는 칸 중 가장 안쪽 고리의 칸에 넣는다.
    - 같은 고리 안에서는 무작위로 고른다.

화면(frontend/src/hive)은 이 (q, r)을 받아 픽셀 위치로 바꾼다:
    x = size * 3/2 * q
    y = size * sqrt(3) * (r + q/2)        (꼭짓점이 좌우를 향하는 육각형 기준)
"""

from __future__ import annotations

import random

# 축 좌표에서 이웃 6방향
_DIRECTIONS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def ring_cells(ring: int) -> list[tuple[int, int]]:
    """ring번째 고리의 칸 좌표 목록. ring=0이면 가운데 한 칸."""
    if ring == 0:
        return [(0, 0)]
    cells: list[tuple[int, int]] = []
    # (-ring, +ring)에서 시작해 6방향으로 ring칸씩 걸으면 고리를 한 바퀴 돈다
    q, r = _DIRECTIONS[4][0] * ring, _DIRECTIONS[4][1] * ring
    for dq, dr in _DIRECTIONS:
        for _ in range(ring):
            cells.append((q, r))
            q, r = q + dq, r + dr
    return cells


def all_cells(max_rings: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for ring in range(max_rings + 1):
        out.extend(ring_cells(ring))
    return out


def pick_free_cell(
    occupied: set[tuple[int, int]], max_rings: int, rng: random.Random | None = None
) -> tuple[int, int] | None:
    """가장 안쪽 고리의 빈 칸 중 하나를 무작위로 고른다. 빈 칸이 없으면 None."""
    rng = rng or random
    for ring in range(max_rings + 1):
        free = [cell for cell in ring_cells(ring) if cell not in occupied]
        if free:
            return rng.choice(free)
    return None
