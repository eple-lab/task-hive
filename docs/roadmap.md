# 로드맵과 진행 기록

강의 과제 순서: **길 A**(로컬 SQLite) → **길 B**(Supabase + 로그인 + RLS) → **길 C**(선택: 실제 배포).

| | 무엇 | 데이터 | 앱(서버) | 상태 |
|---|---|---|---|---|
| 길 A | 로컬 SQLite로 Todo 앱 | 내 컴퓨터 `data/todo.db` | 내 컴퓨터 | ✅ `path-a` 태그 |
| 길 B | 저장소를 Supabase로 + 로그인 + RLS | Supabase | 내 컴퓨터 | 🔧 코드 완료, 실제 프로젝트 연결·확인 남음 |
| 길 C | 백엔드를 Render에 올려 공개 | Supabase | Render | ⬜ 선택 |

GitHub Pages 데모(https://eple-lab.github.io/todo/)는 셋과 별개인 화면 미리보기다.

## 진행 상황

### 길 A
- [x] **A-1** PRD 작성, DB 구조 설계
- [x] **A-2** README에 DB 구조·API·실행 방법 정리
- [x] **A-3** 길 A 구현: Express + 내장 SQLite
- [x] **A-4** 마감일 필수·과거 날짜 금지, 중복 제목 금지, 화면 개선
- [x] **A-5** README에 화면 캡처
- [x] **A-6** GitHub Pages 데모 모드
- [x] **A-7** 문서를 `docs/`로 정리

### 길 B
- [x] **B-0** 길 A 저장 확인 캡처, `path-a` 태그
- [x] **B-1** Supabase 스키마, RLS 정책, 규칙 함수 ([db/supabase/](../db/supabase/))
- [x] **B-2** 백엔드를 Supabase로 전환, 로그인 API
- [x] **B-3** 로그인·회원가입 화면
- [x] **B-4** RLS 확인 스크립트 (`npm run check:rls`)
- [x] **B-5** 문서를 Supabase 기준으로 갱신, 연결 가이드
- [ ] **B-6** 실제 Supabase 프로젝트 연결 → 저장 확인 → 계정 두 개 RLS 확인 → 캡처 ([verification.md](verification.md))

### 길 C (선택)
- [ ] Render 배포 ([deployment.md](deployment.md)의 준비물 노트)

커밋 하나하나는 `git log --oneline` 또는 GitHub의 Commits 화면에서 볼 수 있다.

## 과제 제출물 대응

| 평가 기준 | 배점 | 근거 |
|---|---|---|
| PRD 한 장 | 30 | [PRD.md](PRD.md) |
| 데이터가 남는 Todo 앱 (CRUD + 껐다 켜도 남음) | 40 | [verification.md](verification.md)의 길 A·B 캡처, [testing.md](testing.md) |
| 로컬·클라우드 저장과 보안 확인 | 30 | [verification.md](verification.md) 한 줄 요약 표 (길 A ✅, 길 B·RLS는 B-6에서) |

마감: 2026년 11월 5일 23:59. 제출: https://github.com/eple-lab/todo

## B-6에서 할 일

| 순서 | 할 일 | 누가 |
|---|---|---|
| 1 | Supabase 가입, 프로젝트 생성, Confirm email은 테스트 계정 만들 때만 끄고 다시 켜기, `01_schema.sql` 실행, `.env` 입력 ([supabase-setup.md](supabase-setup.md)) | 직접 |
| 2 | `npm start` → 테스트 계정 두 개 회원가입, `.env`에 두 계정 입력 | 직접 |
| 3 | `npm run check:rls` 실행 | 직접 (결과를 알려 주면 기록) |
| 4 | 앱 화면·Table Editor·RLS 결과 캡처, [verification.md](verification.md) 작성 | Claude (로그인된 화면에서) |

## 다음에 해 볼 만한 것

- 비밀번호 재설정 (Supabase Auth의 reset password 메일)
- 소셜 로그인 (Google 등)
- 회원 탈퇴 버튼 (지금은 대시보드에서 관리자가 삭제)
- 자동 테스트 (`node --test`로 API·RLS 시나리오)
- 할 일 제목 수정 (지금은 지우고 다시 등록)
