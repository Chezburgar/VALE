import { CATALOG, type CatalogGame } from '../catalog';
import { actionButton, bg, onDispose, wordmark } from '../components';
import { downloads } from '../downloads';
import { store } from '../state';
import { formatBytes, formatDuration, h, icon, timeAgo } from '../ui';
import type { Nav } from '../app';

export function libraryPage(nav: Nav, selectedId?: string): HTMLElement {
  const owned = CATALOG.filter((g) => store.entry(g.id).owned || downloads.status(g) !== 'available');

  if (owned.length === 0) {
    return h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'empty' },
        h('img', { src: '/brand/vale-logo.png', alt: '' }),
        h('h3', null, 'Your library is empty'),
        h('p', null, 'Games you install from the store show up here.'),
        h('div', { style: 'height:12px' }),
        h('button', { class: 'btn btn-primary', onclick: () => nav.go('/store') }, icon('store'), 'Browse the store'),
      ),
    );
  }

  const selected = owned.find((g) => g.id === selectedId) ?? owned[0];

  const side = h(
    'aside',
    { class: 'lib-side' },
    h('div', { class: 'lib-side-title' }, h('span', null, 'Games'), h('span', null, String(owned.length))),
    owned.map((g) => {
      const sub = h('div', { class: 'lib-item-sub' });
      const renderSub = () => {
        const st = downloads.status(g);
        sub.className = `lib-item-sub ${st === 'installed' ? 'ok' : ''}`;
        sub.textContent =
          st === 'installed' ? 'Ready to play' : st === 'installing' ? `Installing ${Math.round(downloads.progress(g.id) * 100)}%` : 'Not installed';
      };
      renderSub();
      onDispose(downloads.subscribe(renderSub));
      return h(
        'div',
        { class: `lib-item ${g.id === selected.id ? 'is-active' : ''}`, onclick: () => nav.go(`/library/${g.id}`) },
        h('div', { class: 'lib-item-art', style: bg(g.media.cover) }),
        h('div', null, h('div', { class: 'lib-item-name' }, g.title), sub),
      );
    }),
  );

  return h('div', { class: 'library' }, side, h('div', { class: 'lib-main' }, libraryDetail(selected, nav)));
}

function libraryDetail(game: CatalogGame, nav: Nav): HTMLElement {
  const e = store.entry(game.id);
  const st = store.stats(game.id);
  const kd = st.deaths > 0 ? (st.kills / st.deaths).toFixed(2) : st.kills.toFixed(2);
  const acc = st.shotsFired > 0 ? `${Math.round((st.shotsHit / st.shotsFired) * 100)}%` : '—';
  const hs = st.kills > 0 ? `${Math.round((st.headshots / st.kills) * 100)}%` : '—';
  const unlocked = game.achievements.filter((a) => store.hasAchievement(game.id, a.id));

  const manage = h('div', { style: 'display:flex;gap:8px;margin-left:auto' });
  const renderManage = () => {
    manage.innerHTML = '';
    if (downloads.status(game) === 'installed') {
      manage.append(
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => nav.go(`/game/${game.id}`) }, icon('store', 15), 'Store page'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await downloads.uninstall(game); nav.refresh(); } }, icon('trash', 15), 'Uninstall'),
      );
    }
  };
  renderManage();
  onDispose(downloads.subscribe(renderManage));

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'lib-banner', style: bg(game.media.hero) },
      h('div', null, wordmark(game), h('div', { class: 'edition', style: 'margin-top:8px' }, game.edition)),
    ),
    h(
      'div',
      { class: 'lib-bar' },
      actionButton(game, () => nav.play(game)),
      stat('Last played', e.lastPlayed ? timeAgo(e.lastPlayed) : 'Never'),
      stat('Play time', formatDuration(e.playtimeSec)),
      stat('Achievements', `${unlocked.length}/${game.achievements.length}`),
      stat('Size', e.installed ? formatBytes(e.sizeBytes) : '—'),
      manage,
    ),
    h(
      'div',
      { class: 'lib-content' },
      h('div', { class: 'section-title' }, 'Career'),
      h(
        'div',
        { class: 'stat-grid' },
        tile(st.matches, 'Matches'),
        tile(st.wins, 'Wins'),
        tile(st.kills, 'Kills'),
        tile(st.deaths, 'Deaths'),
        tile(kd, 'K/D ratio'),
        tile(st.headshots, 'Headshots'),
        tile(hs, 'Headshot %'),
        tile(acc, 'Accuracy'),
        tile(st.bestStreak, 'Best streak'),
        tile(`${Math.round(st.longestShot)}m`, 'Longest kill'),
      ),
      h('div', { class: 'section-title' }, 'Kills by class'),
      h(
        'div',
        { class: 'stat-grid' },
        ['Assault Rifle', 'SMG', 'Shotgun', 'Sniper'].map((c) => tile(st.classKills[c] ?? 0, c)),
      ),
      h('div', { class: 'section-title' }, `Achievements · ${unlocked.length}/${game.achievements.length}`),
      h('div', { class: 'progress', style: 'margin-bottom:14px' }, h('div', { style: `width:${(unlocked.length / game.achievements.length) * 100}%` })),
      h(
        'div',
        { class: 'ach-grid' },
        game.achievements.map((a) => {
          const at = store.state.achievements[game.id]?.[a.id];
          return h(
            'div',
            { class: `ach ${at ? 'is-unlocked' : ''}` },
            h('div', { class: 'ach-icon' }, icon(a.icon, 20)),
            h(
              'div',
              null,
              h('div', { class: 'ach-name' }, a.name),
              h('div', { class: 'ach-desc' }, at ? `Unlocked ${timeAgo(at)}` : a.description),
            ),
          );
        }),
      ),
    ),
  );
}

function stat(k: string, v: string): HTMLElement {
  return h('div', { class: 'lib-stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
}

function tile(v: string | number, k: string): HTMLElement {
  return h('div', { class: 'stat-tile' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'k' }, k));
}
