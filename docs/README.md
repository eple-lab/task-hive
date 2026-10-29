# Task Hive 문서

처음이라면 **PRD → 구조 → 데이터베이스** 순서로 읽는다.

## 무엇을 만드나
| 문서 | 내용 |
|---|---|
| [PRD.md](PRD.md) | 만들 기능과 조건 (과제 제출물) |
| [business-rules.md](business-rules.md) | 앱이 지키는 규칙과, 화면·백엔드·DB 중 어디서 막는지 |

## 어떻게 만들었나
| 문서 | 내용 |
|---|---|
| [architecture.md](architecture.md) | 파일별 역할, 요청 하나의 흐름, 기술 선택 |
| [database.md](database.md) | 구조도, 표·열 설명, 제약조건, 색인, 화면 기능별 SQL |
| [api.md](api.md) | API 주소, 요청·응답 예시, 상태 코드 |
| [security.md](security.md) | SQL 주입, XSS, 비밀값, 개인정보 대응 |
| [decisions.md](decisions.md) | 왜 이렇게 만들었는지 결정 기록 |

## 쓰고 지키기
| 문서 | 내용 |
|---|---|
| [operations.md](operations.md) | 설치·실행·설정, 백업과 복구, 자주 막히는 문제 |
| [testing.md](testing.md) | 과제 확인 체크리스트, 테스트 기록 |
| [deployment.md](deployment.md) | GitHub Pages 데모, 길 C 배포 준비물 |

## 앞으로
| 문서 | 내용 |
|---|---|
| [roadmap.md](roadmap.md) | 진행 기록, 과제 평가 기준 대응, 길 B(Supabase + RLS) 계획 |
| [retrospective.md](retrospective.md) | 강의 회고 질문 노트 |

## 문서 관리 규칙
- DB 구조를 바꾸면 `db/schema.sql`과 [database.md](database.md)를 함께 고친다.
- API나 규칙을 바꾸면 [api.md](api.md), [business-rules.md](business-rules.md), 그리고 데모용 `public/demo-api.js`도 함께 고친다.
- 중요한 선택을 하면 [decisions.md](decisions.md)에 한 항목 추가한다.
- 화면 캡처는 `images/`에 둔다.
