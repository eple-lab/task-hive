"""기본 기능: 태스크와 하위 태스크 (등록, 중복, 길이, 수정, 삭제, 완료 연동).

계약: docs/11 "태스크". 규칙은 서버(저장소)가 검사한다.
"""

from __future__ import annotations

import pytest

from conftest import bulk, make_task

TASK_KEYS = {"id", "title", "due_date", "completed", "completed_at", "archived", "source", "hex_q", "hex_r", "created_at", "subtasks"}


def test_bulk_create_shape_and_defaults(client):
    # 일괄 등록: 계약의 태스크 모양, due_date 없어도 됨(null), source 기본 chat
    r = bulk(client, "빨래 개기", "책상 정리")
    assert r.status_code == 200
    tasks = r.json()["tasks"]
    assert len(tasks) == 2
    t = tasks[0]
    assert set(t) == TASK_KEYS
    assert t["due_date"] is None and t["completed"] is False and t["archived"] is False and t["source"] == "chat"
    assert t["completed_at"] is None and t["subtasks"] == [] and t["created_at"]
    assert client.get("/api/tasks").json()["tasks"] == tasks  # 목록과 같은 내용


def test_bulk_with_due_date_and_subtasks(client):
    # 마감일과 하위 태스크를 함께 등록
    r = client.post("/api/tasks/bulk", json={"items": [{"title": "보고서", "due_date": "2026-12-01", "subtasks": ["초안", "검토"], "source": "manual"}]})
    t = r.json()["tasks"][0]
    assert t["due_date"] == "2026-12-01" and t["source"] == "manual"
    assert [s["title"] for s in t["subtasks"]] == ["초안", "검토"]
    assert all(set(s) == {"id", "title", "completed"} for s in t["subtasks"])


@pytest.mark.parametrize("due", ["2026-13-40", "내일", "2026/12/01"])
def test_invalid_due_date_rejected(client, due):
    # 없는 날짜·형식 틀린 날짜는 거부(422)
    r = client.post("/api/tasks/bulk", json={"items": [{"title": "보고서", "due_date": due}]})
    assert r.status_code == 422


def test_duplicate_inside_bulk_rejected_and_nothing_created(client):
    # 묶음 안 중복(대소문자·공백 무시) -> 409, 그리고 전부 취소(하나도 안 만들어짐)
    r = bulk(client, "빨래 개기", "  빨래 개기 ")
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_title"
    assert client.get("/api/tasks").json()["tasks"] == []


def test_duplicate_with_existing_rejected(client):
    # 이미 있는 제목과 같으면 409
    make_task(client, "Report")
    r = bulk(client, "report")
    assert r.status_code == 409
    assert len(client.get("/api/tasks").json()["tasks"]) == 1


def test_duplicate_subtask_in_bulk_rejected(client):
    # 같은 태스크 안에서 하위 태스크 제목이 겹치면 409
    r = client.post("/api/tasks/bulk", json={"items": [{"title": "보고서", "subtasks": ["초안", "초안"]}]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_subtask"


@pytest.mark.parametrize("title", ["", "   ", "\n\t"])
def test_empty_title_rejected(client, title):
    # 빈 제목(공백만 포함)은 422
    r = bulk(client, title)
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_title"


def test_title_length_limit_200(client):
    # 200자는 되고 201자는 422 title_too_long (계약: 200자까지)
    assert bulk(client, "가" * 200).status_code == 200
    r = bulk(client, "나" * 201)
    assert r.status_code == 422 and r.json()["error"]["code"] == "title_too_long"


def test_title_limit_comes_from_setting(make_env):
    # MAX_TITLE_CHARS 설정이 실제로 적용된다(할 일 2)
    c = make_env(MAX_TITLE_CHARS=20).guest()
    assert bulk(c, "가" * 20).status_code == 200
    assert bulk(c, "나" * 21).status_code == 422
    t = make_task(c, "다라마바")
    # 수정·하위 태스크에도 같은 한도
    assert c.patch(f"/api/tasks/{t['id']}", json={"title": "마" * 21}).status_code == 422
    assert c.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "사" * 21}).status_code == 422


def test_very_long_title_rejected_by_schema(client):
    # 1000자를 넘는 입력은 입력 검사 단계에서 422 invalid_request
    r = bulk(client, "가" * 1001)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_unknown_fields_rejected(client):
    # 정해진 칸 밖의 값(예: hex_q를 직접 지정)은 거부 -> 좌표는 서버만 정한다
    r = client.post("/api/tasks/bulk", json={"items": [{"title": "보고서", "hex_q": 0, "hex_r": 0}]})
    assert r.status_code == 422


def test_empty_items_rejected(client):
    assert client.post("/api/tasks/bulk", json={"items": []}).status_code == 422


def test_patch_complete_and_archive(client):
    # 완료하면 completed_at이 생기고 하위 태스크도 모두 완료. 되돌리면 completed_at이 비워진다
    t = client.post("/api/tasks/bulk", json={"items": [{"title": "보고서", "subtasks": ["초안", "검토"]}]}).json()["tasks"][0]
    r = client.patch(f"/api/tasks/{t['id']}", json={"completed": True})
    body = r.json()
    assert r.status_code == 200 and body["completed"] is True and body["completed_at"]
    assert all(s["completed"] for s in body["subtasks"])
    assert client.patch(f"/api/tasks/{t['id']}", json={"completed": False}).json()["completed_at"] is None
    # 보관: archived true, 칸이 비워진다
    a = client.patch(f"/api/tasks/{t['id']}", json={"archived": True}).json()
    assert a["archived"] is True and a["hex_q"] is None and a["hex_r"] is None


def test_patch_title_due_and_duplicate(client):
    # 제목·마감일 수정, 다른 태스크와 같은 제목으로는 못 바꿈, due_date null로 지우기
    a = make_task(client, "A 일", due_date="2026-12-01")
    make_task(client, "B 일")
    r = client.patch(f"/api/tasks/{a['id']}", json={"title": "A 일 수정"})
    assert r.json()["title"] == "A 일 수정"
    assert client.patch(f"/api/tasks/{a['id']}", json={"title": "b 일"}).status_code == 409
    assert client.patch(f"/api/tasks/{a['id']}", json={"due_date": None}).json()["due_date"] is None


def test_patch_with_unknown_field_rejected(client):
    t = make_task(client)
    assert client.patch(f"/api/tasks/{t['id']}", json={"id": 5}).status_code == 422


def test_delete_task(client):
    # 삭제는 204, 다시 지우면 404
    t = make_task(client)
    assert client.delete(f"/api/tasks/{t['id']}").status_code == 204
    assert client.get("/api/tasks").json()["tasks"] == []
    assert client.delete(f"/api/tasks/{t['id']}").status_code == 404


def test_task_not_found_for_missing_id(client):
    assert client.patch("/api/tasks/99999", json={"completed": True}).status_code == 404


def test_subtask_add_complete_delete(client):
    # 하위 태스크: 추가 -> 완료 -> (모두 완료되면 태스크도 완료) -> 삭제
    t = make_task(client, "보고서")
    r = client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "초안"})
    assert r.status_code == 200
    sid = r.json()["subtasks"][0]["id"]
    done = client.patch(f"/api/tasks/{t['id']}/subtasks/{sid}", json={"completed": True}).json()
    assert done["subtasks"][0]["completed"] is True and done["completed"] is True  # D-21: 전부 끝나면 태스크도 끝
    # 완료된 태스크에 새 하위 태스크가 생기면 다시 미완료
    again = client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "검토"}).json()
    assert again["completed"] is False
    after = client.delete(f"/api/tasks/{t['id']}/subtasks/{sid}")
    assert after.status_code == 200 and [s["title"] for s in after.json()["subtasks"]] == ["검토"]
    assert client.delete(f"/api/tasks/{t['id']}/subtasks/{sid}").status_code == 404


def test_subtask_title_unique_only_within_same_task(client):
    # 하위 태스크 제목은 "같은 태스크 안에서만" 중복 불가. 다른 태스크에는 같은 제목 가능
    a = make_task(client, "A 일")
    b = make_task(client, "B 일")
    assert client.post(f"/api/tasks/{a['id']}/subtasks", json={"title": "초안"}).status_code == 200
    dup = client.post(f"/api/tasks/{a['id']}/subtasks", json={"title": " 초안 "})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "duplicate_subtask"
    assert client.post(f"/api/tasks/{b['id']}/subtasks", json={"title": "초안"}).status_code == 200


def test_subtask_rename_duplicate_and_empty(client):
    t = make_task(client, "보고서")
    client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "초안"})
    r = client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "검토"}).json()
    sid = r["subtasks"][1]["id"]
    assert client.patch(f"/api/tasks/{t['id']}/subtasks/{sid}", json={"title": "초안"}).status_code == 409
    assert client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "  "}).status_code == 422


def test_unchecking_subtask_reopens_completed_task(client):
    # 완료된 태스크의 하위 태스크를 하나 풀면 태스크도 미완료로 돌아간다
    t = client.post("/api/tasks/bulk", json={"items": [{"title": "보고서", "subtasks": ["초안"]}]}).json()["tasks"][0]
    client.patch(f"/api/tasks/{t['id']}", json={"completed": True})
    sid = t["subtasks"][0]["id"]
    r = client.patch(f"/api/tasks/{t['id']}/subtasks/{sid}", json={"completed": False}).json()
    assert r["completed"] is False and r["completed_at"] is None
