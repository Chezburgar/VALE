import { CATALOG, type CatalogGame } from '../catalog';
import { actionButton, bg, onDispose, wordmark } from '../components';
import { h, icon } from '../ui';
import type { Nav } from '../app';

export function storePage(nav: Nav, query = ''): HTMLElement {
  const games = CATALOG.filter((g) =>
    query ? `${g.title} ${g.tags.join(' ')} ${g.genres.join(' ')}`.toLowerCase().includes(query.toLowerCase()) : true,
  );
  const featured = CATALOG[0];

  const page = h('div', { class: 'page' });

  if (!query) page.append(hero(featured, nav));

  if (query) {
    page.append(h('div', { class: 'section-title', style: 'margin-top:0' }, `Results for “${query}”`));
  } else {
    page.append(h('div', { class: 'section-title' }, 'Free to Play'));
  }

  const row = h('div', { class: 'card-row' });
  for (const g of games) row.append(gameCard(g, nav));
  if (!query)
    row.append(
      h(
        'div',
        { class: 'soon-card' },
        h(
          'div',
          null,
          h('img', { src: '/brand/vale-logo.png', alt: '' }),
          h('strong', null, 'More games coming'),
          'New titles land in the Vale store as they’re added to the catalog.',
        ),
      ),
    );
  if (query && games.length === 0)
    row.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('h3', null, 'No matches'), 'Try a different search.'));
  page.append(row);

  if (!query) {
    page.append(h('div', { class: 'section-title' }, 'Browse by genre'));
    const genres: [string, string][] = [
      ['FPS', 'target'],
      ['Action', 'bolt'],
      ['Multiplayer', 'users'],
      ['Shooter', 'target'],
      ['Arena', 'shield'],
      ['LAN', 'wifi'],
    ];
    page.append(
      h(
        'div',
        { class: 'genre-row' },
        genres.map(([name, ic]) => {
          const count = CATALOG.filter((g) => g.genres.includes(name) || g.tags.includes(name)).length;
          return h(
            'div',
            { class: 'genre-tile', onclick: () => nav.go(`/store?q=${encodeURIComponent(name)}`) },
            h('span', { class: 'count' }, `${count} ${count === 1 ? 'game' : 'games'}`),
            name,
            icon(ic, 90),
          );
        }),
      ),
    );

    page.append(h('div', { class: 'section-title' }, 'Why Vale'));
    page.append(
      h(
        'div',
        { class: 'store-strip' },
        strip('bolt', 'Instant installs', 'Games download into Vale’s local cache and launch in a couple of seconds, even offline.'),
        strip('trophy', 'Stats & achievements', 'Every match feeds your career stats, Vale level and achievement collection.'),
        strip('wifi', 'Play together', 'Run the Vale server on one PC and anyone on your network can join the lobby.'),
      ),
    );
  }

  return page;
}

function strip(ic: string, title: string, body: string): HTMLElement {
  return h('div', { class: 'strip-card' }, h('div', { class: 'ico' }, icon(ic, 20)), h('div', null, h('h4', null, title), h('p', null, body)));
}

function hero(game: CatalogGame, nav: Nav): HTMLElement {
  const shots = [game.media.hero, ...game.media.screenshots.slice(0, 3)];
  let index = 0;
  const bgEl = h('div', { class: 'hero-bg', style: bg(shots[0]) });
  const thumbs = shots.map((s, i) =>
    h('div', {
      class: `hero-thumb ${i === 0 ? 'is-active' : ''}`,
      style: bg(s),
      onclick: (e: Event) => {
        e.stopPropagation();
        show(i);
      },
    }),
  );
  const show = (i: number) => {
    index = i;
    bgEl.setAttribute('style', bg(shots[i]));
    thumbs.forEach((t, j) => t.classList.toggle('is-active', j === i));
  };
  const timer = window.setInterval(() => show((index + 1) % shots.length), 6000);
  onDispose(() => window.clearInterval(timer));

  return h(
    'section',
    { class: 'hero' },
    bgEl,
    h(
      'div',
      { class: 'hero-content' },
      h('div', { class: 'hero-eyebrow' }, 'Featured on Vale'),
      wordmark(game),
      h('div', { class: 'edition' }, game.edition),
      h('p', { class: 'hero-tagline' }, game.tagline),
      h('div', { class: 'chips' }, game.tags.slice(0, 5).map((t) => h('span', { class: 'chip' }, t))),
      h(
        'div',
        { class: 'hero-actions' },
        actionButton(game, () => nav.play(game)),
        h('button', { class: 'btn btn-ghost btn-lg', onclick: () => nav.go(`/game/${game.id}`) }, 'Details'),
        h('span', { class: 'hero-price' }, game.price),
      ),
    ),
    h('div', { class: 'hero-side' }, thumbs),
  );
}

function gameCard(game: CatalogGame, nav: Nav): HTMLElement {
  return h(
    'div',
    { class: 'game-card', onclick: () => nav.go(`/game/${game.id}`) },
    h('div', { class: 'game-card-art', style: bg(game.media.cover) }, wordmark(game)),
    h(
      'div',
      { class: 'game-card-body' },
      h('div', { class: 'game-card-title' }, h('span', null, `${game.title} — ${game.edition}`), h('span', { class: 'price-tag' }, 'Free')),
      h('div', { class: 'game-card-sub' }, game.tagline),
      h('div', { class: 'chips' }, game.genres.map((t) => h('span', { class: 'chip' }, t))),
    ),
  );
}
