/**
 * 앱의 뿌리: 서버 상태에 따라 어느 화면을 보일지 정한다.
 *
 * 흐름
 * 1. 열리면 GET /api/me 로 로그인 상태를 확인한다(서버가 원본, docs/10 3장).
 * 2. 확인 전 -> "불러오는 중"(오래 걸리면 서버가 깨어나는 중이라고 알린다. Render 무료는 최대 1분).
 * 3. 확인 실패 -> 안내 + "다시 시도".
 * 4. mode === 'none' -> 시작 화면(features/auth).
 * 5. mode === 'guest' | 'google' -> 3단 본 화면(Layout).
 *
 * 그 밖에: 테마(밝음/어두움)를 <html data-theme> 에 반영한다.
 */
import { useCallback, useEffect, useState } from 'react';
import { StartScreen } from '../features/auth/StartScreen';
import { api, ApiError } from '../shared/api/client';
import { t } from '../shared/i18n/ko';
import { useStore } from '../shared/state/store';
import { Button } from '../shared/ui/controls';
import { Layout } from './Layout';

export function App() {
  const { state, dispatch } = useStore();
  const [waking, setWaking] = useState(false);

  // 테마를 문서 전체에 적용한다. CSS 변수가 이 값을 보고 바뀐다.
  useEffect(() => {
    document.documentElement.dataset.theme = state.ui.theme;
  }, [state.ui.theme]);

  const boot = useCallback(async () => {
    try {
      dispatch({ type: 'boot_ok', me: await api.me() });
    } catch (e) {
      dispatch({
        type: 'boot_error',
        message: e instanceof ApiError ? e.message : '서버에 연결하지 못했어요.',
      });
    }
  }, [dispatch]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // 3초가 넘도록 응답이 없으면 "서버를 깨우는 중" 안내를 덧붙인다.
  const loading = !state.me;
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setWaking(true), 3000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!state.me) {
    const retry = () => {
      dispatch({ type: 'boot_error', message: '' }); // 오류 표시를 지우고 다시 시도
      void boot();
    };
    return (
      <div className="boot" role="status">
        {state.bootError ? (
          <>
            <p className="error">{state.bootError}</p>
            <Button variant="primary" onClick={retry}>
              {t.retry}
            </Button>
          </>
        ) : (
          <>
            <p>{t.loading}</p>
            {waking ? <p className="muted">{t.waking}</p> : null}
          </>
        )}
      </div>
    );
  }

  if (state.me.mode === 'none') return <StartScreen />;
  return <Layout />;
}
