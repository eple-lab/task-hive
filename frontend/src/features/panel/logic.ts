/**
 * 상태창의 "화면 없는 계산" 모음.
 *
 * 왜 따로 두나
 * - 컴포넌트에서 계산과 서버 호출 결과 처리를 떼어 두면 화면을 그리지 않고 vitest 로 시험할 수 있다.
 * - 여기 있는 것은 모두 부수 효과가 없거나(순수 함수), 호출할 api 를 인자로 받는다(가짜 서버로 시험 가능).
 */
import { ApiError } from '../../shared/api/client';
import type { Api } from '../../shared/api/client';
import type { BulkItem, Me, Task } from '../../shared/api/types';
import type { LocalCandidate } from '../../shared/state/store';

/** 서버(app/services/weather.py CITIES)가 받는 도시 목록. 서버가 다시 검사하므로 화면 목록은 선택지일 뿐이다. */
export const CITIES = [
  '서울', '부산', '인천', '대구', '대전', '광주', '울산', '세종',
  '수원', '춘천', '강릉', '청주', '전주', '포항', '창원', '제주',
] as const;

/** 서버가 허용하는 대화 설정 범위(app/routers/settings.py LlmIn). 화면 슬라이더의 범위와 같다. */
export const LLM_LIMITS = {
  temperature: { min: 0, max: 1.5, step: 0.05 },
  max_tokens: { min: 50, max: 2000, step: 50 },
} as const;

const GENERIC = '문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';

/**
 * 오류를 사용자에게 보여 줄 문장으로 바꾼다.
 * 서버가 준 한국어 안내(400 주소 검사 실패, 502 연결 실패, 409 벌집 꽉 참·제목 중복 등)는 그대로 쓴다.
 */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : GENERIC;
}

/** 연결 입력을 서버에 보내기 전 검사. 빈 칸만 거른다(주소 모양은 서버가 검사한다). 문제가 없으면 null. */
export function validateConnectInput(url: string, key: string): string | null {
  if (!url.trim()) return 'ngrok 주소를 입력해 주세요.';
  if (!key.trim()) return '접속 키를 입력해 주세요.';
  return null;
}

export type ConnectOutcome =
  | { ok: true; me: Me; latencyMs: number }
  | { ok: false; message: string };

/**
 * 연결 확인: PUT /api/settings/upstream. 성공하면 연결된 상태를 반영한 me 를, 실패하면 서버 안내문을 돌려준다.
 * 주소·키는 이 함수 안에서만 쓰고 어디에도 남기지 않는다(서버가 암호화 쿠키에 둔다).
 */
export async function connectUpstream(api: Api, me: Me, url: string, key: string): Promise<ConnectOutcome> {
  const problem = validateConnectInput(url, key);
  if (problem) return { ok: false, message: problem };
  try {
    const r = await api.putUpstream(url.trim(), key.trim());
    return { ok: true, me: { ...me, upstream: { connected: r.connected, models: r.models } }, latencyMs: r.latency_ms };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** 등록 예정 항목을 서버 요청 모양으로 바꾼다. 제목은 앞뒤 공백을 지운다. */
export function toBulkItems(pending: LocalCandidate[]): BulkItem[] {
  return pending.map((p) => ({
    title: p.title.trim(),
    due_date: p.due_date,
    subtasks: p.subtasks,
    source: p.source,
  }));
}

export type MoveOutcome = { ok: true; tasks: Task[] } | { ok: false; message: string };

/** 하이브로 옮기기: POST /api/tasks/bulk. 409(벌집 꽉 참·제목 중복) 등의 안내문을 그대로 돌려준다. */
export async function movePending(api: Api, pending: LocalCandidate[]): Promise<MoveOutcome> {
  const items = toBulkItems(pending);
  if (items.length === 0) return { ok: false, message: '옮길 항목이 없어요.' };
  if (items.some((i) => !i.title)) return { ok: false, message: '제목이 빈 항목이 있어요. 제목을 적거나 빼 주세요.' };
  try {
    return { ok: true, tasks: await api.bulk(items) };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** 한국어 음성만 고른다(lang 이 ko 로 시작). 목소리 선택 목록용. */
export function koreanVoices<T extends { lang: string }>(voices: T[]): T[] {
  return voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ko'));
}

/** 두 설정 객체에서 값이 달라진 필드만 뽑는다(PUT /api/settings 는 바꾼 필드만 보낸다). */
export function changedFields<T extends object>(before: T, after: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (after[k] !== undefined && after[k] !== before[k]) out[k] = after[k];
  }
  return out;
}
