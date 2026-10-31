// RLS 확인 스크립트: 계정 B가 계정 A의 할 일을 보거나 바꾸거나 지울 수 없는지 확인한다.
//
// 준비
//   1. 앱에서 테스트 계정 두 개를 회원가입한다.
//   2. .env에 두 계정을 적는다 (.env는 Git에 올라가지 않는다)
//        RLS_TEST_A_EMAIL=...   RLS_TEST_A_PASSWORD=...
//        RLS_TEST_B_EMAIL=...   RLS_TEST_B_PASSWORD=...
//   3. 서버를 켠 상태에서 다른 터미널에서 실행: npm run check:rls
//
// 두 가지 길로 확인한다
//   - 우리 서버(API)를 통해서: 서버 규칙 + RLS
//   - Supabase에 직접: 서버를 거치지 않아도 RLS가 막는지 (진짜 방어선)
// 확인용으로 A 계정에 할 일 하나를 만들고, 끝나면 지운다.
import { createClient } from '@supabase/supabase-js';

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const env = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`.env에 ${name}이(가) 없습니다. 파일 맨 위 설명을 확인하세요.`);
    process.exit(1);
  }
  return value;
};
const A = { email: env('RLS_TEST_A_EMAIL'), password: env('RLS_TEST_A_PASSWORD') };
const B = { email: env('RLS_TEST_B_EMAIL'), password: env('RLS_TEST_B_PASSWORD') };

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  (${detail})`);
}

// 우리 서버에 로그인하고 쿠키를 들고 다니는 간단한 클라이언트
async function serverSession({ email, password }) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`${email} 로그인 실패: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return async (method, path, body) => {
    const r = await fetch(BASE + path, {
      method,
      headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: r.status === 204 ? null : await r.json() };
  };
}

async function directClient({ email, password }) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email} Supabase 직접 로그인 실패: ${error.message}`);
  return sb;
}

const today = new Date().toLocaleDateString('sv-SE');
const marker = `RLS 확인용 ${Date.now()}`;

const apiA = await serverSession(A);
const apiB = await serverSession(B);
console.log(`서버: ${BASE}\n`);

// A가 할 일과 태스크를 만든다
const created = await apiA('POST', '/api/todos', { title: marker, due_date: today });
if (created.status !== 201) throw new Error(`A의 할 일 만들기 실패: ${created.status} ${JSON.stringify(created.data)}`);
const todoId = created.data.id;
const task = await apiA('POST', `/api/todos/${todoId}/tasks`, { title: 'A의 태스크' });
const taskId = task.data.id;
console.log(`A가 할 일 #${todoId}, 태스크 #${taskId} 생성\n`);

try {
  // --- 우리 서버를 통해서 ---
  const listB = await apiB('GET', '/api/todos');
  check('[서버] B의 목록에 A의 할 일이 없다', !listB.data.todos.some((t) => t.id === todoId), `B가 받은 할 일 ${listB.data.todos.length}개`);

  const searchB = await apiB('GET', `/api/todos?q=${encodeURIComponent(marker)}`);
  check('[서버] B가 A의 제목으로 검색해도 안 나온다', searchB.data.todos.length === 0, `${searchB.data.todos.length}건`);

  const patchB = await apiB('PATCH', `/api/todos/${todoId}`, { completed: true, force: true });
  check('[서버] B가 A의 할 일 완료 처리 → 거절', patchB.status === 404, `HTTP ${patchB.status}`);

  const taskPatchB = await apiB('PATCH', `/api/tasks/${taskId}`, { completed: true });
  check('[서버] B가 A의 태스크 완료 처리 → 거절', taskPatchB.status === 404, `HTTP ${taskPatchB.status}`);

  const addTaskB = await apiB('POST', `/api/todos/${todoId}/tasks`, { title: 'B가 끼워 넣은 태스크' });
  check('[서버] B가 A의 할 일에 태스크 추가 → 거절', addTaskB.status === 404, `HTTP ${addTaskB.status}`);

  const delTaskB = await apiB('DELETE', `/api/tasks/${taskId}`);
  check('[서버] B가 A의 태스크 삭제 → 거절', delTaskB.status === 404, `HTTP ${delTaskB.status}`);

  const delB = await apiB('DELETE', `/api/todos/${todoId}`);
  check('[서버] B가 A의 할 일 삭제 → 거절', delB.status === 404, `HTTP ${delB.status}`);

  // --- Supabase에 직접 (서버를 거치지 않는 공격 흉내) ---
  const sbB = await directClient(B);

  const sel = await sbB.from('todos').select('id').eq('id', todoId);
  check('[직접] B가 A의 할 일 조회 → 0행', !sel.error && sel.data.length === 0, sel.error?.message ?? `${sel.data.length}행`);

  const upd = await sbB.from('todos').update({ title: 'B가 바꾼 제목' }).eq('id', todoId).select('id');
  check('[직접] B가 A의 할 일 제목 수정 → 0행', !upd.error && upd.data.length === 0, upd.error?.message ?? `${upd.data.length}행`);

  const del = await sbB.from('todos').delete().eq('id', todoId).select('id');
  check('[직접] B가 A의 할 일 삭제 → 0행', !del.error && del.data.length === 0, del.error?.message ?? `${del.data.length}행`);

  const ins = await sbB.from('tasks').insert({ todo_id: todoId, title: 'B가 직접 넣은 태스크' });
  check('[직접] B가 A의 할 일에 태스크 추가 → RLS 거절', Boolean(ins.error), ins.error?.message ?? '들어가 버림');

  const rpc = await sbB.rpc('set_todo_completed', { p_todo_id: todoId, p_completed: true });
  check('[직접] B가 완료 함수로 A의 할 일 완료 → 효과 없음', !rpc.error, rpc.error?.message ?? '에러 없이 0행 처리');

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const anonSel = await anon.from('todos').select('id').limit(1);
  check('[직접] 로그인 안 한 사용자의 조회 → 거절', Boolean(anonSel.error) || anonSel.data.length === 0, anonSel.error?.message ?? `${anonSel.data.length}행`);

  // --- A의 할 일이 그대로인지 ---
  const listA = await apiA('GET', `/api/todos?q=${encodeURIComponent(marker)}`);
  const mine = listA.data.todos.find((t) => t.id === todoId);
  check('[확인] A의 할 일이 그대로 있다', Boolean(mine) && mine.title === marker && !mine.completed,
    mine ? `제목 그대로, 완료=${mine.completed}` : '사라짐');
  check('[확인] A의 태스크도 그대로 1개', mine?.tasks.length === 1 && !mine.tasks[0].completed,
    mine ? `태스크 ${mine.tasks.length}개` : '-');
} finally {
  await apiA('DELETE', `/api/todos/${todoId}`);
  console.log(`\nA의 확인용 할 일 #${todoId} 삭제(정리)`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
