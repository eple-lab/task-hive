// 길 A: 내 컴퓨터의 SQLite 파일(data/todo.db). 로그인 없이 혼자 쓰는 모드.
// 함수 이름과 인자는 db/supabase.js와 같다. 첫 인자 sb는 Supabase용이라 여기서는 쓰지 않는다.
// 표 정의는 db/schema.sql
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AUTO_DELETE_DAYS, DbError, UNIQUE_VIOLATION } from './common.js';

export { DbError };

const projectDir = path.resolve(import.meta.dirname, '..');
const dbPath = path.resolve(projectDir, process.env.DB_PATH || 'data/todo.db');

mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8'));

// 여러 쿼리를 "전부 되거나, 전부 안 되거나"로 묶는다
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// 중복 제목은 Supabase의 UNIQUE 색인과 같은 에러 코드로 알린다
function duplicate() {
  return new DbError({ code: UNIQUE_VIOLATION, message: 'duplicate title' });
}

// LIKE 검색에서 %, _ 를 글자 그대로 찾도록 이스케이프
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

function toTodo(row) {
  return {
    id: row.id,
    title: row.title,
    due_date: row.due_date,
    completed: row.completed === 1,
    completed_at: row.completed_at,
    delete_on: row.delete_on,
    created_at: row.created_at,
    tasks: [],
  };
}

function toTask(row) {
  return {
    id: row.id,
    todo_id: row.todo_id,
    title: row.title,
    completed: row.completed === 1,
  };
}

// 미완료 Todo 중 같은 제목(대소문자 무시)이 있는지. excludeId는 자기 자신 제외용
function hasOpenTodoWithTitle(title, excludeId = 0) {
  return db.prepare(`
    SELECT 1 FROM todos WHERE completed = 0 AND lower(title) = lower(?) AND id <> ?
  `).get(title, excludeId) !== undefined;
}

// 완료된 Todo를 되살릴 때 같은 이름의 미완료 Todo가 있으면 중복이 된다
function assertCanReopen(todoId) {
  const todo = db.prepare('SELECT title, completed FROM todos WHERE id = ?').get(todoId);
  if (todo?.completed === 1 && hasOpenTodoWithTitle(todo.title, todoId)) throw duplicate();
}

export function listTodos(sb, { q = '', dueDate = null } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push(`(t.title LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM tasks s WHERE s.todo_id = t.id AND s.title LIKE ? ESCAPE '\\'))`);
    params.push(likePattern(q), likePattern(q));
  }
  if (dueDate) {
    where.push('t.due_date = ?');
    params.push(dueDate);
  }

  // 미완료 먼저, 그다음 마감일 빠른 순(마감일 없는 건 뒤로), 최신 등록 순
  const todos = db.prepare(`
    SELECT t.*, date(t.completed_at, '+${AUTO_DELETE_DAYS} days') AS delete_on
    FROM todos t
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.completed, t.due_date IS NULL, t.due_date, t.id DESC
  `).all(...params).map(toTodo);

  if (todos.length === 0) return todos;

  const byId = new Map(todos.map((t) => [t.id, t]));
  const placeholders = todos.map(() => '?').join(',');
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE todo_id IN (${placeholders}) ORDER BY id
  `).all(...byId.keys());
  for (const row of tasks) byId.get(row.todo_id).tasks.push(toTask(row));

  return todos;
}

export function getTodo(sb, id) {
  const row = db.prepare('SELECT id, title, completed FROM todos WHERE id = ?').get(id);
  return row ? { ...row, completed: row.completed === 1 } : null;
}

export function getTask(sb, id) {
  const row = db.prepare('SELECT id, todo_id, completed FROM tasks WHERE id = ?').get(id);
  return row ? { ...row, completed: row.completed === 1 } : null;
}

export function countOpenTasks(sb, todoId) {
  return db.prepare('SELECT count(*) AS n FROM tasks WHERE todo_id = ? AND completed = 0')
    .get(todoId).n;
}

export function createTodo(sb, { title, dueDate }) {
  return transaction(() => {
    if (hasOpenTodoWithTitle(title)) throw duplicate();
    const { lastInsertRowid } = db.prepare('INSERT INTO todos (title, due_date) VALUES (?, ?)')
      .run(title, dueDate);
    return Number(lastInsertRowid);
  });
}

export function createTask(sb, { todoId, title }) {
  return transaction(() => {
    if (db.prepare('SELECT 1 FROM tasks WHERE todo_id = ? AND lower(title) = lower(?)').get(todoId, title)) {
      throw duplicate();
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO tasks (todo_id, title) VALUES (?, ?)')
      .run(todoId, title);
    return Number(lastInsertRowid);
  });
}

// Todo 완료 시 남은 태스크도 함께 완료한다
export function setTodoCompleted(sb, id, completed) {
  transaction(() => {
    if (completed) {
      db.prepare(`
        UPDATE todos SET completed = 1, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND completed = 0
      `).run(id);
      db.prepare(`
        UPDATE tasks SET completed = 1, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE todo_id = ? AND completed = 0
      `).run(id);
    } else {
      assertCanReopen(id);
      db.prepare(`
        UPDATE todos SET completed = 0, completed_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(id);
    }
  });
}

// 태스크를 미완료로 되돌리면 완료돼 있던 Todo도 미완료로 돌아간다
export function setTaskCompleted(sb, id, completed) {
  transaction(() => {
    if (completed) {
      db.prepare(`
        UPDATE tasks SET completed = 1, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND completed = 0
      `).run(id);
    } else {
      const task = db.prepare('SELECT todo_id FROM tasks WHERE id = ?').get(id);
      if (task) assertCanReopen(task.todo_id);
      db.prepare(`
        UPDATE tasks SET completed = 0, completed_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(id);
      db.prepare(`
        UPDATE todos SET completed = 0, completed_at = NULL, updated_at = datetime('now')
        WHERE id = (SELECT todo_id FROM tasks WHERE id = ?) AND completed = 1
      `).run(id);
    }
  });
}

export function deleteTodo(sb, id) {
  return db.prepare('DELETE FROM todos WHERE id = ?').run(id).changes > 0;
}

export function deleteTask(sb, id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

// 완료 후 90일 지난 Todo 삭제 (태스크는 CASCADE로 함께 삭제)
export function deleteExpiredTodos(sb) {
  return db.prepare(`
    DELETE FROM todos
    WHERE completed = 1 AND completed_at <= datetime('now', '-${AUTO_DELETE_DAYS} days')
  `).run().changes;
}
