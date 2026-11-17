/**
 * 꿀통을 든 벌이 벌집으로 날아가는 애니메이션(R-HIVE-4).
 *
 * 흐름 (docs/04-screens.md 4장)
 *   옮기기 버튼 → 벌 등장(상태창 쪽, 오른쪽) → 벌집은 멀리 작게 → 포물선으로 날아감
 *   → 벌집 클로즈업 → 새 칸이 하나씩 생김 → 평소 크기
 *
 * 구현
 * - 움직임은 전부 CSS 애니메이션이다(styles/hive.css 의 .bee, .hive--flight). 라이브러리를 쓰지 않는다.
 * - 끝나는 시점은 타이머로 잡는다. animationend 는 "움직임 줄이기"에서 오지 않을 수 있어서다.
 * - 화면을 누르면 건너뛴다.
 * - 기기 설정이 "움직임 줄이기"(prefers-reduced-motion)면 벌을 그리지 않고 바로 끝낸다.
 *   새 칸은 CSS 쪽에서 부드럽게만 나타난다.
 */
import { useEffect } from 'react';

/** 전체 길이(ms). hive.css 의 애니메이션 길이와 맞춘다. */
const FLIGHT_MS = 2600;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function Bee({ onDone }: { onDone: () => void }) {
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(onDone, reduced ? 400 : FLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [onDone, reduced]);

  if (reduced) return null;

  return (
    <button type="button" className="bee-layer" onClick={onDone} aria-label="애니메이션 건너뛰기">
      <span className="bee" aria-hidden="true">
        <span className="bee__body">🐝</span>
        <span className="bee__pot">🍯</span>
      </span>
    </button>
  );
}
