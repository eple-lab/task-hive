/**
 * 상태창 "연결" 구역 (docs/04 5.1, D-22).
 *
 * 하는 일
 * - ngrok 주소 + 접속 키를 받아 PUT /api/settings/upstream 으로 서버에 보내 연결을 확인한다.
 * - 성공하면 연결됨·모델 수·응답 지연을 보여 주고, "연결 끊기"(DELETE)로 되돌릴 수 있다.
 * - 실패하면 서버가 준 안내문(400 주소 검사 실패 / 502 연결 실패)을 그대로 보여 준다.
 *
 * 보안 (docs/05-security.md)
 * - 키 입력칸은 type="password", autoComplete="off". 주소·키는 이 컴포넌트의 입력 중 상태로만 있고
 *   localStorage/sessionStorage 에 두지 않는다. 연결에 성공하면 입력칸을 비운다(화면에 남기지 않음).
 */
import { useState, type FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Button, Collapsible } from '../../shared/ui/controls';
import { connectUpstream, errorMessage } from './logic';

export function ConnectSection() {
  const { state, dispatch } = useStore();
  const me = state.me;
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 마지막 연결 확인의 응답 시간. 새로고침 뒤에는 모르므로 null */
  const [latency, setLatency] = useState<number | null>(null);

  if (!me) return null;
  const connected = me.upstream.connected;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await connectUpstream(api, me, url, key);
    setBusy(false);
    if (r.ok) {
      dispatch({ type: 'set_me', me: r.me });
      setLatency(r.latencyMs);
      // 주소와 키는 서버가 암호화 쿠키에 보관한다. 화면에는 남기지 않는다.
      setUrl('');
      setKey('');
    } else {
      setError(r.message);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteUpstream();
      dispatch({ type: 'set_me', me: { ...me, upstream: { connected: false, models: [] } } });
      setLatency(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Collapsible title={t.panel.connect.title}>
      <p className="status-line" role="status">
        <span className={`dot${connected ? ' dot--on' : ''}`} aria-hidden="true" />
        <span>
          {t.panel.connect.statusModel} {connected ? t.panel.connect.statusOn : t.panel.connect.statusOff}
          {connected ? ` · ${t.panel.connect.models(me.upstream.models.length)}` : ''}
          {connected && latency !== null ? ` · ${t.panel.connect.ok(latency)}` : ''}
        </span>
      </p>

      {connected ? (
        <Button onClick={disconnect} disabled={busy}>
          {t.panel.connect.disconnect}
        </Button>
      ) : (
        <form className="field-stack" onSubmit={submit}>
          <label className="field">
            <span>{t.panel.connect.url}</span>
            <input
              type="url"
              value={url}
              placeholder={t.panel.connect.urlPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t.panel.connect.key}</span>
            <input
              type="password"
              value={key}
              placeholder={t.panel.connect.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? t.panel.connect.checking : t.panel.connect.check}
          </Button>
        </form>
      )}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="help">{t.panel.connect.help}</p>
      <p className="help">{t.panel.connect.keyHelp}</p>
      <p className="help">{t.panel.connect.colabNote}</p>
    </Collapsible>
  );
}
