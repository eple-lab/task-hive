/**
 * 벌집의 자리 계산 (그림과 무관한 순수 계산).
 *
 * 하는 일
 * - 육각 격자 좌표 (q, r) ↔ 화면 좌표 (x, y) 변환
 * - 고리(ring) 계산: 가운데 0단 1칸, 1단 6칸, 2단 12칸, 3단 18칸 → 3단까지 37칸 (초안, D-24)
 * - 가운데부터 바깥으로 "다음 빈 칸" 찾기
 *
 * 왜 그림과 나눴나
 * - 나중에 Three.js 3D로 바꿀 때 이 계산은 그대로 쓰고 그리기만 바꾼다(docs/03 9장).
 * - 순수 함수라 테스트하기 쉽다(layout.test.ts).
 *
 * 좌표계: "축 좌표(axial)". 세 번째 축 s = -q - r. 가운데에서의 거리 = max(|q|, |r|, |s|).
 * 모양: 꼭짓점이 위로 향한 육각형(pointy-top).
 */

export interface Axial {
  q: number;
  r: number;
}

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/** 가운데 칸에서 몇 번째 고리에 있는가 (0 = 가운데). */
export function ringOf(cell: Axial): number {
  const s = -cell.q - cell.r;
  return Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(s));
}

/** 고리 수 n 까지의 전체 칸 수. 1 + 3n(n+1) → 0:1, 1:7, 2:19, 3:37, 4:61 */
export function cellCount(maxRings: number): number {
  const n = Math.max(0, Math.floor(maxRings));
  return 1 + 3 * n * (n + 1);
}

/** n번째 고리에 있는 칸들(시계 방향 순서). n=0 이면 가운데 한 칸. */
export function ringCells(n: number): Axial[] {
  if (n <= 0) return [{ q: 0, r: 0 }];
  // 여섯 방향으로 n칸씩 걸으며 고리를 한 바퀴 돈다.
  const dirs: Axial[] = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
  ];
  const cells: Axial[] = [];
  // 시작점: 방향 4(위쪽)로 n칸 간 자리
  let q = 0;
  let r = -n;
  for (const d of dirs) {
    for (let i = 0; i < n; i++) {
      cells.push({ q, r });
      q += d.q;
      r += d.r;
    }
  }
  return cells;
}

/** 가운데부터 maxRings 단까지의 모든 칸(안쪽 고리 먼저). */
export function allCells(maxRings: number): Axial[] {
  const out: Axial[] = [];
  for (let n = 0; n <= maxRings; n++) out.push(...ringCells(n));
  return out;
}

export function cellKey(cell: Axial): string {
  return `${cell.q},${cell.r}`;
}

/**
 * 비어 있는 칸 중 가장 안쪽 칸을 고른다. 꽉 찼으면 null.
 * 서버가 좌표를 배정하는 것이 원칙이고(원본은 서버), 이 함수는
 * 서버가 좌표를 주지 않은 태스크를 화면에 놓을 때만 쓴다.
 */
export function nextFreeCell(used: Iterable<Axial>, maxRings: number): Axial | null {
  const taken = new Set<string>();
  for (const c of used) taken.add(cellKey(c));
  for (const c of allCells(maxRings)) {
    if (!taken.has(cellKey(c))) return c;
  }
  return null;
}

/** 축 좌표 → 화면 좌표. size = 육각형 중심에서 꼭짓점까지의 길이. */
export function axialToPixel(cell: Axial, size: number): Point {
  return {
    x: size * SQRT3 * (cell.q + cell.r / 2),
    y: size * 1.5 * cell.r,
  };
}

/** 육각형 꼭짓점 6개를 SVG polygon 의 points 문자열로 만든다. */
export function hexPoints(center: Point, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90); // -90도에서 시작 → 꼭짓점이 위
    pts.push(`${(center.x + size * Math.cos(angle)).toFixed(2)},${(center.y + size * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** maxRings 단짜리 벌집 전체가 들어가는 viewBox 의 반쪽 크기. */
export function hiveExtent(maxRings: number, size: number): { halfW: number; halfH: number } {
  return {
    halfW: size * SQRT3 * (maxRings + 0.5) + size * 0.2,
    halfH: size * (1.5 * maxRings + 1) + size * 0.2,
  };
}

/** 벌집 칸에 보일 짧은 제목: 5글자까지, 넘으면 … (초안의 규칙) */
export function shortTitle(title: string, max = 5): string {
  const chars = Array.from(title.trim()); // 한글·이모지를 글자 단위로 자른다
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}

/**
 * 꿀이 찬 비율(0~1).
 * - 하위 태스크가 있으면 완료한 개수 / 전체
 * - 없으면 완료 시 가득(1), 아니면 0
 */
export function honeyRatio(task: { completed: boolean; subtasks: { completed: boolean }[] }): number {
  if (task.completed) return 1;
  if (task.subtasks.length === 0) return 0;
  const done = task.subtasks.filter((s) => s.completed).length;
  return done / task.subtasks.length;
}
