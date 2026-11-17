"""Neon(Postgres) 저장소 — 자리만 있다. 2단계에서 구현한다.

지금 상태
    - DATABASE_URL을 채우면 이 클래스가 선택되고, 서버가 켜질 때 "아직 구현 전"이라고 알리며 멈춘다.
      (조용히 메모리 저장소로 바꾸면 운영에서 데이터가 사라지는 것을 모르고 지나칠 수 있어서다.)
    - 1단계는 DATABASE_URL을 비워 메모리 저장소로 돌린다(D-26).

구현할 때 지킬 것 (docs/03 5장, docs/05)
    1. 표는 migrations/001_init.sql대로. users, guest_sessions, tasks, subtasks, metric_events.
    2. MemoryStore와 "같은 함수 이름·같은 규칙·같은 오류 코드"를 낸다. tests/를 두 저장소에 똑같이 돌린다.
    3. 값은 항상 매개변수로 넘긴다(SQL 문자열에 끼워 넣지 않는다).
    4. 요청마다 `SET LOCAL app.owner_id = ...`를 하고 RLS 정책이 자기 행만 허락하게 한다(P-04).
    5. 제목은 DATA_ENC_KEY로 암호화해 title_enc에 넣고, 중복 검사는 HMAC 값(title_hash)으로 한다(P-03).
       → P-03, P-04는 아직 "제안"이다. docs/07 Q-02에서 정해야 한다.
    6. 구글 토큰(D-19): GOOGLE_TOKEN_MODE=access_only면 access token만 암호화해 저장하고 만료 시각이
       지나면 지운다. refresh면 refresh token도 암호화해 저장한다(eple 결정: 두 방식 모두 구현).
    7. 연결은 TLS(sslmode=require). Neon은 5분 안 쓰면 멈추므로 첫 쿼리가 느릴 수 있다(docs/09 2.2).
    8. 드라이버 후보: psycopg(3) — requirements.txt에 아직 넣지 않았다.
"""

from __future__ import annotations

from app.config import Settings
from app.store.base import Store


class PostgresStore(Store):
    def __init__(self, settings: Settings):
        raise NotImplementedError(
            "Postgres 저장소는 아직 구현 전입니다(2단계). 지금은 DATABASE_URL을 비워 메모리 저장소로 실행해 주세요."
        )

    # 아래는 추상 클래스 요건을 채우기 위한 자리다. __init__에서 멈추므로 불리지 않는다.
    def ensure_owner(self, owner, name): raise NotImplementedError
    def touch(self, owner): raise NotImplementedError
    def get_prefs(self, owner): raise NotImplementedError
    def update_prefs(self, owner, patch): raise NotImplementedError
    def delete_owner(self, owner): raise NotImplementedError
    def list_tasks(self, owner): raise NotImplementedError
    def create_tasks(self, owner, items): raise NotImplementedError
    def update_task(self, owner, task_id, patch): raise NotImplementedError
    def delete_task(self, owner, task_id): raise NotImplementedError
    def add_subtask(self, owner, task_id, title): raise NotImplementedError
    def update_subtask(self, owner, task_id, subtask_id, patch): raise NotImplementedError
    def delete_subtask(self, owner, task_id, subtask_id): raise NotImplementedError
    def cleanup(self, now=None): raise NotImplementedError
