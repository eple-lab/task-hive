/**
 * 태스크 상세: 벌집 칸이나 리스트의 제목을 누르면 열린다.
 *
 * 할 수 있는 일
 * - 전체 제목, D-day, 하위 태스크 체크, 하위 태스크 추가
 * - 완료/완료 취소, 보관함으로 옮기기(D-24), 지우기
 *
 * todo 앱에서 이어받은 규칙 (docs/01 5.5)
 * - 안 끝난 하위 태스크가 있는 태스크를 완료할 때, 하위 태스크가 있는 태스크를 지울 때는 확인받는다.
 * - 같은 규칙을 서버도 다시 검사한다(화면 검사는 편의일 뿐, 믿지 않는다).
 * - 삭제는 여기(화면)에서만 된다. 대화로는 지우지 못한다(D-21).
 */
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../shared/api/client';
import type { Task } from '../../shared/api/types';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Button } from '../../shared/ui/controls';
import { ddayLabel, todayIso } from './dday';

export function TaskDetail({ task }: { task: Task }) {
  const { dispatch } = useStore();
  const [subTitle, setSubTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const label = task.completed ? t.hive.done : ddayLabel(task.due_date, todayIso());
  const d = t.hive.detail;

  /** 서버 호출을 감싸 오류를 이 창 안에 보여 준다. */
  const run = async (fn: () => Promise<Task | void>) => {
    setWorking(true);
    setError(null);
    try {
      const updated = await fn();
      if (updated) dispatch({ type: 'upsert_task', task: updated });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '문제가 생겼어요.');
    } finally {
      setWorking(false);
    }
  };

  const close = () => dispatch({ type: 'ui', patch: { selectedTaskId: null } });

  const toggleComplete = () => {
    const open = task.subtasks.filter((s) => !s.completed);
    if (!task.completed && open.length > 0 && !window.confirm(d.confirmComplete)) return;
    void run(async () => {
      if (!task.completed) {
        // 하위 태스크를 먼저 모두 체크한 뒤 태스크를 완료한다.
        for (const s of open) await api.patchSubtask(task.id, s.id, { completed: true });
      }
      return api.patchTask(task.id, { completed: !task.completed });
    });
  };

  const remove = () => {
    if (!window.confirm(d.confirmDelete)) return;
    void run(async () => {
      await api.deleteTask(task.id);
      dispatch({ type: 'remove_task', id: task.id });
    });
  };

  const addSub = (e: FormEvent) => {
    e.preventDefault();
    const title = subTitle.trim();
    if (!title) return;
    // 같은 태스크 안에서는 하위 태스크 제목이 겹치면 안 된다(서버도 검사한다).
    if (task.subtasks.some((s) => s.title.trim() === title)) {
      setError('같은 이름의 하위 태스크가 이미 있어요.');
      return;
    }
    setSubTitle('');
    void run(() => api.addSubtask(task.id, title));
  };

  return (
    <div className="detail" role="dialog" aria-label={task.title}>
      <header className="detail__head">
        <h3>{task.title}</h3>
        <Button variant="ghost" small onClick={close} aria-label={d.close}>
          ✕
        </Button>
      </header>
      <p className="muted">
        {label ? <span className={`tag${task.completed ? ' tag--done' : ''}`}>{label}</span> : t.hive.noDue}
        {task.due_date ? ` · ${task.due_date}` : ''}
      </p>

      {task.subtasks.length > 0 ? (
        <ul className="sublist">
          {task.subtasks.map((s) => (
            <li key={s.id}>
              <label className={s.completed ? 'checked' : ''}>
                <input
                  type="checkbox"
                  checked={s.completed}
                  disabled={working}
                  onChange={(e) => void run(() => api.patchSubtask(task.id, s.id, { completed: e.target.checked }))}
                />
                <span>{s.title}</span>
              </label>
              <Button
                variant="ghost"
                small
                disabled={working}
                aria-label={`${s.title} ${d.delete}`}
                onClick={() => void run(() => api.deleteSubtask(task.id, s.id))}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="detail__add" onSubmit={addSub}>
        <input
          value={subTitle}
          maxLength={200}
          placeholder={d.subPlaceholder}
          aria-label={d.subPlaceholder}
          onChange={(e) => setSubTitle(e.target.value)}
        />
        <Button type="submit" small disabled={working || !subTitle.trim()}>
          {d.addSub}
        </Button>
      </form>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="detail__foot">
        <Button variant="primary" small disabled={working} onClick={toggleComplete}>
          {task.completed ? d.reopen : d.complete}
        </Button>
        <Button
          small
          disabled={working}
          onClick={() => void run(() => api.patchTask(task.id, { archived: !task.archived }))}
        >
          {task.archived ? d.fromArchive : d.toArchive}
        </Button>
        <Button variant="danger" small disabled={working} onClick={remove}>
          {d.delete}
        </Button>
      </footer>
    </div>
  );
}
