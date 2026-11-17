/**
 * 말하기(TTS) — 브라우저 내장 음성(Web Speech API)으로 읽는다.
 *
 * 왜 브라우저 음성인가 (2026-11-17 결정)
 * - 과제 마감까지는 브라우저 음성으로 말하기를 완성하고, Colab TTS는 자리만 둔다.
 * - 원래 계획(D-03)은 "Colab TTS 우선, 꺼져 있으면 브라우저 음성"이다.
 *   Colab TTS가 붙으면 speak() 안에서 먼저 /api/tts 를 시도하고 실패하면 지금 코드로 내려오게 바꾼다.
 *
 * 한계
 * - 브라우저 음성은 소리를 가공할 수 없어 에코를 걸 수 없다. 음높이(pitch)와 속도만 된다.
 * - 목소리 종류는 기기마다 다르다. 남·여 구분 정보도 없다(이름으로 짐작만 가능).
 *
 * 개인정보: 읽을 문장은 기기 안에서 처리된다(일부 브라우저의 온라인 음성은 예외일 수 있다).
 */
import type { VoiceSettings } from '../../shared/api/types';

/** 이 브라우저가 말하기를 지원하는가 */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * 사용자가 이 페이지를 한 번이라도 눌렀거나 키를 눌렀는가.
 * 브라우저는 사용자 조작 없이 소리가 나는 것을 막는다(자동재생 제한). 새로고침 직후 첫 인사처럼
 * 조작 전에 읽으려 하면 조용히 건너뛰어, 막힌 소리가 나중에 한꺼번에 나오거나 오류가 나지 않게 한다.
 */
let interacted = false;
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(ev, () => (interacted = true), { capture: true, passive: true });
  }
}
export function userHasInteracted(): boolean {
  if (interacted) return true;
  // 브라우저가 알려 주는 값도 함께 본다(지원하는 브라우저만).
  return (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;
}

/**
 * 기기에 있는 목소리 목록. 한국어 목소리를 앞에 둔다.
 * 일부 브라우저는 목록을 늦게 채우므로 'voiceschanged' 이벤트 뒤에 다시 불러야 한다(useVoices 참고).
 */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const all = window.speechSynthesis.getVoices();
  const ko = all.filter((v) => v.lang.toLowerCase().startsWith('ko'));
  const rest = all.filter((v) => !v.lang.toLowerCase().startsWith('ko'));
  return [...ko, ...rest];
}

/** 설정에 맞는 목소리를 고른다. 지정이 없거나 못 찾으면 한국어 첫 번째 목소리. */
function pickVoice(voiceURI: string | null): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (voiceURI) {
    const found = voices.find((v) => v.voiceURI === voiceURI);
    if (found) return found;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith('ko')) ?? null;
}

/**
 * 글을 문장 단위로 자른다.
 * 반환값: [끝난 문장들, 아직 안 끝난 나머지]
 * 답이 흘러나오는 동안 "끝난 문장"만 먼저 읽기 위해 쓴다(문장마다 바로 읽기).
 */
export function splitSentences(text: string): [string[], string] {
  const sentences: string[] = [];
  let rest = text;
  // 마침표·물음표·느낌표·줄바꿈 뒤에서 자른다. "…" 나 "?!" 처럼 이어진 부호는 한 덩어리로 본다.
  const re = /^([\s\S]*?[.!?。？！…]+["')\]]*|[\s\S]*?\n)\s*/;
  for (;;) {
    const m = re.exec(rest);
    if (!m || !m[1]) break;
    const s = m[1].trim();
    if (s) sentences.push(s);
    rest = rest.slice(m[0].length);
  }
  return [sentences, rest];
}

/** 읽기에 맞지 않는 기호(마크다운 표시, 이모지 일부)를 걷어 낸다. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 말하기 큐.
 * - enqueue(문장) 으로 순서대로 읽는다.
 * - stop() 으로 지금 읽는 것과 남은 것을 모두 멈춘다(말하기 끔, 사용자가 입력 시작).
 */
export class Speaker {
  private settings: VoiceSettings;
  /** 지금 읽고 있는 문장이 바뀔 때 알려 준다(채팅창에서 강조 표시용). null = 읽기 끝 */
  onSentence: ((sentence: string | null) => void) | null = null;
  private pendingCount = 0;

  constructor(settings: VoiceSettings) {
    this.settings = settings;
  }

  update(settings: VoiceSettings): void {
    this.settings = settings;
  }

  enqueue(text: string): void {
    // 말하기가 꺼져 있거나, 사용자가 아직 화면을 누른 적이 없으면 읽지 않는다(자동재생 제한).
    if (!speechSupported() || !this.settings.enabled || !userHasInteracted()) return;
    this.speakNow(text);
  }

  /** "들어 보기": 말하기가 꺼져 있어도 지금 설정으로 한 문장을 읽는다. 버튼을 눌러 부르므로 사용자 조작이 있었던 셈이다. */
  preview(text: string): void {
    if (!speechSupported()) return;
    this.stop();
    this.speakNow(text);
  }

  private speakNow(text: string): void {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    const voice = pickVoice(this.settings.voice);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'ko-KR';
    }
    u.rate = clamp(this.settings.rate, 0.5, 2);
    u.pitch = clamp(this.settings.pitch, 0, 2);
    u.volume = clamp(this.settings.volume, 0, 1);
    this.pendingCount += 1;
    u.onstart = () => this.onSentence?.(clean);
    const finish = () => {
      this.pendingCount = Math.max(0, this.pendingCount - 1);
      if (this.pendingCount === 0) this.onSentence?.(null);
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (!speechSupported()) return;
    window.speechSynthesis.cancel();
    this.pendingCount = 0;
    this.onSentence?.(null);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

/** 분위기 프리셋(제안 기능). 한 번에 속도·음높이·볼륨을 맞춘다. */
export const VOICE_PRESETS: Record<'calm' | 'clear' | 'whisper', Pick<VoiceSettings, 'rate' | 'pitch' | 'volume'>> = {
  calm: { rate: 0.9, pitch: 0.85, volume: 0.9 },
  clear: { rate: 1.05, pitch: 1.1, volume: 1 },
  whisper: { rate: 0.85, pitch: 0.95, volume: 0.45 },
};
