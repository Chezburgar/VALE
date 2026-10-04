import type { CatalogGame } from './catalog';

// "Installing" a game downloads its code chunks and media into Cache Storage.
// The service worker answers from those caches, so installed games launch
// instantly and keep working offline. In dev (no build manifest) the download
// is simulated so the flow can still be exercised.

interface ManifestChunk {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

type Manifest = Record<string, ManifestChunk>;

export interface InstallProgress {
  loaded: number;
  total: number;
  file: string;
}

const cacheName = (gameId: string) => `vale-game-${gameId}`;

let manifestPromise: Promise<Manifest | null> | null = null;

function loadManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch('/vale-manifest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

function collectFiles(manifest: Manifest, key: string, out: Set<string>, seen: Set<string>): void {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) return;
  out.add('/' + chunk.file);
  chunk.css?.forEach((f) => out.add('/' + f));
  chunk.assets?.forEach((f) => out.add('/' + f));
  chunk.imports?.forEach((k) => collectFiles(manifest, k, out, seen));
  chunk.dynamicImports?.forEach((k) => collectFiles(manifest, k, out, seen));
}

async function fileList(game: CatalogGame): Promise<string[] | null> {
  const manifest = await loadManifest();
  if (!manifest || !manifest[game.entry]) return null;
  const files = new Set<string>();
  collectFiles(manifest, game.entry, files, new Set());
  for (const m of [game.media.hero, game.media.cover, ...game.media.screenshots]) files.add(m);
  return [...files];
}

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<Response> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok || !res.body) return res;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.byteLength);
  }
  const blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') ?? '' });
  return new Response(blob, { status: 200, headers: res.headers });
}

export async function installGame(
  game: CatalogGame,
  onProgress: (p: InstallProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const files = await fileList(game);
  if (!files || !('caches' in window)) {
    return simulateInstall(game, onProgress, signal);
  }

  // HEAD-less size estimate: fetch sequentially and grow the total as we learn sizes.
  const cache = await caches.open(cacheName(game.id));
  let loaded = 0;
  let total = game.approxSize;
  for (const file of files) {
    if (signal?.aborted) throw new DOMException('Install cancelled', 'AbortError');
    try {
      const res = await fetchWithProgress(file, (n) => {
        loaded += n;
        if (loaded > total) total = loaded * 1.05;
        onProgress({ loaded, total, file });
      });
      if (res.ok) await cache.put(file, res);
    } catch {
      /* missing optional media is fine */
    }
  }
  onProgress({ loaded, total: loaded, file: '' });
  return loaded;
}

async function simulateInstall(
  game: CatalogGame,
  onProgress: (p: InstallProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const total = game.approxSize;
  let loaded = 0;
  while (loaded < total) {
    if (signal?.aborted) throw new DOMException('Install cancelled', 'AbortError');
    await new Promise((r) => setTimeout(r, 60));
    loaded = Math.min(total, loaded + total / 40);
    onProgress({ loaded, total, file: 'game data' });
  }
  return total;
}

export async function uninstallGame(game: CatalogGame): Promise<void> {
  if ('caches' in window) await caches.delete(cacheName(game.id));
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
