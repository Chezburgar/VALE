// Vale service worker.
// - On install, caches the launcher shell (index.html + its static chunks,
//   read from the build manifest) so Vale opens offline.
// - Game chunks are cached by Vale's installer into `vale-game-<id>` caches;
//   hashed /assets/ files are served cache-first from whichever cache holds
//   them, so installed games launch offline and uninstalling really removes them.
// - Everything else is network-first with a cache fallback.
const SHELL = 'vale-shell-v1';

async function shellFiles() {
  const files = new Set(['/', '/brand/vale-logo.png', '/brand/vale-splash.png', '/manifest.webmanifest', '/icons/icon-192.png']);
  try {
    const manifest = await (await fetch('/vale-manifest.json', { cache: 'no-store' })).json();
    const walk = (key, seen = new Set()) => {
      if (seen.has(key) || !manifest[key]) return;
      seen.add(key);
      const c = manifest[key];
      files.add('/' + c.file);
      (c.css || []).forEach((f) => files.add('/' + f));
      (c.assets || []).forEach((f) => files.add('/' + f));
      (c.imports || []).forEach((k) => walk(k, seen));
    };
    walk('index.html');
  } catch (e) {
    /* dev build or offline: cache what we can */
  }
  return [...files];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      for (const f of await shellFiles()) {
        try {
          await cache.add(f);
        } catch (e) {
          /* skip missing */
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/ws') || url.pathname === '/vale-manifest.json') return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.mode === 'navigate') {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' && (await caches.match('/'))) || Response.error()),
  );
});
