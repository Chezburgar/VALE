import type { ValeSettings } from '../types';
import {
  CLASS_ORDER,
  DIFFICULTY,
  MAP_INFO,
  MAP_ORDER,
  MODE_ORDER,
  MODES,
  TIERS,
  WEAPONS,
  type ClassId,
  type Difficulty,
  type MapId,
  type ModeId,
  type Tier,
} from './config';
import { CLASS_ICON, el, esc } from './hud';

export interface Progress {
  cls: ClassId;
  tiers: Record<ClassId, Tier>;
  classKills: Record<ClassId, number>;
  totalKills: number;
  totalDeaths: number;
  totalHeadshots: number;
  matches: number;
  wins: number;
  xp: number;
  mapsPlayed: MapId[];
  prefs: { mode: ModeId; map: MapId; bots: number; difficulty: Difficulty };
  serverUrl: string;
}

export function defaultProgress(serverUrl: string): Progress {
  return {
    cls: 'ar',
    tiers: { ar: 0, smg: 0, shotgun: 0, sniper: 0 },
    classKills: { ar: 0, smg: 0, shotgun: 0, sniper: 0 },
    totalKills: 0,
    totalDeaths: 0,
    totalHeadshots: 0,
    matches: 0,
    wins: 0,
    xp: 0,
    mapsPlayed: [],
    prefs: { mode: 'ffa', map: 'factory', bots: 7, difficulty: 'normal' },
    serverUrl,
  };
}

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let need = 800;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need = Math.round(need * 1.12);
  }
  return { level, into: rest, need };
}

export function tierUnlocked(p: Progress, cls: ClassId, tier: Tier): boolean {
  return (p.classKills[cls] ?? 0) >= TIERS[tier].kills;
}

export interface LanRoom {
  id: string;
  name: string;
  mode: ModeId;
  map: MapId;
  players: number;
  max: number;
}

export interface MenuHandlers {
  play(): void;
  exit(): void;
  progressChanged(): void;
  settingsChanged(patch: Partial<ValeSettings>): void;
  previewMap(map: MapId): void;
  gunPreview(cls: ClassId, tier: Tier): string;
  resume(): void;
  leave(): void;
  respawnClass(cls: ClassId): void;
  lanConnect(url: string): void;
  lanCreate(mode: ModeId, map: MapId): void;
  lanJoin(id: string): void;
  lanDisconnect(): void;
  playAgain(): void;
  hover(): void;
  click(): void;
}

type Tab = 'play' | 'loadout' | 'career' | 'settings';

export class Menu {
  root = el('div', 'ds-menu');
  private content = el('main', 'ds-menu-main');
  private tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'play';
  private playerCard = el('div', 'ds-player-card');
  private pause = el('div', 'ds-overlay ds-pause');
  private death = el('div', 'ds-death');
  private end = el('div', 'ds-overlay ds-end');
  private loading = el('div', 'ds-overlay ds-loading');
  private lan = { status: 'idle' as 'idle' | 'connecting' | 'connected' | 'error', message: '', rooms: [] as LanRoom[] };

  constructor(
    container: HTMLElement,
    private p: Progress,
    private settings: ValeSettings,
    private playerName: string,
    private h: MenuHandlers,
  ) {
    const top = el('header', 'ds-menu-top');
    const logo = el('div', 'ds-logo', 'DEADSHOT<span>.io</span><small>Vale Edition</small>');
    const nav = el('nav', 'ds-tabs');
    for (const [id, label] of [
      ['play', 'Play'],
      ['loadout', 'Loadout'],
      ['career', 'Career'],
      ['settings', 'Settings'],
    ] as [Tab, string][]) {
      const b = el('button', '', label);
      b.addEventListener('click', () => {
        this.h.click();
        this.setTab(id);
      });
      b.addEventListener('mouseenter', () => this.h.hover());
      this.tabs.set(id, b);
      nav.append(b);
    }
    const exit = el('button', 'ds-btn ds-btn-ghost ds-exit', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/></svg> Exit to Vale');
    exit.addEventListener('click', () => this.h.exit());
    top.append(logo, nav, el('div', 'ds-spacer'), this.playerCard, exit);
    this.root.append(el('div', 'ds-menu-shade'), top, this.content);
    container.append(this.root, this.pause, this.death, this.end, this.loading);
    this.pause.style.display = 'none';
    this.death.style.display = 'none';
    this.end.style.display = 'none';
    this.loading.style.display = 'none';
    this.renderPlayerCard();
    this.setTab('play');
  }

  updateSettings(s: ValeSettings): void {
    // Stored only: re-rendering here would replace a slider mid-drag.
    this.settings = s;
  }

  setPlayerName(name: string): void {
    this.playerName = name;
    this.renderPlayerCard();
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (v) {
      this.renderPlayerCard();
      this.setTab(this.tab);
    }
  }

  private renderPlayerCard(): void {
    const lv = levelFromXp(this.p.xp);
    this.playerCard.innerHTML = `<div class="ds-lvl">${lv.level}</div><div><div class="ds-pname">${esc(this.playerName)}</div><div class="ds-xpbar"><i style="width:${(lv.into / lv.need) * 100}%"></i></div></div>`;
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    for (const [id, b] of this.tabs) b.classList.toggle('on', id === tab);
    this.content.innerHTML = '';
    if (tab === 'play') this.renderPlay();
    else if (tab === 'loadout') this.renderLoadout();
    else if (tab === 'career') this.renderCareer();
    else this.content.append(this.settingsPanel());
  }

  // ---------------------------------------------------------------------------

  private renderPlay(): void {
    const prefs = this.p.prefs;
    const left = el('section', 'ds-col ds-play-left');

    left.append(el('h3', 'ds-h', 'Mode'));
    const modes = el('div', 'ds-modes');
    for (const id of MODE_ORDER) {
      const m = MODES[id];
      const b = el('button', `ds-mode ${prefs.mode === id ? 'on' : ''}`, `<b>${m.name}</b><span>${m.blurb}</span><em>${m.teams ? 'Teams' : 'Solo'} · ${m.scoreLimit} ${id === 'ffa' || id === 'tdm' ? 'kills' : 'pts'}</em>`);
      b.dataset.mode = id;
      b.addEventListener('click', () => {
        this.h.click();
        prefs.mode = id;
        this.h.progressChanged();
        this.setTab('play');
      });
      b.addEventListener('mouseenter', () => this.h.hover());
      modes.append(b);
    }
    left.append(modes);

    left.append(el('h3', 'ds-h', 'Map'));
    const maps = el('div', 'ds-maps');
    for (const id of MAP_ORDER) {
      const b = el('button', `ds-map map-${id} ${prefs.map === id ? 'on' : ''}`, `<b>${MAP_INFO[id].name}</b><span>${MAP_INFO[id].blurb}</span>`);
      b.addEventListener('click', () => {
        this.h.click();
        prefs.map = id;
        this.h.progressChanged();
        this.h.previewMap(id);
        this.setTab('play');
      });
      b.addEventListener('mouseenter', () => this.h.hover());
      maps.append(b);
    }
    left.append(maps);

    const right = el('section', 'ds-col ds-play-right');
    const cls = this.p.cls;
    const tier = this.p.tiers[cls];
    const card = el('div', 'ds-loadout-mini');
    card.innerHTML = `<div class="ds-h">Loadout</div><img alt="" src="${this.h.gunPreview(cls, tier)}"/><div class="ds-lm-row"><b>${WEAPONS[cls].name}</b><span style="color:${TIERS[tier].css}">${TIERS[tier].name}</span></div>`;
    const quick = el('div', 'ds-class-quick');
    for (const c of CLASS_ORDER) {
      const b = el('button', c === cls ? 'on' : '', `${CLASS_ICON[c]}<span>${WEAPONS[c].short}</span>`);
      b.title = WEAPONS[c].name;
      b.addEventListener('click', () => {
        this.h.click();
        this.p.cls = c;
        this.h.progressChanged();
        this.setTab('play');
      });
      quick.append(b);
    }
    card.append(quick);
    right.append(card);

    const bots = el('div', 'ds-field');
    bots.innerHTML = `<label>Bots <b>${prefs.bots}</b></label>`;
    const range = el('input') as HTMLInputElement;
    range.type = 'range';
    range.min = '0';
    range.max = '11';
    range.value = String(prefs.bots);
    range.addEventListener('input', () => {
      prefs.bots = Number(range.value);
      bots.querySelector('b')!.textContent = range.value;
    });
    range.addEventListener('change', () => this.h.progressChanged());
    bots.append(range);
    right.append(bots);

    const diff = el('div', 'ds-field');
    diff.append(el('label', '', 'Bot difficulty'));
    const seg = el('div', 'ds-seg');
    for (const d of Object.keys(DIFFICULTY) as Difficulty[]) {
      const b = el('button', prefs.difficulty === d ? 'on' : '', DIFFICULTY[d].name);
      b.addEventListener('click', () => {
        this.h.click();
        prefs.difficulty = d;
        this.h.progressChanged();
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      seg.append(b);
    }
    diff.append(seg);
    right.append(diff);

    const play = el('button', 'ds-btn ds-btn-play', `Play <small>${MODES[prefs.mode].short} · ${MAP_INFO[prefs.map].name}</small>`);
    play.dataset.action = 'play';
    play.addEventListener('click', () => this.h.play());
    play.addEventListener('mouseenter', () => this.h.hover());
    right.append(play);

    right.append(this.lanPanel());
    this.content.append(left, right);
  }

  private lanPanel(): HTMLElement {
    const box = el('div', 'ds-lan');
    box.append(el('div', 'ds-h', 'Online · LAN'));
    if (this.lan.status !== 'connected') {
      const row = el('div', 'ds-lan-row');
      const input = el('input', 'ds-input') as HTMLInputElement;
      input.value = this.p.serverUrl;
      input.placeholder = 'ws://192.168.1.20:8787/ws';
      input.spellcheck = false;
      const btn = el('button', 'ds-btn ds-btn-sm', this.lan.status === 'connecting' ? 'Connecting…' : 'Connect');
      btn.addEventListener('click', () => {
        this.p.serverUrl = input.value.trim();
        this.h.progressChanged();
        this.h.lanConnect(this.p.serverUrl);
      });
      row.append(input, btn);
      box.append(row);
      box.append(
        el(
          'p',
          `ds-note ${this.lan.status === 'error' ? 'err' : ''}`,
          this.lan.message ||
            (location.protocol === 'https:'
              ? 'Online play needs the Vale desktop app or a Vale server on your network. Browsers block <code>ws://</code> from https pages, so open the server’s <code>http://</code> address instead of this site.'
              : 'One PC hosts: turn on <b>Settings → Desktop → Host LAN games</b> in the Vale desktop app, or run <code>npm start</code>. Everyone on the network then connects to it.'),
        ),
      );
    } else {
      const head = el('div', 'ds-lan-row');
      const create = el('button', 'ds-btn ds-btn-sm', `Host ${MODES[this.p.prefs.mode].teams ? 'TDM' : 'FFA'} on ${MAP_INFO[this.p.prefs.map].name}`);
      create.addEventListener('click', () => this.h.lanCreate(this.p.prefs.mode === 'ffa' ? 'ffa' : 'tdm', this.p.prefs.map));
      const dc = el('button', 'ds-btn ds-btn-sm ds-btn-ghost', 'Disconnect');
      dc.addEventListener('click', () => this.h.lanDisconnect());
      head.append(create, dc);
      box.append(head);
      const list = el('div', 'ds-rooms');
      if (this.lan.rooms.length === 0) list.append(el('p', 'ds-note', 'No lobbies yet. Host one and your friends will see it here.'));
      for (const r of this.lan.rooms) {
        const item = el('button', 'ds-room', `<b>${esc(r.name)}</b><span>${MODES[r.mode].short} · ${MAP_INFO[r.map].name}</span><em>${r.players}/${r.max}</em>`);
        item.addEventListener('click', () => this.h.lanJoin(r.id));
        list.append(item);
      }
      box.append(list);
      if (this.lan.message) box.append(el('p', 'ds-note', esc(this.lan.message)));
    }
    return box;
  }

  setLan(status: 'idle' | 'connecting' | 'connected' | 'error', message = '', rooms?: LanRoom[]): void {
    this.lan.status = status;
    this.lan.message = message;
    if (rooms) this.lan.rooms = rooms;
    if (this.tab === 'play' && this.root.style.display !== 'none') this.setTab('play');
  }

  private renderLoadout(): void {
    const grid = el('div', 'ds-classes');
    for (const c of CLASS_ORDER) {
      const w = WEAPONS[c];
      const tier = this.p.tiers[c];
      const card = el('div', `ds-class ${this.p.cls === c ? 'on' : ''}`);
      const dmg = Math.min(1, (w.damage * w.pellets) / 130);
      const rate = Math.min(1, 0.07 / w.fireInterval);
      const range = Math.min(1, (w.falloffStart + w.falloffEnd) / 120);
      const mob = Math.min(1, (w.moveMult - 0.85) / 0.3);
      const stat = (label: string, v: number) => `<div class="ds-stat"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`;
      card.innerHTML = `<div class="ds-class-head"><b>${w.name}</b><span>${w.mag} rds · ${w.reloadTime}s reload</span></div><img alt="" src="${this.h.gunPreview(c, tier)}"/>${stat('Damage', dmg)}${stat('Fire rate', rate)}${stat('Range', range)}${stat('Mobility', mob)}`;
      const tiers = el('div', 'ds-tiers');
      TIERS.forEach((t, i) => {
        const ok = tierUnlocked(this.p, c, i as Tier);
        const b = el('button', `ds-tier ${tier === i ? 'on' : ''} ${ok ? '' : 'locked'}`, '');
        b.style.setProperty('--c', t.css);
        b.title = ok ? `${t.name} finish` : `${t.name}: ${t.kills} kills with the ${w.name} (${this.p.classKills[c] ?? 0}/${t.kills})`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!ok) return;
          this.h.click();
          this.p.tiers[c] = i as Tier;
          this.h.progressChanged();
          this.setTab('loadout');
        });
        tiers.append(b);
      });
      const next = TIERS.find((_t, i) => i > 0 && !tierUnlocked(this.p, c, i as Tier));
      card.append(tiers, el('div', 'ds-tier-note', next ? `${this.p.classKills[c] ?? 0}/${next.kills} kills to ${next.name}` : 'All finishes unlocked'));
      card.addEventListener('click', () => {
        this.h.click();
        this.p.cls = c;
        this.h.progressChanged();
        this.setTab('loadout');
      });
      card.addEventListener('mouseenter', () => this.h.hover());
      grid.append(card);
    }
    this.content.append(grid);
  }

  private renderCareer(): void {
    const p = this.p;
    const lv = levelFromXp(p.xp);
    const kd = p.totalDeaths ? (p.totalKills / p.totalDeaths).toFixed(2) : p.totalKills.toFixed(2);
    const box = el('div', 'ds-career');
    const tile = (v: string | number, k: string) => `<div class="ds-tile"><b>${v}</b><span>${k}</span></div>`;
    box.innerHTML = `<div class="ds-tiles">${tile(lv.level, 'Level')}${tile(p.matches, 'Matches')}${tile(p.wins, 'Wins')}${tile(p.totalKills, 'Kills')}${tile(p.totalDeaths, 'Deaths')}${tile(kd, 'K/D')}${tile(p.totalHeadshots, 'Headshots')}${tile(p.mapsPlayed.length + '/4', 'Maps played')}</div><div class="ds-h">Kills by class</div><div class="ds-tiles">${CLASS_ORDER.map((c) => tile(p.classKills[c] ?? 0, WEAPONS[c].name)).join('')}</div><p class="ds-note">Full career stats and achievements are also in your Vale library.</p>`;
    this.content.append(box);
  }

  settingsPanel(): HTMLElement {
    const s = this.settings;
    const box = el('div', 'ds-settings');
    const slider = (label: string, key: 'sensitivity' | 'fov' | 'masterVolume' | 'musicVolume', min: number, max: number, step: number, fmt: (v: number) => string) => {
      const row = el('div', 'ds-field');
      const lab = el('label', '', `${label} <b>${fmt(s[key])}</b>`);
      const r = el('input') as HTMLInputElement;
      r.type = 'range';
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
      r.value = String(s[key]);
      r.addEventListener('input', () => {
        lab.querySelector('b')!.textContent = fmt(Number(r.value));
        this.h.settingsChanged({ [key]: Number(r.value) });
      });
      row.append(lab, r);
      return row;
    };
    const toggle = (label: string, key: 'adsToggle' | 'showFps' | 'invertY') => {
      const row = el('div', 'ds-field ds-field-inline');
      const b = el('button', `ds-toggle ${s[key] ? 'on' : ''}`);
      b.addEventListener('click', () => {
        const v = !b.classList.contains('on');
        b.classList.toggle('on', v);
        this.h.settingsChanged({ [key]: v });
      });
      row.append(el('label', '', label), b);
      return row;
    };
    const quality = el('div', 'ds-field');
    quality.append(el('label', '', 'Graphics quality'));
    const seg = el('div', 'ds-seg');
    for (const q of ['low', 'medium', 'high'] as const) {
      const b = el('button', s.quality === q ? 'on' : '', q[0].toUpperCase() + q.slice(1));
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.h.settingsChanged({ quality: q });
      });
      seg.append(b);
    }
    quality.append(seg);
    box.append(
      slider('Sensitivity', 'sensitivity', 0.1, 3, 0.05, (v) => v.toFixed(2)),
      slider('Field of view', 'fov', 70, 120, 1, (v) => `${v}°`),
      slider('Master volume', 'masterVolume', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
      slider('Ambience & music', 'musicVolume', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
      quality,
      toggle('Toggle aim (instead of hold)', 'adsToggle'),
      toggle('Invert mouse Y', 'invertY'),
      toggle('Show FPS', 'showFps'),
      el('p', 'ds-note', 'Settings are shared with Vale and apply to every game.'),
    );
    return box;
  }

  // ---------------------------------------------------------------------------
  // In-match overlays

  showPause(v: boolean, online: boolean): void {
    this.pause.style.display = v ? '' : 'none';
    if (!v) return;
    this.pause.innerHTML = '';
    const panel = el('div', 'ds-panel');
    panel.append(el('div', 'ds-logo small', 'DEADSHOT<span>.io</span>'));
    panel.append(el('div', 'ds-h', online ? 'Menu (match keeps running)' : 'Paused'));
    const resume = el('button', 'ds-btn ds-btn-play', 'Resume');
    resume.dataset.action = 'resume';
    resume.addEventListener('click', () => this.h.resume());
    panel.append(resume);
    panel.append(el('div', 'ds-h', 'Class (next spawn)'));
    const quick = el('div', 'ds-class-quick');
    for (const c of CLASS_ORDER) {
      const b = el('button', c === this.p.cls ? 'on' : '', `${CLASS_ICON[c]}<span>${WEAPONS[c].short}</span>`);
      b.addEventListener('click', () => {
        this.p.cls = c;
        this.h.progressChanged();
        this.h.respawnClass(c);
        quick.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      quick.append(b);
    }
    panel.append(quick);
    const settings = this.settingsPanel();
    settings.classList.add('compact');
    panel.append(settings);
    const leave = el('button', 'ds-btn ds-btn-ghost', 'Leave match');
    leave.addEventListener('click', () => this.h.leave());
    panel.append(leave);
    this.pause.append(panel);
  }

  showDeath(info: { killer: string; weapon: ClassId; headshot: boolean; distance: number; killerHealth: number; color: string } | null, respawnIn: number): void {
    if (!info) {
      this.death.style.display = 'none';
      return;
    }
    if (this.death.style.display === 'none') {
      this.death.style.display = '';
      this.death.innerHTML = '';
      const card = el('div', 'ds-death-card');
      card.innerHTML = `<div class="ds-death-top">Eliminated by</div><div class="ds-death-name" style="color:${info.color}">${esc(info.killer)}</div><div class="ds-death-meta"><span class="ico">${CLASS_ICON[info.weapon]}</span>${WEAPONS[info.weapon].name}${info.headshot ? ' · Headshot' : ''} · ${Math.round(info.distance)}m${info.killerHealth > 0 ? ` · ${Math.ceil(info.killerHealth)} HP left` : ''}</div><div class="ds-respawn"></div>`;
      const quick = el('div', 'ds-class-quick');
      for (const c of CLASS_ORDER) {
        const b = el('button', c === this.p.cls ? 'on' : '', `${CLASS_ICON[c]}<span>${WEAPONS[c].short}</span><kbd>${CLASS_ORDER.indexOf(c) + 1}</kbd>`);
        b.dataset.cls = c;
        b.addEventListener('click', () => this.pickDeathClass(c));
        quick.append(b);
      }
      card.append(quick);
      this.death.append(card);
    }
    const r = this.death.querySelector('.ds-respawn');
    if (r) r.textContent = respawnIn > 0 ? `Respawning in ${respawnIn.toFixed(1)}s` : 'Click or press Space to respawn';
  }

  pickDeathClass(c: ClassId): void {
    this.p.cls = c;
    this.h.progressChanged();
    this.h.respawnClass(c);
    this.death.querySelectorAll<HTMLButtonElement>('.ds-class-quick button').forEach((x) => x.classList.toggle('on', x.dataset.cls === c));
  }

  showLoading(text: string | null): void {
    this.loading.style.display = text ? '' : 'none';
    if (text) this.loading.innerHTML = `<div class="ds-loading-inner"><div class="ds-logo">DEADSHOT<span>.io</span></div><div class="ds-spinner"></div><div class="ds-h">${esc(text)}</div></div>`;
  }

  showEnd(
    r: {
      title: string;
      subtitle: string;
      won: boolean;
      rows: { name: string; kills: number; deaths: number; score: number; me: boolean; color: string }[];
      stats: [string, string][];
      xp: number;
      unlocks: string[];
    } | null,
  ): void {
    this.end.style.display = r ? '' : 'none';
    if (!r) return;
    this.end.innerHTML = '';
    const panel = el('div', 'ds-panel ds-end-panel');
    panel.innerHTML = `<div class="ds-end-title ${r.won ? 'won' : 'lost'}">${esc(r.title)}</div><div class="ds-end-sub">${esc(r.subtitle)}</div>
      <div class="ds-end-grid"><table class="ds-end-table"><tr><th>#</th><th>Player</th><th>K</th><th>D</th><th>Score</th></tr>${r.rows
        .map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}</td><td style="color:${x.color}">${esc(x.name)}</td><td>${x.kills}</td><td>${x.deaths}</td><td>${x.score}</td></tr>`)
        .join('')}</table>
      <div class="ds-end-stats">${r.stats.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}<div class="xp"><span>XP earned</span><b>+${r.xp}</b></div>${r.unlocks.map((u) => `<div class="unlock">${esc(u)}</div>`).join('')}</div></div>`;
    const actions = el('div', 'ds-end-actions');
    const again = el('button', 'ds-btn ds-btn-play', 'Play again');
    again.dataset.action = 'again';
    again.addEventListener('click', () => this.h.playAgain());
    const menu = el('button', 'ds-btn', 'Main menu');
    menu.addEventListener('click', () => this.h.leave());
    const exit = el('button', 'ds-btn ds-btn-ghost', 'Exit to Vale');
    exit.addEventListener('click', () => this.h.exit());
    actions.append(again, menu, exit);
    panel.append(actions);
    this.end.append(panel);
  }

  dispose(): void {
    this.root.remove();
    this.pause.remove();
    this.death.remove();
    this.end.remove();
    this.loading.remove();
  }
}
