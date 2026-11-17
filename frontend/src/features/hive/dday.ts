/**
 * D-day 계산.
 *
 * 규칙 (docs/04-screens.md 4장)
 * - 날짜 없음 → 표시 없음(null)
 * - 오늘 → "D-DAY"
 * - 앞으로 N일 → "D-N"
 * - N일 지남 → "D+N"
 *
 * 시간대 메모: "YYYY-MM-DD" 를 그대로 Date 로 만들면 UTC 자정이 되어 한국에서는 하루가 밀릴 수 있다.
 * 그래서 연·월·일 숫자만 꺼내 "날짜 번호"끼리 뺀다.
 */

/** "YYYY-MM-DD" → 1970-01-01 부터의 날 수. 형식이 틀리면 null. */
export function dayNumber(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000);
}

/** 사용자의 "오늘"(기기 시간대 기준)을 "YYYY-MM-DD" 로. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 마감일까지 남은 날 수. 오늘이면 0, 지났으면 음수. 날짜가 없거나 형식이 틀리면 null. */
export function daysLeft(dueDate: string | null, today: string): number | null {
  if (!dueDate) return null;
  const due = dayNumber(dueDate);
  const base = dayNumber(today);
  if (due === null || base === null) return null;
  return due - base;
}

/** 벌집 칸에 보일 D-day 글자. */
export function ddayLabel(dueDate: string | null, today: string): string | null {
  const left = daysLeft(dueDate, today);
  if (left === null) return null;
  if (left === 0) return 'D-DAY';
  return left > 0 ? `D-${left}` : `D+${-left}`;
}
