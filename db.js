// DB 접근 코드는 전부 이 파일에만 둔다.
// 길 B: Supabase(Postgres). 모든 함수는 "로그인한 사용자의 Supabase 클라이언트"(sb)를 받는다.
// 그래서 RLS가 그 사용자 기준으로 적용되어, 남의 행은 보이지도 바뀌지도 않는다.
// 표와 규칙 정의는 db/supabase/01_schema.sql. (길 A의 SQLite 버전은 path-a 태그)

const AUTO_DELETE_DAYS = 90;

// Supabase 에러에 Postgres 에러 코드(code)를 붙여서 던진다 (예: 23505 = UNIQUE 위반)
export class DbError extends Error {
  constructor(error) {
    super(error.message);
    this.code = error.code;
  }
}

function unwrap({ data, error, count }) {
  if (error) throw new DbError(error);
  return count ?? data;
}

function deleteOn(completedAt) {
  if (!completedAt) return null;
  const d = new Date(completedAt);
  d.setUTCDate(d.getUTCDate() + AUTO_DELETE_DAYS);
  return d.toISOString().slice(0, 10);
}

export async function listTodos(sb, { q = '', dueDate = null } = {}) {
  // 미완료 먼저, 그다음 마감일 빠른 순(마감일 없는 건 뒤로), 최신 등록 순. 태스크는 등록 순
  let query = sb.from('todos')
    .select('id, title, due_date, completed, completed_at, created_at, tasks (id, todo_id, title, completed)')
    .order('completed')
    .order('due_date', { nullsFirst: false })
    .order('id', { ascending: false })
    .order('id', { referencedTable: 'tasks' });
  if (dueDate) query = query.eq('due_date', dueDate);
  const todos = unwrap(await query);

  // 검색: 할 일 제목 또는 태스크 제목. RLS로 자기 할 일만 받아 왔으므로 서버에서 거른다
  const needle = q.toLowerCase();
  return todos
    .filter((t) => !needle || t.title.toLowerCase().includes(needle)
      || t.tasks.some((s) => s.title.toLowerCase().includes(needle)))
    .map((t) => ({ ...t, delete_on: deleteOn(t.completed_at) }));
}

export async function getTodo(sb, id) {
  return unwrap(await sb.from('todos').select('id, title, completed').eq('id', id).maybeSingle());
}

export async function getTask(sb, id) {
  return unwrap(await sb.from('tasks').select('id, todo_id, completed').eq('id', id).maybeSingle());
}

export async function countOpenTasks(sb, todoId) {
  return unwrap(await sb.from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('todo_id', todoId)
    .eq('completed', false));
}

// user_id는 DB가 로그인한 사용자(auth.uid())로 채운다
export async function createTodo(sb, { title, dueDate }) {
  return unwrap(await sb.from('todos').insert({ title, due_date: dueDate }).select('id').single()).id;
}

export async function createTask(sb, { todoId, title }) {
  return unwrap(await sb.from('tasks').insert({ todo_id: todoId, title }).select('id').single()).id;
}

// 할 일과 태스크를 함께 바꾸는 작업은 DB 함수 안에서 한 번에 처리한다 (01_schema.sql)
export async function setTodoCompleted(sb, id, completed) {
  unwrap(await sb.rpc('set_todo_completed', { p_todo_id: id, p_completed: completed }));
}

export async function setTaskCompleted(sb, id, completed) {
  unwrap(await sb.rpc('set_task_completed', { p_task_id: id, p_completed: completed }));
}

export async function deleteTodo(sb, id) {
  return unwrap(await sb.from('todos').delete().eq('id', id).select('id')).length > 0;
}

export async function deleteTask(sb, id) {
  return unwrap(await sb.from('tasks').delete().eq('id', id).select('id')).length > 0;
}

// 완료 후 90일 지난 할 일 삭제 (태스크는 CASCADE로 함께). RLS 때문에 이 사용자의 것만 지워진다
export async function deleteExpiredTodos(sb) {
  const cutoff = new Date(Date.now() - AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return unwrap(await sb.from('todos').delete().eq('completed', true).lte('completed_at', cutoff).select('id')).length;
}
