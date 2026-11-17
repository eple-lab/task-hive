/**
 * 왼쪽·오른쪽 패널을 감싸는 접이식 틀.
 *
 * 동작 (docs/04-screens.md 1장 "접기 동작")
 * - 손잡이(◀ ▶)를 누르면 패널이 접혀 가느다란 띠만 남는다. 다시 누르면 펴진다.
 * - 접힌 띠에 알림 숫자(badge)를 보여 준다. 예: 상태창이 접힌 동안 생긴 후보 수.
 * - 좁은 화면(mobile)에서는 손잡이 없이 내용만 보인다. 전환은 아래 탭이 맡는다.
 *
 * 접힌 동안에도 내용은 그리지 않는다(숨겨진 패널에 포커스가 가지 않게). 상태는 저장소에 있어서 잃지 않는다.
 */
import type { ReactNode } from 'react';

interface Props {
  side: 'left' | 'right';
  /** 접힘/펴짐 버튼의 이름표(화면 낭독기용). 예: "하이브" */
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: number;
  /** 일이 진행 중인 표시(예: 후보 찾는 중). 접힌 띠에 작은 점을 보인다. */
  working?: boolean;
  /** 좁은 화면: 손잡이 없이 내용만 */
  mobile?: boolean;
  children: ReactNode;
}

export function SidePanel({ side, label, collapsed, onToggle, badge, working, mobile, children }: Props) {
  if (mobile) {
    return <div className="side side--mobile">{children}</div>;
  }

  // 왼쪽 패널: 펴져 있을 때 ◀(접기), 접혀 있을 때 ▶(펴기). 오른쪽은 반대.
  const arrow = side === 'left' ? (collapsed ? '▶' : '◀') : collapsed ? '◀' : '▶';

  const handle = (
    <button
      type="button"
      className="side__handle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? `${label} 펴기` : `${label} 접기`}
      title={collapsed ? `${label} 펴기` : `${label} 접기`}
      onClick={onToggle}
    >
      <span aria-hidden="true">{arrow}</span>
      {collapsed && working ? (
        <span className="extracting__dot extracting__dot--strip" role="img" aria-label="할 일 찾는 중" title="할 일 찾는 중" />
      ) : null}
      {collapsed && badge ? (
        <span className="badge badge--strip" aria-label={`새 알림 ${badge}개`}>
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <aside className={`side side--${side}${collapsed ? ' side--collapsed' : ''}`}>
      {/* 손잡이는 패널과 가운데 채팅 사이 경계에 둔다. */}
      {side === 'right' ? handle : null}
      {collapsed ? null : <div className="side__body">{children}</div>}
      {side === 'left' ? handle : null}
    </aside>
  );
}
