import express from 'express';
import path from 'node:path';
import * as db from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_TITLE = 200;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(import.meta.dirname, 'public')));

// --- 입력값 검사: 화면이 보낸 값은 믿지 않고 여기서 다시 확인한다 ---

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '잘못된 번호입니다.');
  return id;
}

function parseTitle(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new HttpError(400, '제목을 입력하세요.');
  const title = value.trim();
  if (title.length > MAX_TITLE) throw new HttpError(400, `제목은 ${MAX_TITLE}자까지 쓸 수 있습니다.`);
  return title;
}

// 마감일은 필수이고 오늘 이후만 가능
function parseDueDate(value) {
  if (value === undefined || value === null || value === '') throw new HttpError(400, '날짜를 등록해주세요.');
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(value + 'T00:00:00Z'))
    || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, '마감일 형식이 올바르지 않습니다.');
  }
  if (value < localToday()) throw new HttpError(400, '지난 날짜는 등록할 수 없습니다.');
  return value;
}

function parseCompleted(value) {
  if (typeof value !== 'boolean') throw new HttpError(400, 'completed는 true/false여야 합니다.');
  return value;
}

// 서버 컴퓨터 기준 오늘 날짜 (YYYY-MM-DD)
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// --- API ---

app.get('/api/todos', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_TITLE) : '';
  const dueDate = req.query.today === '1' ? localToday() : null;
  res.json({ today: localToday(), todos: db.listTodos({ q, dueDate }) });
});

app.post('/api/todos', (req, res) => {
  const title = parseTitle(req.body?.title);
  const dueDate = parseDueDate(req.body?.due_date);
  if (db.hasOpenTodoWithTitle(title)) throw new HttpError(409, '같은 이름의 할 일이 이미 있습니다.');
  const id = db.createTodo({ title, dueDate });
  res.status(201).json({ id });
});

app.patch('/api/todos/:id', (req, res) => {
  const id = parseId(req.params.id);
  const completed = parseCompleted(req.body?.completed);
  const todo = db.getTodo(id);
  if (!todo) throw new HttpError(404, '할 일을 찾을 수 없습니다.');

  // 완료된 Todo를 되살릴 때 같은 이름의 미완료 Todo가 있으면 중복이 된다
  if (!completed && db.hasOpenTodoWithTitle(todo.title, id)) {
    throw new HttpError(409, '같은 이름의 할 일이 이미 있어서 되돌릴 수 없습니다.');
  }
  if (completed && req.body?.force !== true) {
    const openTasks = db.countOpenTasks(id);
    if (openTasks > 0) {
      throw new HttpError(409, `완료하지 않은 태스크가 ${openTasks}개 있습니다.`, { open_tasks: openTasks });
    }
  }
  db.setTodoCompleted(id, completed);
  res.status(204).end();
});

app.delete('/api/todos/:id', (req, res) => {
  if (!db.deleteTodo(parseId(req.params.id))) throw new HttpError(404, '할 일을 찾을 수 없습니다.');
  res.status(204).end();
});

app.post('/api/todos/:id/tasks', (req, res) => {
  const todoId = parseId(req.params.id);
  const title = parseTitle(req.body?.title);
  const todo = db.getTodo(todoId);
  if (!todo) throw new HttpError(404, '할 일을 찾을 수 없습니다.');
  if (todo.completed === 1) throw new HttpError(409, '완료된 할 일에는 태스크를 추가할 수 없습니다.');
  if (db.hasTaskWithTitle(todoId, title)) throw new HttpError(409, '이 할 일에 같은 이름의 태스크가 이미 있습니다.');
  const id = db.createTask({ todoId, title });
  res.status(201).json({ id });
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = parseId(req.params.id);
  const completed = parseCompleted(req.body?.completed);
  const task = db.getTask(id);
  if (!task) throw new HttpError(404, '태스크를 찾을 수 없습니다.');

  // 태스크를 되돌리면 완료된 Todo도 되살아나므로 같은 중복 검사를 한다
  if (!completed) {
    const todo = db.getTodo(task.todo_id);
    if (todo.completed === 1 && db.hasOpenTodoWithTitle(todo.title, todo.id)) {
      throw new HttpError(409, '같은 이름의 할 일이 이미 있어서 되돌릴 수 없습니다.');
    }
  }
  db.setTaskCompleted(id, completed);
  res.status(204).end();
});

app.delete('/api/tasks/:id', (req, res) => {
  if (!db.deleteTask(parseId(req.params.id))) throw new HttpError(404, '태스크를 찾을 수 없습니다.');
  res.status(204).end();
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: '없는 API입니다.' });
});

// 에러 응답: 내부 에러 내용은 화면에 보내지 않는다
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
  console.error(err);
  res.status(500).json({ error: '서버에서 문제가 생겼습니다.' });
});

// --- 90일 지난 완료 항목 자동 삭제 ---

function cleanup() {
  const removed = db.deleteExpiredTodos();
  if (removed > 0) console.log(`완료 후 90일 지난 할 일 ${removed}개를 삭제했습니다.`);
}
cleanup();
setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();

app.listen(PORT, () => {
  console.log(`Task Hive: http://localhost:${PORT}`);
});
