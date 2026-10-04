import type { CatalogGame } from '../catalog';
import { actionButton, bg, onDispose, wordmark } from '../components';
import { downloads } from '../downloads';
import { store } from '../state';
import { formatBytes, formatDuration, h, icon } from '../ui';
import type { Nav } from '../app';

export function gamePage(game: CatalogGame, nav: Nav): HTMLElement {
  const shots = [game.media.hero, ...game.media.screenshots];
  let index = 0;
  const main = h('div', { class: 'gallery-main', style: bg(shots[0]) });
  const thumbs = shots.slice(0, 5).map((s, i) =>
    h('div', { class: `hero-thumb ${i === 0 ? 'is-active' : ''}`, style: bg(s), onclick: () => show(i) }),
  );
  const show = (i: number) => {
    index = (i + shots.length) % shots.length;
    main.setAttribute('style', bg(shots[index]));
    thumbs.forEach((t, j) => t.classList.toggle('is-active', j === index));
  };
  main.append(
    h('button', { class: 'gallery-nav prev', onclick: () => show(index - 1), 'aria-label': 'Previous' }, icon('chevronLeft', 20)),
    h('button', { class: 'gallery-nav next', onclick: () => show(index + 1), 'aria-label': 'Next' }, icon('chevronRight', 20)),
  );

  const entry = store.entry(game.id);
  const unlocked = game.achievements.filter((a) => store.hasAchievement(game.id, a.id)).length;

  const statusNote = h('div', { class: 'install-note' });
  const renderNote = () => {
    const st = downloads.status(game);
    const e = store.entry(game.id);
    statusNote.textContent =
      st === 'installed'
        ? `Installed · ${formatBytes(e.sizeBytes)} · ${e.playtimeSec > 0 ? formatDuration(e.playtimeSec) + ' played' : 'Never played'}`
        : st === 'installing'
          ? 'Downloading into Vale’s game cache…'
          : `Free · about ${formatBytes(game.approxSize)} download`;
  };
  renderNote();
  onDispose(downloads.subscribe(renderNote));

  const manage =
    entry.installed
      ? h(
          'button',
          { class: 'btn btn-ghost btn-sm', onclick: async () => { await downloads.uninstall(game); nav.refresh(); } },
          icon('trash', 15),
          'Uninstall',
        )
      : null;

  const side = h(
    'aside',
    { class: 'side-card' },
    h('div', { class: 'side-card-art', style: bg(game.media.cover) }),
    h(
      'div',
      { class: 'side-card-body' },
      h('p', null, game.tagline),
      h(
        'dl',
        { class: 'meta-table' },
        h('dt', null, 'Developer'),
        h('dd', null, game.developer),
        h('dt', null, 'Publisher'),
        h('dd', null, game.publisher),
        h('dt', null, 'Released'),
        h('dd', null, game.released),
        h('dt', null, 'Achievements'),
        h('dd', null, `${unlocked} / ${game.achievements.length}`),
      ),
      h('div', { class: 'chips' }, game.tags.map((t) => h('span', { class: 'chip' }, t))),
      h('div', { class: 'install-box' }, actionButton(game, () => nav.play(game)), statusNote, manage),
    ),
  );

  const page = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'crumbs' },
      h('button', { onclick: () => nav.go('/store') }, 'Store'),
      '›',
      h('span', null, game.genres[0]),
      '›',
      h('span', { style: 'color:var(--text-2)' }, game.title),
    ),
    h(
      'div',
      { class: 'gp-head' },
      h('div', null, wordmark(game), h('div', { class: 'edition', style: 'margin-top:8px' }, game.edition)),
      h('div', { class: 'chips' }, h('span', { class: 'chip chip-accent' }, game.price), game.genres.map((g) => h('span', { class: 'chip' }, g))),
    ),
    h('div', { class: 'gp-grid' }, h('div', null, main, h('div', { class: 'gallery-thumbs' }, thumbs)), side),
    h(
      'div',
      { class: 'gp-body' },
      h(
        'div',
        null,
        h('div', { class: 'section-title' }, 'About this game'),
        h('div', { class: 'prose' }, game.about.map((p) => h('p', null, p))),
        h('div', { class: 'section-title' }, 'Features'),
        h(
          'div',
          { class: 'feature-grid' },
          game.features.map((f) => h('div', { class: 'feature' }, h('h4', null, f.title), h('p', null, f.body))),
        ),
        h('div', { class: 'section-title' }, 'Classes'),
        h(
          'div',
          { class: 'feature-grid' },
          game.classes.map((f) => h('div', { class: 'feature' }, h('h4', null, f.name), h('p', null, f.body))),
        ),
        h('div', { class: 'section-title' }, 'Modes & maps'),
        h(
          'div',
          { class: 'two-col' },
          h('div', { class: 'list-card' }, game.modes.map((m) => h('div', { class: 'row' }, h('span', null, h('strong', null, m.name), h('div', { class: 'k', style: 'margin-top:3px' }, m.body))))),
          h('div', { class: 'list-card' }, game.maps.map((m) => h('div', { class: 'row' }, h('span', null, h('strong', null, m.name), h('div', { class: 'k', style: 'margin-top:3px' }, m.body))))),
        ),
        h('div', { class: 'section-title' }, `Achievements · ${unlocked}/${game.achievements.length}`),
        h(
          'div',
          { class: 'ach-grid' },
          game.achievements.map((a) =>
            h(
              'div',
              { class: `ach ${store.hasAchievement(game.id, a.id) ? 'is-unlocked' : ''}` },
              h('div', { class: 'ach-icon' }, icon(a.icon, 20)),
              h('div', null, h('div', { class: 'ach-name' }, a.name), h('div', { class: 'ach-desc' }, a.description)),
            ),
          ),
        ),
      ),
      h(
        'div',
        null,
        h('div', { class: 'section-title' }, 'Controls'),
        h('div', { class: 'list-card' }, game.controls.map(([k, v]) => h('div', { class: 'row' }, h('span', { class: 'k' }, v), h('kbd', null, k)))),
        h('div', { class: 'section-title' }, 'System requirements'),
        h(
          'div',
          { class: 'list-card' },
          [
            ['Runtime', 'Vale (any modern browser)'],
            ['Graphics', 'WebGL 2'],
            ['Input', 'Keyboard & mouse'],
            ['Storage', `~${formatBytes(game.approxSize)}`],
            ['Network', 'Optional (LAN play)'],
          ].map(([k, v]) => h('div', { class: 'row' }, h('span', { class: 'k' }, k), h('span', null, v))),
        ),
        h(
          'p',
          { style: 'color:var(--muted);font-size:12px;line-height:1.6;margin-top:16px' },
          'Deadshot.io Vale Edition is an independent fan recreation built for Vale. It is not affiliated with or endorsed by the creators of Deadshot.io, and it uses no code or assets from the original game.',
        ),
      ),
    ),
  );
  return page;
}
