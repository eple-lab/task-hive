-- Task Hive 표 정의 (docs/03-architecture.md 5.2)
-- 상태: 초안. 아직 어떤 DB에도 실행하지 않았다. 2단계에서 Neon 개발 브랜치에 먼저 실행해 확인한다.
--
-- 원칙
--   - 대화 원문, 일기, 캘린더 일정, 구글 이메일·이름은 저장하지 않는다 (D-08, P-02).
--   - 제목은 암호문(title_enc)으로, 중복 검사는 가린 값(title_hash)으로 한다 (P-03, 제안).
--   - 사용자나 손님을 지우면 태스크도 함께 지워진다 (ON DELETE CASCADE).
--   - RLS로 DB가 직접 "자기 행만" 허락한다 (P-04, 제안). 서버는 요청마다
--       SET LOCAL app.owner_kind = 'user' | 'guest';
--       SET LOCAL app.owner_id   = '<uuid>';
--     를 실행한다.

create extension if not exists pgcrypto;

-- 구글 로그인 사용자 ------------------------------------------------------
create table if not exists users (
    id                       uuid primary key default gen_random_uuid(),
    sub_hash                 text not null unique,       -- "google:<구글 ID의 HMAC>" (원래 ID는 저장하지 않는다)
    display_name             text not null check (char_length(display_name) between 1 and 20),
    lang                     text not null default 'ko',
    prefs                    jsonb not null default '{}'::jsonb,  -- 음성·LLM 설정, 기능 켬·끔(D-14~18), 도시
    google_token_enc         bytea,                      -- access token 암호문 (D-19: 약 1시간)
    google_token_expires_at  timestamptz,                -- 지나면 정리 작업이 지운다
    google_refresh_enc       bytea,                      -- GOOGLE_TOKEN_MODE=refresh일 때만 채운다
    scopes                   text not null default '',
    drive_folder_id          text,
    tasks_sheet_id           text,
    created_at               timestamptz not null default now(),
    last_seen_at             timestamptz not null default now()
);

-- 손님 (D-07: 내려받기 직후 또는 마지막 활동 24시간 뒤 삭제) ---------------
create table if not exists guest_sessions (
    id                uuid primary key default gen_random_uuid(),
    session_hash      text not null unique,              -- 세션 ID의 HMAC
    display_name      text not null check (char_length(display_name) between 1 and 20),
    prefs             jsonb not null default '{}'::jsonb,
    last_activity_at  timestamptz not null default now()
);
create index if not exists guest_sessions_last_activity_idx on guest_sessions (last_activity_at);

-- 태스크 (벌집 한 칸) -----------------------------------------------------
create table if not exists tasks (
    id            bigint generated always as identity primary key,
    user_id       uuid references users(id) on delete cascade,
    guest_id      uuid references guest_sessions(id) on delete cascade,
    title_enc     bytea not null,
    title_hash    text not null,
    due_date      date,                                  -- 없어도 된다 (R-HIVE-5)
    completed     boolean not null default false,
    completed_at  timestamptz,
    archived      boolean not null default false,        -- 보관함 (D-24)
    source        text not null default 'chat' check (source in ('chat', 'calendar', 'manual')),
    hex_q         smallint,                              -- 벌집 좌표. 보관하면 null
    hex_r         smallint,
    created_at    timestamptz not null default now(),
    -- 주인은 사용자 또는 손님 중 정확히 하나
    constraint tasks_one_owner check ((user_id is null) <> (guest_id is null)),
    constraint tasks_completed_at check (completed = (completed_at is not null)),
    constraint tasks_archived_cell check (archived = (hex_q is null and hex_r is null) or not archived)
);
-- 같은 주인 안에서 제목 중복 금지
create unique index if not exists tasks_user_title_uq  on tasks (user_id, title_hash)  where user_id is not null;
create unique index if not exists tasks_guest_title_uq on tasks (guest_id, title_hash) where guest_id is not null;
-- 같은 주인의 벌집에서 같은 칸에 두 태스크가 들어가지 못하게
create unique index if not exists tasks_user_cell_uq  on tasks (user_id, hex_q, hex_r)  where user_id is not null and not archived;
create unique index if not exists tasks_guest_cell_uq on tasks (guest_id, hex_q, hex_r) where guest_id is not null and not archived;
create index if not exists tasks_completed_at_idx on tasks (completed_at) where completed_at is not null;

-- 하위 태스크 --------------------------------------------------------------
create table if not exists subtasks (
    id          bigint generated always as identity primary key,
    task_id     bigint not null references tasks(id) on delete cascade,
    title_enc   bytea not null,
    title_hash  text not null,
    completed   boolean not null default false,
    sort_order  smallint not null default 0,
    unique (task_id, title_hash)                         -- 같은 태스크 안에서만 중복 금지
);

-- 지표 (숫자만. 사용자 구분 값과 본문이 없다. 30일 뒤 삭제) ---------------
create table if not exists metric_events (
    id          bigint generated always as identity primary key,
    at          timestamptz not null default now(),
    kind        text not null,
    ttfb_ms     integer,
    total_ms    integer,
    tokens_out  integer,
    status      text not null default 'ok'
);
create index if not exists metric_events_at_idx on metric_events (at);

-- RLS (P-04, 제안) --------------------------------------------------------
alter table tasks    enable row level security;
alter table subtasks enable row level security;

drop policy if exists tasks_own_rows on tasks;
create policy tasks_own_rows on tasks for all
    using (
        (current_setting('app.owner_kind', true) = 'user'  and user_id  = current_setting('app.owner_id', true)::uuid) or
        (current_setting('app.owner_kind', true) = 'guest' and guest_id = current_setting('app.owner_id', true)::uuid)
    )
    with check (
        (current_setting('app.owner_kind', true) = 'user'  and user_id  = current_setting('app.owner_id', true)::uuid) or
        (current_setting('app.owner_kind', true) = 'guest' and guest_id = current_setting('app.owner_id', true)::uuid)
    );

drop policy if exists subtasks_own_rows on subtasks;
create policy subtasks_own_rows on subtasks for all
    using (exists (select 1 from tasks t where t.id = subtasks.task_id))       -- tasks의 RLS를 그대로 따른다
    with check (exists (select 1 from tasks t where t.id = subtasks.task_id));

-- 주의: 표의 주인(owner) 역할은 RLS를 건너뛴다. 서버는 주인이 아닌 별도 역할로 접속해야 한다.
