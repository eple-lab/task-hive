/**
 * 시작 화면 (docs/04-screens.md 2장 "로그인 단계").
 *
 * 보이는 것
 * - 서비스 한 줄 소개, "구글로 시작" / "로그인 없이 시작", 데이터 안내.
 * - "로그인 없이 시작"을 누르면 이름 입력 + 손님 안내가 나온다. 확인 버튼을 눌러야 넘어간다.
 *
 * 구글 로그인은 2단계다.
 * - 서버의 /api/me 가 google_available=false 로 알려 주므로 버튼을 끄고 "2단계에 열려요"를 보여 준다.
 * - 계약에 구글 시작 경로가 아직 없어서, google_available=true 여도 지금은 누를 수 없게 둔다.
 *   (화면이 주소를 만들어 이동하지 않는다. docs/10 5장)
 *
 * 손님 시작: POST /api/guest {name} -> 응답(me)을 저장소에 넣으면 App 이 3단 화면으로 바꾼다.
 */
import { useId, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../shared/api/client';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Button } from '../../shared/ui/controls';
import { cleanGuestName, NAME_MAX } from './name';

export function StartScreen() {
  const { dispatch } = useStore();
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanGuestName(name);
    if (!clean) {
      setError(`이름을 1~${NAME_MAX}자로 적어 주세요.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      dispatch({ type: 'boot_ok', me: await api.guest(clean) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      setBusy(false);
    }
  };

  return (
    <main className="start">
      <div className="start__card">
        <h1 className="start__logo">
          <span aria-hidden="true">🐝</span> {t.appName}
        </h1>
        <p className="start__tagline">{t.start.tagline}</p>

        <div className="start__actions">
          <Button variant="primary" disabled aria-describedby="google-note">
            {t.start.google}
          </Button>
          <p id="google-note" className="help">
            {t.start.googleSoon}
          </p>

          {askName ? (
            <form className="start__form" onSubmit={(e) => void submit(e)}>
              <label htmlFor={nameId}>{t.start.namePrompt}</label>
              <input
                id={nameId}
                value={name}
                autoFocus
                autoComplete="off"
                maxLength={NAME_MAX}
                placeholder={t.start.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="help">{t.start.guestNotice}</p>
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
              <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
                {busy ? t.loading : t.start.guestAgree}
              </Button>
            </form>
          ) : (
            <Button onClick={() => setAskName(true)}>{t.start.guest}</Button>
          )}
        </div>

        <details className="start__data">
          <summary>{t.start.dataTitle}</summary>
          <ul>
            {t.start.dataLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </div>
    </main>
  );
}
