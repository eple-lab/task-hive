/**
 * 상태창 "후보" 구역 (docs/04 5.2, P-06).
 *
 * 대화에서 AI가 뽑은 할 일 후보를 카드로 보여 준다.
 * - 카드: 제목, 날짜(없으면 "날짜 없음"), 하위 태스크, 근거(evidence: 대화의 어느 문장에서 나왔는지).
 * - "담기": 등록 예정으로 넘긴다. 사용자가 담아야만 다음 단계로 간다(AI는 제안만 한다).
 * - "빼기": 후보에서 버린다.
 * - 상태창에서 한 일은 채팅창에도 한 줄 남긴다(R-CHAT-5).
 *
 * 근거·제목은 AI(외부) 출력이라 믿을 수 없는 글이다. React 가 글자로만 그리므로(HTML 로 해석하지 않음) 안전하다.
 */
import { t } from '../../shared/i18n/ko';
import { useStore, type LocalCandidate } from '../../shared/state/store';
import { Button, Collapsible } from '../../shared/ui/controls';

export function CandidatesSection() {
  const { state, dispatch } = useStore();
  const items = state.candidates;

  const add = (c: LocalCandidate) => {
    dispatch({ type: 'candidate_to_pending', localId: c.localId });
    dispatch({ type: 'add_message', message: { role: 'system', content: t.notices.addedPending(c.title) } });
  };
  const drop = (c: LocalCandidate) => {
    dispatch({ type: 'remove_candidate', localId: c.localId });
    dispatch({ type: 'add_message', message: { role: 'system', content: t.notices.removedCandidate(c.title) } });
  };

  return (
    <Collapsible title={t.panel.candidates.title} badge={items.length}>
      {/* 후보 찾는 중 / 실패 안내. 움직임은 CSS 가 "움직임 줄이기" 설정을 보고 끈다. */}
      {state.extracting === 'running' ? (
        <p className="extracting" role="status">
          <span className="extracting__dot" aria-hidden="true" />
          {t.panel.candidates.extracting}
        </p>
      ) : null}
      {state.extracting === 'failed' ? (
        <p className="extracting extracting--failed" role="status">
          {t.panel.candidates.extractFailed}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="muted">{t.panel.candidates.empty}</p>
      ) : (
        <>
          <p className="help">{t.panel.candidates.guide}</p>
          <ul className="cards">
            {items.map((c) => (
              <li key={c.localId} className="card">
                <p className="card__title">{c.title}</p>
                <p className="card__meta">
                  <span className="tag">{c.due_date ?? t.panel.candidates.noDue}</span>
                  {c.subtasks.length > 0 ? <span className="tag">{t.panel.candidates.sub(c.subtasks.length)}</span> : null}
                </p>
                {c.subtasks.length > 0 ? (
                  <ul className="card__subs">
                    {c.subtasks.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : null}
                {c.evidence ? (
                  <p className="card__evidence">
                    <span className="muted">{t.panel.candidates.evidence}</span> “{c.evidence}”
                  </p>
                ) : null}
                <div className="card__actions">
                  <Button small variant="primary" onClick={() => add(c)}>
                    {t.panel.candidates.add}
                  </Button>
                  <Button small variant="ghost" onClick={() => drop(c)}>
                    {t.panel.candidates.remove}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Collapsible>
  );
}
