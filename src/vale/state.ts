import type { MatchReport, ValeSettings } from '../games/types';

// Everything Vale remembers lives in one localStorage document.
// Reads and writes are wrapped because storage can be unavailable (private
// windows, blocked site data); Vale keeps working in memory in that case.

export interface LibraryEntry {
  owned: boolean;
  installed: boolean;
  installedAt: number;
  sizeBytes: number;
  playtimeSec: number;
  lastPlayed: number;
  launches: number;
}

export interface CareerStats {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  bestStreak: number;
  longestShot: number;
  xp: number;
  mapsPlayed: string[];
  modesPlayed: string[];
  classKills: Record<string, number>;
}

export interface ValeState {
  version: 1;
  firstRun: boolean;
  profile: { name: string; hue: number; createdAt: number };
  settings: ValeSettings;
  library: Record<string, LibraryEntry>;
  stats: Record<string, CareerStats>;
  achievements: Record<string, Record<string, number>>;
  progress: Record<string, unknown>;
  wishlist: string[];
  /** Desktop-app-only preferences (ignored in the browser). */
  desktop: DesktopPrefs;
}

export interface DesktopPrefs {
  /** Start the LAN server whenever the desktop app opens. */
  hostLan: boolean;
  fullscreenGames: boolean;
}

const KEY = 'vale:state:v1';

export const DEFAULT_SETTINGS: ValeSettings = {
  sensitivity: 1,
  fov: 95,
  masterVolume: 0.8,
  musicVolume: 0.5,
  quality: 'high',
  showFps: false,
  adsToggle: false,
  invertY: false,
};

function defaultState(): ValeState {
  return {
    version: 1,
    firstRun: true,
    profile: {
      name: `Player${Math.floor(1000 + Math.random() * 9000)}`,
      hue: 168,
      createdAt: Date.now(),
    },
    settings: { ...DEFAULT_SETTINGS },
    library: {},
    stats: {},
    achievements: {},
    progress: {},
    wishlist: [],
    desktop: { hostLan: false, fullscreenGames: true },
  };
}

export function emptyStats(): CareerStats {
  return {
    matches: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    shotsFired: 0,
    shotsHit: 0,
    bestStreak: 0,
    longestShot: 0,
    xp: 0,
    mapsPlayed: [],
    modesPlayed: [],
    classKills: {},
  };
}

function load(): ValeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ValeState>;
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...parsed.profile },
      settings: { ...base.settings, ...parsed.settings },
      desktop: { ...base.desktop, ...parsed.desktop },
    } as ValeState;
  } catch {
    return defaultState();
  }
}

type Listener = (state: ValeState) => void;

class Store {
  state: ValeState = load();
  private listeners = new Set<Listener>();
  private saveTimer = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(mutator: (s: ValeState) => void): void {
    mutator(this.state);
    this.persistSoon();
    for (const fn of this.listeners) fn(this.state);
  }

  private persistSoon(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 150);
  }

  persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage unavailable: keep state in memory */
    }
  }

  entry(gameId: string): LibraryEntry {
    return (
      this.state.library[gameId] ?? {
        owned: false,
        installed: false,
        installedAt: 0,
        sizeBytes: 0,
        playtimeSec: 0,
        lastPlayed: 0,
        launches: 0,
      }
    );
  }

  setEntry(gameId: string, patch: Partial<LibraryEntry>): void {
    this.update((s) => {
      s.library[gameId] = { ...this.entry(gameId), ...patch };
    });
  }

  stats(gameId: string): CareerStats {
    return { ...emptyStats(), ...this.state.stats[gameId] };
  }

  recordMatch(gameId: string, r: MatchReport): void {
    this.update((s) => {
      const st = { ...emptyStats(), ...s.stats[gameId] };
      st.matches += 1;
      st.wins += r.won ? 1 : 0;
      st.kills += r.kills;
      st.deaths += r.deaths;
      st.headshots += r.headshots;
      st.shotsFired += r.shotsFired;
      st.shotsHit += r.shotsHit;
      st.bestStreak = Math.max(st.bestStreak, r.bestStreak);
      st.longestShot = Math.max(st.longestShot, r.longestShot);
      st.xp += r.xp;
      if (!st.mapsPlayed.includes(r.map)) st.mapsPlayed = [...st.mapsPlayed, r.map];
      if (!st.modesPlayed.includes(r.mode)) st.modesPlayed = [...st.modesPlayed, r.mode];
      const ck = { ...st.classKills };
      for (const [k, v] of Object.entries(r.classKills)) ck[k] = (ck[k] ?? 0) + v;
      st.classKills = ck;
      s.stats[gameId] = st;
    });
  }

  hasAchievement(gameId: string, id: string): boolean {
    return Boolean(this.state.achievements[gameId]?.[id]);
  }

  grantAchievement(gameId: string, id: string): boolean {
    if (this.hasAchievement(gameId, id)) return false;
    this.update((s) => {
      s.achievements[gameId] = { ...s.achievements[gameId], [id]: Date.now() };
    });
    return true;
  }

  /** Vale account level derived from XP earned across all games. */
  level(): { level: number; into: number; needed: number; total: number } {
    let total = 0;
    for (const st of Object.values(this.state.stats)) total += st.xp ?? 0;
    for (const ach of Object.values(this.state.achievements)) total += Object.keys(ach).length * 250;
    let level = 1;
    let needed = 1000;
    let rest = total;
    while (rest >= needed) {
      rest -= needed;
      level += 1;
      needed = Math.round(needed * 1.15);
    }
    return { level, into: rest, needed, total };
  }

  reset(): void {
    this.state = defaultState();
    this.state.firstRun = false;
    this.persist();
    for (const fn of this.listeners) fn(this.state);
  }
}

export const store = new Store();
window.addEventListener('beforeunload', () => store.persist());
