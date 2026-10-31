// DB 접근 코드의 입구. server.js는 이 파일만 부른다.
// .env에 Supabase 주소와 키가 있으면 db/supabase.js(길 B), 없으면 db/sqlite.js(길 A)를 쓴다.
// 두 파일은 함수 이름·인자·돌려주는 모양이 같아서 server.js는 어느 쪽인지 몰라도 된다.
import { isSupabaseConfigured } from './supabase.js';

export const mode = isSupabaseConfigured() ? 'supabase' : 'sqlite';

const impl = await import(mode === 'supabase' ? './db/supabase.js' : './db/sqlite.js');

export const {
  DbError,
  listTodos, getTodo, getTask, countOpenTasks,
  createTodo, createTask,
  setTodoCompleted, setTaskCompleted,
  deleteTodo, deleteTask, deleteExpiredTodos,
} = impl;
