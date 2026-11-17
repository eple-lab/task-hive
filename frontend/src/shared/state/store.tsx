/**
 * 화면 전체가 함께 쓰는 상태 저장소.
 *
 * 왜 직접 만들었나
 * - 패널 세 개(하이브·채팅·상태창)가 같은 상태를 본다(D-20의 이유).
 * - 상태 관리 라이브러리를 더하지 않으려고 React 기본 기능(useReducer + Context)만 썼다.
 *   의존성이 늘면 보안 점검 대상도 는다(docs/10-frontend-architecture.md).
 *
 * 어디에 무엇이 있나
 * - 대화(messages)는 여기(브라우저 메모리)에만 있다. 서버에 저장하지 않고 새로고침하면 사라진다(D-08).
 * - 태스크(tasks)의 원본은 서버다. 여기 값은 서버 응답을 받아 넣은 사본이다.
 * - 후보(candidates)와 등록 예정(pending)은 아직 서버에 없는 값이다.
 *
 * 쓰는 법
 * - 읽기: const { state } = useStore();
 * - 바꾸기: dispatch({ type: '...', ... }) — 아래 Action 목록만 가능하다.
 */
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Candidate, FeatureKey, Me, Task, VoiceSettings } from '../api/types';

/** 채팅 말풍선 아래에 붙는 버튼. 누르면 features/chat/useChatActions.ts 가 kind 로 처리한다. */
export type ChatAction =
  | { kind: 'undo_task'; label: string; taskId: number }
  | { kind: 'undo_subtask'; label: string; taskId: number; subtaskId: number }
  | { kind: 'confirm_all'; label: string; taskId: number }
  | { kind: 'dismiss'; label: string }
  | { kind: 'feature_connect'; label: string; feature: FeatureKey }
  | { kind: 'feature_later'; label: string; feature: FeatureKey }
  | { kind: 'diary_save'; label: string }
  | { kind: 'diary_later'; label: string };

/** 채팅창의 한 줄. system 은 가운데 작게 보이는 알림(상태창에서 한 일 등, R-CHAT-5). */
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 답이 아직 흘러나오는 중인가 */
  streaming?: boolean;
  /** 오류 안내인가(붉게 표시) */
  error?: boolean;
  actions?: ChatAction[];
  /** 버튼을 이미 눌렀으면 다시 못 누르게 한다 */
  actionsDone?: boolean;
}

/** 후보·등록 예정 항목. 화면에서 구분하려고 localId 를 붙인다. */
export interface LocalCandidate extends Candidate {
  localId: number;
  source: 'chat' | 'calendar' | 'manual';
}

export type Theme = 'light' | 'dark';
export type HiveMode = 'hive' | 'list';
export type MobileTab = 'hive' | 'chat' | 'panel';

export const DEFAULT_VOICE: VoiceSettings = {
  // 서버 기본값(docs/11-api-contract.md)과 같게 켠 채로 둔다. 소리는 사용자가 화면을 한 번 누른 뒤에만 난다(speech.ts userHasInteracted).
  enabled: true,
  gender: 'female',
  voice: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  echo: 0,
  sentence_stream: true,
  stop_on_typing: true,
};

export interface State {
  /** 서버가 알려 준 내 상태. null 이면 아직 불러오는 중 */
  me: Me | null;
  bootError: string | null;
  messages: ChatMessage[];
  /** AI 답을 기다리는 중(입력창 잠금) */
  busy: boolean;
  /**
   * 대화에서 할 일 후보를 뽑는 중인가(/api/extract 호출 동안. 로컬 LLM에서는 2~3분 걸린다).
   * idle: 아무것도 안 함 / running: 찾는 중(후보 구역·접힌 띠·탭에 표시) / failed: 실패했다는 짧은 안내
   * 대화는 입력창 잠금(busy)과 따로 움직인다. 찾는 동안에도 대화는 이어 갈 수 있다.
   */
  extracting: 'idle' | 'running' | 'failed';
  candidates: LocalCandidate[];
  pending: LocalCandidate[];
  tasks: Task[];
  voice: VoiceSettings;
  ui: {
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    theme: Theme;
    hiveMode: HiveMode;
    mobileTab: MobileTab;
    selectedTaskId: number | null;
    /** 방금 등록해 벌 애니메이션을 보여 줄 태스크 id 들. null 이면 애니메이션 없음 */
    flightTaskIds: number[] | null;
    /** 상태창이 접힌 동안 새로 생긴 후보 수(접힌 띠의 알림 숫자) */
    unseenCandidates: number;
  };
  nextLocalId: number;
}

export type Action =
  | { type: 'boot_ok'; me: Me }
  | { type: 'boot_error'; message: string }
  /** 나가기 뒤: 대화·태스크·후보를 모두 비우고 화면 설정(접힘·테마)만 남긴다. */
  | { type: 'reset' }
  | { type: 'set_me'; me: Me }
  | { type: 'set_tasks'; tasks: Task[] }
  | { type: 'upsert_task'; task: Task }
  | { type: 'remove_task'; id: number }
  | { type: 'add_message'; message: Omit<ChatMessage, 'id'> }
  | { type: 'append_stream'; text: string }
  | { type: 'end_stream'; error?: string }
  | { type: 'actions_done'; id: number }
  | { type: 'set_busy'; busy: boolean }
  /** 후보 찾기 시작 / 정상 끝 / 실패 / 실패 안내 닫기 */
  | { type: 'extract_start' }
  | { type: 'extract_end' }
  | { type: 'extract_fail' }
  | { type: 'extract_dismiss' }
  | { type: 'add_candidates'; items: Omit<LocalCandidate, 'localId'>[] }
  | { type: 'remove_candidate'; localId: number }
  | { type: 'candidate_to_pending'; localId: number }
  | { type: 'update_pending'; localId: number; patch: Partial<Candidate> }
  | { type: 'remove_pending'; localId: number }
  | { type: 'clear_pending' }
  | { type: 'set_voice'; patch: Partial<VoiceSettings> }
  | { type: 'ui'; patch: Partial<State['ui']> }
  | { type: 'start_flight'; taskIds: number[] }
  | { type: 'end_flight' };

/** 패널 접힘·테마는 화면 설정일 뿐이라 브라우저에 기억해도 된다(개인정보 아님). */
const UI_KEY = 'th.ui';

function loadUi(): Partial<State['ui']> {
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Partial<State['ui']>;
    return {
      leftCollapsed: v.leftCollapsed === true,
      rightCollapsed: v.rightCollapsed === true,
      theme: v.theme === 'dark' ? 'dark' : v.theme === 'light' ? 'light' : undefined,
      hiveMode: v.hiveMode === 'list' ? 'list' : 'hive',
    };
  } catch {
    return {};
  }
}

function saveUi(ui: State['ui']): void {
  try {
    window.localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        leftCollapsed: ui.leftCollapsed,
        rightCollapsed: ui.rightCollapsed,
        theme: ui.theme,
        hiveMode: ui.hiveMode,
      }),
    );
  } catch {
    /* 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 기억하지 않는다 */
  }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function initialState(): State {
  const saved = typeof window !== 'undefined' ? loadUi() : {};
  return {
    me: null,
    bootError: null,
    messages: [],
    busy: false,
    extracting: 'idle',
    candidates: [],
    pending: [],
    tasks: [],
    voice: DEFAULT_VOICE,
    ui: {
      leftCollapsed: saved.leftCollapsed ?? false,
      rightCollapsed: saved.rightCollapsed ?? false,
      theme: saved.theme ?? systemTheme(),
      hiveMode: saved.hiveMode ?? 'hive',
      mobileTab: 'chat',
      selectedTaskId: null,
      flightTaskIds: null,
      unseenCandidates: 0,
    },
    nextLocalId: 1,
  };
}

/** 제목 비교용: 앞뒤 공백과 대소문자를 무시한다(후보 중복 제거에 쓴다). */
export function normTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** 서버가 준 me 의 목소리 설정을 기본값 위에 덮는다. */
function voiceFromMe(me: Me, current: VoiceSettings): VoiceSettings {
  return { ...current, ...me.settings.voice };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'boot_ok':
      return { ...state, me: action.me, bootError: null, voice: voiceFromMe(action.me, state.voice) };
    case 'boot_error':
      return { ...state, bootError: action.message };
    case 'reset': {
      const fresh = initialState();
      return { ...fresh, ui: { ...fresh.ui, leftCollapsed: state.ui.leftCollapsed, rightCollapsed: state.ui.rightCollapsed, theme: state.ui.theme, hiveMode: state.ui.hiveMode } };
    }
    case 'set_me':
      return { ...state, me: action.me };
    case 'set_tasks':
      return { ...state, tasks: action.tasks };
    case 'upsert_task': {
      const exists = state.tasks.some((t) => t.id === action.task.id);
      return {
        ...state,
        tasks: exists
          ? state.tasks.map((t) => (t.id === action.task.id ? action.task : t))
          : [...state.tasks, action.task],
      };
    }
    case 'remove_task':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        ui: {
          ...state.ui,
          selectedTaskId: state.ui.selectedTaskId === action.id ? null : state.ui.selectedTaskId,
        },
      };
    case 'add_message':
      return {
        ...state,
        messages: [...state.messages, { ...action.message, id: state.nextLocalId }],
        nextLocalId: state.nextLocalId + 1,
      };
    case 'append_stream': {
      // 마지막 말풍선이 "흘러나오는 중"이면 거기에 글자를 붙인다.
      const last = state.messages[state.messages.length - 1];
      if (!last || !last.streaming) return state;
      const updated = { ...last, content: last.content + action.text };
      return { ...state, messages: [...state.messages.slice(0, -1), updated] };
    }
    case 'end_stream': {
      const last = state.messages[state.messages.length - 1];
      if (!last || !last.streaming) return state;
      const updated: ChatMessage = action.error
        ? {
            ...last,
            streaming: false,
            error: true,
            content: last.content ? `${last.content}\n\n(${action.error})` : action.error,
          }
        : { ...last, streaming: false };
      return { ...state, messages: [...state.messages.slice(0, -1), updated] };
    }
    case 'actions_done':
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, actionsDone: true } : m)),
      };
    case 'set_busy':
      return { ...state, busy: action.busy };
    case 'extract_start':
      return { ...state, extracting: 'running' };
    case 'extract_end':
      return { ...state, extracting: 'idle' };
    case 'extract_fail':
      return { ...state, extracting: 'failed' };
    case 'extract_dismiss':
      // 실패 안내만 닫는다. 그 사이 새로 시작한 찾기(running)는 건드리지 않는다.
      return state.extracting === 'failed' ? { ...state, extracting: 'idle' } : state;
    case 'add_candidates': {
      // 이미 후보·등록 예정·벌집에 있는 제목은 다시 넣지 않는다.
      const known = new Set<string>([
        ...state.candidates.map((c) => normTitle(c.title)),
        ...state.pending.map((c) => normTitle(c.title)),
        ...state.tasks.filter((t) => !t.archived).map((t) => normTitle(t.title)),
      ]);
      let id = state.nextLocalId;
      const fresh: LocalCandidate[] = [];
      for (const item of action.items) {
        const key = normTitle(item.title);
        if (!key || known.has(key)) continue;
        known.add(key);
        fresh.push({ ...item, localId: id++ });
      }
      if (fresh.length === 0) return state;
      return {
        ...state,
        candidates: [...state.candidates, ...fresh],
        nextLocalId: id,
        ui: {
          ...state.ui,
          unseenCandidates: state.ui.rightCollapsed ? state.ui.unseenCandidates + fresh.length : 0,
        },
      };
    }
    case 'remove_candidate':
      return { ...state, candidates: state.candidates.filter((c) => c.localId !== action.localId) };
    case 'candidate_to_pending': {
      const c = state.candidates.find((x) => x.localId === action.localId);
      if (!c) return state;
      return {
        ...state,
        candidates: state.candidates.filter((x) => x.localId !== action.localId),
        pending: [...state.pending, c],
      };
    }
    case 'update_pending':
      return {
        ...state,
        pending: state.pending.map((p) => (p.localId === action.localId ? { ...p, ...action.patch } : p)),
      };
    case 'remove_pending':
      return { ...state, pending: state.pending.filter((p) => p.localId !== action.localId) };
    case 'clear_pending':
      return { ...state, pending: [] };
    case 'set_voice':
      return { ...state, voice: { ...state.voice, ...action.patch } };
    case 'ui': {
      const ui = { ...state.ui, ...action.patch };
      // 상태창을 펴면 알림 숫자를 지운다.
      if (action.patch.rightCollapsed === false) ui.unseenCandidates = 0;
      saveUi(ui);
      return { ...state, ui };
    }
    case 'start_flight':
      // 벌집으로 옮길 때 왼쪽 패널이 접혀 있으면 펴서 애니메이션을 보여 준다(docs/04 1장).
      return {
        ...state,
        ui: { ...state.ui, flightTaskIds: action.taskIds, leftCollapsed: false, hiveMode: 'hive', mobileTab: 'hive' },
      };
    case 'end_flight':
      return { ...state, ui: { ...state.ui, flightTaskIds: null } };
    default:
      return state;
  }
}

interface StoreValue {
  state: State;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

/** 앱 맨 바깥에서 한 번 감싼다(main.tsx). */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('StoreProvider 안에서만 useStore 를 쓸 수 있습니다.');
  return v;
}
