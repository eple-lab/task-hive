/**
 * 말하기 기능을 React 에 연결하는 훅.
 *
 * - useSpeaker(): 앱 전체에서 하나만 쓰는 Speaker 를 돌려준다. 설정이 바뀌면 Speaker 에 알려 준다.
 * - useVoices(): 기기의 목소리 목록. 브라우저가 목록을 늦게 채우는 경우를 처리한다.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../shared/state/store';
import { Speaker, listVoices, speechSupported } from './speech';

/** 앱 전체가 함께 쓰는 Speaker 하나. 여러 개가 동시에 말하면 안 되기 때문이다. */
let sharedSpeaker: Speaker | null = null;

export function useSpeaker(): Speaker {
  const { state } = useStore();
  const ref = useRef<Speaker | null>(null);
  if (!ref.current) {
    sharedSpeaker ??= new Speaker(state.voice);
    ref.current = sharedSpeaker;
  }
  const speaker = ref.current;

  useEffect(() => {
    speaker.update(state.voice);
    // 말하기를 끄면 읽던 것도 바로 멈춘다(docs/04 3장).
    if (!state.voice.enabled) speaker.stop();
  }, [speaker, state.voice]);

  return speaker;
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());
  useEffect(() => {
    if (!speechSupported()) return;
    const refresh = () => setVoices(listVoices());
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);
  return voices;
}
