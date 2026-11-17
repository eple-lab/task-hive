/**
 * 벌집 그림 (SVG).
 *
 * 하는 일
 * - 보관하지 않은 태스크를 육각형 칸으로 그린다. 칸마다 짧은 제목, D-day, 꿀 높이를 보여 준다.
 * - 칸은 진짜 버튼처럼 동작한다(Tab 으로 이동, Enter/Space 로 열기). SVG 요소라서 role 과 tabIndex 를 붙였다.
 * - 방금 등록한 태스크가 있으면(flightTaskIds) 벌 비행 → 클로즈업 → 새 칸 생성 순서로 보여 준다(R-HIVE-4).
 *
 * 왜 SVG 인가 (D-06)
 * - 구형 기기에서도 가볍고, 칸 하나하나가 실제 요소라 클릭·키보드·화면 낭독기·테스트가 쉽다.
 *
 * 꿀 채우기: 육각형 모양으로 자른(clipPath) 영역 안에 아래에서부터 사각형을 올린다.
 * 색은 CSS 변수(--honey)라서 라이트는 노란 꿀, 다크는 파란 꿀이 된다(R-LAYOUT-3).
 */
import { useCallback, useMemo, type KeyboardEvent } from 'react';
import type { Task } from '../../shared/api/types';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Bee } from './Bee';
import { ddayLabel, todayIso } from './dday';
import {
  allCells,
  axialToPixel,
  cellKey,
  hexPoints,
  hiveExtent,
  honeyRatio,
  ringOf,
  nextFreeCell,
  shortTitle,
  type Axial,
} from './layout';

/** 육각형 크기(중심에서 꼭짓점까지). viewBox 단위라 실제 크기는 패널 폭에 맞춰 늘어난다. */
const SIZE = 46;

interface Placed {
  task: Task;
  cell: Axial;
}

/**
 * 태스크마다 칸을 정한다.
 * 서버가 준 좌표(hex_q, hex_r)를 먼저 쓰고, 좌표가 없거나 겹치면 가운데부터 빈 칸에 놓는다.
 */
export function placeTasks(tasks: Task[], maxRings: number): Placed[] {
  const valid = new Set(allCells(maxRings).map(cellKey));
  const used = new Map<string, Axial>();
  const placed: Placed[] = [];
  const homeless: Task[] = [];
  for (const task of tasks) {
    if (task.hex_q !== null && task.hex_r !== null) {
      const cell = { q: task.hex_q, r: task.hex_r };
      const key = cellKey(cell);
      if (valid.has(key) && !used.has(key)) {
        used.set(key, cell);
        placed.push({ task, cell });
        continue;
      }
    }
    homeless.push(task);
  }
  for (const task of homeless) {
    const cell = nextFreeCell(used.values(), maxRings);
    if (!cell) break; // 꽉 찼다 → 리스트에서만 보인다
    used.set(cellKey(cell), cell);
    placed.push({ task, cell });
  }
  return placed;
}

export function HiveView() {
  const { state, dispatch } = useStore();
  const maxRings = state.me?.limits.hive_max_rings ?? 3;
  const today = todayIso();
  const flight = state.ui.flightTaskIds;

  const visible = useMemo(() => state.tasks.filter((x) => !x.archived), [state.tasks]);
  const placed = useMemo(() => placeTasks(visible, maxRings), [visible, maxRings]);
  // 보여 줄 고리 수: 지금 채운 가장 바깥 고리 + 1 (최소 1, 최대 maxRings).
  // 예전에는 37칸 전체가 들어가게 고정해서, 칸이 몇 개 없을 때 칸이 너무 작게 보였다.
  // 칸이 늘어 바깥 고리로 넘어가면 보기 영역이 커지며 칸이 자연스럽게 줄어든다.
  const shownRings = Math.min(maxRings, Math.max(1, ...placed.map((p) => ringOf(p.cell) + 1)));
  const { halfW, halfH } = hiveExtent(shownRings, SIZE);

  // Bee 의 타이머가 화면이 다시 그려질 때마다 초기화되지 않게, 끝내는 함수를 고정해 둔다.
  const endFlight = useCallback(() => dispatch({ type: 'end_flight' }), [dispatch]);

  const open = (id: number) => dispatch({ type: 'ui', patch: { selectedTaskId: id } });
  const onKey = (e: KeyboardEvent<SVGGElement>, id: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(id);
    }
  };

  if (visible.length === 0 && !flight) {
    return (
      <div className="hive hive--empty">
        <svg viewBox="-60 -60 120 120" className="hive__svg hive__svg--empty" aria-hidden="true">
          <polygon className="cell__shape" points={hexPoints({ x: 0, y: 0 }, SIZE)} />
        </svg>
        <p>{t.hive.empty}</p>
      </div>
    );
  }

  return (
    <div className={`hive${flight ? ' hive--flight' : ''}`}>
      <svg
        className="hive__svg"
        viewBox={`${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`}
        role="group"
        aria-label={`${t.hive.title}: 태스크 ${visible.length}개`}
      >
        {placed.map(({ task, cell }) => {
          const c = axialToPixel(cell, SIZE);
          const ratio = honeyRatio(task);
          const label = task.completed ? t.hive.done : ddayLabel(task.due_date, today);
          const clipId = `clip-${task.id}`;
          // 꿀 높이: 육각형 전체 높이(2 * SIZE) 중 ratio 만큼 아래에서부터
          const honeyH = 2 * SIZE * ratio;
          const isNew = flight?.includes(task.id) ?? false;
          const newIndex = isNew && flight ? flight.indexOf(task.id) : 0;
          const subs = task.subtasks.length;
          const doneSubs = task.subtasks.filter((s) => s.completed).length;
          const aria = [
            task.title,
            label ?? t.hive.noDue,
            subs > 0 ? `하위 ${doneSubs}/${subs}` : '',
            task.completed ? '완료' : '',
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <g
              key={task.id}
              className={`cell${task.completed ? ' cell--done' : ''}${isNew ? ' cell--new' : ''}`}
              // 새 칸은 벌이 도착한 뒤(약 1.6초) 하나씩 차례로 나타난다.
              style={isNew ? { animationDelay: `${1.6 + newIndex * 0.18}s` } : undefined}
              role="button"
              tabIndex={0}
              aria-label={aria}
              onClick={() => open(task.id)}
              onKeyDown={(e) => onKey(e, task.id)}
            >
              <clipPath id={clipId}>
                <polygon points={hexPoints(c, SIZE - 2)} />
              </clipPath>
              <polygon className="cell__shape" points={hexPoints(c, SIZE - 2)} />
              <rect
                className="cell__honey"
                clipPath={`url(#${clipId})`}
                x={c.x - SIZE}
                y={c.y + SIZE - honeyH}
                width={SIZE * 2}
                height={honeyH}
              />
              {label ? (
                <text className={`cell__dday${task.completed ? ' cell__dday--done' : ''}`} x={c.x} y={c.y - 14}>
                  {label}
                </text>
              ) : null}
              <text className="cell__title" x={c.x} y={c.y + 6}>
                {shortTitle(task.title)}
              </text>
              {subs > 0 ? (
                <text className="cell__count" x={c.x} y={c.y + 24}>
                  {doneSubs}/{subs}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {flight ? <Bee onDone={endFlight} /> : null}
    </div>
  );
}
