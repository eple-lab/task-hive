"""벌집(육각 칸) 배정: 겹치지 않음, 가운데부터 바깥 고리, 한도(409), 보관은 칸을 비움.

근거: D-24·D-29 (HIVE_MAX_RINGS, 칸 수 = 1 + 3n(n+1)), 계약 "좌표는 서버가 정한다".
"""

from __future__ import annotations

from app.config import hive_max_cells
from app.store.hive import all_cells, pick_free_cell, ring_cells
from conftest import bulk, make_task


def ring_of(q: int, r: int) -> int:
    """축 좌표 (q, r)가 몇 번째 고리인가(가운데로부터의 육각 거리)."""
    return max(abs(q), abs(r), abs(q + r))


def test_cell_counts_per_ring():
    # n번째 고리는 6n칸, 3단이면 37칸, 1단이면 7칸
    assert [len(ring_cells(n)) for n in range(4)] == [1, 6, 12, 18]
    assert hive_max_cells(3) == 37 and hive_max_cells(1) == 7 and hive_max_cells(4) == 61
    cells = all_cells(3)
    assert len(cells) == 37 == len(set(cells))
    assert all(ring_of(q, r) == n for n in range(4) for q, r in ring_cells(n))


def test_pick_free_cell_prefers_inner_ring():
    # 비어 있는 가장 안쪽 고리에서 고른다
    assert pick_free_cell(set(), 3) == (0, 0)
    assert ring_of(*pick_free_cell({(0, 0)}, 3)) == 1
    full = set(all_cells(1))
    assert ring_of(*pick_free_cell(full, 3)) == 2
    assert pick_free_cell(set(all_cells(3)), 3) is None


def test_default_fills_37_cells_without_overlap_then_409(client):
    # 기본(3단): 37개까지 등록되고 좌표가 겹치지 않으며, 38번째는 409
    titles = [f"할 일 {i}" for i in range(37)]
    r = bulk(client, *titles)
    assert r.status_code == 200
    tasks = r.json()["tasks"]
    coords = [(t["hex_q"], t["hex_r"]) for t in tasks]
    assert len(set(coords)) == 37 and set(coords) == set(all_cells(3))
    over = bulk(client, "한 개 더")
    assert over.status_code == 409 and over.json()["error"]["code"] == "hive_full"
    assert len(client.get("/api/tasks").json()["tasks"]) == 37  # 실패해도 그대로


def test_center_first_then_outward_rings(client):
    # 첫 태스크는 (0,0), 그 뒤로 고리 번호가 줄어들지 않는다(바깥으로 번진다)
    tasks = bulk(client, *[f"할 일 {i}" for i in range(20)]).json()["tasks"]
    assert (tasks[0]["hex_q"], tasks[0]["hex_r"]) == (0, 0)
    rings = [ring_of(t["hex_q"], t["hex_r"]) for t in tasks]
    assert rings == sorted(rings)
    assert rings.count(1) == 6 and rings.count(2) == 12 and rings.count(3) == 1  # 1+6+12=19, 20번째는 3고리


def test_bulk_over_capacity_is_atomic(client):
    # 한 번에 38개를 보내면 409이고 하나도 만들어지지 않는다
    r = bulk(client, *[f"할 일 {i}" for i in range(38)])
    assert r.status_code == 409
    assert client.get("/api/tasks").json()["tasks"] == []


def test_rings_setting_one_gives_seven_cells(make_env):
    # HIVE_MAX_RINGS=1이면 7칸. /api/me의 limits도 같다
    c = make_env(HIVE_MAX_RINGS=1).guest()
    assert c.get("/api/me").json()["limits"] == {"hive_max_rings": 1, "hive_max_cells": 7}
    assert bulk(c, *[f"일 {i}" for i in range(7)]).status_code == 200
    assert bulk(c, "여덟째").status_code == 409


def test_archived_task_frees_its_cell(make_env):
    # 보관한 태스크는 칸을 차지하지 않는다: 꽉 찬 벌집에서 하나 보관하면 새 태스크가 들어간다
    c = make_env(HIVE_MAX_RINGS=1).guest()
    tasks = bulk(c, *[f"일 {i}" for i in range(7)]).json()["tasks"]
    freed = (tasks[3]["hex_q"], tasks[3]["hex_r"])
    assert c.patch(f"/api/tasks/{tasks[3]['id']}", json={"archived": True}).status_code == 200
    new = bulk(c, "새 일")
    assert new.status_code == 200
    n = new.json()["tasks"][0]
    assert (n["hex_q"], n["hex_r"]) == freed  # 비워진 그 칸(유일한 빈 칸)에 들어간다


def test_unarchive_when_full_is_409(make_env):
    # 보관 해제는 빈 칸이 없으면 409 (보관함에 남는다)
    c = make_env(HIVE_MAX_RINGS=1).guest()
    tasks = bulk(c, *[f"일 {i}" for i in range(7)]).json()["tasks"]
    c.patch(f"/api/tasks/{tasks[0]['id']}", json={"archived": True})
    bulk(c, "새 일")
    r = c.patch(f"/api/tasks/{tasks[0]['id']}", json={"archived": False})
    assert r.status_code == 409 and r.json()["error"]["code"] == "hive_full"


def test_unarchive_gets_new_cell(client):
    # 자리가 있으면 보관 해제 때 새 칸을 받는다
    t = make_task(client)
    client.patch(f"/api/tasks/{t['id']}", json={"archived": True})
    back = client.patch(f"/api/tasks/{t['id']}", json={"archived": False}).json()
    assert back["archived"] is False and back["hex_q"] is not None


def test_cells_are_per_user(env):
    # 다른 손님의 벌집과 칸이 서로 영향을 주지 않는다(둘 다 (0,0)부터)
    a, b = env.guest("가"), env.guest("나")
    ta, tb = make_task(a, "일"), make_task(b, "일")
    assert (ta["hex_q"], ta["hex_r"]) == (0, 0) == (tb["hex_q"], tb["hex_r"])
