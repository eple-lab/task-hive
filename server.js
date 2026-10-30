import express from 'express';
import path from 'node:path';
import * as db from './db.js';
import { assertSupabaseConfig, createSupabase } from './supabase.js';

assertSupabaseConfig();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_TITLE = 200;
const UNIQUE_VIOLATION = '23505';   // Postgres 에러 코드: UNIQUE 색인 위반 (중복 제목)

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

function parseEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new HttpError(400, '이메일 형식이 올바르지 않습니다.');
  }
  return value.trim().toLowerCase();
}

function parsePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72) {
    throw new HttpError(400, '비밀번호는 8~72자로 입력하세요.');
  }
  return value;
}

// 서버 컴퓨터 기준 오늘 날짜 (YYYY-MM-DD)
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// DB가 중복 제목을 거절하면 상황에 맞는 문구로 409를 돌려준다
async function onDuplicate(message, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof db.DbError && err.code === UNIQUE_VIOLATION) throw new HttpError(409, message);
    throw err;
  }
}

// --- 로그인 (Supabase Auth) ---
// 비밀번호 저장·확인과 토큰 발급은 Supabase Auth가 한다. 서버는 결과 토큰을 httpOnly 쿠키로만 주고받는다.

function authError(error) {
  const known = {
    invalid_credentials: [400, '이메일 또는 비밀번호가 올바르지 않습니다.'],
    email_not_confirmed: [400, '이메일 인증을 먼저 완료해 주세요. 받은 편지함을 확인하세요.'],
    user_already_exists: [409, '이미 가입된 이메일입니다.'],
    weak_password: [400, '비밀번호가 너무 약합니다. 더 길고 복잡하게 만들어 주세요.'],
    email_address_invalid: [400, '사용할 수 없는 이메일 주소입니다.'],
    signup_disabled: [403, '지금은 회원가입을 받지 않습니다.'],
    over_request_rate_limit: [429, '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'],
    over_email_send_rate_limit: [429, '인증 메일을 너무 많이 보냈습니다. 잠시 후 다시 시도하세요.'],
  }[error.code];
  if (known) return new HttpError(...known);
  // 네트워크 문제나 Supabase 프로젝트 일시정지(1주 미사용)
  if (error.name === 'AuthRetryableFetchError') {
    return new HttpError(503, 'Supabase에 연결하지 못했습니다. 프로젝트가 일시정지됐는지 대시보드에서 확인하세요.');
  }
  console.error('Supabase Auth 에러:', error.code, error.message);
  return new HttpError(400, '요청을 처리하지 못했습니다.');
}

app.get('/api/auth/me', async (req, res) => {
  const { data: { user } } = await createSupabase(req, res).auth.getUser();
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  res.json({ email: user.email });
});

app.post('/api/auth/signup', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = parsePassword(req.body?.password);
  const { data, error } = await createSupabase(req, res).auth.signUp({ email, password });
  if (error) throw authError(error);
  // 이메일 인증이 켜져 있으면 세션 없이 돌아온다 → 메일 인증 후 로그인
  res.status(201).json({ email, needs_confirmation: !data.session });
});

app.post('/api/auth/login', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { error } = await createSupabase(req, res).auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
  res.json({ email });
});

app.post('/api/auth/logout', async (req, res) => {
  await createSupabase(req, res).auth.signOut();
  res.status(204).end();
});

// 여기부터는 로그인한 사용자만. req.sb는 그 사용자로 접속한 Supabase 클라이언트(RLS 적용)
async function requireUser(req, res, next) {
  const sb = createSupabase(req, res);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  req.sb = sb;
  next();
}
app.use(['/api/todos', '/api/tasks'], requireUser);

// --- 할 일·태스크 API ---

app.get('/api/todos', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_TITLE) : '';
  const dueDate = req.query.today === '1' ? localToday() : null;
  await db.deleteExpiredTodos(req.sb);   // 완료 후 90일 지난 이 사용자의 할 일 정리
  res.json({ today: localToday(), todos: await db.listTodos(req.sb, { q, dueDate }) });
});

app.post('/api/todos', async (req, res) => {
  const title = parseTitle(req.body?.title);
  const dueDate = parseDueDate(req.body?.due_date);
  const id = await onDuplicate('같은 이름의 할 일이 이미 있습니다.',
    () => db.createTodo(req.sb, { title, dueDate }));
  res.status(201).json({ id });
});

app.patch('/api/todos/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const completed = parseCompleted(req.body?.completed);
  if (!await db.getTodo(req.sb, id)) throw new HttpError(404, '할 일을 찾을 수 없습니다.');

  if (completed && req.body?.force !== true) {
    const openTasks = await db.countOpenTasks(req.sb, id);
    if (openTasks > 0) {
      throw new HttpError(409, `완료하지 않은 태스크가 ${openTasks}개 있습니다.`, { open_tasks: openTasks });
    }
  }
  // 완료된 할 일을 되살릴 때 같은 이름의 미완료 할 일이 있으면 DB가 거절한다
  await onDuplicate('같은 이름의 할 일이 이미 있어서 되돌릴 수 없습니다.',
    () => db.setTodoCompleted(req.sb, id, completed));
  res.status(204).end();
});

app.delete('/api/todos/:id', async (req, res) => {
  if (!await db.deleteTodo(req.sb, parseId(req.params.id))) throw new HttpError(404, '할 일을 찾을 수 없습니다.');
  res.status(204).end();
});

app.post('/api/todos/:id/tasks', async (req, res) => {
  const todoId = parseId(req.params.id);
  const title = parseTitle(req.body?.title);
  const todo = await db.getTodo(req.sb, todoId);
  if (!todo) throw new HttpError(404, '할 일을 찾을 수 없습니다.');
  if (todo.completed) throw new HttpError(409, '완료된 할 일에는 태스크를 추가할 수 없습니다.');
  const id = await onDuplicate('이 할 일에 같은 이름의 태스크가 이미 있습니다.',
    () => db.createTask(req.sb, { todoId, title }));
  res.status(201).json({ id });
});

app.patch('/api/tasks/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const completed = parseCompleted(req.body?.completed);
  if (!await db.getTask(req.sb, id)) throw new HttpError(404, '태스크를 찾을 수 없습니다.');
  // 태스크를 되돌리면 완료된 할 일도 되살아나므로 같은 중복 검사가 걸린다
  await onDuplicate('같은 이름의 할 일이 이미 있어서 되돌릴 수 없습니다.',
    () => db.setTaskCompleted(req.sb, id, completed));
  res.status(204).end();
});

app.delete('/api/tasks/:id', async (req, res) => {
  if (!await db.deleteTask(req.sb, parseId(req.params.id))) throw new HttpError(404, '태스크를 찾을 수 없습니다.');
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

app.listen(PORT, () => {
  console.log(`Task Hive: http://localhost:${PORT}`);
});
