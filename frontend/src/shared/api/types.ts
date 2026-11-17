/**
 * 서버 API와 주고받는 데이터의 모양(타입).
 *
 * 왜 따로 두나
 * - 서버가 주는 모양이 바뀌면 여기 한 곳만 고치면 빌드 오류로 영향 범위가 드러난다(D-20, Q-28).
 * - 이 모양은 백엔드(app/routers)와 맺은 "계약"이다. 한쪽만 바꾸지 않는다.
 *   계약 원문: docs/03-architecture.md 7장.
 */

/** 로그인 상태. none = 아직 시작 전, guest = 이름만 적은 손님, google = 구글 로그인(2단계). */
export type Mode = 'none' | 'guest' | 'google';

/** 목소리 설정. 서버는 내용을 해석하지 않고 그대로 저장·반환한다. */
export interface VoiceSettings {
  /** 말하기 켜기/끄기 (R-CHAT-2) */
  enabled: boolean;
  /** 브라우저 음성 이름(voiceURI). 비어 있으면 한국어 기본 음성 */
  voiceURI: string | null;
  /** 0.5 ~ 2.0 */
  rate: number;
  /** 0 ~ 2. 낮을수록 굵은 목소리("저음") */
  pitch: number;
  /** 0 ~ 1 */
  volume: number;
  /** 에코 크기 0 ~ 1. 브라우저 내장 음성에는 걸 수 없다(D-03). Colab TTS가 붙으면 쓴다. */
  echo: number;
  /** 답이 끝나기 전에 문장 단위로 읽기 시작 */
  sentenceStreaming: boolean;
  /** 사용자가 글을 쓰기 시작하면 읽기를 멈춤 */
  stopOnTyping: boolean;
}

export interface LlmSettings {
  temperature: number;
  max_tokens: number;
  model: string | null;
}

/**
 * 구글 기능 토글(D-16).
 * null = 아직 사용자에게 묻지 않음(화면에는 켜진 모습으로 보인다),
 * true = 연결함, false = "나중에"를 눌러 꺼 둠.
 */
export interface Features {
  calendar: boolean | null;
  diary_google: boolean | null;
  task_sheet: boolean | null;
}
export type FeatureKey = keyof Features;

export interface Me {
  mode: Mode;
  name: string | null;
  lang: string;
  city: string;
  settings: { voice: Partial<VoiceSettings>; llm: LlmSettings };
  features: Features;
  upstream: { connected: boolean; models: string[] };
  limits: { hive_max_rings: number; hive_max_cells: number };
  google_available: boolean;
}

export interface Subtask {
  id: number;
  title: string;
  completed: boolean;
}

export type TaskSource = 'chat' | 'calendar' | 'manual';

export interface Task {
  id: number;
  title: string;
  /** "YYYY-MM-DD" 또는 없음(D-day 없는 태스크를 허용한다. R-HIVE-5) */
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  /** 보관함으로 옮겼는가(D-24). 보관한 태스크는 벌집에 안 보이고 리스트에만 보인다. */
  archived: boolean;
  source: TaskSource;
  /** 벌집 좌표(육각 격자 q, r). 서버가 배정한다. */
  hex_q: number | null;
  hex_r: number | null;
  created_at: string;
  subtasks: Subtask[];
}

/** 대화에서 뽑힌 "할 일 후보". 사용자가 담아야만 등록 예정으로 넘어간다(P-06). */
export interface Candidate {
  title: string;
  due_date: string | null;
  subtasks: string[];
  /** 근거가 된 대화 문장. 틀렸을 때 원문에서 바로 확인할 수 있게 함께 보여 준다. */
  evidence: string;
  confidence: number;
}

/** "그건 한 것 같아" 신호(D-21). */
export interface Completion {
  task_id: number;
  subtask_id: number | null;
  /** true면 "다 했어"처럼 하위 태스크 전부를 뜻한다 → 확인받고 체크한다. */
  all_subtasks: boolean;
  evidence: string;
  confidence: number;
}

export interface ExtractResult {
  candidates: Candidate[];
  completions: Completion[];
}

/** 서버로 보내는 대화 한 줄. system 역할은 서버가 넣으므로 화면은 보내지 않는다. */
export interface WireMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: WireMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string | null;
}

/** /api/chat 의 SSE 이벤트 */
export type ChatEvent =
  | { type: 'answer'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface Greeting {
  now: string;
  weather: { city: string; temp_c: number; desc: string } | null;
  text: string;
}

export interface UpstreamResult {
  connected: boolean;
  models: string[];
  latency_ms: number;
}

export interface DiarySummary {
  summary_line: string;
  body: string;
  did: string[];
  todo: string[];
}

export interface BulkItem {
  title: string;
  due_date?: string | null;
  subtasks?: string[];
  source?: TaskSource;
}

export interface SettingsPatch {
  lang?: string;
  city?: string;
  voice?: Partial<VoiceSettings>;
  llm?: Partial<LlmSettings>;
  features?: Partial<Features>;
}

/** 서버 오류 응답의 공통 모양: {"error":{"code","message"}} */
export interface ErrorBody {
  error: { code: string; message: string };
}
