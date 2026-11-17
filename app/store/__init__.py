"""저장소 계층.

    base.py      저장소가 제공해야 하는 함수 목록과 규칙 오류
    hive.py      벌집 좌표 계산 (가운데부터 바깥 고리로)
    memory.py    메모리 구현 (DATABASE_URL이 없을 때, D-26)
    postgres.py  Neon 구현 자리 (2단계)
    migrations/  표·RLS SQL

create_store(settings)가 설정을 보고 알맞은 구현을 고른다(todo의 db.js, honey의 store.py와 같은 방식).
"""

from app.config import Settings
from app.store.base import Store


def create_store(settings: Settings) -> Store:
    if settings.database_url:
        from app.store.postgres import PostgresStore

        return PostgresStore(settings)
    from app.store.memory import MemoryStore

    return MemoryStore(settings)
