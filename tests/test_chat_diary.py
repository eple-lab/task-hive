"""/api/chat (SSE)와 /api/diary/summary — 가짜 업스트림으로.

계약: 줄마다 data: {"type":"answer"|"done"|"error"}. 업스트림 오류는 error 이벤트.
"""

from __future__ import annotations

import json

from conftest import parse_sse

MSG = {"messages": [{"role": "user", "content": "오늘 좀 피곤했어"}]}


def test_chat_requires_login_and_upstream(env):
    assert env.client().post("/api/chat", json=MSG).status_code == 401
    r = env.guest().post("/api/chat", json=MSG)
    assert r.status_code == 409 and r.json()["error"]["code"] == "upstream_not_connected"


def test_chat_streams_answer_then_done(env):
    # 정상: answer 조각들 -> done. text/event-stream
    c = env.connected()
    r = c.post("/api/chat", json=MSG)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(r.text)
    assert events[-1] == {"type": "done"}
    assert [e["text"] for e in events if e["type"] == "answer"] == ["안녕", "하세요"]
    assert not any(e["type"] == "error" for e in events)


def test_chat_filters_think_block(env, upstream):
    # thinking 모델의 생각 구간(<think>…</think>)은 화면으로 가지 않는다
    c = env.connected()
    upstream.chat_chunks = ["<thi", "nk>속으로 생각", "</think>", "\n답이에요"]
    events = parse_sse(c.post("/api/chat", json=MSG).text)
    answer = "".join(e["text"] for e in events if e["type"] == "answer")
    assert answer == "답이에요" and "think" not in answer


def test_chat_upstream_error_becomes_error_event(env, upstream):
    # 업스트림 오류는 HTTP 오류가 아니라 SSE error 이벤트(그때까지 받은 답은 화면에 남는다)
    c = env.connected()
    upstream.status = 500
    events = parse_sse(c.post("/api/chat", json=MSG).text)
    assert events[-1]["type"] == "error" and events[-1]["message"]
    assert not any(e["type"] == "done" for e in events)


def test_chat_upstream_unreachable_error_event(env, upstream):
    c = env.connected()
    upstream.raise_connect_error = True
    events = parse_sse(c.post("/api/chat", json=MSG).text)
    assert events[-1]["type"] == "error" and "연결" in events[-1]["message"]


def test_chat_auth_failure_message(env, upstream):
    # 접속 키가 틀리면(401) 키를 확인하라는 안내
    c = env.connected()
    upstream.status = 401
    events = parse_sse(c.post("/api/chat", json=MSG).text)
    assert events[-1]["type"] == "error" and "키" in events[-1]["message"]


def test_chat_input_validation(env):
    c = env.connected()
    assert c.post("/api/chat", json={"messages": []}).status_code == 422
    assert c.post("/api/chat", json={"messages": [{"role": "system", "content": "x"}]}).status_code == 422
    assert c.post("/api/chat", json={**MSG, "temperature": 5}).status_code == 422
    # 공백뿐인 메시지만 있으면 보낼 말이 없다
    assert c.post("/api/chat", json={"messages": [{"role": "user", "content": "   "}]}).status_code == 422


def test_chat_sends_only_open_task_titles_and_trims(env, upstream):
    # 업스트림으로 가는 메시지: 끝나지 않은 할 일 제목은 들어가고 끝난 것은 안 들어간다. 모델은 목록 안에서만 고른다
    from conftest import bulk

    c = env.connected()
    bulk(c, "열린 일", "끝낸 일")
    tasks = c.get("/api/tasks").json()["tasks"]
    c.patch(f"/api/tasks/{tasks[1]['id']}", json={"completed": True})
    c.post("/api/chat", json={**MSG, "model": "없는-모델"})
    sent = upstream.requests[-1]
    text = sent.content.decode()
    assert "열린 일" in text and "끝낸 일" not in text
    assert json.loads(sent.content)["model"] == "fake-model"  # 목록에 없는 이름은 무시


def test_diary_summary_ok(env, upstream):
    # 일기 요약: 계약 모양 {"summary_line","body","did","todo"}
    c = env.connected()
    upstream.completion = json.dumps({"summary_line": "조용한 하루", "body": "피곤했지만 해야 할 일을 했다.", "did": ["빨래"], "todo": ["장보기"]}, ensure_ascii=False)
    r = c.post("/api/diary/summary", json=MSG)
    assert r.status_code == 200
    assert r.json() == {"summary_line": "조용한 하루", "body": "피곤했지만 해야 할 일을 했다.", "did": ["빨래"], "todo": ["장보기"]}


def test_diary_summary_failures(env, upstream):
    c = env.connected()
    upstream.completion = "JSON 아님"
    r = c.post("/api/diary/summary", json=MSG)
    assert r.status_code == 502 and r.json()["error"]["code"] == "bad_summary"
    # 사용자 말이 하나도 없으면 422
    r = c.post("/api/diary/summary", json={"messages": [{"role": "assistant", "content": "안녕하세요"}]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_dialog"
    upstream.status = 500
    assert c.post("/api/diary/summary", json=MSG).status_code == 502
