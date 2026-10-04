import type { CatalogGame } from './catalog';
import type { GameContext, GameInstance, MatchReport, ValeSettings } from '../games/types';
import { store } from './state';
import { formatDuration, h, icon, toast } from './ui';

// Runs a game full-window on top of the launcher and provides the Vale
// overlay (Shift+Tab), achievement toasts and playtime tracking.

let running: { game: CatalogGame; root: HTMLElement; instance: GameInstance | null; close: () => void } | null = null;

export function isRunning(): boolean {
  return running !== null;
}

function defaultServerUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export async function launchGame(game: CatalogGame, onExit: () => void): Promise<void> {
  if (running) return;

  const appEl = document.querySelector('.vale-app') as HTMLElement | null;
  const host = h('div', { class: 'vale-runner-host' });
  const launching = h(
    'div',
    { class: 'vale-launching' },
    h(
      'div',
      { class: 'vale-launching-inner' },
      h('img', { src: '/brand/vale-logo.png', alt: '' }),
      h('div', { class: 'label' }, `Launching ${game.title}`),
    ),
  );

  const startedAt = Date.now();
  let lastTick = startedAt;
  const clock = h('div', { class: 'ov-time' });
  const sessionEl = h('div', { class: 'v' });
  const achList = h('div', { class: 'ach-grid', style: 'grid-template-columns:1fr' });

  const overlay = h(
    'div',
    { class: 'vale-overlay' },
    h(
      'div',
      { class: 'ov-top' },
      h('img', { src: '/brand/vale-logo.png', alt: '' }),
      h('div', { class: 'ov-title' }, `${game.title} — ${game.edition}`),
      clock,
    ),
    h(
      'div',
      { class: 'ov-body' },
      h(
        'div',
        { class: 'ov-panel' },
        h('h4', null, 'Session'),
        h('div', { class: 'lib-stat' }, h('div', { class: 'k' }, 'Playing for'), sessionEl),
        h('div', { style: 'height:16px' }),
        h(
          'div',
          { style: 'display:flex;flex-direction:column;gap:10px' },
          h('button', { class: 'btn btn-primary', onclick: () => setOverlay(false) }, icon('play'), 'Resume game'),
          h('button', { class: 'btn btn-danger', onclick: () => close() }, icon('logout'), 'Exit to Vale'),
        ),
      ),
      h('div', { class: 'ov-panel' }, h('h4', null, 'Achievements'), achList),
      h(
        'div',
        { class: 'ov-panel' },
        h('h4', null, 'Controls'),
        h(
          'div',
          { class: 'list-card', style: 'background:none;border:none' },
          game.controls.slice(0, 9).map(([k, v]) => h('div', { class: 'row' }, h('span', { class: 'k' }, v), h('kbd', null, k))),
        ),
      ),
    ),
    h(
      'div',
      { class: 'ov-bottom' },
      h('span', null, 'Vale overlay'),
      h('span', null, h('kbd', null, 'Shift'), ' + ', h('kbd', null, 'Tab'), ' to close'),
    ),
  );

  const root = h('div', { class: 'vale-runner' }, host, overlay, launching);
  document.body.appendChild(root);
  appEl?.classList.add('is-hidden');

  let overlayOpen = false;
  const renderAchievements = () => {
    achList.innerHTML = '';
    const unlocked = game.achievements.filter((a) => store.hasAchievement(game.id, a.id));
    achList.append(
      h('div', { style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--muted)' }, h('span', null, `${unlocked.length} of ${game.achievements.length} unlocked`)),
      h('div', { class: 'progress' }, h('div', { style: `width:${(unlocked.length / game.achievements.length) * 100}%` })),
    );
    for (const a of game.achievements.slice(0, 6)) {
      const ok = store.hasAchievement(game.id, a.id);
      achList.append(
        h(
          'div',
          { class: `ach ${ok ? 'is-unlocked' : ''}`, style: 'padding:8px' },
          h('div', { class: 'ach-icon', style: 'width:34px;height:34px' }, icon(a.icon, 16)),
          h('div', null, h('div', { class: 'ach-name' }, a.name), h('div', { class: 'ach-desc' }, a.description)),
        ),
      );
    }
  };

  const setOverlay = (open: boolean) => {
    overlayOpen = open;
    overlay.classList.toggle('is-open', open);
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      renderAchievements();
    }
    running?.instance?.setOverlayOpen?.(open);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setOverlay(!overlayOpen);
    } else if (overlayOpen && e.key === 'Escape') {
      e.stopImmediatePropagation();
      setOverlay(false);
    }
  };
  window.addEventListener('keydown', onKey, true);

  const flushPlaytime = () => {
    const now = Date.now();
    const add = (now - lastTick) / 1000;
    lastTick = now;
    const entry = store.entry(game.id);
    store.setEntry(game.id, { playtimeSec: entry.playtimeSec + add, lastPlayed: now });
  };
  const timer = window.setInterval(() => {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sessionEl.textContent = formatDuration((Date.now() - startedAt) / 1000);
  }, 1000);
  const playtimeTimer = window.setInterval(flushPlaytime, 30_000);
  clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  sessionEl.textContent = '0s';

  const close = () => {
    if (!running) return;
    window.removeEventListener('keydown', onKey, true);
    window.clearInterval(timer);
    window.clearInterval(playtimeTimer);
    flushPlaytime();
    try {
      running.instance?.dispose();
    } catch (err) {
      console.error(err);
    }
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    root.remove();
    appEl?.classList.remove('is-hidden');
    running = null;
    onExit();
  };

  running = { game, root, instance: null, close };
  const entry = store.entry(game.id);
  store.setEntry(game.id, { launches: entry.launches + 1, lastPlayed: Date.now() });

  const ctx: GameContext = {
    playerName: store.state.profile.name,
    settings: { ...store.state.settings },
    loadProgress<T>(fallback: T): T {
      const saved = store.state.progress[game.id];
      return saved && typeof saved === 'object' ? ({ ...fallback, ...(saved as object) } as T) : fallback;
    },
    saveProgress(data: unknown) {
      store.update((s) => {
        s.progress[game.id] = data;
      });
    },
    reportMatch(report: MatchReport) {
      store.recordMatch(game.id, report);
    },
    unlockAchievement(id: string) {
      const def = game.achievements.find((a) => a.id === id);
      if (!def) return;
      if (store.grantAchievement(game.id, id)) {
        toast(`Achievement unlocked`, `${def.name} — ${def.description}`, { icon: 'trophy', kind: 'achievement', duration: 5000 });
      }
    },
    exit: () => close(),
    updateSettings(patch: Partial<ValeSettings>) {
      store.update((s) => {
        s.settings = { ...s.settings, ...patch };
      });
    },
    defaultServerUrl: defaultServerUrl(),
  };

  try {
    const [mod] = await Promise.all([game.load(), new Promise((r) => setTimeout(r, 900))]);
    if (!running) return;
    running.instance = await mod.launch(host, ctx);
    launching.classList.add('is-done');
    setTimeout(() => launching.remove(), 600);
    toast(`Playing ${game.title}`, 'Press Shift+Tab for the Vale overlay.', { duration: 3500 });
  } catch (err) {
    console.error(err);
    toast('Could not start the game', String((err as Error).message ?? err), { icon: 'x' });
    close();
  }
}

export function closeRunningGame(): void {
  running?.close();
}

let lastSettings = JSON.stringify(store.state.settings);
store.subscribe((s) => {
  const next = JSON.stringify(s.settings);
  if (next === lastSettings) return;
  lastSettings = next;
  running?.instance?.onSettingsChanged?.({ ...s.settings });
});
