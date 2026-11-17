/**
 * 서버 호출을 한곳에 모은 파일.
 *
 * 하는 일
 * - 모든 요청을 같은 출처(우리 FastAPI 서버)로만 보낸다. 화면은 구글이나 Colab을 직접 부르지 않는다.
 * - GET이 아닌 요청에는 `X-TH: 1` 헤더를 붙인다(CSRF 방어. 다른 사이트의 폼은 이 헤더를 못 붙인다).
 * - 서버 오류 모양 `{"error":{"code","message"}}` 을 ApiError 로 바꿔 던진다.
 * - /api/chat 의 SSE(글자가 흘러나오는 응답)를 읽는다.
 * - `npm run dev:mock` 이면 실제 서버 대신 mock.ts 의 가짜 응답을 쓴다.
 *
 * 보안 메모 (docs/05-security.md)
 * - 토큰·ngrok 주소·접속 키를 화면에 보관하지 않는다. 서버가 암호화한 쿠키에 둔다.
 * - 오류 메시지는 서버가 준 한국어 안내만 보여 준다. 서버가 모양을 안 지킨 응답은 일반 문구로 바꾼다.
 */
import type {
  BulkItem,
  ChatEvent,
  ChatRequest,
  DiarySummary,
  ErrorBody,
  ExtractResult,
  Greeting,
  Me,
  SettingsPatch,
  Task,
  UpstreamResult,
  WireMessage,
} from './types';
import { mockApi } from './mock';

/** 서버가 알려 준 오류. code 로 분기하고 message 를 사용자에게 보여 준다. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const GENERIC_ERROR = '서버에서 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.';
const NETWORK_ERROR = '서버에 연결하지 못했어요. 서버가 깨어나는 중일 수 있어요(최대 1분).';

/** 가짜 응답 모드인가. `vite --mode mock` 또는 VITE_USE_MOCK=1 */
export const USE_MOCK: boolean =
  import.meta.env.MODE === 'mock' || import.meta.env.VITE_USE_MOCK === '1';

function isErrorBody(v: unknown): v is ErrorBody {
  if (typeof v !== 'object' || v === null) return false;
  const e = (v as { error?: unknown }).error;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { code?: unknown }).code === 'string' &&
    typeof (e as { message?: unknown }).message === 'string'
  );
}

/** 응답이 실패면 ApiError 를 던진다. 서버가 약속한 모양이 아니면 일반 문구를 쓴다. */
async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* JSON이 아닌 오류 응답(프록시 오류 등) → 일반 문구 */
  }
  if (isErrorBody(body)) throw new ApiError(res.status, body.error.code, body.error.message);
  throw new ApiError(res.status, 'unknown', GENERIC_ERROR);
}

/** 공통 fetch. 쿠키는 같은 출처에만 보낸다. */
async function request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-TH'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', NETWORK_ERROR);
  }
  return ensureOk(res);
}

async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, body);
  return (await res.json()) as T;
}

async function noContent(method: string, path: string, body?: unknown): Promise<void> {
  await request(method, path, body);
}

/**
 * SSE 본문을 읽어 이벤트마다 onEvent 를 부른다.
 * 서버는 `data: {...}\n\n` 형태로 보낸다(llm-chatbot 과 같은 단순 이벤트 형식).
 */
export async function readSse(res: Response, onEvent: (e: ChatEvent) => void): Promise<void> {
  if (!res.body) throw new ApiError(res.status, 'no_body', GENERIC_ERROR);
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // 이벤트는 빈 줄로 구분된다. 마지막 조각은 다음 읽기에서 이어 붙인다.
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as ChatEvent);
        } catch {
          /* 깨진 조각은 버린다. 업스트림 응답은 믿지 않는 자료다. */
        }
      }
    }
  }
}

/** 실제 서버를 부르는 구현 */
const realApi = {
  me: () => json<Me>('GET', '/api/me'),
  guest: (name: string) => json<Me>('POST', '/api/guest', { name }),
  logout: () => noContent('POST', '/auth/logout'),
  putSettings: (patch: SettingsPatch) => json<Me>('PUT', '/api/settings', patch),
  putUpstream: (url: string, key: string) =>
    json<UpstreamResult>('PUT', '/api/settings/upstream', { url, key }),
  deleteUpstream: () => noContent('DELETE', '/api/settings/upstream'),
  greeting: () => json<Greeting>('GET', '/api/greeting'),

  /** 대화. 글자가 올 때마다 onEvent 가 불린다. signal 로 중간에 끊을 수 있다. */
  async chatStream(body: ChatRequest, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
    const res = await request('POST', '/api/chat', body, signal);
    await readSse(res, onEvent);
  },

  extract: (messages: WireMessage[]) => json<ExtractResult>('POST', '/api/extract', { messages }),
  tasks: async () => (await json<{ tasks: Task[] }>('GET', '/api/tasks')).tasks,
  bulk: async (items: BulkItem[]) =>
    (await json<{ tasks: Task[] }>('POST', '/api/tasks/bulk', { items })).tasks,
  patchTask: (id: number, patch: Partial<Pick<Task, 'title' | 'due_date' | 'completed' | 'archived'>>) =>
    json<Task>('PATCH', `/api/tasks/${id}`, patch),
  deleteTask: (id: number) => noContent('DELETE', `/api/tasks/${id}`),
  addSubtask: (id: number, title: string) => json<Task>('POST', `/api/tasks/${id}/subtasks`, { title }),
  patchSubtask: (id: number, sid: number, patch: { completed?: boolean; title?: string }) =>
    json<Task>('PATCH', `/api/tasks/${id}/subtasks/${sid}`, patch),
  deleteSubtask: (id: number, sid: number) => json<Task>('DELETE', `/api/tasks/${id}/subtasks/${sid}`),
  diarySummary: (messages: WireMessage[]) => json<DiarySummary>('POST', '/api/diary/summary', { messages }),
  /** 손님 MD 내려받기 주소. 링크로 열면 서버가 파일을 주고 손님 데이터를 지운다(D-07). */
  exportUrl: () => '/api/export',
  /** 브라우저에서만 알 수 있는 숫자(TTS 지연 등)를 보낸다. 실패해도 무시한다. */
  clientMetric: (kind: string, ms: number) =>
    noContent('POST', '/api/metrics/client', { kind, ms }).catch(() => undefined),
  adminMetrics: () => json<Record<string, unknown>>('GET', '/api/admin/metrics'),
};

export type Api = typeof realApi;

/** 화면 코드는 항상 이 `api` 만 쓴다. */
export const api: Api = USE_MOCK ? mockApi : realApi;
