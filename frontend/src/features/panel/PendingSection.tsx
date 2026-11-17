/**
 * 상태창 "하이브 등록 예정" 구역 (docs/04 5.3, R-HIVE-3·4).
 *
 * - 담은 항목 목록(제목, 날짜, 하위 태스크 수). 제목 고치기와 빼기가 된다.
 * - "벌집으로 옮기기": POST /api/tasks/bulk 를 부르고, 성공한 뒤에만 벌 애니메이션을 시작한다(docs/04 4장).
 *   실패(409 벌집 꽉 참·제목 중복 등)하면 서버 안내문을 이 구역에 보여 주고 목록은 그대로 둔다(잃지 않게).
 * - 옮기기·빼기 결과는 채팅창에도 한 줄 남긴다(R-CHAT-5).
 */
import { useState } from 'react';
import { api } from '../../shared/api/client';
import { t } from '../../shared/i18n/ko';
import { useStore, type LocalCandidate } from '../../shared/state/store';
import { Button, Collapsible } from '../../shared/ui/controls';
import { movePending } from './logic';

/** 항목 한 줄. 제목을 고치는 중인지만 이 안에서 안다. */
function PendingRow({ item }: { item: LocalCandidate }) {
  const { dispatch } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  const save = () => {
    const title = draft.trim();
    if (!title) return; // 빈 제목은 저장하지 않는다(서버도 거절한다)
    dispatch({ type: 'update_pending', localId: item.localId, patch: { title } });
    setEditing(false);
  };
  const remove = () => {
    dispatch({ type: 'remove_pending', localId: item.localId });
    dispatch({ type: 'add_message', message: { role: 'system', content: t.notices.removedPending(item.title) } });
  };

  return (
    <li className="card">
      {editing ? (
        <form
          className="card__edit"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            value={draft}
            maxLength={200}
            aria-label={t.panel.pending.editTitle}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button small variant="primary" type="submit" disabled={!draft.trim()}>
            {t.panel.pending.save}
          </Button>
          <Button
            small
            variant="ghost"
            onClick={() => {
              setDraft(item.title);
              setEditing(false);
            }}
          >
            {t.panel.pending.cancel}
          </Button>
        </form>
      ) : (
        <>
          <p className="card__title">{item.title}</p>
          <p className="card__meta">
            <span className="tag">{item.due_date ?? t.panel.candidates.noDue}</span>
            {item.subtasks.length > 0 ? <span className="tag">{t.panel.pending.subtasks(item.subtasks.length)}</span> : null}
          </p>
          <div className="card__actions">
            <Button small onClick={() => setEditing(true)}>
              {t.panel.pending.edit}
            </Button>
            <Button small variant="ghost" onClick={remove}>
              {t.panel.pending.remove}
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function PendingSection() {
  const { state, dispatch } = useStore();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = state.pending;

  const move = async () => {
    if (moving || items.length === 0) return;
    setMoving(true);
    setError(null);
    const r = await movePending(api, items);
    setMoving(false);
    if (!r.ok) {
      setError(r.message);
      dispatch({ type: 'add_message', message: { role: 'system', content: r.message, error: true } });
      return;
    }
    for (const task of r.tasks) dispatch({ type: 'upsert_task', task });
    dispatch({ type: 'clear_pending' });
    // 서버 저장이 성공한 뒤에만 벌이 난다.
    dispatch({ type: 'start_flight', taskIds: r.tasks.map((x) => x.id) });
    dispatch({ type: 'add_message', message: { role: 'system', content: t.notices.moved(r.tasks.length) } });
  };

  return (
    <Collapsible title={t.panel.pending.title} badge={items.length}>
      {items.length === 0 ? (
        <p className="muted">{t.panel.pending.empty}</p>
      ) : (
        <ul className="cards">
          {items.map((p) => (
            <PendingRow key={p.localId} item={p} />
          ))}
        </ul>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <Button className="btn--block" variant="primary" disabled={items.length === 0 || moving} onClick={move}>
        {moving ? t.panel.pending.moving : t.panel.pending.move}
      </Button>
    </Collapsible>
  );
}
