// 기본 기능 자동 테스트 (2026-10-31 추가): npm test
// 임시 DB 파일로 SQLite 모드 서버를 띄워 API를 확인한다. 진짜 data/todo.db와 Supabase는 건드리지 않는다.
// Supabase 모드의 사용자별 분리(RLS)는 npm run check:rls (실제 계정 필요)로 따로 확인한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'todo-test-'));
const dbPath = path.join(tmp, 'test.db');
let port;
let server;
let base;

function freePort() {
  return new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port: p } = s.address();
      s.close(() => resolve(p));
    });
  });
}

async function startServer() {
  // Supabase 정보를 빼서 반드시 SQLite 모드로 켠다
  const env = { ...process.env, PORT: String(port), DB_PATH: dbPath };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  delete env.SUPABASE_ANON_KEY;
  server = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'ignore' });
  // 서버가 켜지는 데 3초쯤 걸린다 (Supabase 라이브러리 불러오기). 최대 20초 기다린다
  for (let i = 0; i < 200; i++) {
    try {
      await fetch(`${base}/api/auth/me`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('서버가 켜지지 않았습니다');
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server || server.exitCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill();
  });
}

async function api(method, url, body, { raw = false } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv-SE');   // YYYY-MM-DD (로컬 날짜)
}

async function listAll() {
  return (await api('GET', '/api/todos')).body.todos;
}

before(async () => {
  port = await freePort();
  base = `http://localhost:${port}`;
  await startServer();
});

after(async () => {
  await stopServer();
  rmSync(tmp, { recursive: true, force: true });
});

test('SQLite 모드로 켜지고 로그인 없이 쓴다', async () => {
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.email, null);
  assert.equal(me.body.mode, 'sqlite');
  assert.equal((await api('POST', '/api/auth/login', { email: 'a@b.cd', password: '12345678' })).status, 404);
});

test('할 일 추가·조회 (Create, Read)', async () => {
  const r = await api('POST', '/api/todos', { title: '장보기', due_date: day(0) });
  assert.equal(r.status, 201);
  const todo = (await listAll()).find((t) => t.id === r.body.id);
  assert.equal(todo.title, '장보기');
  assert.equal(todo.due_date, day(0));
  assert.equal(todo.completed, false);
  assert.deepEqual(todo.tasks, []);
});

test('마감일 규칙: 필수, 지난 날짜·없는 날짜 금지', async () => {
  const noDate = await api('POST', '/api/todos', { title: '날짜 없음' });
  assert.equal(noDate.status, 400);
  assert.equal(noDate.body.error, '날짜를 등록해주세요.');
  assert.equal((await api('POST', '/api/todos', { title: '어제', due_date: day(-1) })).status, 400);
  assert.equal((await api('POST', '/api/todos', { title: '없는 날', due_date: '2027-02-30' })).status, 400);
});

test('제목 규칙: 빈 제목 금지, 공백·대소문자만 다른 중복 금지', async () => {
  assert.equal((await api('POST', '/api/todos', { title: '   ', due_date: day(0) })).status, 400);
  assert.equal((await api('POST', '/api/todos', { title: ' 장보기 ', due_date: day(1) })).status, 409);
  assert.equal((await api('POST', '/api/todos', { title: 'Report', due_date: day(0) })).status, 201);
  assert.equal((await api('POST', '/api/todos', { title: 'report', due_date: day(0) })).status, 409);
});

test('태스크 추가: 같은 할 일 안 중복 금지, 다른 할 일이면 허용, 없는 할 일은 404', async () => {
  const a = (await api('POST', '/api/todos', { title: '태스크용 A', due_date: day(0) })).body.id;
  const b = (await api('POST', '/api/todos', { title: '태스크용 B', due_date: day(0) })).body.id;
  assert.equal((await api('POST', `/api/todos/${a}/tasks`, { title: '준비물' })).status, 201);
  assert.equal((await api('POST', `/api/todos/${a}/tasks`, { title: '준비물' })).status, 409);
  assert.equal((await api('POST', `/api/todos/${b}/tasks`, { title: '준비물' })).status, 201);
  assert.equal((await api('POST', '/api/todos/999999/tasks', { title: '고아' })).status, 404);
  const todoA = (await listAll()).find((t) => t.id === a);
  assert.equal(todoA.tasks.length, 1);
  assert.equal(todoA.tasks[0].title, '준비물');
});

test('완료 (Update): 남은 태스크가 있으면 확인 요청, 강제 완료하면 태스크도 완료', async () => {
  const id = (await api('POST', '/api/todos', { title: '완료 테스트', due_date: day(0) })).body.id;
  await api('POST', `/api/todos/${id}/tasks`, { title: '하나' });
  await api('POST', `/api/todos/${id}/tasks`, { title: '둘' });

  const ask = await api('PATCH', `/api/todos/${id}`, { completed: true });
  assert.equal(ask.status, 409);
  assert.equal(ask.body.open_tasks, 2);

  assert.equal((await api('PATCH', `/api/todos/${id}`, { completed: true, force: true })).status, 204);
  const todo = (await listAll()).find((t) => t.id === id);
  assert.equal(todo.completed, true);
  assert.ok(todo.tasks.every((t) => t.completed));
  assert.match(todo.delete_on, /^\d{4}-\d{2}-\d{2}$/);   // 90일 뒤 자동 삭제 날짜

  assert.equal((await api('POST', `/api/todos/${id}/tasks`, { title: '셋' })).status, 409);   // 완료된 할 일에는 추가 불가
});

test('태스크를 되돌리면 완료된 할 일도 미완료로', async () => {
  const id = (await api('POST', '/api/todos', { title: '되돌리기', due_date: day(0) })).body.id;
  const taskId = (await api('POST', `/api/todos/${id}/tasks`, { title: '작업' })).body.id;
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { completed: true })).status, 204);
  assert.equal((await api('PATCH', `/api/todos/${id}`, { completed: true })).status, 204);   // 남은 태스크 없음 → 바로 완료

  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { completed: false })).status, 204);
  const todo = (await listAll()).find((t) => t.id === id);
  assert.equal(todo.completed, false);
  assert.equal(todo.tasks[0].completed, false);
});

test('완료 후 같은 제목 재등록은 허용, 그때 옛 할 일 되돌리기는 중복으로 거절', async () => {
  const old = (await api('POST', '/api/todos', { title: '반복 일', due_date: day(0) })).body.id;
  const oldTask = (await api('POST', `/api/todos/${old}/tasks`, { title: '세부' })).body.id;
  await api('PATCH', `/api/todos/${old}`, { completed: true, force: true });

  assert.equal((await api('POST', '/api/todos', { title: '반복 일', due_date: day(0) })).status, 201);
  assert.equal((await api('PATCH', `/api/todos/${old}`, { completed: false })).status, 409);
  assert.equal((await api('PATCH', `/api/tasks/${oldTask}`, { completed: false })).status, 409);
});

test('검색(할 일·태스크 제목)과 오늘 할 일만 보기', async () => {
  const today = (await api('POST', '/api/todos', { title: '검색 대상', due_date: day(0) })).body.id;
  await api('POST', `/api/todos/${today}/tasks`, { title: '숨은단어' });
  const later = (await api('POST', '/api/todos', { title: '나중 일', due_date: day(3) })).body.id;

  const byTask = await api('GET', `/api/todos?q=${encodeURIComponent('숨은단어')}`);
  assert.deepEqual(byTask.body.todos.map((t) => t.id), [today]);

  const todayOnly = await api('GET', '/api/todos?today=1');
  assert.ok(todayOnly.body.todos.some((t) => t.id === today));
  assert.ok(!todayOnly.body.todos.some((t) => t.id === later));
  assert.ok(todayOnly.body.todos.every((t) => t.due_date === todayOnly.body.today));
});

test('삭제 (Delete): 할 일을 지우면 태스크도 함께 지워진다', async () => {
  const id = (await api('POST', '/api/todos', { title: '지울 일', due_date: day(0) })).body.id;
  const taskId = (await api('POST', `/api/todos/${id}/tasks`, { title: '딸린 태스크' })).body.id;
  assert.equal((await api('DELETE', `/api/todos/${id}`)).status, 204);
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { completed: true })).status, 404);
  assert.equal((await api('DELETE', `/api/todos/${id}`)).status, 404);

  const t2 = (await api('POST', '/api/todos', { title: '태스크만 지우기', due_date: day(0) })).body.id;
  const s2 = (await api('POST', `/api/todos/${t2}/tasks`, { title: '지울 태스크' })).body.id;
  assert.equal((await api('DELETE', `/api/tasks/${s2}`)).status, 204);
  assert.equal((await listAll()).find((t) => t.id === t2).tasks.length, 0);
});

test('잘못된 요청: JSON 아닌 본문, 숫자 아닌 id, 없는 API', async () => {
  assert.equal((await api('POST', '/api/todos', '{깨진', { raw: true })).status, 400);
  assert.equal((await api('PATCH', '/api/todos/abc', { completed: true })).status, 400);
  assert.equal((await api('PATCH', '/api/todos/1', { completed: 'yes' })).status, 400);
  assert.equal((await api('GET', '/api/nope')).status, 404);
});

test('SQL 주입·태그 문자열은 글자 그대로 저장된다', async () => {
  const evil = "x'); DROP TABLE todos; --";
  const id = (await api('POST', '/api/todos', { title: evil, due_date: day(0) })).body.id;
  const tag = (await api('POST', '/api/todos', { title: '<b>굵게</b>', due_date: day(0) })).body.id;
  const todos = await listAll();
  assert.equal(todos.find((t) => t.id === id).title, evil);
  assert.equal(todos.find((t) => t.id === tag).title, '<b>굵게</b>');
  assert.equal((await api('GET', `/api/todos?q=${encodeURIComponent("' OR 1=1 --")}`)).body.todos.length, 0);
});

test('완료 후 90일 지난 할 일은 자동 삭제, 그 전은 남는다', async () => {
  const oldId = (await api('POST', '/api/todos', { title: '91일 전 완료', due_date: day(0) })).body.id;
  const recentId = (await api('POST', '/api/todos', { title: '10일 전 완료', due_date: day(0) })).body.id;
  await api('PATCH', `/api/todos/${oldId}`, { completed: true });
  await api('PATCH', `/api/todos/${recentId}`, { completed: true });

  // 완료 시각을 과거로 옮긴다 (서버가 쓰는 같은 DB 파일)
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE todos SET completed_at = datetime('now', '-91 days') WHERE id = ?").run(oldId);
  db.prepare("UPDATE todos SET completed_at = datetime('now', '-10 days') WHERE id = ?").run(recentId);
  db.close();

  const todos = await listAll();   // 목록을 부를 때 정리한다
  assert.ok(!todos.some((t) => t.id === oldId));
  assert.ok(todos.some((t) => t.id === recentId));
});

test('서버를 껐다 켜도 데이터가 남는다', async () => {
  const id = (await api('POST', '/api/todos', { title: '재시작 확인', due_date: day(0) })).body.id;
  await api('POST', `/api/todos/${id}/tasks`, { title: '남아야 할 태스크' });

  await stopServer();
  await startServer();

  const todo = (await listAll()).find((t) => t.id === id);
  assert.equal(todo?.title, '재시작 확인');
  assert.equal(todo.tasks[0].title, '남아야 할 태스크');
});
