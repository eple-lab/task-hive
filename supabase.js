// 요청마다 "그 요청을 보낸 사용자"로 Supabase에 접속하는 클라이언트를 만든다.
// 로그인 상태(토큰)는 브라우저의 httpOnly 쿠키에 있고, 화면의 자바스크립트는 이 쿠키를 읽을 수 없다.
// 이 클라이언트로 DB를 부르면 Supabase가 토큰의 사용자 기준으로 RLS를 적용한다.
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';

const url = process.env.SUPABASE_URL;
// 새 프로젝트는 "Publishable key"(sb_publishable_...), 예전 프로젝트는 "anon key"라고 부른다. 둘 다 공개용 키
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

export function assertSupabaseConfig() {
  if (url && key) return;
  console.error([
    'Supabase 접속 정보가 없습니다.',
    '1. .env.example을 .env로 복사하세요.',
    '2. Supabase 대시보드 → Project Settings → API에서 Project URL과 Publishable key를 .env에 넣으세요.',
    '3. 서버를 다시 켜세요.',
  ].join('\n'));
  process.exit(1);
}

export function createSupabase(req, res) {
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,                                   // 화면의 자바스크립트가 못 읽게 (XSS 대비)
      sameSite: 'lax',                                  // 다른 사이트에서 보낸 POST 요청에는 쿠키를 싣지 않게
      secure: process.env.NODE_ENV === 'production',    // 배포(https)에서는 https로만 전송
      path: '/',
    },
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie ?? ''),
      setAll(cookies, headers) {
        if (res.headersSent) return;
        for (const { name, value, options } of cookies) {
          res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options));
        }
        // 로그인 쿠키가 담긴 응답이 캐시되지 않게
        for (const [header, value] of Object.entries(headers ?? {})) res.setHeader(header, value);
      },
    },
  });
}
