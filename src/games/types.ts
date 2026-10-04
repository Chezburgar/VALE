// Contract between the Vale launcher and the games it runs.
// A game is a lazily-loaded module that renders into a container Vale gives it.

export interface ValeSettings {
  sensitivity: number; // 0.1 – 3.0, 1 = default
  fov: number; // horizontal field of view in degrees (16:9 reference)
  masterVolume: number; // 0 – 1
  musicVolume: number; // 0 – 1
  quality: 'low' | 'medium' | 'high';
  showFps: boolean;
  adsToggle: boolean;
  invertY: boolean;
}

export interface MatchReport {
  kills: number;
  deaths: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  won: boolean;
  mode: string;
  map: string;
  bestStreak: number;
  longestShot: number;
  xp: number;
  seconds: number;
  classKills: Record<string, number>;
}

export interface GameContext {
  playerName: string;
  settings: ValeSettings;
  /** Game-specific persisted data (unlocks, loadout, etc). */
  loadProgress<T>(fallback: T): T;
  saveProgress(data: unknown): void;
  /** Called when a match ends so Vale can track career stats. */
  reportMatch(report: MatchReport): void;
  unlockAchievement(id: string): void;
  /** Ask Vale to close the game and return to the launcher. */
  exit(): void;
  /** Let the game update Vale settings (e.g. from its own pause menu). */
  updateSettings(patch: Partial<ValeSettings>): void;
  /** WebSocket URL of the Vale multiplayer server, if one is reachable. */
  defaultServerUrl: string;
}

export interface GameInstance {
  dispose(): void;
  /** Vale overlay opened / closed. */
  setOverlayOpen?(open: boolean): void;
  onSettingsChanged?(settings: ValeSettings): void;
}

export interface GameModule {
  launch(container: HTMLElement, ctx: GameContext): Promise<GameInstance>;
}
