/**
 * 본 화면: 위쪽 머리줄 + 왼쪽 하이브 · 가운데 채팅 · 오른쪽 상태창 (docs/04-screens.md 1장).
 *
 * 폭에 따른 배치
 * - 넓음(1200px~): 3단 모두 표시. 양쪽을 손잡이로 접을 수 있다.
 * - 중간(768~1199px): 채팅 + 한쪽 패널. 둘 다 펴져 있으면 오른쪽을 접은 것으로 본다(저장하지는 않는다).
 *   한쪽을 펴면 다른 쪽은 접는다.
 * - 좁음(~767px): 채팅만. 하이브·상태창은 아래 탭으로 바꿔 본다.
 *
 * 좁은 화면에서도 세 영역을 모두 그려 두고 hidden 으로만 가린다(입력 중이던 글이 탭을 바꿔도 사라지지 않게).
 */
import { useEffect, useRef } from 'react';
import { ChatPanel } from '../features/chat/ChatPanel';
import { useConversation } from '../features/chat/useConversation';
import { HivePanel } from '../features/hive/HivePanel';
import { StatusPanel } from '../features/panel/StatusPanel';
import { t } from '../shared/i18n/ko';
import { useStore, type MobileTab } from '../shared/state/store';
import { Header } from './Header';
import { SidePanel } from './SidePanel';

import { useViewport } from './useViewport';

const TABS: { key: MobileTab; label: string }[] = [
  { key: 'hive', label: t.hive.title },
  { key: 'chat', label: '채팅' },
  { key: 'panel', label: t.panel.title },
];

export function Layout() {
  const { state, dispatch } = useStore();
  const viewport = useViewport();
  const { startSession } = useConversation();

  // 본 화면에 처음 들어왔을 때 한 번만: 태스크 불러오기 + 첫 인사.
  // (StrictMode 가 개발 중 effect 를 두 번 돌려도 인사가 두 번 나오지 않게 ref 로 막는다.)
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startSession();
  }, [startSession]);

  const { leftCollapsed, rightCollapsed, mobileTab, unseenCandidates } = state.ui;

  // 중간 폭에서 둘 다 펴져 있으면 오른쪽을 접힌 것으로 본다.
  const bothOpenInMid = viewport === 'mid' && !leftCollapsed && !rightCollapsed;
  const leftC = leftCollapsed;
  const rightC = rightCollapsed || bothOpenInMid;

  const toggleLeft = () => {
    const opening = leftC;
    // 중간 폭에서 왼쪽을 펴면 오른쪽은 접는다.
    dispatch({
      type: 'ui',
      patch: { leftCollapsed: !leftC, ...(opening && viewport === 'mid' ? { rightCollapsed: true } : {}) },
    });
  };
  const toggleRight = () => {
    const opening = rightC;
    dispatch({
      type: 'ui',
      patch: { rightCollapsed: !rightC, ...(opening && viewport === 'mid' ? { leftCollapsed: true } : {}) },
    });
  };

  if (viewport === 'narrow') {
    return (
      <div className="app">
        <Header />
        <main className="shell shell--narrow">
          <div className="pane" hidden={mobileTab !== 'hive'}>
            <SidePanel side="left" label={t.hive.title} collapsed={false} onToggle={toggleLeft} mobile>
              <HivePanel />
            </SidePanel>
          </div>
          <div className="pane pane--chat" hidden={mobileTab !== 'chat'}>
            <ChatPanel />
          </div>
          <div className="pane" hidden={mobileTab !== 'panel'}>
            <SidePanel side="right" label={t.panel.title} collapsed={false} onToggle={toggleRight} mobile>
              <StatusPanel />
            </SidePanel>
          </div>
        </main>
        <nav className="tabs" aria-label="화면 전환">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tabs__item${mobileTab === tab.key ? ' tabs__item--on' : ''}`}
              aria-current={mobileTab === tab.key ? 'page' : undefined}
              onClick={() => dispatch({ type: 'ui', patch: { mobileTab: tab.key } })}
            >
              {tab.label}
              {tab.key === 'panel' && state.extracting === 'running' ? (
                <span className="extracting__dot extracting__dot--tab" role="img" aria-label={t.panel.candidates.extractingShort} />
              ) : null}
              {tab.key === 'panel' && unseenCandidates > 0 ? <span className="badge">{unseenCandidates}</span> : null}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      <main className="shell">
        <SidePanel side="left" label={t.hive.title} collapsed={leftC} onToggle={toggleLeft}>
          <HivePanel />
        </SidePanel>
        <div className="center">
          <ChatPanel />
        </div>
        <SidePanel side="right" label={t.panel.title} collapsed={rightC} onToggle={toggleRight} badge={unseenCandidates} working={state.extracting === 'running'}>
          <StatusPanel />
        </SidePanel>
      </main>
    </div>
  );
}
