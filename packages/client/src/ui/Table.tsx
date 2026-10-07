/**
 * The game table: overlay around the board. The 3D canvas lives in `#board-root` behind the
 * overlay (mounted by main.tsx); while no 3D renderer is registered the overlay shows Board2D.
 * Desktop: player rail left, dock right. Mobile: compact rail on top, dock as a bottom sheet.
 */
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { boardRenderer, interactionMode, isPickMode } from '../state/boardBridge.js';
import { isMyTurn, me, mode, prompt, summaries, unreadChat, view } from '../state/store.js';
import { announce, summaryAnnouncement, turnAnnouncement } from '../state/announce.js';
import { phaseLabel } from '../state/selectors.js';
import { currentBeat, phaseCaption } from '../state/feedback.js';
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
  // otherwise jump to the Turn tab when it becomes my turn (or a pick ends on my turn). On a phone
  // (portrait: the sheet covers the board) the sheet also lowers when my turn ends, and waits for
  // the board to finish animating (Marketing, Dinnertime, other players' moves) before it rises:
  // the handle's "your turn" dot says a prompt is waiting meanwhile.
  const picking = isPickMode(interactionMode.value);
  const narrow = useMedia(PHONE_QUERY);
  const landscape = useMedia(LANDSCAPE_QUERY);
  const sheetPhone = narrow && !landscape;
  // Marketing / Dinnertime beats on the board (the caption pill shows them).
  const autoPhase = phaseCaption.value !== null || currentBeat.value !== null;
  const animating = useBoardAnimating() || autoPhase;
  const mine = isMyTurn.value;
  const openPending = useRef(false);
  const wasMine = useRef(false);
  useEffect(() => {
    if (!picking && mine) openPending.current = true;
  }, [mine, v?.phase.kind, picking]);
  // An automatic phase starts playing while the sheet is up (my Payday move ran Marketing straight
  // into my Restructuring): lower it to show the board, and raise it again once the board is idle.
  useEffect(() => {
    if (!sheetPhone || !autoPhase || picking || !sheetOpen.peek()) return;
    sheetOpen.value = false;
    if (mine) openPending.current = true;
  }, [autoPhase]);
  useEffect(() => {
    const ended = wasMine.current && !mine;
    wasMine.current = mine;
    if (picking) {
      sheetOpen.value = false;
      return;
    }
    if (!mine) {
      openPending.current = false;
      if (ended && sheetPhone) sheetOpen.value = false;
      return;
    }
    if (!openPending.current || (sheetPhone && animating)) return;
    openPending.current = false;
    dockTab.value = 'turn';
    sheetOpen.value = true;
  }, [mine, v?.phase.kind, picking, animating, sheetPhone]);

  useAnnouncements();

  if (!v) return null;
  const show2d = boardRenderer.value !== '3d' && hasBoard(v);
  return (
    <div class={`table ${sheetOpen.value ? 'sheet-open' : ''} ${picking ? 'is-picking' : ''} ${show2d ? 'is-2d' : ''}`}>
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

/**
 * Screen-reader announcements for the table (WCAG 4.1.3): turn start, phase changes, Dinnertime
 * and Payday results. Online, the tab title also says when it is my turn.
 */
function useAnnouncements(): void {
  const v = view.value;
  const mine = isMyTurn.value;
  const phaseKey = v?.phase.kind ?? null;
  const last = useRef<{ phase: string | null; mine: boolean; summary: number }>({ phase: null, mine: false, summary: Number.POSITIVE_INFINITY });
  useEffect(() => {
    const was = last.current;
    last.current = { ...was, phase: phaseKey, mine };
    if (!v || was.phase === null) return; // First view: the page itself says where we are.
    const text = turnAnnouncement({ phaseChanged: was.phase !== phaseKey, phase: phaseLabel(v.phase), turnStarted: mine && !was.mine, title: prompt.peek()?.title ?? null });
    if (text) announce(text);
  }, [phaseKey, mine]);
  const list = summaries.value;
  useEffect(() => {
    const top = list.at(-1)?.id ?? 0;
    const from = last.current.summary;
    last.current.summary = top;
    if (!v || from === Number.POSITIVE_INFINITY) return;
    for (const s of list) {
      if (s.id <= from) continue;
      const text = summaryAnnouncement(s, v.turnOrder, me.peek(), (id) => v.players[id]?.name ?? id);
      if (text) announce(text);
    }
  }, [list]);
  const online = mode.value === 'online';
  useEffect(() => {
    if (!online) return;
    const base = document.title.replace(/^Your turn · /, '');
    document.title = mine ? `Your turn · ${base}` : base;
  }, [online, mine]);
  useEffect(() => () => void (document.title = document.title.replace(/^Your turn · /, '')), []);
}

/** Phones: the dock is a bottom sheet over the board... */
const PHONE_QUERY = '(max-width: 860px)';
/** ...except on short landscape screens, where it is a side panel (styles/main.css, P6 block). */
const LANDSCAPE_QUERY = '(max-width: 1180px) and (max-height: 520px) and (orientation: landscape)';

function useMedia(query: string): boolean {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
  const on = useSignal(mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const f = () => (on.value = mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return on.value;
}

/** The 3D board's running timeline (`data-anim` on its canvas, which e2e waits on too). */
function useBoardAnimating(): boolean {
  const on = useSignal(false);
  useEffect(() => {
    let mo: MutationObserver | null = null;
    let watched: Element | null = null;
    const attach = () => {
      const c = document.querySelector('#board-root canvas');
      if (c === watched) return;
      mo?.disconnect();
      watched = c;
      on.value = c?.getAttribute('data-anim') === 'playing';
      if (!c) return;
      mo = new MutationObserver(() => (on.value = c.getAttribute('data-anim') === 'playing'));
      mo.observe(c, { attributes: true, attributeFilter: ['data-anim'] });
    };
    attach();
    // The 3D board mounts lazily after the first view.
    const id = window.setInterval(attach, 1000);
    return () => {
      window.clearInterval(id);
      mo?.disconnect();
    };
  }, []);
  return on.value;
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
            aria-label={t.id === 'turn' && mine ? 'Turn, your turn' : t.id === 'chat' && unreadChat.value > 0 ? `Chat, ${unreadChat.value} unread` : undefined}
            class={`dock-tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => {
              dockTab.value = t.id;
              sheetOpen.value = true;
            }}
          >
            {Icon[t.icon]({ size: 18 })}
            <span>{t.label}</span>
            {t.id === 'turn' && mine && <i class="tab-dot" aria-hidden="true" />}
            {t.id === 'chat' && unreadChat.value > 0 && <i class="tab-count" aria-hidden="true">{unreadChat.value}</i>}
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
