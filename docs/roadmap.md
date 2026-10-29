# 로드맵과 진행 기록

강의 과제 순서: **길 A**(로컬 SQLite) → **길 B**(Supabase + 로그인 + RLS) → **길 C**(선택: 실제 배포).

## 진행 상황

- [x] **A-1** PRD 작성, DB 구조 설계
- [x] **A-2** README에 DB 구조·API·실행 방법 정리
- [x] **A-3** 길 A 구현: Express + 내장 SQLite
- [x] **A-4** 마감일 필수·과거 날짜 금지, 중복 제목 금지, 화면 개선
- [x] **A-5** README에 화면 캡처
- [x] **A-6** GitHub Pages 데모 모드
- [x] **A-7** 문서를 `docs/`로 정리
- [ ] **B** Supabase 전환 + Supabase Auth + RLS
- [ ] **C** (선택) Render 배포

커밋 하나하나는 `git log --oneline` 또는 GitHub의 Commits 화면에서 볼 수 있다.

## 과제 제출물 대응

| 평가 기준 | 배점 | 근거 |
|---|---|---|
| PRD 한 장 | 30 | [PRD.md](PRD.md) |
| 데이터가 남는 Todo 앱 (CRUD + 껐다 켜도 남음) | 40 | 길 A 앱 + [testing.md](testing.md) 체크리스트 캡처 |
| 로컬·클라우드 저장과 보안 확인 | 30 | 길 A 확인 기록 + 길 B 전환·RLS 확인 기록 (예정) |

마감: 2026년 11월 5일 23:59. 제출: https://github.com/eple-lab/task-hive

## 길 B 계획: Supabase로 전환

### 해야 할 일
1. Supabase 가입, 무료 프로젝트 만들기
2. SQL Editor에서 표 만들기 (아래 초안)
3. RLS 켜고 정책 만들기
4. Supabase Auth로 로그인 화면 추가 (이메일)
5. `db.js`를 Supabase용으로 교체. 키는 `.env`에, 화면 코드에는 두지 않는다
6. 계정 2개로 서로의 할 일이 안 보이는지, 수정·삭제가 거절되는지 확인
7. 배포 준비물을 [deployment.md](deployment.md)에 기록 (초안 있음)

### 표 초안 (Postgres)
```sql
create table todos (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  due_date     date,
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (completed = (completed_at is not null))
);

create table tasks (
  id           bigint generated always as identity primary key,
  todo_id      bigint not null references todos(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (completed = (completed_at is not null))
);
```

### RLS 정책 초안
```sql
alter table todos enable row level security;
alter table tasks enable row level security;

-- 할 일: 내 것만
create policy "own todos" on todos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 태스크: 내 할 일에 속한 것만
create policy "own tasks" on tasks
  for all using (exists (select 1 from todos t where t.id = tasks.todo_id and t.user_id = auth.uid()))
  with check (exists (select 1 from todos t where t.id = tasks.todo_id and t.user_id = auth.uid()));
```

> 초안이다. 실제로 만들 때 Supabase 문서와 대조하고, 계정 2개로 꼭 시험한다.
> RLS를 켜기만 하고 정책을 안 만들면 아무도 못 읽고, 정책을 너무 넓게 만들면 남의 것도 보인다.

### 길 B에서 고민할 점
- 백엔드가 Supabase를 부를 때 **로그인한 사용자의 토큰**으로 불러야 RLS가 그 사용자 기준으로 동작한다. `service_role` 키로 부르면 RLS가 무시된다.
- 데모 모드(`demo-api.js`)는 로그인 없이 그대로 둔다.
- 90일 자동 삭제는 Supabase의 예약 작업(pg_cron)으로 옮길지, 서버 타이머를 유지할지 정한다.
- Supabase 무료 요금제는 자동 백업이 없다. 표를 CSV로 내려받는 수동 백업 절차를 [operations.md](operations.md)에 추가한다.
