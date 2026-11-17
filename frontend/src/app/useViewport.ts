/**
 * 화면 폭 구간을 알려 주는 훅 (docs/04-screens.md 1장 "화면 폭에 따른 배치").
 *
 * - wide   : 1200px 이상 → 3단 모두 표시
 * - mid    : 768~1199px  → 채팅 + 한쪽 패널
 * - narrow : 767px 이하  → 채팅만, 하이브·상태창은 아래 탭으로 전환
 *
 * matchMedia 를 useSyncExternalStore 로 구독해서, 창 크기를 바꾸면 바로 다시 그려진다.
 */
import { useSyncExternalStore } from 'react';

export type Viewport = 'wide' | 'mid' | 'narrow';

const WIDE = '(min-width: 1200px)';
const MID = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const a = window.matchMedia(WIDE);
  const b = window.matchMedia(MID);
  a.addEventListener('change', onChange);
  b.addEventListener('change', onChange);
  return () => {
    a.removeEventListener('change', onChange);
    b.removeEventListener('change', onChange);
  };
}

function snapshot(): Viewport {
  if (window.matchMedia(WIDE).matches) return 'wide';
  if (window.matchMedia(MID).matches) return 'mid';
  return 'narrow';
}

export function useViewport(): Viewport {
  // 서버 렌더링은 쓰지 않으므로 세 번째 인자는 넓은 화면으로 둔다.
  return useSyncExternalStore(subscribe, snapshot, () => 'wide' as Viewport);
}
