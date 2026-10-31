// db/sqlite.js와 db/supabase.js가 함께 쓰는 것

export const AUTO_DELETE_DAYS = 90;

// DB 에러에 Postgres 방식의 에러 코드(code)를 붙여서 던진다 (예: 23505 = UNIQUE 위반 = 중복 제목)
// SQLite 버전도 중복이면 같은 코드로 던져서, server.js는 어느 DB인지 몰라도 된다
export class DbError extends Error {
  constructor(error) {
    super(error.message);
    this.code = error.code;
  }
}

export const UNIQUE_VIOLATION = '23505';
