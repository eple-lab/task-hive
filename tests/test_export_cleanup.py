"""내려받기(GET /api/export)와 손님 데이터 정리(D-07, D-23).

D-07: 손님은 내려받으면 데이터가 지워지고, 마지막 활동 24시간 뒤에도 지워진다.
D-23: 완료한 태스크는 90일 뒤 삭제.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from conftest import make_task


def test_export_markdown_then_guest_data_deleted(env):
    # Markdown 파일이 오고, 응답 뒤 손님 데이터와 쿠키가 지워진다
    c = env.guest("하루")
    c.post("/api/tasks/bulk", json={"items": [{"title": "빨래 개기", "due_date": "2099-01-01", "subtasks": ["수건"]}, {"title": "책 반납"}]})
    assert len(env.app.state.store._owners) == 1
    r = c.get("/api/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/markdown")
    assert "attachment" in r.headers["content-disposition"] and ".md" in r.headers["content-disposition"]
    assert r.headers["x-th-deleted"] == "1"
    text = r.text
    assert text.startswith("# Task Hive 할 일") and "- [ ] 빨래 개기" in text and "    - [ ] 수건" in text and "- [ ] 책 반납" in text
    assert "D-" in text  # 마감일 D-day 표시
    # 지워졌는지: 저장소가 비었고, 쿠키도 사라져 mode:none
    assert env.app.state.store._owners == {}
    assert c.get("/api/me").json()["mode"] == "none"


def test_export_without_tasks(env):
    r = env.guest().get("/api/export")
    assert r.status_code == 200 and "등록한 할 일이 없습니다" in r.text


def test_export_marks_done_and_archived(env):
    c = env.guest()
    a, b = make_task(c, "끝낸 일"), make_task(c, "보관할 일")
    c.patch(f"/api/tasks/{a['id']}", json={"completed": True})
    c.patch(f"/api/tasks/{b['id']}", json={"archived": True})
    text = c.get("/api/export").text
    assert "- [x] 끝낸 일" in text and "## 보관함" in text and "보관할 일" in text


def test_export_requires_login(env):
    assert env.client().get("/api/export").status_code == 401


def test_export_cross_site_navigation_refused_and_data_kept(env):
    # 다른 사이트에서 넘어온 요청(Sec-Fetch-Site: cross-site)은 거절하고 데이터는 그대로(링크 낚시로 지우는 것 방지)
    c = env.guest()
    make_task(c)
    r = c.get("/api/export", headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403
    assert len(env.app.state.store._owners) == 1
    assert c.get("/api/export", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200


# ── 24시간 지난 손님 정리 ───────────────────────────────────


def test_cleanup_removes_guest_after_24h(env):
    # 시각을 24시간 넘겨 정리하면 손님 행이 사라진다. 23시간이면 남는다
    c = env.guest()
    make_task(c)
    store = env.app.state.store
    now = datetime.now(timezone.utc)
    assert store.cleanup(now + timedelta(hours=23)) == {"guests": 0, "done_tasks": 0}
    assert len(store._owners) == 1
    assert store.cleanup(now + timedelta(hours=25))["guests"] == 1
    assert store._owners == {}
    # 쿠키가 남아 있어도 데이터는 없다(빈 상태로 다시 시작)
    assert c.get("/api/tasks").json()["tasks"] == []


def test_activity_resets_guest_clock(env):
    # 요청이 오면 마지막 활동 시각이 갱신된다 -> 12시간 뒤 한 번 쓰면 그로부터 24시간이 기준
    c = env.guest()
    store = env.app.state.store
    owner = next(iter(store._owners))
    store._owners[owner]["last_activity"] = datetime.now(timezone.utc) - timedelta(hours=23)
    c.get("/api/me")  # touch
    assert store.cleanup(datetime.now(timezone.utc) + timedelta(hours=2))["guests"] == 0


def test_cleanup_removes_done_tasks_after_90_days_only(env):
    # D-23: 완료 후 90일 지난 태스크만 삭제. 미완료는 남는다(로그인 사용자 행으로 시험: 손님은 24시간 정리 대상)
    store = env.app.state.store
    store.ensure_owner("google:u1", "테스터")
    done, open_ = store.create_tasks("google:u1", [{"title": "끝낸 일"}, {"title": "안 끝낸 일"}])
    store.update_task("google:u1", done["id"], {"completed": True})
    now = datetime.now(timezone.utc)
    assert store.cleanup(now + timedelta(days=89))["done_tasks"] == 0
    assert store.cleanup(now + timedelta(days=91)) == {"guests": 0, "done_tasks": 1}
    assert [t["title"] for t in store.list_tasks("google:u1")] == ["안 끝낸 일"]
