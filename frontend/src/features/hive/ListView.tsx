/**
 * 리스트로 보기.
 *
 * 벌집 대신 태스크와 하위 태스크를 목록으로 보여 준다(todo 앱 화면과 같은 구성).
 * 진행률(2/4), D-day, 체크박스가 있다. 보관함으로 옮긴 태스크(D-24)는 여기에서만 보인다.
 */
import { api, ApiError } from '../../shared/api/client';
import type { Task } from '../../shared/api/types';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { ddayLabel, todayIso } from './dday';

export function ListView() {
  const { state, dispatch } = useStore();
  const today = todayIso();
  const active = state.tasks.filter((x) => !x.archived);
  const archived = state.tasks.filter((x) => x.archived);

  const fail = (e: unknown) =>
    dispatch({
      type: 'add_message',
      message: { role: 'system', error: true, content: e instanceof ApiError ? e.message : '문제가 생겼어요.' },
    });

  const toggleSub = async (task: Task, sid: number, completed: boolean) => {
    try {
      dispatch({ type: 'upsert_task', task: await api.patchSubtask(task.id, sid, { completed }) });
    } catch (e) {
      fail(e);
    }
  };

  const row = (task: Task) => {
    const label = task.completed ? t.hive.done : ddayLabel(task.due_date, today);
    const done = task.subtasks.filter((s) => s.completed).length;
    return (
      <li key={task.id} className={`listrow${task.completed ? ' listrow--done' : ''}`}>
        <button
          type="button"
          className="listrow__title"
          onClick={() => dispatch({ type: 'ui', patch: { selectedTaskId: task.id } })}
        >
          <span>{task.title}</span>
          <span className="listrow__meta">
            {task.subtasks.length > 0 ? `${done}/${task.subtasks.length}` : ''}
            {label ? <span className={`tag${task.completed ? ' tag--done' : ''}`}>{label}</span> : null}
          </span>
        </button>
        {task.subtasks.length > 0 ? (
          <ul className="sublist">
            {task.subtasks.map((s) => (
              <li key={s.id}>
                <label className={s.completed ? 'checked' : ''}>
                  <input
                    type="checkbox"
                    checked={s.completed}
                    onChange={(e) => void toggleSub(task, s.id, e.target.checked)}
                  />
                  <span>{s.title}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  if (state.tasks.length === 0) return <p className="muted pad">{t.hive.empty}</p>;

  return (
    <div className="listview">
      <ul className="list">{active.map(row)}</ul>
      {archived.length > 0 ? (
        <>
          <h3 className="list__head">
            {t.hive.archive} ({archived.length})
          </h3>
          <ul className="list list--archived">{archived.map(row)}</ul>
        </>
      ) : null}
    </div>
  );
}
