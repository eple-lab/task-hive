/**
 * 가짜 서버 (`npm run dev:mock` 일 때만 쓴다).
 *
 * 왜 있나
 * - 백엔드나 Colab이 없어도 화면을 띄워 보고 고칠 수 있게 한다.
 * - 운영 빌드에서는 client.ts 가 이 구현을 고르지 않는다(USE_MOCK=false).
 *
 * 주의
 * - 여기의 "할 일 추출"은 진짜 AI가 아니라 아주 단순한 규칙이다. 화면 흐름 확인용이다.
 * - 데이터는 브라우저 메모리에만 있고 새로고침하면 사라진다.
 */
import type { Api } from './client';
import type {
  BulkItem,
  Candidate,
  ChatEvent,
  ChatRequest,
  Completion,
  ExtractResult,
  Me,
  SettingsPatch,
  Subtask,
  Task,
  WireMessage,
} from './types';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 가짜 서버가 받는 도시(진짜 서버의 목록 일부). */
const MOCK_CITIES = ['서울', '부산', '인천', '대구', '대전', '광주', '제주'];

let me: Me = {
  mode: 'none',
  name: null,
  lang: 'ko',
  city: '서울',
  // 서버의 기본값(docs/11-api-contract.md)과 같은 모양.
  settings: {
    voice: {
      enabled: true,
      gender: 'female',
      voice: null,
      rate: 1,
      pitch: 1,
      volume: 1,
      echo: 0,
      sentence_stream: true,
      stop_on_typing: true,
    },
    llm: { temperature: 0.6, max_tokens: 400, model: null },
  },
  features: { calendar: null, diary_google: null, task_sheet: null },
  upstream: { connected: false, models: [] },
  limits: { hive_max_rings: 3, hive_max_cells: 37 },
  google_available: false,
};

let tasks: Task[] = [];
let nextId = 1;

/** 가운데부터 바깥 고리 순서로 빈 칸을 찾는다(서버의 좌표 배정을 흉내 낸다). */
function nextFreeCell(): { q: number; r: number } | null {
  const used = new Set(tasks.filter((t) => !t.archived && t.hex_q !== null).map((t) => `${t.hex_q},${t.hex_r}`));
  const rings = me.limits.hive_max_rings;
  for (let ring = 0; ring <= rings; ring++) {
    for (let q = -ring; q <= ring; q++) {
      for (let r = -ring; r <= ring; r++) {
        const s = -q - r;
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) !== ring) continue;
        if (!used.has(`${q},${r}`)) return { q, r };
      }
    }
  }
  return null;
}

function makeTask(item: BulkItem): Task {
  const cell = nextFreeCell();
  const subs: Subtask[] = (item.subtasks ?? []).map((title) => ({ id: nextId++, title, completed: false }));
  return {
    id: nextId++,
    title: item.title,
    due_date: item.due_date ?? null,
    completed: false,
    completed_at: null,
    archived: false,
    source: item.source ?? 'chat',
    hex_q: cell ? cell.q : null,
    hex_r: cell ? cell.r : null,
    created_at: new Date().toISOString(),
    subtasks: subs,
  };
}

function find(id: number): Task {
  const t = tasks.find((x) => x.id === id);
  if (!t) throw new Error('없는 태스크');
  return t;
}

/** 아주 단순한 규칙: "~해야" 가 들어간 문장을 할 일로, "한 것 같아/했어" 를 완료 신호로 본다. */
function fakeExtract(messages: WireMessage[]): ExtractResult {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = last?.content ?? '';
  const candidates: Candidate[] = text
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => /해야|할 거|하기로|예약|준비/.test(s))
    .map((s) => ({
      title: s.replace(/(해야 ?(해|돼|겠어|지)|할 거야).*$/, '').trim().slice(0, 40) || s.slice(0, 40),
      due_date: /내일/.test(s) ? new Date(Date.now() + 86400000).toISOString().slice(0, 10) : null,
      subtasks: [],
      evidence: s,
      confidence: 0.7,
    }));
  const completions: Completion[] = [];
  if (/한 것 같아|했어|끝냈어|다 했/.test(text)) {
    const open = tasks.find((t) => !t.completed && !t.archived && text.includes(t.title.slice(0, 2)));
    if (open) {
      completions.push({
        task_id: open.id,
        subtask_id: null,
        all_subtasks: open.subtasks.length > 0,
        evidence: text,
        confidence: 0.6,
      });
    }
  }
  // 규칙에 걸리는 문장이 없어도 화면 흐름을 끝까지 볼 수 있게, 지어낸 후보 2~3개를 돌려준다(가짜 모드 전용).
  if (candidates.length === 0 && text.trim()) {
    const snippet = text.trim().slice(0, 30);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    candidates.push(
      { title: '장 보고 오기', due_date: tomorrow, subtasks: ['우유 사기', '빵 사기'], evidence: snippet, confidence: 0.8 },
      { title: '빨래 널기', due_date: null, subtasks: [], evidence: snippet, confidence: 0.7 },
      { title: '친구에게 안부 문자 보내기', due_date: null, subtasks: [], evidence: snippet, confidence: 0.6 },
    );
  }
  return { candidates, completions };
}

export const mockApi: Api = {
  me: async () => me,
  guest: async (name: string) => {
    me = { ...me, mode: 'guest', name };
    return me;
  },
  logout: async () => {
    me = { ...me, mode: 'none', name: null };
    tasks = [];
  },
  putSettings: async (patch: SettingsPatch) => {
    if (patch.city !== undefined && !MOCK_CITIES.includes(patch.city)) {
      const { ApiError } = await import('./client');
      throw new ApiError(422, 'invalid_city', '고를 수 없는 도시입니다.');
    }
    me = {
      ...me,
      lang: patch.lang ?? me.lang,
      city: patch.city ?? me.city,
      settings: {
        voice: { ...me.settings.voice, ...patch.voice },
        llm: { ...me.settings.llm, ...patch.llm },
      },
      features: { ...me.features, ...patch.features },
    };
    return me;
  },
  putUpstream: async (url: string, key: string) => {
    await wait(400);
    if (!/^https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)\/?$/i.test(url)) {
      const { ApiError } = await import('./client');
      throw new ApiError(400, 'bad_upstream_url', 'ngrok 무료 주소(https://….ngrok-free.app)만 넣을 수 있어요.');
    }
    if (!key.trim()) {
      const { ApiError } = await import('./client');
      throw new ApiError(502, 'upstream_unreachable', 'Colab에 연결하지 못했어요. 노트북이 켜져 있고 접속 키가 맞는지 확인해 주세요.');
    }
    const models = ['mock-model-a', 'mock-model-b'];
    me = { ...me, upstream: { connected: true, models } };
    return { connected: true, models, latency_ms: 123 };
  },
  deleteUpstream: async () => {
    me = { ...me, upstream: { connected: false, models: [] }, settings: { ...me.settings, llm: { ...me.settings.llm, model: null } } };
  },
  greeting: async () => ({
    now: new Date().toISOString(),
    weather: { city: me.city, temp_c: 9, desc: '맑음' },
    text: `${me.name ?? ''}님, 좋은 저녁이에요. 오늘 ${me.city}은 맑았네요. 오늘은 어땠어요?`,
  }),
  chatStream: async (_body: ChatRequest, onEvent: (e: ChatEvent) => void, signal?: AbortSignal) => {
    const reply = '그랬군요, 오늘 하루도 수고 많았어요. 말씀하신 것 중에 할 일로 담아 둘 만한 게 있으면 옆에 모아 둘게요.';
    for (const ch of reply) {
      if (signal?.aborted) return;
      await wait(18);
      onEvent({ type: 'answer', text: ch });
    }
    onEvent({ type: 'done' });
  },
  extract: async (messages: WireMessage[]) => {
    await wait(200);
    return fakeExtract(messages);
  },
  tasks: async () => tasks,
  bulk: async (items: BulkItem[]) => {
    await wait(300);
    // 진짜 서버처럼: 제목이 이미 벌집에 있거나 칸이 모자라면 409.
    const { ApiError } = await import('./client');
    const live = tasks.filter((x) => !x.archived);
    const titles = new Set(live.map((x) => x.title.trim().toLowerCase()));
    const dup = items.find((i) => titles.has(i.title.trim().toLowerCase()));
    if (dup) throw new ApiError(409, 'duplicate_title', `이미 벌집에 있는 제목이에요: ${dup.title}`);
    if (live.length + items.length > me.limits.hive_max_cells) {
      throw new ApiError(409, 'hive_full', '벌집이 꽉 찼어요. 완료한 태스크를 보관함으로 옮겨 주세요.');
    }
    const made: Task[] = [];
    // makeTask 가 빈 칸을 찾을 때 방금 만든 것도 봐야 하므로 하나씩 넣는다.
    for (const item of items) {
      const t = makeTask(item);
      tasks = [...tasks, t];
      made.push(t);
    }
    return made;
  },
  patchTask: async (id, patch) => {
    const t = find(id);
    const completed = patch.completed ?? t.completed;
    const updated: Task = {
      ...t,
      ...patch,
      completed,
      completed_at: completed ? (t.completed_at ?? new Date().toISOString()) : null,
      subtasks: patch.completed === true ? t.subtasks.map((s) => ({ ...s, completed: true })) : t.subtasks,
    };
    tasks = tasks.map((x) => (x.id === id ? updated : x));
    return updated;
  },
  deleteTask: async (id: number) => {
    tasks = tasks.filter((x) => x.id !== id);
  },
  addSubtask: async (id: number, title: string) => {
    const t = find(id);
    const updated = { ...t, subtasks: [...t.subtasks, { id: nextId++, title, completed: false }] };
    tasks = tasks.map((x) => (x.id === id ? updated : x));
    return updated;
  },
  patchSubtask: async (id, sid, patch) => {
    const t = find(id);
    const subtasks = t.subtasks.map((s) => (s.id === sid ? { ...s, ...patch } : s));
    const allDone = subtasks.length > 0 && subtasks.every((s) => s.completed);
    const updated: Task = {
      ...t,
      subtasks,
      completed: allDone,
      completed_at: allDone ? new Date().toISOString() : null,
    };
    tasks = tasks.map((x) => (x.id === id ? updated : x));
    return updated;
  },
  deleteSubtask: async (id: number, sid: number) => {
    const t = find(id);
    const updated = { ...t, subtasks: t.subtasks.filter((s) => s.id !== sid) };
    tasks = tasks.map((x) => (x.id === id ? updated : x));
    return updated;
  },
  diarySummary: async (messages: WireMessage[]) => ({
    summary_line: '하루를 돌아보며 할 일을 정리했다.',
    body: messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join(' ')
      .slice(0, 200),
    did: [],
    todo: tasks.filter((t) => !t.completed).map((t) => t.title),
  }),
  exportUrl: () => '#',
  clientMetric: async () => undefined,
  adminMetrics: async () => ({ note: '가짜 모드에서는 지표가 없어요', requests: 0 }),
};
