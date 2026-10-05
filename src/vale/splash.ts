import { asset } from './env';
import { h } from './ui';

/** Startup screen: shows the Vale key art while the launcher warms up. */
export function showSplash(tasks: Promise<unknown>[]): Promise<void> {
  const fill = h('div');
  const status = h('div', { class: 'vale-splash-status' }, 'Starting Vale');
  const el = h(
    'div',
    { class: 'vale-splash', role: 'presentation' },
    h(
      'div',
      { class: 'vale-splash-inner' },
      h('div', { class: 'vale-splash-art' }, h('img', { src: asset('brand/vale-splash.png'), alt: 'Vale' })),
      h('div', { class: 'vale-splash-bar' }, fill),
      status,
    ),
  );
  document.body.appendChild(el);

  const steps = ['Starting Vale', 'Loading library', 'Connecting to store', 'Ready'];
  let progress = 0;
  let skip = false;
  el.addEventListener('click', () => (skip = true));
  window.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip = true;
    if (skip) window.removeEventListener('keydown', onKey);
  });

  const minTime = new Promise((r) => setTimeout(r, 2600));
  const work = Promise.all(tasks.map((t) => t.catch(() => undefined)));

  return new Promise((resolve) => {
    let workDone = false;
    let minDone = false;
    work.then(() => (workDone = true));
    minTime.then(() => (minDone = true));
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 2600;
      const target = workDone ? (minDone ? 1 : Math.min(0.95, t)) : Math.min(0.8, t);
      progress += (target - progress) * 0.12;
      if (skip) progress = 1;
      fill.style.width = `${(progress * 100).toFixed(1)}%`;
      status.textContent = steps[Math.min(steps.length - 1, Math.floor(progress * steps.length))];
      if ((workDone && minDone && progress > 0.985) || (skip && workDone)) {
        fill.style.width = '100%';
        status.textContent = 'Ready';
        setTimeout(() => {
          el.classList.add('is-done');
          setTimeout(() => el.remove(), 800);
          resolve();
        }, skip ? 0 : 250);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
