/**
 * 설정을 서버에 저장하는 훅 (PUT /api/settings).
 *
 * 하는 일
 * - save(patch): 바꾼 필드만 보낸다. 서버가 돌려준 me 를 저장소에 반영한다.
 * - saveDebounced(patch): 슬라이더처럼 값이 연달아 바뀌는 입력용. 마지막 조작 뒤 0.5초가 지나면 모아서 한 번만 보낸다.
 *   (슬라이더를 끄는 동안 요청이 수십 번 나가고 응답 순서가 뒤바뀌는 것을 막는다.)
 * - error: 마지막 저장 실패 안내문. 서버가 준 한국어 문장을 그대로 쓴다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../shared/api/client';
import type { SettingsPatch } from '../../shared/api/types';
import { useStore } from '../../shared/state/store';
import { errorMessage } from './logic';

const DEBOUNCE_MS = 500;

/** 같은 영역(voice/llm)의 patch 를 합친다. 나중 값이 이긴다. */
export function mergePatch(a: SettingsPatch, b: SettingsPatch): SettingsPatch {
  return {
    ...a,
    ...b,
    ...(a.voice || b.voice ? { voice: { ...a.voice, ...b.voice } } : {}),
    ...(a.llm || b.llm ? { llm: { ...a.llm, ...b.llm } } : {}),
  };
}

export function useSettingsSave() {
  const { dispatch } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const waiting = useRef<SettingsPatch | null>(null);
  const timer = useRef<number | null>(null);

  const save = useCallback(
    async (patch: SettingsPatch): Promise<boolean> => {
      setSaving(true);
      try {
        const me = await api.putSettings(patch);
        // 목소리는 화면 값(state.voice)이 먼저 바뀌어 있으므로 me 만 갱신한다(늦게 온 응답이 슬라이더를 되돌리지 않게).
        dispatch({ type: 'set_me', me });
        setError(null);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [dispatch],
  );

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const p = waiting.current;
    waiting.current = null;
    if (p) void save(p);
  }, [save]);

  const saveDebounced = useCallback(
    (patch: SettingsPatch) => {
      waiting.current = mergePatch(waiting.current ?? {}, patch);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  // 패널이 닫히거나 화면이 바뀔 때 못 보낸 값이 있으면 보낸다.
  useEffect(() => flush, [flush]);

  return { save, saveDebounced, error, saving };
}
