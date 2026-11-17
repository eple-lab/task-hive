/**
 * 가운데 채팅 영역 (항상 보인다).
 *
 * 구성 (docs/04-screens.md 3장)
 * - 맨 위: 외부 전송 안내 배너(항상 보임, R-CHAT-4)와 연결 상태 점
 * - 가운데: 말풍선. AI(왼쪽), 사용자(오른쪽), 시스템 알림(가운데 작게)
 * - 말풍선 아래: 행동 버튼(되돌리기, 등록해/나중에 …)
 * - 맨 아래: 입력창, 말하기 토글, 보내기/멈추기
 *
 * 보안: 모든 글은 React 가 글자로 넣는다(HTML로 해석하지 않는다). dangerouslySetInnerHTML 을 쓰지 않는다.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { t } from '../../shared/i18n/ko';
import { useStore, type ChatMessage } from '../../shared/state/store';
import { Button } from '../../shared/ui/controls';
import { useSpeaker } from '../voice/useVoice';
import { useConversation } from './useConversation';

export function ChatPanel() {
  const { state, dispatch } = useStore();
  const { send, stop, runAction } = useConversation();
  const speaker = useSpeaker();
  const [draft, setDraft] = useState('');
  /** 지금 소리로 읽고 있는 문장(채팅창에서 강조) */
  const [speaking, setSpeaking] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const connected = state.me?.upstream.connected ?? false;

  // 읽는 문장이 바뀔 때 강조 표시를 갱신한다.
  useEffect(() => {
    speaker.onSentence = setSpeaking;
    return () => {
      speaker.onSentence = null;
    };
  }, [speaker]);

  // 새 글이 오면 맨 아래로 내린다.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || state.busy) return;
    void send(draft);
    setDraft('');
  };

  // Enter = 보내기, Shift+Enter = 줄바꿈. 한글 조합 중(isComposing)의 Enter 는 무시한다.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onDraftChange = (value: string) => {
    // "내가 입력하면 멈추기": 글을 쓰기 시작하면 읽기를 멈춘다.
    if (value && !draft && state.voice.stopOnTyping) speaker.stop();
    setDraft(value);
  };

  return (
    <section className="chat" aria-label="채팅">
      <div className={`chat__notice${connected ? '' : ' chat__notice--off'}`} role="note">
        <span className={`dot${connected ? ' dot--on' : ''}`} aria-hidden="true" />
        <span>
          {connected ? t.chat.externalNotice : t.chat.notConnected}
          <span className="visually-hidden"> ({connected ? t.chat.connected : t.chat.disconnected})</span>
        </span>
      </div>

      <div className="chat__list" ref={listRef} role="log" aria-live="polite">
        {state.messages.map((m) => (
          <Bubble key={m.id} message={m} speaking={speaking} onAction={(a) => void runAction(m.id, a)} />
        ))}
      </div>

      <form className="chat__input" onSubmit={submit}>
        <textarea
          value={draft}
          rows={2}
          maxLength={2000}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.placeholder}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="chat__buttons">
          <Button
            variant="ghost"
            aria-pressed={state.voice.enabled}
            title={state.voice.enabled ? t.chat.speakOn : t.chat.speakOff}
            onClick={() => dispatch({ type: 'set_voice', patch: { enabled: !state.voice.enabled } })}
          >
            {state.voice.enabled ? '🔊' : '🔇'}
            <span className="visually-hidden">{state.voice.enabled ? t.chat.speakOn : t.chat.speakOff}</span>
          </Button>
          {state.busy ? (
            <Button onClick={stop}>{t.chat.stop}</Button>
          ) : (
            <Button variant="primary" type="submit" disabled={!draft.trim()}>
              {t.chat.send}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

interface BubbleProps {
  message: ChatMessage;
  speaking: string | null;
  onAction: (action: NonNullable<ChatMessage['actions']>[number]) => void;
}

/** 말풍선 하나. 줄바꿈은 CSS(white-space: pre-wrap)로 살린다. */
function Bubble({ message, speaking, onAction }: BubbleProps) {
  const cls = [
    'bubble',
    `bubble--${message.role}`,
    message.error ? 'bubble--error' : '',
    // 지금 읽는 문장이 이 말풍선 안에 있으면 강조한다.
    speaking && message.role === 'assistant' && message.content.includes(speaking.slice(0, 12)) ? 'bubble--speaking' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <p className="bubble__text">
        {message.content || (message.streaming ? t.chat.thinking : '')}
        {message.streaming && message.content ? <span className="cursor" aria-hidden="true" /> : null}
      </p>
      {message.actions && !message.actionsDone ? (
        <div className="bubble__actions">
          {message.actions.map((a, i) => (
            <Button key={i} small variant={i === 0 ? 'primary' : 'default'} onClick={() => onAction(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
