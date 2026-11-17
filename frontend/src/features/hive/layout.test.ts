/**
 * 벌집 자리 계산과 D-day 계산 테스트.
 * 기대 결과를 먼저 적고(주석), 그 값과 비교한다.
 */
import { describe, expect, it } from 'vitest';
import {
  allCells,
  axialToPixel,
  cellCount,
  cellKey,
  honeyRatio,
  nextFreeCell,
  ringCells,
  ringOf,
  shortTitle,
} from './layout';
import { ddayLabel, daysLeft, dayNumber } from './dday';

describe('벌집 칸 수', () => {
  // 기대: 0단 1칸, 1단 7칸, 2단 19칸, 3단 37칸, 4단 61칸 (초안의 규칙: n번째 고리에 6n칸)
  it('고리 수에 따른 전체 칸 수', () => {
    expect(cellCount(0)).toBe(1);
    expect(cellCount(1)).toBe(7);
    expect(cellCount(2)).toBe(19);
    expect(cellCount(3)).toBe(37);
    expect(cellCount(4)).toBe(61);
  });

  // 기대: n번째 고리에는 6n칸, 모두 가운데에서 거리 n
  it('각 고리의 칸 수와 거리', () => {
    for (let n = 1; n <= 4; n++) {
      const cells = ringCells(n);
      expect(cells).toHaveLength(6 * n);
      for (const c of cells) expect(ringOf(c)).toBe(n);
    }
  });

  // 기대: 3단 벌집은 37칸이고 좌표가 하나도 겹치지 않는다
  it('3단은 37칸, 좌표 겹침 없음', () => {
    const cells = allCells(3);
    expect(cells).toHaveLength(37);
    expect(new Set(cells.map(cellKey)).size).toBe(37);
  });

  // 기대: 화면 좌표도 겹치지 않는다(두 칸의 중심이 같은 자리에 오지 않는다)
  it('화면 좌표 겹침 없음', () => {
    const pts = allCells(3).map((c) => axialToPixel(c, 40));
    const keys = new Set(pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(keys.size).toBe(37);
  });

  // 기대: 이웃한 두 칸의 중심 거리는 size * sqrt(3)
  it('이웃 칸 사이 거리', () => {
    const a = axialToPixel({ q: 0, r: 0 }, 40);
    const b = axialToPixel({ q: 1, r: 0 }, 40);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(40 * Math.sqrt(3), 6);
  });
});

describe('다음 빈 칸', () => {
  // 기대: 비어 있으면 가운데(0,0)부터
  it('빈 벌집은 가운데부터', () => {
    expect(nextFreeCell([], 3)).toEqual({ q: 0, r: 0 });
  });

  // 기대: 가운데가 차 있으면 1단 고리의 칸
  it('가운데가 차면 1단으로', () => {
    const next = nextFreeCell([{ q: 0, r: 0 }], 3);
    expect(next).not.toBeNull();
    expect(ringOf(next!)).toBe(1);
  });

  // 기대: 37칸이 다 차면 null (꽉 참 → 보관함 안내, D-24)
  it('꽉 차면 null', () => {
    expect(nextFreeCell(allCells(3), 3)).toBeNull();
  });

  // 기대: 고리 수를 4로 늘리면(환경변수 HIVE_MAX_RINGS) 38번째 칸이 생긴다
  it('고리 수를 늘리면 자리가 생긴다', () => {
    const next = nextFreeCell(allCells(3), 4);
    expect(next).not.toBeNull();
    expect(ringOf(next!)).toBe(4);
  });
});

describe('칸에 보이는 값', () => {
  // 기대: 5글자까지는 그대로, 넘으면 5글자 + …
  it('짧은 제목', () => {
    expect(shortTitle('장보기')).toBe('장보기');
    expect(shortTitle('병원예약하')).toBe('병원예약하');
    expect(shortTitle('병원 예약하기')).toBe('병원 예약…');
  });

  // 기대: 하위 없음+미완료 0, 하위 4개 중 1개 완료 0.25, 완료면 1
  it('꿀 비율', () => {
    expect(honeyRatio({ completed: false, subtasks: [] })).toBe(0);
    expect(
      honeyRatio({
        completed: false,
        subtasks: [{ completed: true }, { completed: false }, { completed: false }, { completed: false }],
      }),
    ).toBe(0.25);
    expect(honeyRatio({ completed: true, subtasks: [{ completed: false }] })).toBe(1);
  });
});

describe('D-day', () => {
  const today = '2026-11-17';

  // 기대: 날짜 없음 → null(표시 없음)
  it('날짜가 없으면 표시 없음', () => {
    expect(ddayLabel(null, today)).toBeNull();
  });

  // 기대: 오늘 → D-DAY, 내일 → D-1, 어제 → D+1
  it('오늘·내일·어제 경계', () => {
    expect(ddayLabel('2026-11-17', today)).toBe('D-DAY');
    expect(ddayLabel('2026-11-18', today)).toBe('D-1');
    expect(ddayLabel('2026-11-16', today)).toBe('D+1');
  });

  // 기대: 달과 해가 바뀌어도 날 수가 맞다 (11/17 → 12/01 = 14일, → 다음 해 1/1 = 45일)
  it('달·해를 넘는 계산', () => {
    expect(daysLeft('2026-12-01', today)).toBe(14);
    expect(daysLeft('2027-01-01', today)).toBe(45);
  });

  // 기대: 형식이 틀린 값은 null (화면이 깨지지 않게)
  it('틀린 형식은 null', () => {
    expect(dayNumber('2026/11/17')).toBeNull();
    expect(ddayLabel('내일', today)).toBeNull();
  });
});
