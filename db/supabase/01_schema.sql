-- Task Hive DB 구조 (Supabase / Postgres)
-- Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS를 썼다.
--
-- 길 A(SQLite)와 달라진 점
--   - 할 일마다 주인(user_id)을 기록하고, RLS로 "자기 행만" 다룰 수 있게 한다.
--   - 날짜·시각·참거짓은 Postgres의 진짜 타입(date, timestamptz, boolean)을 쓴다.
--   - 중복 제목 금지를 DB의 UNIQUE 색인으로도 막는다(새 DB라 기존 데이터 충돌 걱정이 없다).

-- ---------------------------------------------------------------------------
-- 표
-- ---------------------------------------------------------------------------

-- 큰 할 일
create table if not exists public.todos (
  id           bigint generated always as identity primary key,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null check (length(trim(title)) > 0),
  due_date     date,
  completed    boolean     not null default false,
  completed_at timestamptz,  -- 완료 시각. 90일 자동 삭제 기준. 미완료면 NULL
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 완료 여부와 완료 시각이 서로 어긋나지 않게
  check (completed = (completed_at is not null))
);

-- 하위 태스크: 반드시 하나의 할 일에 속한다. 주인은 할 일을 통해 정해진다
create table if not exists public.tasks (
  id           bigint generated always as identity primary key,
  todo_id      bigint      not null references public.todos (id) on delete cascade,
  title        text        not null check (length(trim(title)) > 0),
  completed    boolean     not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (completed = (completed_at is not null))
);

-- ---------------------------------------------------------------------------
-- 색인
-- ---------------------------------------------------------------------------

-- 중복 금지: 같은 사람의 미완료 할 일끼리 같은 제목(대소문자 무시) 금지
create unique index if not exists todos_open_title_unique
  on public.todos (user_id, lower(title)) where not completed;

-- 중복 금지: 같은 할 일 안의 태스크끼리 같은 제목 금지 (todo_id로 태스크 찾기도 이 색인을 쓴다)
create unique index if not exists tasks_todo_title_unique
  on public.tasks (todo_id, lower(title));

create index if not exists todos_user_due_date on public.todos (user_id, due_date);   -- 오늘 할 일만 보기
create index if not exists todos_completed_at on public.todos (completed_at);         -- 90일 자동 삭제

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

create or replace trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (행 수준 보안): 로그인한 사용자는 자기 할 일과 그 태스크만
-- ---------------------------------------------------------------------------

alter table public.todos enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "todos: own rows" on public.todos;
create policy "todos: own rows" on public.todos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks: rows of own todos" on public.tasks;
create policy "tasks: rows of own todos" on public.tasks
  for all to authenticated
  using (exists (
    select 1 from public.todos t
    where t.id = tasks.todo_id and t.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.todos t
    where t.id = tasks.todo_id and t.user_id = (select auth.uid())
  ));

-- 로그인하지 않은 사용자(anon)는 표에 아예 접근하지 않는다
revoke all on public.todos, public.tasks from anon;
grant select, insert, update, delete on public.todos, public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- 여러 행을 "전부 되거나, 전부 안 되거나"로 바꾸는 함수
-- security invoker(기본값)라서 부른 사람의 권한과 RLS가 그대로 적용된다
-- ---------------------------------------------------------------------------

-- 할 일 완료/미완료. 완료할 때는 남은 태스크도 함께 완료
create or replace function public.set_todo_completed(p_todo_id bigint, p_completed boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_completed then
    update public.todos set completed = true, completed_at = now()
      where id = p_todo_id and not completed;
    update public.tasks set completed = true, completed_at = now()
      where todo_id = p_todo_id and not completed;
  else
    update public.todos set completed = false, completed_at = null
      where id = p_todo_id;
  end if;
end;
$$;

-- 태스크 완료/미완료. 미완료로 되돌리면 완료돼 있던 할 일도 미완료로
create or replace function public.set_task_completed(p_task_id bigint, p_completed boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_todo_id bigint;
begin
  if p_completed then
    update public.tasks set completed = true, completed_at = now()
      where id = p_task_id and not completed;
  else
    update public.tasks set completed = false, completed_at = null
      where id = p_task_id
      returning todo_id into v_todo_id;
    if v_todo_id is not null then
      update public.todos set completed = false, completed_at = null
        where id = v_todo_id and completed;
    end if;
  end if;
end;
$$;

revoke execute on function public.set_todo_completed(bigint, boolean) from public, anon;
revoke execute on function public.set_task_completed(bigint, boolean) from public, anon;
grant execute on function public.set_todo_completed(bigint, boolean) to authenticated;
grant execute on function public.set_task_completed(bigint, boolean) to authenticated;
