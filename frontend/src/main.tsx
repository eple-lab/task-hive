/**
 * 화면의 시작점.
 *
 * 하는 일
 * - #root 에 React 앱을 그린다.
 * - 전역 상태 저장소(StoreProvider)로 앱 전체를 감싼다. 하이브·채팅·상태창이 같은 상태를 본다.
 * - 스타일(CSS)을 불러온다. 외부 글꼴·CDN은 쓰지 않는다(CSP, docs/10 5장).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { StoreProvider } from './shared/state/store';
import './styles/theme.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/hive.css';
import './styles/start.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소가 없습니다. index.html 을 확인해 주세요.');

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
