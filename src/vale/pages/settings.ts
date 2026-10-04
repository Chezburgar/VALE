import type { ValeSettings } from '../../games/types';
import { DEFAULT_SETTINGS, store } from '../state';
import { h, icon, toast } from '../ui';
import type { Nav } from '../app';

const HUES = [168, 200, 260, 300, 340, 20, 45, 120];

let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as Event & { prompt: () => Promise<void> };
});

function setSetting<K extends keyof ValeSettings>(key: K, value: ValeSettings[K]): void {
  store.update((s) => {
    s.settings = { ...s.settings, [key]: value };
  });
}

function row(label: string, help: string, control: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'setting' },
    h('div', null, h('div', { class: 'setting-label' }, label), help ? h('div', { class: 'setting-help' }, help) : null),
    h('div', { class: 'setting-control' }, control),
  );
}

function range(key: 'sensitivity' | 'fov' | 'masterVolume' | 'musicVolume', min: number, max: number, step: number, fmt: (v: number) => string): HTMLElement {
  const val = h('span', { class: 'range-val' }, fmt(store.state.settings[key]));
  const input = h('input', { type: 'range', min, max, step, value: store.state.settings[key] }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = fmt(v);
    setSetting(key, v);
  });
  return h('div', { style: 'display:flex;align-items:center;gap:12px;width:100%' }, input, val);
}

function toggle(key: 'showFps' | 'adsToggle' | 'invertY'): HTMLElement {
  const el = h('button', { class: `toggle ${store.state.settings[key] ? 'is-on' : ''}`, 'aria-label': key });
  el.addEventListener('click', () => {
    const next = !store.state.settings[key];
    setSetting(key, next);
    el.classList.toggle('is-on', next);
  });
  return el;
}

function seg<T extends string>(options: [T, string][], current: T, onPick: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg' });
  const buttons = options.map(([v, label]) => {
    const b = h('button', { class: v === current ? 'is-active' : '' }, label);
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      onPick(v);
    });
    return b;
  });
  wrap.append(...buttons);
  return wrap;
}

export function settingsPage(nav: Nav): HTMLElement {
  const s = store.state;

  const nameInput = h('input', { type: 'text', value: s.profile.name, maxlength: 16 }) as HTMLInputElement;
  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim().slice(0, 16) || s.profile.name;
    nameInput.value = name;
    store.update((st) => {
      st.profile.name = name;
    });
    toast('Profile updated', `You’re now playing as ${name}.`, { icon: 'user' });
  });

  const swatches = h(
    'div',
    { class: 'hue-swatches' },
    HUES.map((hue) => {
      const b = h('button', {
        class: hue === s.profile.hue ? 'is-active' : '',
        style: `background:hsl(${hue} 90% 60%)`,
        'aria-label': `Color ${hue}`,
      });
      b.addEventListener('click', () => {
        store.update((st) => {
          st.profile.hue = hue;
        });
        swatches.querySelectorAll('button').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
      });
      return b;
    }),
  );

  const sections: [string, string, HTMLElement][] = [
    [
      'profile',
      'Profile',
      h(
        'section',
        { class: 'settings-group', id: 'set-profile' },
        h('h3', null, 'Profile'),
        row('Display name', 'Shown in matches, scoreboards and LAN lobbies.', nameInput),
        row('Avatar color', 'Your profile badge color.', swatches),
      ),
    ],
    [
      'gameplay',
      'Gameplay',
      h(
        'section',
        { class: 'settings-group', id: 'set-gameplay' },
        h('h3', null, 'Gameplay'),
        row('Mouse sensitivity', 'Applies to every game.', range('sensitivity', 0.1, 3, 0.05, (v) => v.toFixed(2))),
        row('Field of view', 'Horizontal field of view in 3D games.', range('fov', 70, 120, 1, (v) => `${v}°`)),
        row('Toggle aim', 'Click once to aim down sights instead of holding.', toggle('adsToggle')),
        row('Invert mouse Y', '', toggle('invertY')),
      ),
    ],
    [
      'video',
      'Video',
      h(
        'section',
        { class: 'settings-group', id: 'set-video' },
        h('h3', null, 'Video'),
        row(
          'Graphics quality',
          'Low turns off shadows and lowers resolution for older PCs.',
          seg<ValeSettings['quality']>(
            [
              ['low', 'Low'],
              ['medium', 'Medium'],
              ['high', 'High'],
            ],
            s.settings.quality,
            (v) => setSetting('quality', v),
          ),
        ),
        row('Show FPS counter', '', toggle('showFps')),
      ),
    ],
    [
      'audio',
      'Audio',
      h(
        'section',
        { class: 'settings-group', id: 'set-audio' },
        h('h3', null, 'Audio'),
        row('Master volume', '', range('masterVolume', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)),
        row('Music & ambience', '', range('musicVolume', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)),
      ),
    ],
    [
      'app',
      'Vale app',
      h(
        'section',
        { class: 'settings-group', id: 'set-app' },
        h('h3', null, 'Vale app'),
        row(
          'Install Vale on this PC',
          'Adds Vale to your desktop and Start menu and opens it in its own window.',
          h(
            'button',
            {
              class: 'btn btn-primary btn-sm',
              onclick: async () => {
                if (installPrompt) {
                  await installPrompt.prompt();
                  installPrompt = null;
                } else {
                  toast('Install from your browser', 'Use the install icon in the address bar, or the browser menu → “Install Vale”.', { icon: 'install', duration: 6000 });
                }
              },
            },
            icon('install', 15),
            'Install app',
          ),
        ),
        row(
          'Reset settings',
          'Restore the default controls, video and audio settings.',
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              onclick: () => {
                store.update((st) => {
                  st.settings = { ...DEFAULT_SETTINGS };
                });
                nav.refresh();
              },
            },
            'Reset',
          ),
        ),
        row(
          'Erase all Vale data',
          'Removes your library, stats, achievements and settings from this PC.',
          h(
            'button',
            {
              class: 'btn btn-danger btn-sm',
              onclick: async () => {
                if (!confirm('Erase all Vale data on this PC? This cannot be undone.')) return;
                if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith('vale-game-')) await caches.delete(k);
                store.reset();
                nav.go('/store');
              },
            },
            icon('trash', 15),
            'Erase',
          ),
        ),
      ),
    ],
  ];

  const navEl = h(
    'nav',
    { class: 'settings-nav' },
    sections.map(([id, label], i) =>
      h(
        'button',
        {
          class: i === 0 ? 'is-active' : '',
          onclick: (e: Event) => {
            navEl.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
            (e.currentTarget as HTMLElement).classList.add('is-active');
            document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
        label,
      ),
    ),
  );

  return h(
    'div',
    { class: 'page' },
    h('h1', { class: 'game-wordmark', style: 'font-size:40px;margin-bottom:24px' }, 'Settings'),
    h('div', { class: 'settings' }, navEl, h('div', null, sections.map(([, , el]) => el))),
  );
}
