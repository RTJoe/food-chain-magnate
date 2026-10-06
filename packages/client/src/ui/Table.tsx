/**
 * The game table: overlay around the board. The 3D canvas lives in `#board-root` behind the
 * overlay (mounted by main.tsx); while no 3D renderer is registered the overlay shows Board2D.
 * Desktop: player rail left, dock right. Mobile: compact rail on top, dock as a bottom sheet.
 */
import { useEffect } from 'preact/hooks';
import { boardRenderer, interactionMode, isPickMode } from '../state/boardBridge.js';
import { isMyTurn, me, mode, prompt, unreadChat, view } from '../state/store.js';
import { undo } from '../net/session.js';
import { Board2D, hasBoard } from './Board2D.js';
import { BoardControls } from './BoardControls.js';
import { ChatBox } from './Chat.js';
import { Icon, type IconName } from './icons.js';
import { InspectCard } from './Inspect.js';
import { Log } from './Log.js';
import { Market } from './Market.js';
import { Milestones } from './Milestones.js';
import { Company } from './OrgChart.js';
import { ConnectionBanner, GameMenu, GameOverModal, HotseatHandoff } from './Overlays.js';
import { PlayerPanels } from './PlayerPanels.js';
import { PromptPanel } from './PromptPanel.js';
import { SummaryCard, SummaryLinks } from './Summary.js';
import { TopBar } from './TopBar.js';
import { dockTab, menuOpen, sheetOpen, type DockTab } from './uiState.js';
import { CoachLayer } from '../tutorial/coach/CoachLayer.js';
import { navigate } from '../state/router.js';

const TABS: { id: DockTab; label: string; icon: IconName }[] = [
  { id: 'turn', label: 'Turn', icon: 'play' },
  { id: 'company', label: 'Company', icon: 'restructure' },
  { id: 'market', label: 'Staff', icon: 'users' },
  { id: 'milestones', label: 'Milestones', icon: 'star' },
  { id: 'log', label: 'Log', icon: 'log' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
];

export function Table() {
  const v = view.value;
  useEffect(() => {
    document.body.dataset.screen = 'table';
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && me.value) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      delete document.body.dataset.screen;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Board pick modes collapse the phone sheet to the pick strip (and never reopen it while picking);
  // otherwise jump to the Turn tab when it becomes my turn (or a pick ends on my turn).
  const picking = isPickMode(interactionMode.value);
  useEffect(() => {
    if (picking) sheetOpen.value = false;
    else if (isMyTurn.value) {
      dockTab.value = 'turn';
      sheetOpen.value = true;
    }
  }, [isMyTurn.value, v?.phase.kind, picking]);

  if (!v) return null;
  const show2d = boardRenderer.value !== '3d' && hasBoard(v);
  return (
    <div class={`table ${sheetOpen.value ? 'sheet-open' : ''} ${picking ? 'is-picking' : ''}`}>
      <TopBar onMenu={() => (menuOpen.value = true)} />
      <ConnectionBanner />
      <div class="table-main">
        <PlayerPanels />
        <div class="table-board">
          {show2d && <Board2D />}
          <BoardControls />
          <InspectCard />
        </div>
        <Dock />
      </div>
      <SummaryCard />
      <GameOverModal />
      <GameMenu />
      <HotseatHandoff />
      {mode.value === 'tutorial' && <CoachLayer onExit={() => navigate({ name: 'learn', lesson: null })} />}
    </div>
  );
}

function Dock() {
  const tab = dockTab.value;
  const pr = prompt.value;
  const tabs = TABS.filter((t) => t.id !== 'chat' || mode.value === 'online');
  const mine = isMyTurn.value;
  return (
    <aside class={`dock glass ${sheetOpen.value ? 'is-open' : ''}`} aria-label="Game panels">
      <button type="button" class={`sheet-handle ${mine ? 'is-mine' : ''}`} onClick={() => (sheetOpen.value = !sheetOpen.value)} aria-expanded={sheetOpen.value}>
        <span class="sheet-grip" aria-hidden="true" />
        <span class="sheet-title">
          {mine && <span class="dot is-on" />}
          {pr?.title ?? 'Game'}
        </span>
        {sheetOpen.value ? Icon.chevronDown({ size: 18 }) : Icon.chevronUp({ size: 18 })}
      </button>
      <nav class="dock-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tutorial={`tab-${t.id}`}
            aria-selected={tab === t.id}
            class={`dock-tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => {
              dockTab.value = t.id;
              sheetOpen.value = true;
            }}
          >
            {Icon[t.icon]({ size: 18 })}
            <span>{t.label}</span>
            {t.id === 'turn' && mine && <i class="tab-dot" aria-label="Your turn" />}
            {t.id === 'chat' && unreadChat.value > 0 && <i class="tab-count">{unreadChat.value}</i>}
          </button>
        ))}
      </nav>
      <div class="dock-body" role="tabpanel">
        {tab === 'turn' && <PromptPanel />}
        {tab === 'company' && <Company />}
        {tab === 'market' && <Market />}
        {tab === 'milestones' && <Milestones />}
        {tab === 'log' && (
          <>
            <SummaryLinks />
            <Log />
          </>
        )}
        {tab === 'chat' && <ChatBox />}
      </div>
    </aside>
  );
}
