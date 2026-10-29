// 데모 모드: GitHub Pages처럼 서버가 없는 곳에서 화면을 보여 주기 위한 "브라우저 안의 가짜 백엔드".
// server.js와 같은 주소·규칙으로 응답하지만, 데이터는 메모리에만 있어서 새로고침하면 처음 상태로 돌아간다.
// 진짜 앱(npm start)에서는 쓰이지 않는다.

export const isDemo = location.hostname.endsWith('github.io')
  || new URLSearchParams(location.search).has('demo');

const AUTO_DELETE_DAYS = 90;
const MAX_TITLE = 200;

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// --- 메모리 속 데이터 ---

let nextTodoId = 1;
let nextTaskId = 1;
const todos = [];

function addTodo(title, dueDate) {
  const todo = { id: nextTodoId++, title, due_date: dueDate, completed: false, completed_at: null, created_at: nowIso(), tasks: [] };
  todos.push(todo);
  return todo;
}

function addTask(todo, title, completed = false) {
  const task = { id: nextTaskId++, todo_id: todo.id, title, completed, completed_at: completed ? nowIso() : null };
  todo.tasks.push(task);
  return task;
}

function completeTodo(todo) {
  todo.completed = true;
  todo.completed_at = nowIso();
  for (const t of todo.tasks) {
    if (!t.completed) Object.assign(t, { completed: true, completed_at: nowIso() });
  }
}

// 테스트 데이터
{
  const review = addTodo('개발 환경 설정 복습', localDate(0));
  addTask(review, 'Node.js 설치 확인');
  addTask(review, 'VS Code 확장 정리');
  completeTodo(review);

  addTodo('장보기', localDate(5));

  const hw = addTodo('Todo 앱 과제 제출', localDate(6));
  addTask(hw, 'PRD.md 작성', true);
  addTask(hw, '로컬 SQLite 저장 확인', true);
  addTask(hw, 'Supabase 전환 + RLS 확인');
  addTask(hw, '시연 영상 녹화');

  const lecture = addTodo('백엔드 강의 복습', localDate(0));
  addTask(lecture, 'CRUD와 API 정리', true);
  addTask(lecture, 'SQL 주입 방어 다시 보기');
}

// --- 규칙 (server.js와 동일) ---

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function parseTitle(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new HttpError(400, '제목을 입력하세요.');
  const title = value.trim();
  if (title.length > MAX_TITLE) throw new HttpError(400, `제목은 ${MAX_TITLE}자까지 쓸 수 있습니다.`);
  return title;
}

function parseDueDate(value) {
  if (!value) throw new HttpError(400, '날짜를 등록해주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, '마감일 형식이 올바르지 않습니다.');
  if (value < localDate()) throw new HttpError(400, '지난 날짜는 등록할 수 없습니다.');
  return value;
}

const sameTitle = (a, b) => a.toLowerCase() === b.toLowerCase();
const hasOpenTodoWithTitle = (title, excludeId = 0) =>
  todos.some((t) => !t.completed && t.id !== excludeId && sameTitle(t.title, title));

function findTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) throw new HttpError(404, '할 일을 찾을 수 없습니다.');
  return todo;
}

function findTask(id) {
  for (const todo of todos) {
    const task = todo.tasks.find((t) => t.id === id);
    if (task) return { todo, task };
  }
  throw new HttpError(404, '태스크를 찾을 수 없습니다.');
}

function withDeleteOn(todo) {
  let deleteOn = null;
  if (todo.completed_at) {
    const d = new Date(todo.completed_at.replace(' ', 'T') + 'Z');
    d.setUTCDate(d.getUTCDate() + AUTO_DELETE_DAYS);
    deleteOn = d.toISOString().slice(0, 10);
  }
  return structuredClone({ ...todo, delete_on: deleteOn });
}

function listTodos(q, dueDate) {
  const needle = q.toLowerCase();
  return todos
    .filter((t) => !needle || t.title.toLowerCase().includes(needle)
      || t.tasks.some((s) => s.title.toLowerCase().includes(needle)))
    .filter((t) => !dueDate || t.due_date === dueDate)
    .sort((a, b) => (a.completed - b.completed)
      || ((a.due_date === null) - (b.due_date === null))
      || (a.due_date ?? '').localeCompare(b.due_date ?? '')
      || (b.id - a.id))
    .map(withDeleteOn);
}

// --- 주소별 처리 ---

function handle(method, path, query, body) {
  let m;
  if (method === 'GET' && path === '/api/todos') {
    const q = (query.get('q') || '').trim();
    const dueDate = query.get('today') === '1' ? localDate() : null;
    return [200, { today: localDate(), todos: listTodos(q, dueDate) }];
  }
  if (method === 'POST' && path === '/api/todos') {
    const title = parseTitle(body?.title);
    const dueDate = parseDueDate(body?.due_date);
    if (hasOpenTodoWithTitle(title)) throw new HttpError(409, '같은 이름의 할 일이 이미 있습니다.');
    return [201, { id: addTodo(title, dueDate).id }];
  }
  if ((m = path.match(/^\/api\/todos\/(\d+)$/))) {
    const todo = findTodo(Number(m[1]));
    if (method === 'DELETE') {
      todos.splice(todos.indexOf(todo), 1);
      return [204, null];
    }
    if (method === 'PATCH') {
      const completed = body?.completed;
      if (typeof completed !== 'boolean') throw new HttpError(400, 'completed는 true/false여야 합니다.');
      if (!completed) {
        if (hasOpenTodoWithTitle(todo.title, todo.id)) throw new HttpError(409, '같은 이름의 할 일이 이미 있어서 되돌릴 수 없습니다.');
        Object.assign(todo, { completed: false, completed_at: null });
        return [204, null];
      }
      const openTasks = todo.tasks.filter((t) => !t.completed).length;
      if (openTasks > 0 && body?.force !== true) {
        throw new HttpError(409, `완료하지 않은 태스크가 ${openTasks}개 있습니다.`, { open_tasks: openTasks });
      }
      if (!todo.completed) completeTodo(todo);
      return [204, null];
    }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/todos\/(\d+)\/tasks$/))) {
    const todo = findTodo(Number(m[1]));
    const title = parseTitle(body?.title);
    if (todo.completed) throw new HttpError(409, '완료된 할 일에는 태스크를 추가할 수 없습니다.');
    if (todo.tasks.some((t) => sameTitle(t.title, title))) throw new HttpError(409, '이 할 일에 같은 이름의 태스크가 이미 있습니다.');
    return [201, { id: addTask(todo, title).id }];
  }
  if ((m = path.match(/^\/api\/tasks\/(\d+)$/))) {
    const { todo, task } = findTask(Number(m[1]));
    if (method === 'DELETE') {
      todo.tasks.splice(todo.tasks.indexOf(task), 1);
      return [204, null];
    }
    if (method === 'PATCH') {
      const completed = body?.completed;
      if (typeof completed !== 'boolean') throw new HttpError(400, 'completed는 true/false여야 합니다.');
      if (completed) {
        if (!task.completed) Object.assign(task, { completed: true, completed_at: nowIso() });
      } else {
        if (todo.completed && hasOpenTodoWithTitle(todo.title, todo.id)) {
          throw new HttpError(409, '같은 이름의 할 일이 이미 있어서 되돌릴 수 없습니다.');
        }
        Object.assign(task, { completed: false, completed_at: null });
        Object.assign(todo, { completed: false, completed_at: null });
      }
      return [204, null];
    }
  }
  throw new HttpError(404, '없는 API입니다.');
}

// fetch와 같은 모양(Response)으로 돌려준다
export async function demoFetch(method, url, body) {
  const { pathname, searchParams } = new URL(url, 'http://demo.local');
  try {
    const [status, data] = handle(method, pathname, searchParams, body);
    return new Response(data === null ? null : JSON.stringify(data), { status });
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    return new Response(JSON.stringify({ error: err.message, ...err.extra }), { status: err.status });
  }
}
