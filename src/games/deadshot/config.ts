// Gameplay tuning for Deadshot (Vale Edition).
// Numbers follow the original's published class stats where known
// (AR 30 rounds, SMG 40 rounds / 1.5s reload, Shotgun 2 shells x 13 pellets /
// 1.6s reload, bolt-action Sniper 3 rounds / 100 damage / headshots always kill).

export type ClassId = 'ar' | 'smg' | 'shotgun' | 'sniper';
export type Tier = 0 | 1 | 2 | 3;
export type ModeId = 'ffa' | 'tdm' | 'kc' | 'dom' | 'hp';
export type MapId = 'factory' | 'refinery' | 'snowfall' | 'forest';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

export interface WeaponDef {
  id: ClassId;
  name: string;
  short: string;
  damage: number;
  headMult: number;
  legMult: number;
  falloffStart: number;
  falloffEnd: number;
  minDamageMult: number;
  fireInterval: number;
  auto: boolean;
  mag: number;
  reloadTime: number;
  pellets: number;
  hipSpread: number;
  adsSpread: number;
  moveSpread: number;
  airSpread: number;
  bloomPerShot: number;
  bloomMax: number;
  recoilPitch: number;
  recoilYaw: number;
  adsTime: number;
  adsZoom: number;
  scope: boolean;
  moveMult: number;
  adsMoveMult: number;
  range: number;
  /** Bolt-action: unscopes while cycling. */
  bolt: boolean;
}

export const WEAPONS: Record<ClassId, WeaponDef> = {
  ar: {
    id: 'ar',
    name: 'Assault Rifle',
    short: 'AR',
    damage: 26,
    headMult: 2,
    legMult: 0.8,
    falloffStart: 28,
    falloffEnd: 60,
    minDamageMult: 0.72,
    fireInterval: 0.1,
    auto: true,
    mag: 30,
    reloadTime: 2.0,
    pellets: 1,
    hipSpread: 0.032,
    adsSpread: 0.004,
    moveSpread: 0.018,
    airSpread: 0.05,
    bloomPerShot: 0.004,
    bloomMax: 0.03,
    recoilPitch: 0.011,
    recoilYaw: 0.005,
    adsTime: 0.2,
    adsZoom: 1.4,
    scope: false,
    moveMult: 1,
    adsMoveMult: 0.68,
    range: 200,
    bolt: false,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    short: 'SMG',
    damage: 19,
    headMult: 1.7,
    legMult: 0.85,
    falloffStart: 12,
    falloffEnd: 32,
    minDamageMult: 0.6,
    fireInterval: 0.07,
    auto: true,
    mag: 40,
    reloadTime: 1.5,
    pellets: 1,
    hipSpread: 0.04,
    adsSpread: 0.013,
    moveSpread: 0.01,
    airSpread: 0.035,
    bloomPerShot: 0.003,
    bloomMax: 0.025,
    recoilPitch: 0.0075,
    recoilYaw: 0.0065,
    adsTime: 0.14,
    adsZoom: 1.2,
    scope: false,
    moveMult: 1.1,
    adsMoveMult: 0.8,
    range: 150,
    bolt: false,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    short: 'SG',
    damage: 12,
    headMult: 1.5,
    legMult: 0.8,
    falloffStart: 7,
    falloffEnd: 24,
    minDamageMult: 0.12,
    fireInterval: 0.26,
    auto: false,
    mag: 2,
    reloadTime: 1.6,
    pellets: 13,
    hipSpread: 0.085,
    adsSpread: 0.062,
    moveSpread: 0.0,
    airSpread: 0.01,
    bloomPerShot: 0,
    bloomMax: 0,
    recoilPitch: 0.055,
    recoilYaw: 0.012,
    adsTime: 0.15,
    adsZoom: 1.15,
    scope: false,
    moveMult: 1.04,
    adsMoveMult: 0.8,
    range: 60,
    bolt: false,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    short: 'SR',
    damage: 100,
    headMult: 2.5,
    legMult: 0.75,
    falloffStart: 999,
    falloffEnd: 1000,
    minDamageMult: 1,
    fireInterval: 1.15,
    auto: false,
    mag: 3,
    reloadTime: 2.4,
    pellets: 1,
    hipSpread: 0.075,
    adsSpread: 0.0,
    moveSpread: 0.02,
    airSpread: 0.08,
    bloomPerShot: 0,
    bloomMax: 0,
    recoilPitch: 0.06,
    recoilYaw: 0.01,
    adsTime: 0.26,
    adsZoom: 4.2,
    scope: true,
    moveMult: 0.96,
    adsMoveMult: 0.5,
    range: 400,
    bolt: true,
  },
};

export const CLASS_ORDER: ClassId[] = ['ar', 'smg', 'shotgun', 'sniper'];

export const TIERS: { name: string; kills: number; color: number; css: string }[] = [
  { name: 'Gray', kills: 0, color: 0x8a9399, css: '#9aa4aa' },
  { name: 'Blue', kills: 25, color: 0x2f8cff, css: '#3d95ff' },
  { name: 'Purple', kills: 100, color: 0xa04dff, css: '#b06bff' },
  { name: 'Gold', kills: 250, color: 0xffc23d, css: '#ffc94d' },
];

export const PLAYER = {
  maxHealth: 100,
  regenDelay: 4.5,
  regenRate: 32,
  respawnTime: 3,
  spawnProtection: 1.5,
  radius: 0.32,
  heightStand: 1.8,
  heightCrouch: 1.2,
  heightSlide: 0.95,
  eyeStand: 1.62,
  eyeCrouch: 1.05,
  eyeSlide: 0.78,
  gravity: 24,
  jumpVelocity: 7.6,
  walkSpeed: 7.0,
  crouchSpeed: 3.3,
  groundAccel: 70,
  airAccel: 16,
  friction: 9,
  slideBoost: 11.8,
  slideMinSpeed: 5.2,
  slideFriction: 4.2,
  slideDuration: 0.85,
  slideCooldown: 0.55,
  stepHeight: 0.55,
};

export interface ModeDef {
  id: ModeId;
  name: string;
  short: string;
  teams: boolean;
  scoreLimit: number;
  timeLimit: number;
  blurb: string;
}

export const MODES: Record<ModeId, ModeDef> = {
  ffa: { id: 'ffa', name: 'Free-for-All', short: 'FFA', teams: false, scoreLimit: 25, timeLimit: 480, blurb: 'Every player for themselves. First to the kill limit wins.' },
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', teams: true, scoreLimit: 50, timeLimit: 480, blurb: 'Two teams. Every kill scores for your side.' },
  kc: { id: 'kc', name: 'Kill Confirmed', short: 'KC', teams: true, scoreLimit: 40, timeLimit: 480, blurb: 'Collect enemy tags to score. Grab your team’s tags to deny.' },
  dom: { id: 'dom', name: 'Domination', short: 'DOM', teams: true, scoreLimit: 200, timeLimit: 600, blurb: 'Capture and hold A, B and C to earn points.' },
  hp: { id: 'hp', name: 'Hardpoint', short: 'HP', teams: true, scoreLimit: 150, timeLimit: 600, blurb: 'Hold the rotating hardpoint uncontested to score.' },
};

export const MODE_ORDER: ModeId[] = ['ffa', 'tdm', 'kc', 'dom', 'hp'];

export const MAP_INFO: Record<MapId, { name: string; blurb: string }> = {
  factory: { name: 'Factory', blurb: 'Catwalks, conveyor halls and a long loading-bay lane.' },
  refinery: { name: 'Refinery', blurb: 'Storage tanks and pipe racks at sunset.' },
  snowfall: { name: 'Snowfall', blurb: 'A frozen village with cabins and a watchtower.' },
  forest: { name: 'Forest', blurb: 'Woodland, a lumber yard and a river crossing.' },
};

export const MAP_ORDER: MapId[] = ['factory', 'refinery', 'snowfall', 'forest'];

export interface DifficultyDef {
  name: string;
  reaction: number;
  aimError: number;
  turnSpeed: number;
  trackGain: number;
  burst: number;
  movement: number;
  fov: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: { name: 'Easy', reaction: 0.7, aimError: 0.11, turnSpeed: 3.2, trackGain: 0.6, burst: 0.5, movement: 0.3, fov: 1.6 },
  normal: { name: 'Normal', reaction: 0.42, aimError: 0.065, turnSpeed: 5.5, trackGain: 1.1, burst: 0.75, movement: 0.6, fov: 2.0 },
  hard: { name: 'Hard', reaction: 0.26, aimError: 0.04, turnSpeed: 8.5, trackGain: 1.8, burst: 0.9, movement: 0.85, fov: 2.3 },
  insane: { name: 'Insane', reaction: 0.16, aimError: 0.022, turnSpeed: 13, trackGain: 2.8, burst: 1, movement: 1, fov: 2.6 },
};

export const BOT_NAMES = [
  'NoScopeNova', 'Wraith', 'HeadTap', 'Kestrel', 'SlideKing', 'Vortex', 'Pixelated', 'Phantom',
  'QuickDraw', 'Ronin', 'Zephyr', 'Cobalt', 'Havoc', 'Mirage', 'Talon', 'Glitch', 'Nyx', 'Bandit',
  'Ember', 'Specter', 'Volt', 'Rook', 'Onyx', 'Blitz', 'Saber', 'Jinx', 'Raptor', 'Fable', 'Echo',
  'Hex', 'Viper', 'Crux', 'Lumen', 'Static', 'Drift', 'Orbit', 'Flint', 'Banshee', 'Atlas', 'Quasar',
];

export const TEAM_COLORS = {
  0: { name: 'Teal', css: '#2ef0c8', color: 0x23d6b2, dark: 0x0f6e5c },
  1: { name: 'Crimson', css: '#ff4d5e', color: 0xe8394b, dark: 0x7a1822 },
} as const;
