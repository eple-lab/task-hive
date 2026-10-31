// 화면 상태 테스트 (2026-10-31 추가, BUG-003)
// 등록창·검색 상태가 "태스크 등록 후", "로그아웃 → 다른 계정 로그인", "세션 만료" 때 처음으로 돌아가는지 확인한다.
//
// 실행 방법
//   1. 가짜 Supabase 주소로 서버를 켠다 (실제 계정·Supabase를 쓰지 않는다)
//        PowerShell: $env:SUPABASE_URL='https://example.invalid'; $env:SUPABASE_PUBLISHABLE_KEY='test'; $env:PORT='3100'; node server.js
//   2. 브라우저로 http://localhost:3100/ 을 연다 → 로그인 화면이 나온다
//   3. 개발자 도구 콘솔에 이 파일 내용을 붙여 넣고 실행 → 마지막 줄에 "결과: n/n 통과"
//
// 페이지의 fetch를 가짜 백엔드로 바꿔서 사용자 A·B를 흉내 낸다. 네트워크로는 아무것도 보내지 않는다.
(async () => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (${info})`}`);
  const today = new Date().toLocaleDateString('sv-SE');
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');

  // --- 가짜 백엔드 ---
  const data = {
    'a@test.local': [{ id: 1, title: 'A의 할 일', due_date: today, completed: false, completed_at: null, delete_on: null, tasks: [] }],
    'b@test.local': [{ id: 2, title: 'B의 할 일', due_date: today, completed: false, completed_at: null, delete_on: null, tasks: [] }],
  };
  let user = null;
  let failNextTask = false;
  let expireSession = false;
  const requests = [];
  const realFetch = window.fetch;
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    requests.push(`${method} ${url}`);
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (url === '/api/auth/login') { user = body.email; return json(200, { email: user }); }
    if (url === '/api/auth/logout') { user = null; return json(204); }
    if (!user || expireSession) return json(401, { error: '로그인이 필요합니다.' });
    if (method === 'GET' && url.startsWith('/api/todos')) {
      const q = new URL(url, location.origin).searchParams;
      const todos = data[user].filter((t) => !q.get('q') || t.title.includes(q.get('q')));
      return json(200, { today, todos });
    }
    const m = url.match(/^\/api\/todos\/(\d+)\/tasks$/);
    if (method === 'POST' && m) {
      if (failNextTask) { failNextTask = false; return json(409, { error: '이 할 일에 같은 이름의 태스크가 이미 있습니다.' }); }
      const todo = data[user].find((t) => t.id === Number(m[1]));
      todo.tasks.push({ id: Date.now(), todo_id: todo.id, title: body.title, completed: false });
      return json(201, { id: 1 });
    }
    if (method === 'POST' && url === '/api/todos') {
      data[user].push({ id: Date.now(), title: body.title, due_date: body.due_date, completed: false, completed_at: null, delete_on: null, tasks: [] });
      return json(201, { id: 1 });
    }
    return json(404, { error: 'mock' });
  };
  const realAlert = window.alert;
  const alerts = [];
  window.alert = (msg) => alerts.push(msg);

  // --- 도우미 ---
  const formState = () => ({
    asTask: $('as-task').checked,
    pickerHidden: $('parent-picker').hidden,
    dateHidden: $('due-date').hidden,
    placeholder: $('title').placeholder,
    title: $('title').value,
    date: $('due-date').value,
    search: $('search').value,
    todayOnly: $('today-only').checked,
    radios: [...document.querySelectorAll('#parent-options input')].map((r) => `${r.parentElement.textContent}${r.checked ? '*' : ''}`),
  });
  const isInitial = (s) => !s.asTask && s.pickerHidden && !s.dateHidden && s.placeholder === '할 일을 입력하세요'
    && s.title === '' && s.date === today && s.search === '' && !s.todayOnly;
  async function login(email) {
    $('auth-email').value = email;
    $('auth-password').value = 'not-sent-anywhere';
    $('auth-form').querySelector('button[value="login"]').click();
    await wait(500);
  }
  async function logout() {
    $('logout').click();
    await wait(500);
  }
  function setTaskMode() {
    $('as-task').checked = true;
    $('as-task').dispatchEvent(new Event('change'));
  }
  // A 사용자로 등록창·검색에 흔적을 남긴다
  async function dirtyAsA() {
    $('search').value = 'A의';
    $('search').dispatchEvent(new Event('input'));
    $('today-only').checked = true;
    $('today-only').dispatchEvent(new Event('change'));
    await wait(400);
    setTaskMode();
    document.querySelector('#parent-options input').checked = true;
    $('title').value = 'A가 쓰다 만 글';
    $('due-date').value = tomorrow;
  }

  try {
    check('U0. 시작 화면이 로그인 화면', document.body.dataset.view === 'auth', document.body.dataset.view);

    // U1. 태스크 등록 성공 → 처음 상태
    await login('a@test.local');
    setTaskMode();
    document.querySelector('#parent-options input').checked = true;
    $('title').value = '새 태스크';
    $('add-form').requestSubmit();
    await wait(500);
    const afterTask = formState();
    check('U1. 태스크 등록 후 "태스크로 등록" 체크 해제', !afterTask.asTask, JSON.stringify(afterTask));
    check('U1. 태스크 등록 후 라디오 목록 숨김, 마감일 칸 다시 보임', afterTask.pickerHidden && !afterTask.dateHidden, JSON.stringify(afterTask));
    check('U1. 태스크 등록 후 라디오 선택 없음', afterTask.radios.every((r) => !r.endsWith('*')), afterTask.radios.join(','));
    check('U1. 태스크 등록 후 안내 문구 "할 일을 입력하세요"', afterTask.placeholder === '할 일을 입력하세요', afterTask.placeholder);

    // U2. 태스크 등록 실패 → 그대로 (다시 시도할 수 있게)
    setTaskMode();
    document.querySelector('#parent-options input').checked = true;
    $('title').value = '중복 태스크';
    failNextTask = true;
    $('add-form').requestSubmit();
    await wait(500);
    const afterFail = formState();
    check('U2. 태스크 등록 실패 시 체크·입력 유지', afterFail.asTask && afterFail.title === '중복 태스크' && !afterFail.pickerHidden, JSON.stringify(afterFail));
    check('U2. 실패 이유를 알림', alerts.some((m) => m.includes('같은 이름')), alerts.join('|'));

    // U3. 할 일 등록 성공 → 제목 비우고 마감일 오늘
    $('as-task').checked = false;
    $('as-task').dispatchEvent(new Event('change'));
    $('title').value = '새 할 일';
    $('due-date').value = tomorrow;
    $('add-form').requestSubmit();
    await wait(500);
    const afterTodo = formState();
    check('U3. 할 일 등록 후 제목 비움, 마감일 오늘', afterTodo.title === '' && afterTodo.date === today, JSON.stringify(afterTodo));

    // U4. A가 흔적을 남기고 로그아웃 → B 로그인
    await dirtyAsA();
    await logout();
    requests.length = 0;
    await login('b@test.local');
    const asB = formState();
    check('U4. 다른 계정 로그인 시 등록창·검색 처음 상태', isInitial(asB), JSON.stringify(asB));
    check('U4. A가 쓰다 만 글이 B에게 안 보임', asB.title === '', asB.title);
    check('U4. B의 라디오 목록에 A의 할 일 없음', !asB.radios.some((r) => r.startsWith('A의')), asB.radios.join(','));
    const firstList = requests.find((r) => r.startsWith('GET /api/todos'));
    check('U4. B의 첫 목록 요청에 A의 검색어·오늘만 조건 없음', firstList === 'GET /api/todos?', firstList);
    check('U4. B의 목록에 B의 할 일이 보임', $('todo-list').textContent.includes('B의 할 일'), $('todo-list').textContent);

    // U5. 세션 만료(401) → 로그인 화면, 상태 초기화
    await dirtyAsA();
    expireSession = true;
    $('today-only').checked = false;
    $('today-only').dispatchEvent(new Event('change'));   // 목록 요청 → 401
    await wait(500);
    expireSession = false;
    const expired = formState();
    check('U5. 세션 만료 시 로그인 화면', document.body.dataset.view === 'auth', document.body.dataset.view);
    check('U5. 세션 만료 시 등록창·검색 처음 상태', isInitial(expired), JSON.stringify(expired));
  } finally {
    window.fetch = realFetch;
    window.alert = realAlert;
  }

  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  results.push(`결과: ${results.length - failed}/${results.length} 통과`);
  console.log(results.join('\n'));
  return results.join('\n');
})();
