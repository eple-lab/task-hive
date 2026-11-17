/**
 * 왼쪽 패널: 하이브.
 *
 * 구성 (docs/04-screens.md 4장)
 * - 벌집(HiveView) 또는 리스트(ListView). 리스트는 좁은 화면·키보드·화면 낭독기 사용자를 위한 대체 화면이다.
 * - 칸을 누르면 상세(TaskDetail)가 열린다.
 * - 하단 버튼: 리스트/벌집 전환, 구글시트 가기(지금은 구글 연결 전이라 "MD로 내려받기").
 * - 벌집이 꽉 차면 보관함 안내(D-24).
 */
import { api } from '../../shared/api/client';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Button } from '../../shared/ui/controls';
import { HiveView } from './HiveView';
import { ListView } from './ListView';
import { TaskDetail } from './TaskDetail';

export function HivePanel() {
  const { state, dispatch } = useStore();
  const mode = state.ui.hiveMode;
  const maxCells = state.me?.limits.hive_max_cells ?? 37;
  const inHive = state.tasks.filter((x) => !x.archived).length;
  const selected = state.tasks.find((x) => x.id === state.ui.selectedTaskId) ?? null;
  // 시트 내보내기는 구글 로그인 + 토글을 켠 경우에만(D-18). 지금은 항상 내려받기다.
  const sheetOn = state.me?.mode === 'google' && state.me.features.task_sheet === true;

  const onExport = () => {
    // 손님은 내려받는 즉시 서버 데이터가 지워진다(D-07). 실수로 누르지 않게 한 번 확인한다.
    if (state.me?.mode === 'guest' && !window.confirm(t.hive.exportWarn)) return;
    window.location.assign(api.exportUrl());
  };

  return (
    <section className="hivepanel" aria-label={t.hive.title}>
      <header className="hivepanel__head">
        <h2>{t.hive.title}</h2>
        <span className="muted">
          {inHive}/{maxCells}
        </span>
      </header>

      {inHive >= maxCells ? <p className="banner">{t.hive.full}</p> : null}

      <div className="hivepanel__body">{mode === 'hive' ? <HiveView /> : <ListView />}</div>

      {selected ? <TaskDetail task={selected} /> : null}

      <footer className="hivepanel__foot">
        <Button onClick={() => dispatch({ type: 'ui', patch: { hiveMode: mode === 'hive' ? 'list' : 'hive' } })}>
          {mode === 'hive' ? t.hive.toList : t.hive.toHive}
        </Button>
        {sheetOn ? (
          <Button disabled title="2단계">
            {t.hive.sheet}
          </Button>
        ) : (
          <Button onClick={onExport} disabled={state.tasks.length === 0}>
            {t.hive.exportMd}
          </Button>
        )}
      </footer>
    </section>
  );
}
