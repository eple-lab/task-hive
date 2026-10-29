// 화면 코드는 백엔드 API에만 요청한다. DB에는 직접 접근하지 않는다.

const $ = (id) => document.getElementById(id);
const list = $('todo-list');
const statusEl = $('status');
const searchInput = $('search');
const todayOnly = $('today-only');
const form = $('add-form');
const asTask = $('as-task');
const titleInput = $('title');
const dueDateInput = $('due-date');
const parentPicker = $('parent-picker');
const parentOptions = $('parent-options');

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || '요청에 실패했습니다.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// 사용자가 입력한 글자는 textContent로만 넣는다 (HTML로 해석되지 않게)
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function showError(err) {
  alert(err.message);
}

// --- 목록 그리기 ---

function renderTodo(todo, today) {
  const doneCount = todo.tasks.filter((t) => t.completed).length;

  const checkbox = el('input', { type: 'checkbox', checked: todo.completed });
  checkbox.setAttribute('aria-label', `${todo.title} 완료`);
  checkbox.addEventListener('change', () => toggleTodo(todo, checkbox));

  const meta = [];
  if (todo.tasks.length > 0) meta.push(el('span', { className: 'meta', textContent: `${doneCount}/${todo.tasks.length}` }));
  if (todo.due_date) {
    const overdue = !todo.completed && todo.due_date < today;
    meta.push(el('span', {
      className: 'meta' + (overdue ? ' overdue' : ''),
      textContent: todo.due_date === today ? '오늘 마감' : `마감 ${todo.due_date}`,
    }));
  }
  if (todo.completed) {
    meta.push(el('span', {
      className: 'meta auto-delete',
      textContent: `완료 후 90일 뒤 자동 삭제 (${todo.delete_on})`,
    }));
  }

  const del = el('button', { type: 'button', className: 'icon-btn', textContent: '✕', title: '삭제' });
  del.setAttribute('aria-label', `${todo.title} 삭제`);
  del.addEventListener('click', () => removeTodo(todo));

  const row = el('div', { className: 'row' }, [
    checkbox,
    el('span', { className: 'title', textContent: todo.title }),
    ...meta,
    del,
  ]);

  const tasks = el('ul', { className: 'tasks' }, todo.tasks.map(renderTask));

  return el('li', {
    className: 'todo' + (todo.completed ? ' done' : '') + (todo.due_date === today && !todo.completed ? ' is-today' : ''),
  }, todo.tasks.length ? [row, tasks] : [row]);
}

function renderTask(task) {
  const checkbox = el('input', { type: 'checkbox', checked: task.completed });
  checkbox.setAttribute('aria-label', `${task.title} 완료`);
  checkbox.addEventListener('change', () => toggleTask(task, checkbox));

  const del = el('button', { type: 'button', className: 'icon-btn', textContent: '✕', title: '삭제' });
  del.setAttribute('aria-label', `${task.title} 삭제`);
  del.addEventListener('click', () => removeTask(task));

  return el('li', { className: 'task' + (task.completed ? ' done' : '') }, [
    el('div', { className: 'row' }, [checkbox, el('span', { className: 'title', textContent: task.title }), del]),
  ]);
}

// 태스크를 넣을 Todo 라디오 목록: 완료되지 않은 Todo만, 검색·필터와 상관없이 전부
function renderParentOptions(todos) {
  const selected = parentOptions.querySelector('input:checked')?.value;
  const open = todos.filter((t) => !t.completed);
  parentOptions.replaceChildren(...open.map((todo) => {
    const radio = el('input', { type: 'radio', name: 'parent', value: String(todo.id) });
    radio.checked = String(todo.id) === selected;
    return el('label', {}, [radio, todo.title]);
  }));
  if (open.length === 0) {
    parentOptions.replaceChildren(el('span', { className: 'meta', textContent: '태스크를 넣을 수 있는 할 일이 없습니다. 먼저 할 일을 등록하세요.' }));
  }
}

async function refresh() {
  const q = searchInput.value.trim();
  const filtered = q !== '' || todayOnly.checked;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (todayOnly.checked) params.set('today', '1');

  try {
    const [view, all] = await Promise.all([
      api('GET', '/api/todos?' + params),
      filtered ? api('GET', '/api/todos') : null,
    ]);
    list.replaceChildren(...view.todos.map((t) => renderTodo(t, view.today)));
    renderParentOptions((all ?? view).todos);

    if (view.todos.length === 0) {
      statusEl.textContent = filtered ? '조건에 맞는 할 일이 없습니다.' : '아직 할 일이 없습니다. 아래에서 추가해 보세요.';
    } else {
      statusEl.textContent = '';
    }
  } catch (err) {
    statusEl.textContent = '목록을 불러오지 못했습니다: ' + err.message;
  }
}

// --- 동작 ---

async function toggleTodo(todo, checkbox) {
  const completed = checkbox.checked;
  try {
    await api('PATCH', `/api/todos/${todo.id}`, { completed });
  } catch (err) {
    // 안 끝난 태스크가 있으면 서버가 409로 알려 준다 → 확인 후 강제 완료
    if (err.status === 409 && err.data?.open_tasks) {
      const ok = confirm(`완료하지 않은 태스크가 ${err.data.open_tasks}개 있습니다.\n그래도 완료하시겠습니까? (남은 태스크도 함께 완료됩니다)`);
      if (ok) {
        try { await api('PATCH', `/api/todos/${todo.id}`, { completed, force: true }); } catch (e) { showError(e); }
      }
    } else {
      showError(err);
    }
  }
  refresh();
}

async function toggleTask(task, checkbox) {
  try {
    await api('PATCH', `/api/tasks/${task.id}`, { completed: checkbox.checked });
  } catch (err) {
    showError(err);
  }
  refresh();
}

async function removeTodo(todo) {
  if (todo.tasks.length > 0) {
    const ok = confirm(`하위 태스크 ${todo.tasks.length}개도 함께 삭제됩니다.\n삭제하시겠습니까?`);
    if (!ok) return;
  }
  try {
    await api('DELETE', `/api/todos/${todo.id}`);
  } catch (err) {
    showError(err);
  }
  refresh();
}

async function removeTask(task) {
  try {
    await api('DELETE', `/api/tasks/${task.id}`);
  } catch (err) {
    showError(err);
  }
  refresh();
}

// --- 등록창 ---

asTask.addEventListener('change', () => {
  parentPicker.hidden = !asTask.checked;
  dueDateInput.hidden = asTask.checked;
  titleInput.placeholder = asTask.checked ? '태스크를 입력하세요' : '할 일을 입력하세요';
});

let saving = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title || saving) return;

  // 저장이 끝나기 전에 다시 입력·전송되지 않게 잠근다
  saving = true;
  titleInput.readOnly = true;
  try {
    if (asTask.checked) {
      const parentId = parentOptions.querySelector('input:checked')?.value;
      if (!parentId) {
        alert('태스크를 넣을 할 일을 선택하세요.');
        return;
      }
      await api('POST', `/api/todos/${parentId}/tasks`, { title });
    } else {
      await api('POST', '/api/todos', { title, due_date: dueDateInput.value || null });
      dueDateInput.value = '';
    }
    titleInput.value = '';
  } catch (err) {
    showError(err);
  } finally {
    saving = false;
    titleInput.readOnly = false;
    titleInput.focus();
  }
  refresh();
});

// --- 검색·필터 ---

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 200);
});
todayOnly.addEventListener('change', refresh);

refresh();
