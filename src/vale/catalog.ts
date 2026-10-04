import type { GameModule } from '../games/types';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface CatalogGame {
  id: string;
  title: string;
  edition: string;
  tagline: string;
  developer: string;
  publisher: string;
  released: string;
  price: string;
  genres: string[];
  tags: string[];
  accent: string;
  about: string[];
  features: { title: string; body: string }[];
  modes: { name: string; body: string }[];
  maps: { name: string; body: string }[];
  classes: { name: string; body: string }[];
  controls: [string, string][];
  achievements: Achievement[];
  media: { hero: string; cover: string; screenshots: string[] };
  /** Path of the entry module in the Vite build manifest. */
  entry: string;
  approxSize: number;
  load: () => Promise<GameModule>;
}

export const CATALOG: CatalogGame[] = [
  {
    id: 'deadshot',
    title: 'Deadshot.io',
    edition: 'Vale Edition',
    tagline: 'Fast, skill-based arena FPS. Slide, scope and take the headshot.',
    developer: 'Vale (fan recreation)',
    publisher: 'Vale',
    released: '2026',
    price: 'Free to Play',
    genres: ['FPS', 'Action', 'Multiplayer'],
    tags: ['Shooter', 'Arena', 'Sniper', 'Fast-Paced', 'PvP', 'Bots', 'LAN'],
    accent: '#ff4d5e',
    about: [
      'Deadshot.io Vale Edition is a from-scratch recreation of the browser arena shooter, rebuilt to run natively inside Vale. Nothing is embedded: the engine, maps, weapons, bots and netcode ship with Vale and run on your machine.',
      'Pick one of four classes, drop into a match and win it on movement and aim. Slide between cover, jump-shot around corners and line up the one-tap headshot that gave the game its name.',
      'Play offline against bots from Easy to Insane, or host a LAN lobby with the Vale server and play with friends on your network.',
    ],
    features: [
      { title: 'Four classes', body: 'Assault Rifle, SMG, Shotgun and a bolt-action Sniper, each with its own handling, recoil and range.' },
      { title: 'Movement that matters', body: 'Slide out of a sprint to shrink your hitbox and carry momentum into jumps.' },
      { title: 'Five game modes', body: 'Free-for-All, Team Deathmatch, Kill Confirmed, Domination and Hardpoint.' },
      { title: 'Four arenas', body: 'Factory, Refinery, Snowfall and Forest, each with sniper lanes, flanks and close-quarters rooms.' },
      { title: 'Bots that fight back', body: 'Bots navigate the map, play objectives, strafe and track you. Difficulty goes from Easy to Insane.' },
      { title: 'Weapon tiers', body: 'Unlock Blue, Purple and Gold finishes for each class by getting kills with it.' },
    ],
    modes: [
      { name: 'Free-for-All', body: 'Everyone for themselves. First to the kill limit wins.' },
      { name: 'Team Deathmatch', body: 'Two teams, one scoreboard. Every kill counts.' },
      { name: 'Kill Confirmed', body: 'A kill only scores when your team collects the dog tag it drops.' },
      { name: 'Domination', body: 'Capture and hold flags A, B and C to tick up points.' },
      { name: 'Hardpoint', body: 'Hold the rotating zone uncontested to score.' },
    ],
    maps: [
      { name: 'Factory', body: 'An indoor-outdoor plant with catwalks, conveyor halls and a long loading-bay lane.' },
      { name: 'Refinery', body: 'Storage tanks and pipe racks at sunset. Long sightlines with lots of verticality.' },
      { name: 'Snowfall', body: 'A frozen mountain village with cabins, pines and a watchtower over the square.' },
      { name: 'Forest', body: 'Dense woodland with a lumber yard, ridges and a river crossing.' },
    ],
    classes: [
      { name: 'Assault Rifle', body: '30-round mag, steady recoil, strong at every range.' },
      { name: 'SMG', body: '40 rounds, fastest fire rate and movement, built for close range.' },
      { name: 'Shotgun', body: 'Two shells, 13 pellets, deletes anyone within arm’s reach.' },
      { name: 'Sniper', body: 'Bolt-action, three rounds. A headshot always kills.' },
    ],
    controls: [
      ['W A S D', 'Move'],
      ['Mouse', 'Aim'],
      ['Left click', 'Shoot'],
      ['Right click / L', 'Aim down sights / scope'],
      ['Space', 'Jump'],
      ['Shift', 'Crouch / slide while moving'],
      ['R', 'Reload'],
      ['Tab', 'Scoreboard'],
      ['Enter', 'Chat'],
      ['Esc / ~', 'Pause menu'],
      ['1 – 4', 'Change class (applies on respawn)'],
      ['Shift + Tab', 'Vale overlay'],
    ],
    achievements: [
      { id: 'first_blood', name: 'First Blood', description: 'Get your first kill.', icon: 'target' },
      { id: 'deadshot', name: 'Deadshot', description: 'Land a headshot kill with the Sniper.', icon: 'target' },
      { id: 'long_shot', name: 'Long Distance Call', description: 'Get a kill from more than 60 meters away.', icon: 'bolt' },
      { id: 'headhunter', name: 'Headhunter', description: 'Get 50 headshots in your career.', icon: 'target' },
      { id: 'streak_5', name: 'On a Roll', description: 'Get a 5-kill streak.', icon: 'bolt' },
      { id: 'streak_10', name: 'Unstoppable', description: 'Get a 10-kill streak.', icon: 'bolt' },
      { id: 'victor', name: 'Victor', description: 'Win a match.', icon: 'trophy' },
      { id: 'flawless', name: 'Flawless', description: 'Win a match without dying.', icon: 'shield' },
      { id: 'slider', name: 'Slippery', description: 'Get a kill while sliding.', icon: 'bolt' },
      { id: 'air_shot', name: 'Airborne', description: 'Get a kill while in the air.', icon: 'bolt' },
      { id: 'tourist', name: 'Tourist', description: 'Play a match on every map.', icon: 'store' },
      { id: 'all_rounder', name: 'All-Rounder', description: 'Get a kill with every class.', icon: 'users' },
      { id: 'insane', name: 'Certified Insane', description: 'Win a match against Insane bots.', icon: 'trophy' },
      { id: 'gold', name: 'Midas Touch', description: 'Unlock a Gold weapon finish.', icon: 'trophy' },
      { id: 'lan', name: 'LAN Party', description: 'Play an online match on a Vale server.', icon: 'wifi' },
    ],
    media: {
      hero: '/media/deadshot/hero.jpg',
      cover: '/media/deadshot/cover.jpg',
      screenshots: [
        '/media/deadshot/shot-1.jpg',
        '/media/deadshot/shot-2.jpg',
        '/media/deadshot/shot-3.jpg',
        '/media/deadshot/shot-4.jpg',
        '/media/deadshot/shot-5.jpg',
      ],
    },
    entry: 'src/games/deadshot/index.ts',
    approxSize: 1_550_000,
    load: () => import('../games/deadshot/index').then((m) => m.default),
  },
];

export function getGame(id: string): CatalogGame | undefined {
  return CATALOG.find((g) => g.id === id);
}
