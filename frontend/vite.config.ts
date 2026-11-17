/**
 * Vite 설정.
 *
 * 하는 일
 * - 개발 서버(npm run dev)가 /api, /auth, /health 요청을 FastAPI(localhost:8000)로 넘긴다.
 *   그래서 화면 코드는 항상 "같은 출처"로 요청하고, 쿠키(SameSite=Lax)도 그대로 동작한다.
 * - 빌드 결과는 frontend/dist 에 만든다. FastAPI가 이 폴더를 정적 파일로 내준다(D-20).
 * - `npm run dev:mock`(mode=mock)이면 백엔드 없이 가짜 응답(src/shared/api/mock.ts)으로 화면을 본다.
 *
 * 보안 메모
 * - 소스맵은 운영 빌드에서 만들지 않는다(내부 코드 구조 노출을 줄인다).
 * - 외부 CDN을 쓰지 않으므로 CSP `script-src 'self'` 로 충분하다.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/auth': { target: BACKEND, changeOrigin: false },
      '/health': { target: BACKEND, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 구형 휴대폰도 고려해 너무 최신 문법만 쓰지 않게 한다.
    target: 'es2020',
  },
  test: {
    // 좌표 계산·날짜 계산 같은 순수 함수 테스트가 중심이라 node 환경으로 충분하다.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
