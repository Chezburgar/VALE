// Vale service worker.
// - On install, caches the launcher shell (index.html + its static chunks,
//   read from the build manifest) so Vale opens offline.
// - Game chunks are cached by Vale's installer into `vale-game-<id>` caches;
//   hashed assets/ files are served cache-first from whichever cache holds
//   them, so installed games launch offline and uninstalling really removes them.
// - Everything else is network-first with a cache fallback.
//
// Vale may be served from a subpath (e.g. GitHub Pages at /VALE/app/), so all
// paths are resolved against the registration scope instead of the site root.
const SHELL = 'vale-shell-v2';
const SCOPE = new URL(self.registration.scope);
const at = (path) => new URL(path, SCOPE).href;
const ROOT = at('./');
const ASSETS = new URL('assets/', SCOPE).pathname;
const MANIFEST = new URL('vale-manifest.json', SCOPE).pathname;

async function shellFiles() {
  const files = new Set([ROOT, at('brand/vale-logo.png'), at('brand/vale-splash.png'), at('manifest.webmanifest'), at('icons/icon-192.png')]);
  try {
    const manifest = await (await fetch(at('vale-manifest.json'), { cache: 'no-store' })).json();
    const walk = (key, seen = new Set()) => {
      if (seen.has(key) || !manifest[key]) return;
      seen.add(key);
      const c = manifest[key];
      files.add(at(c.file));
      (c.css || []).forEach((f) => files.add(at(f)));
      (c.assets || []).forEach((f) => files.add(at(f)));
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
  event.waitUntil(
    (async () => {
      // Drop shell caches from older versions; installed games stay.
      for (const key of await caches.keys()) if (key.startsWith('vale-shell-') && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname === MANIFEST) return;

  if (url.pathname.startsWith(ASSETS)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.mode === 'navigate') {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(ROOT, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' && (await caches.match(ROOT))) || Response.error()),
  );
});
