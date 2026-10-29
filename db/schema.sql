-- Task Hive DB 구조 (SQLite)
-- 앱 시작 시 매번 실행해도 안전하도록 IF NOT EXISTS 사용.
-- 날짜/시각은 TEXT로 저장: 날짜는 'YYYY-MM-DD', 시각은 'YYYY-MM-DD HH:MM:SS'(UTC).

-- SQLite는 외래키 검사가 기본으로 꺼져 있다. 연결할 때마다 켜야 한다.
PRAGMA foreign_keys = ON;

-- 큰 할 일
CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  due_date     TEXT    CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed    INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at TEXT,   -- 완료 시각. 90일 자동 삭제 기준. 미완료면 NULL
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  -- 완료 여부와 완료 시각이 서로 어긋나지 않게
  CHECK ((completed = 1) = (completed_at IS NOT NULL))
);

-- 하위 태스크: 반드시 하나의 Todo에 속한다
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id      INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  completed    INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK ((completed = 1) = (completed_at IS NOT NULL))
);

-- 자주 찾는 조건에 색인
CREATE INDEX IF NOT EXISTS idx_tasks_todo_id ON tasks(todo_id);              -- Todo별 태스크 목록
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);            -- 오늘 할 일만 보기
CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at);    -- 90일 자동 삭제
