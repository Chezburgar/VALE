import type { CatalogGame } from './catalog';
import { installGame, uninstallGame } from './installer';
import { store } from './state';
import { toast } from './ui';

export type GameStatus = 'available' | 'installing' | 'installed';

interface ActiveInstall {
  game: CatalogGame;
  loaded: number;
  total: number;
  controller: AbortController;
}

type Listener = () => void;

class Downloads {
  active = new Map<string, ActiveInstall>();
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  status(game: CatalogGame): GameStatus {
    if (this.active.has(game.id)) return 'installing';
    return store.entry(game.id).installed ? 'installed' : 'available';
  }

  progress(gameId: string): number {
    const a = this.active.get(gameId);
    return a ? Math.min(1, a.loaded / Math.max(1, a.total)) : 0;
  }

  async install(game: CatalogGame): Promise<void> {
    if (this.active.has(game.id) || store.entry(game.id).installed) return;
    store.setEntry(game.id, { owned: true });
    const job: ActiveInstall = { game, loaded: 0, total: game.approxSize, controller: new AbortController() };
    this.active.set(game.id, job);
    this.emit();
    try {
      const size = await installGame(
        game,
        (p) => {
          job.loaded = p.loaded;
          job.total = p.total;
          this.emit();
        },
        job.controller.signal,
      );
      store.setEntry(game.id, { installed: true, installedAt: Date.now(), sizeBytes: size });
      toast(`${game.title} is ready to play`, 'Installed to your Vale library.', { icon: 'check' });
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') {
        toast('Install failed', String((err as Error).message ?? err), { icon: 'x' });
      }
    } finally {
      this.active.delete(game.id);
      this.emit();
    }
  }

  cancel(gameId: string): void {
    this.active.get(gameId)?.controller.abort();
  }

  async uninstall(game: CatalogGame): Promise<void> {
    await uninstallGame(game);
    store.setEntry(game.id, { installed: false, sizeBytes: 0 });
    this.emit();
    toast(`${game.title} uninstalled`, 'Your stats and progress are kept.', { icon: 'trash' });
  }
}

export const downloads = new Downloads();
