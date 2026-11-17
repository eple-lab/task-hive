/**
 * 위쪽 머리줄: 로고, 이름, 테마 전환, 나가기 (docs/04-screens.md 1장).
 *
 * 나가기(logout)
 * - 서버에 POST /auth/logout 을 보낸다. 손님이면 서버가 그 손님의 데이터도 지운다(D-07).
 * - 손님은 데이터가 사라지므로 한 번 확인한다.
 * - 성공하면 저장소를 비우고(reset) 서버 상태를 다시 읽어 시작 화면으로 돌아간다.
 */
import { useState } from 'react';
import { api, ApiError } from '../shared/api/client';
import { t } from '../shared/i18n/ko';
import { useStore } from '../shared/state/store';
import { Button } from '../shared/ui/controls';

export function Header() {
  const { state, dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dark = state.ui.theme === 'dark';

  const logout = async () => {
    if (state.me?.mode === 'guest' && !window.confirm('나가면 서버의 내 할 일이 지워져요. 나갈까요?')) return;
    setBusy(true);
    setError(null);
    try {
      await api.logout();
      // 읽던 소리도 멈춘다.
      if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
      dispatch({ type: 'reset' });
      dispatch({ type: 'boot_ok', me: await api.me() });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '나가지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="topbar">
      <h1 className="topbar__logo">
        <span aria-hidden="true">🐝</span> {t.appName}
      </h1>
      <div className="topbar__right">
        {error ? (
          <span className="error" role="alert">
            {error}
          </span>
        ) : null}
        {state.me?.name ? <span className="topbar__name">{state.me.name}님</span> : null}
        <Button
          variant="ghost"
          small
          aria-pressed={dark}
          onClick={() => dispatch({ type: 'ui', patch: { theme: dark ? 'light' : 'dark' } })}
        >
          <span aria-hidden="true">{dark ? '☀' : '☾'}</span> {dark ? t.theme.toLight : t.theme.toDark}
        </Button>
        <Button small disabled={busy} onClick={() => void logout()}>
          {t.logout}
        </Button>
      </div>
    </header>
  );
}
