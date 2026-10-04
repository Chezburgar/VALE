import type { Actor } from './actor';
import { TIERS, WEAPONS, type ClassId } from './config';
import type { MapDef } from './maps';
import { FLAG_RADIUS, type Match } from './match';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const CLASS_ICON: Record<ClassId, string> = {
  ar: '<svg viewBox="0 0 64 20"><path d="M2 8h30l4-3h14l2 2h10v3h-8v2H38l-4 3h-6l2-5H14l-2 6H6l1-6H2z" fill="currentColor"/></svg>',
  smg: '<svg viewBox="0 0 64 20"><path d="M8 7h26l3-2h10v3h9v3h-9v2H36l-2 6h-5l1-6h-8v5h-4V12H8z" fill="currentColor"/></svg>',
  shotgun: '<svg viewBox="0 0 64 20"><path d="M2 9l14-3h44v2H30v2h30v2H28l-4 2H16l-6 4H4l3-6z" fill="currentColor"/></svg>',
  sniper: '<svg viewBox="0 0 64 20"><path d="M2 9l12-2h8V4h18v3h22v2H40v2h-6l-2 5h-5l1-5H16L6 15H2z M24 2h12v2H24z" fill="currentColor"/></svg>',
};

export interface HudState {
  health: number;
  ammo: number;
  mag: number;
  reload: number;
  cls: ClassId;
  tier: number;
  spreadPx: number;
  ads: number;
  scoped: boolean;
  alive: boolean;
  spawnProtect: number;
  fps: number;
  showFps: boolean;
}

export class Hud {
  root = el('div', 'ds-hud');
  private cross = el('div', 'ds-cross');
  private hit = el('div', 'ds-hit');
  private dmgWrap = el('div', 'ds-dmg');
  private vignette = el('div', 'ds-vignette');
  private healthNum = el('div', 'ds-health-num');
  private healthBar = el('div', 'ds-health-fill');
  private ammoNum = el('div', 'ds-ammo-num');
  private ammoMag = el('div', 'ds-ammo-mag');
  private weaponName = el('div', 'ds-weapon-name');
  private reloadBar = el('div', 'ds-reload');
  private top = el('div', 'ds-top');
  private feed = el('div', 'ds-feed');
  private medals = el('div', 'ds-medals');
  private center = el('div', 'ds-center');
  private chatLog = el('div', 'ds-chat-log');
  private chatInput = el('input', 'ds-chat-input') as HTMLInputElement;
  private board = el('div', 'ds-board');
  private scope = el('div', 'ds-scope');
  private fps = el('div', 'ds-fps');
  private protect = el('div', 'ds-protect', 'Spawn protection');
  private mini = el('canvas', 'ds-minimap') as HTMLCanvasElement;
  private miniBase: HTMLCanvasElement | null = null;
  private miniScale = 2.4;
  private map: MapDef | null = null;
  private last: Partial<HudState> & { top?: string } = {};
  private chatOpen = false;
  onChat: ((text: string) => void) | null = null;
  onChatClosed: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.cross.innerHTML = '<i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i><b></b>';
    this.hit.innerHTML = '<i></i><i></i><i></i><i></i>';
    this.scope.innerHTML = '<div class="ds-scope-ring"></div><div class="ds-scope-h"></div><div class="ds-scope-v"></div><div class="ds-scope-dot"></div>';
    const health = el('div', 'ds-health');
    health.append(el('div', 'ds-health-label', 'HP'), this.healthNum, el('div', 'ds-health-bar'));
    health.lastElementChild!.append(this.healthBar);
    const ammo = el('div', 'ds-ammo');
    const nums = el('div', 'ds-ammo-row');
    nums.append(this.ammoNum, this.ammoMag);
    ammo.append(this.weaponName, nums, this.reloadBar);
    const chat = el('div', 'ds-chat');
    this.chatInput.maxLength = 120;
    this.chatInput.placeholder = 'Say something… (Enter to send, Esc to cancel)';
    chat.append(this.chatLog, this.chatInput);
    this.mini.width = this.mini.height = 180;
    this.root.append(this.scope, this.vignette, this.dmgWrap, this.cross, this.hit, this.top, this.feed, this.medals, this.center, chat, health, ammo, this.board, this.fps, this.protect, this.mini);
    container.append(this.root);

    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) this.onChat?.(text);
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  get isChatOpen(): boolean {
    return this.chatOpen;
  }

  openChat(): void {
    this.chatOpen = true;
    this.root.classList.add('chat-open');
    this.chatInput.value = '';
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat(): void {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.root.classList.remove('chat-open');
    this.chatInput.blur();
    this.onChatClosed?.();
  }

  chat(name: string, text: string, color: string, system = false): void {
    const line = el('div', `ds-chat-line ${system ? 'sys' : ''}`);
    line.innerHTML = system ? esc(text) : `<b style="color:${color}">${esc(name)}</b> ${esc(text)}`;
    this.chatLog.append(line);
    while (this.chatLog.children.length > 7) this.chatLog.firstElementChild!.remove();
    setTimeout(() => line.classList.add('old'), 9000);
  }

  setMap(map: MapDef): void {
    this.map = map;
    const b = map.bounds;
    const w = Math.ceil((b.maxX - b.minX) * this.miniScale);
    const h = Math.ceil((b.maxZ - b.minZ) * this.miniScale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(10,16,18,0.9)';
    ctx.fillRect(0, 0, w, h);
    const boxes = [...map.boxes].filter((x) => x.collide && x.visible && x.maxY > 0.3 && x.maxY < 30).sort((p, q) => p.maxY - q.maxY);
    for (const bx of boxes) {
      const l = Math.min(1, bx.maxY / 9);
      const v = Math.round(60 + l * 120);
      ctx.fillStyle = `rgb(${v},${v + 8},${v + 10})`;
      ctx.fillRect((bx.minX - b.minX) * this.miniScale, (bx.minZ - b.minZ) * this.miniScale, (bx.maxX - bx.minX) * this.miniScale, (bx.maxZ - bx.minZ) * this.miniScale);
    }
    this.miniBase = c;
  }

  drawMinimap(match: Match, local: Actor, camYaw: number): void {
    if (!this.miniBase || !this.map) return;
    const ctx = this.mini.getContext('2d')!;
    const S = 180;
    const k = this.miniScale;
    const b = this.map.bounds;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(6,10,12,0.75)';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(camYaw);
    const px = (local.body.x - b.minX) * k;
    const pz = (local.body.z - b.minZ) * k;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.miniBase, -px, -pz);
    ctx.globalAlpha = 1;
    const dot = (x: number, z: number, color: string, r = 3.2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((x - b.minX) * k - px, (z - b.minZ) * k - pz, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const f of match.flags) {
      const c = f.owner === -1 ? '#ffffff' : f.owner === local.team ? '#2ef0c8' : '#ff4d5e';
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((f.pos.x - b.minX) * k - px, (f.pos.z - b.minZ) * k - pz, FLAG_RADIUS * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (match.hardpoint) {
      const hp = match.hardpoint;
      ctx.strokeStyle = hp.contested ? '#ffcc33' : hp.holder === -1 ? '#ffffff' : hp.holder === local.team ? '#2ef0c8' : '#ff4d5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((hp.pos.x - b.minX) * k - px, (hp.pos.z - b.minZ) * k - pz, 4.6 * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const t of match.tags) dot(t.x, t.z, t.team === local.team ? '#2ef0c8' : '#ff4d5e', 2.2);
    for (const a of match.actors) {
      if (a === local || !a.alive) continue;
      const friendly = match.teams && a.team === local.team;
      if (friendly) dot(a.body.x, a.body.z, '#2ef0c8');
      else if (match.time - a.lastShotTime < 1.5) dot(a.body.x, a.body.z, '#ff4d5e');
    }
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 - 7);
    ctx.lineTo(S / 2 + 5, S / 2 + 5);
    ctx.lineTo(S / 2, S / 2 + 2);
    ctx.lineTo(S / 2 - 5, S / 2 + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(46,240,200,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  update(s: HudState): void {
    const L = this.last;
    if (L.health !== Math.ceil(s.health)) {
      L.health = Math.ceil(s.health);
      this.healthNum.textContent = String(Math.max(0, L.health));
      this.healthBar.style.width = `${Math.max(0, s.health)}%`;
      this.healthBar.classList.toggle('low', s.health < 35);
      this.vignette.style.opacity = s.alive ? String(Math.max(0, (60 - s.health) / 60) * 0.85) : '0';
    }
    if (L.ammo !== s.ammo || L.mag !== s.mag) {
      L.ammo = s.ammo;
      L.mag = s.mag;
      this.ammoNum.textContent = String(s.ammo);
      this.ammoMag.textContent = `/ ${s.mag}`;
      this.ammoNum.classList.toggle('low', s.ammo <= Math.ceil(s.mag * 0.25));
    }
    if (L.cls !== s.cls || L.tier !== s.tier) {
      L.cls = s.cls;
      L.tier = s.tier;
      this.weaponName.innerHTML = `<span class="ico" style="color:${TIERS[s.tier].css}">${CLASS_ICON[s.cls]}</span>${esc(WEAPONS[s.cls].name)}`;
    }
    const rl = s.reload >= 0 ? Math.round(s.reload * 100) : -1;
    if (L.reload !== rl) {
      L.reload = rl;
      this.reloadBar.style.display = rl >= 0 ? '' : 'none';
      if (rl >= 0) this.reloadBar.style.setProperty('--p', `${rl}%`);
    }
    const gap = Math.round(Math.min(90, s.spreadPx));
    if (L.spreadPx !== gap) {
      L.spreadPx = gap;
      this.cross.style.setProperty('--gap', `${gap}px`);
    }
    const crossHidden = !s.alive || s.ads > 0.6;
    this.cross.classList.toggle('hidden', crossHidden);
    this.cross.classList.toggle('ads', s.ads > 0.6 && !s.scoped);
    if (L.scoped !== s.scoped) {
      L.scoped = s.scoped;
      this.scope.classList.toggle('on', s.scoped);
    }
    this.protect.style.display = s.alive && s.spawnProtect > 0 ? '' : 'none';
    if (s.showFps) {
      this.fps.style.display = '';
      this.fps.textContent = `${Math.round(s.fps)} FPS`;
    } else this.fps.style.display = 'none';
  }

  /** Top bar: timer, scores, objectives. */
  updateTop(match: Match, local: Actor): void {
    const t = Math.ceil(match.timeLeft);
    const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    let html: string;
    if (match.teams) {
      const mine = match.teamScores[local.team];
      const theirs = match.teamScores[local.team === 0 ? 1 : 0];
      const lim = match.mode.scoreLimit;
      let obj = '';
      if (match.flags.length) {
        obj = `<div class="ds-flags">${match.flags
          .map((f) => {
            const c = f.owner === -1 ? 'n' : f.owner === local.team ? 'f' : 'e';
            const cap = f.capturing !== 0 && Math.abs(f.progress) < 1 ? ' cap' : '';
            return `<span class="ds-flag ${c}${f.contested ? ' contested' : ''}${cap}">${f.label}</span>`;
          })
          .join('')}</div>`;
      } else if (match.hardpoint) {
        const hp = match.hardpoint;
        const st = hp.contested ? 'Contested' : hp.holder === -1 ? 'Neutral' : hp.holder === local.team ? 'Holding' : 'Enemy holds';
        const c = hp.contested ? 'contested' : hp.holder === -1 ? 'n' : hp.holder === local.team ? 'f' : 'e';
        obj = `<div class="ds-flags"><span class="ds-flag wide ${c}">HP · ${st} · ${Math.max(0, Math.ceil(hp.rotateAt - match.time))}s</span></div>`;
      }
      html = `<div class="ds-score f"><b>${mine}</b><i style="width:${Math.min(100, (mine / lim) * 100)}%"></i></div><div class="ds-timer">${time}<small>${match.mode.short} · ${lim}</small></div><div class="ds-score e"><b>${theirs}</b><i style="width:${Math.min(100, (theirs / lim) * 100)}%"></i></div>${obj}`;
    } else {
      const sorted = match.standings();
      const leader = sorted[0];
      const second = sorted.find((a) => a !== local) ?? null;
      const top = leader === local ? second : leader;
      const lim = match.mode.scoreLimit;
      html = `<div class="ds-score f"><b>${local.kills}</b><span>You</span><i style="width:${Math.min(100, (local.kills / lim) * 100)}%"></i></div><div class="ds-timer">${time}<small>FFA · ${lim}</small></div><div class="ds-score e"><b>${top?.kills ?? 0}</b><span>${esc(top?.name ?? '—')}</span><i style="width:${Math.min(100, ((top?.kills ?? 0) / lim) * 100)}%"></i></div>`;
    }
    if (html !== this.last.top) {
      this.last.top = html;
      this.top.innerHTML = html;
    }
  }

  hitmarker(kind: 'body' | 'head' | 'kill' | 'headkill'): void {
    this.hit.className = `ds-hit show ${kind}`;
    void this.hit.offsetWidth;
    this.hit.classList.add('anim');
  }

  damageIndicator(angle: number): void {
    const d = el('div', 'ds-dmg-arc');
    d.style.transform = `rotate(${angle}rad)`;
    this.dmgWrap.append(d);
    setTimeout(() => d.remove(), 1200);
  }

  killfeed(killerName: string | null, killerColor: string, victimName: string, victimColor: string, cls: ClassId, headshot: boolean, involvesLocal: boolean): void {
    const row = el('div', `ds-feed-row ${involvesLocal ? 'me' : ''}`);
    row.innerHTML = `${killerName ? `<b style="color:${killerColor}">${esc(killerName)}</b>` : ''}<span class="ico">${CLASS_ICON[cls]}</span>${headshot ? '<span class="hs" title="Headshot">◎</span>' : ''}<b style="color:${victimColor}">${esc(victimName)}</b>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastElementChild!.remove();
    setTimeout(() => row.classList.add('out'), 5500);
    setTimeout(() => row.remove(), 6200);
  }

  medal(text: string, points: number, big: boolean): void {
    const m = el('div', `ds-medal ${big ? 'big' : ''}`);
    m.innerHTML = `${esc(text)}${points ? `<span>+${points}</span>` : ''}`;
    this.medals.prepend(m);
    while (this.medals.children.length > 4) this.medals.lastElementChild!.remove();
    setTimeout(() => m.classList.add('out'), big ? 2200 : 1600);
    setTimeout(() => m.remove(), big ? 2700 : 2100);
  }

  message(text: string, ms = 2200, kind = ''): void {
    const m = el('div', `ds-center-msg ${kind}`);
    m.textContent = text;
    this.center.innerHTML = '';
    this.center.append(m);
    setTimeout(() => m.classList.add('out'), ms);
    setTimeout(() => m.remove(), ms + 500);
  }

  scoreboard(show: boolean, match: Match | null, local: Actor | null): void {
    this.board.style.display = show ? '' : 'none';
    if (!show || !match || !local) return;
    const row = (a: Actor) => {
      const kd = a.deaths ? (a.kills / a.deaths).toFixed(2) : a.kills.toFixed(2);
      return `<tr class="${a === local ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td class="nm"><span class="ico" style="color:${TIERS[a.tier].css}">${CLASS_ICON[a.classId]}</span>${esc(a.name)}${a.isBot ? '<small>BOT</small>' : ''}</td><td>${a.score}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.assists}</td><td>${kd}</td>${match.teams && match.settings.mode !== 'tdm' ? `<td>${a.objective}</td>` : ''}</tr>`;
    };
    const head = `<tr><th>Player</th><th>Score</th><th>K</th><th>D</th><th>A</th><th>K/D</th>${match.teams && match.settings.mode !== 'tdm' ? '<th>Obj</th>' : ''}</tr>`;
    let html = `<div class="ds-board-head"><span>${esc(match.mode.name)}</span><span>${esc(match.map.id.toUpperCase())}</span></div>`;
    if (match.teams) {
      for (const team of [local.team, local.team === 0 ? 1 : 0] as const) {
        const list = match.standings().filter((a) => a.team === team);
        html += `<div class="ds-board-team ${team === local.team ? 'f' : 'e'}"><div class="ds-board-title"><span>${team === local.team ? 'Your team' : 'Enemy team'}</span><b>${match.teamScores[team]}</b></div><table>${head}${list.map(row).join('')}</table></div>`;
      }
    } else {
      html += `<div class="ds-board-team"><table>${head}${match.standings().map(row).join('')}</table></div>`;
    }
    this.board.innerHTML = html;
  }

  dispose(): void {
    this.root.remove();
  }
}
