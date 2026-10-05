import { CATALOG, getGame, type CatalogGame } from './catalog';
import { bg, pageDisposers } from './components';
import { downloads } from './downloads';
import { asset } from './env';
import { gamePage } from './pages/game';
import { libraryPage } from './pages/library';
import { settingsPage } from './pages/settings';
import { storePage } from './pages/store';
import { isRunning, launchGame } from './runner';
import { store } from './state';
import { clear, h, icon } from './ui';

export interface Nav {
  go(path: string): void;
  refresh(): void;
  play(game: CatalogGame): void;
}

export function mountApp(root: HTMLElement): void {
  const main = h('main', { class: 'vale-main' });
  const navButtons: Record<string, HTMLButtonElement> = {};

  const search = h('input', { type: 'search', placeholder: 'Search the store', 'aria-label': 'Search' }) as HTMLInputElement;
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nav.go(`/store?q=${encodeURIComponent(search.value.trim())}`);
  });

  const profileName = h('div', { class: 'vale-profile-name' });
  const profileLevel = h('div', { class: 'vale-profile-level' });
  const avatar = h('div', { class: 'vale-avatar' });
  const renderProfile = () => {
    const p = store.state.profile;
    const lv = store.level();
    profileName.textContent = p.name;
    profileLevel.textContent = `LEVEL ${lv.level}`;
    avatar.textContent = p.name.slice(0, 1).toUpperCase();
    avatar.style.background = `linear-gradient(135deg, hsl(${p.hue} 95% 65%), hsl(${p.hue + 30} 85% 45%))`;
  };
  renderProfile();
  store.subscribe(renderProfile);

  // Downloads indicator + popover
  const dlButton = h('button', { class: 'vale-iconbtn', title: 'Downloads', 'aria-label': 'Downloads' }, icon('download', 17));
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('class', 'ring');
  ring.setAttribute('viewBox', '0 0 42 42');
  ring.innerHTML = '<circle cx="21" cy="21" r="19" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="0 200" stroke-linecap="round" transform="rotate(-90 21 21)"/>';
  dlButton.appendChild(ring);
  let popover: HTMLElement | null = null;
  const renderPopover = () => {
    if (!popover) return;
    clear(popover);
    popover.append(h('h4', null, 'Downloads'));
    const active = [...downloads.active.values()];
    if (active.length === 0) {
      const installed = CATALOG.filter((g) => store.entry(g.id).installed);
      popover.append(
        h('div', { style: 'color:var(--muted);font-size:13px;padding:6px 0' }, installed.length ? 'All games are up to date.' : 'Nothing downloading.'),
      );
      for (const g of installed)
        popover.append(
          h(
            'div',
            { class: 'dl-row', style: 'margin-top:8px' },
            h('div', { class: 'lib-item-art', style: bg(g.media.cover) }),
            h('div', { class: 'grow' }, h('strong', null, g.title), h('span', { class: 'lib-item-sub ok' }, 'Installed')),
          ),
        );
    }
    for (const a of active) {
      const pct = Math.round((a.loaded / Math.max(1, a.total)) * 100);
      popover.append(
        h(
          'div',
          { class: 'dl-row' },
          h('div', { class: 'lib-item-art', style: bg(a.game.media.cover) }),
          h(
            'div',
            { class: 'grow' },
            h('div', { style: 'display:flex;justify-content:space-between' }, h('strong', null, a.game.title), h('span', null, `${pct}%`)),
            h('div', { class: 'progress' }, h('div', { style: `width:${pct}%` })),
          ),
        ),
      );
    }
  };
  dlButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover) {
      popover.remove();
      popover = null;
      return;
    }
    popover = h('div', { class: 'downloads-pop' });
    popover.addEventListener('click', (ev) => ev.stopPropagation());
    root.appendChild(popover);
    renderPopover();
  });
  document.addEventListener('click', () => {
    popover?.remove();
    popover = null;
  });
  downloads.subscribe(() => {
    const active = [...downloads.active.values()];
    const pct = active.length ? active.reduce((s, a) => s + a.loaded / Math.max(1, a.total), 0) / active.length : 0;
    const circle = ring.querySelector('circle')!;
    circle.setAttribute('stroke-dasharray', `${(pct * 119.4).toFixed(1)} 200`);
    renderPopover();
  });

  const navItem = (key: string, label: string, ic: string, path: string) => {
    const b = h('button', { onclick: () => nav.go(path) }, icon(ic, 17), h('span', null, label)) as HTMLButtonElement;
    navButtons[key] = b;
    return b;
  };

  const topbar = h(
    'header',
    { class: 'vale-topbar' },
    h('div', { class: 'vale-brand', onclick: () => nav.go('/store') }, h('img', { src: asset('brand/vale-logo.png'), alt: '' }), h('span', null, 'VALE')),
    h(
      'nav',
      { class: 'vale-nav' },
      navItem('store', 'Store', 'store', '/store'),
      navItem('library', 'Library', 'library', '/library'),
      navItem('settings', 'Settings', 'settings', '/settings'),
    ),
    h('div', { class: 'vale-topbar-spacer' }),
    h('label', { class: 'vale-search' }, icon('search', 16), search),
    dlButton,
    h(
      'div',
      { class: 'vale-profile', onclick: () => nav.go('/settings'), title: 'Profile & settings' },
      avatar,
      h('div', { class: 'vale-profile-text' }, profileName, profileLevel),
    ),
  );

  const app = h('div', { class: 'vale-app' }, topbar, main);
  root.appendChild(app);

  const render = () => {
    while (pageDisposers.length) pageDisposers.pop()!();
    const hash = location.hash.replace(/^#/, '') || '/store';
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs ?? '');
    const parts = path.split('/').filter(Boolean);
    const section = parts[0] ?? 'store';
    for (const [k, b] of Object.entries(navButtons)) b.classList.toggle('is-active', k === section || (k === 'store' && section === 'game'));

    let page: HTMLElement;
    if (section === 'game' && parts[1] && getGame(parts[1])) page = gamePage(getGame(parts[1])!, nav);
    else if (section === 'library') page = libraryPage(nav, parts[1]);
    else if (section === 'settings') page = settingsPage(nav);
    else {
      page = storePage(nav, params.get('q') ?? '');
      search.value = params.get('q') ?? '';
    }
    clear(main);
    main.appendChild(page);
    main.scrollTop = 0;
  };

  const nav: Nav = {
    go(path: string) {
      if (location.hash === `#${path}`) render();
      else location.hash = path;
    },
    refresh: render,
    play(game: CatalogGame) {
      if (isRunning()) return;
      if (downloads.status(game) !== 'installed') return;
      launchGame(game, () => render());
    },
  };

  window.addEventListener('hashchange', render);
  render();

  if (store.state.firstRun) welcome(nav);
}

function welcome(nav: Nav): void {
  const input = h('input', { type: 'text', value: store.state.profile.name, maxlength: 16, 'aria-label': 'Display name' }) as HTMLInputElement;
  const finish = () => {
    const name = input.value.trim().slice(0, 16) || store.state.profile.name;
    store.update((s) => {
      s.profile.name = name;
      s.firstRun = false;
    });
    backdrop.remove();
    nav.refresh();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish();
  });
  const backdrop = h(
    'div',
    { class: 'modal-backdrop' },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('img', { class: 'modal-logo', src: asset('brand/vale-logo.png'), alt: '' }),
      h('h2', null, 'Welcome to Vale'),
      h('p', null, 'Pick a display name. It’s what other players see in matches, and you can change it any time in Settings.'),
      input,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', onclick: finish, 'data-action': 'welcome-continue' }, 'Continue')),
    ),
  );
  document.body.appendChild(backdrop);
  setTimeout(() => input.select(), 50);
}
