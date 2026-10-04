import type { CatalogGame } from './catalog';
import { downloads } from './downloads';
import { h, icon } from './ui';

/** Per-page cleanup registry; the router flushes it on navigation. */
export const pageDisposers: (() => void)[] = [];

export function onDispose(fn: () => void): void {
  pageDisposers.push(fn);
}

export function bg(url: string, fallback = 'linear-gradient(135deg,#0f2a2e,#071214)'): string {
  return `background-image:url('${url}'), ${fallback}`;
}

export function wordmark(game: CatalogGame, extraClass = ''): HTMLElement {
  // "Deadshot.io" -> DEADSHOT<red dot>IO
  const [name, tld] = game.title.split('.');
  return h(
    'h1',
    { class: `game-wordmark ${extraClass}` },
    name,
    tld ? h('span', { class: 'dot' }, '.') : null,
    tld ? h('span', { style: 'color:var(--danger)' }, tld) : null,
  );
}

/**
 * Install / progress / Play button that stays in sync with the download manager.
 */
export function actionButton(game: CatalogGame, onPlay: () => void, size: 'lg' | 'md' = 'lg'): HTMLElement {
  const wrap = h('div', { style: 'display:contents' });
  const render = () => {
    wrap.innerHTML = '';
    const status = downloads.status(game);
    const sz = size === 'lg' ? 'btn-lg' : '';
    if (status === 'installed') {
      wrap.append(h('button', { class: `btn btn-play ${sz}`, onclick: onPlay, 'data-action': 'play' }, icon('play', 18), 'Play'));
    } else if (status === 'installing') {
      const pct = Math.round(downloads.progress(game.id) * 100);
      wrap.append(
        h(
          'button',
          { class: `btn btn-progress ${sz}`, title: 'Click to cancel', onclick: () => downloads.cancel(game.id) },
          h('div', { class: 'fill', style: `width:${pct}%` }),
          h('span', null, `Installing ${pct}%`),
        ),
      );
    } else {
      wrap.append(
        h(
          'button',
          { class: `btn btn-primary ${sz}`, onclick: () => downloads.install(game), 'data-action': 'install' },
          icon('download', 18),
          'Install',
        ),
      );
    }
  };
  render();
  onDispose(downloads.subscribe(render));
  return wrap;
}
