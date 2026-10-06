import { Actor, rayBox, type FireRequest, type HitPart } from './actor';
import { MODES, PLAYER, WEAPONS, type ClassId, type Difficulty, type MapId, type ModeDef, type ModeId } from './config';
import { getMap, type MapDef } from './maps';
import { rng, type V3 } from './maps/builder';
import { NavGrid } from './navgrid';
import { World } from './world';

export interface MatchSettings {
  mode: ModeId;
  map: MapId;
  bots: number;
  difficulty: Difficulty;
  scoreLimit: number;
  timeLimit: number;
}

export interface ShotTrace {
  ex: number;
  ey: number;
  ez: number;
  nx: number;
  ny: number;
  nz: number;
  hitActor: Actor | null;
  part: HitPart | null;
  hitWorld: boolean;
  /** The surface hit is drawn as a box (not an invisible collider around a round prop), so a bullet hole fits. */
  decal: boolean;
}

export type MatchEvent =
  | { type: 'shot'; actor: Actor; req: FireRequest; traces: ShotTrace[] }
  | { type: 'damage'; attacker: Actor | null; victim: Actor; amount: number; part: HitPart; killed: boolean }
  | {
      type: 'kill';
      killer: Actor | null;
      victim: Actor;
      headshot: boolean;
      weapon: ClassId;
      distance: number;
      assisters: Actor[];
      sliding: boolean;
      airborne: boolean;
      noscope: boolean;
    }
  | { type: 'spawn'; actor: Actor }
  | { type: 'medal'; actor: Actor; text: string; points: number; big?: boolean }
  | { type: 'objective'; text: string; team: 0 | 1 | -1 }
  | { type: 'chat'; name: string; text: string; team: 0 | 1 | -1; system?: boolean }
  | { type: 'land'; actor: Actor }
  | { type: 'jump'; actor: Actor }
  | { type: 'slide'; actor: Actor }
  | { type: 'reload'; actor: Actor }
  | { type: 'end' };

export interface DogTag {
  id: number;
  x: number;
  y: number;
  z: number;
  team: 0 | 1;
  victimId: number;
  expires: number;
}

export interface Flag {
  label: string;
  pos: V3;
  owner: -1 | 0 | 1;
  /** -1 = team 1 owns fully, +1 = team 0 owns fully. */
  progress: number;
  contested: boolean;
  capturing: -1 | 0 | 1;
}

export interface Hardpoint {
  index: number;
  pos: V3;
  rotateAt: number;
  holder: -1 | 0 | 1;
  contested: boolean;
}

const FLAG_RADIUS = 4.2;
const HP_RADIUS = 4.6;
const HP_ROTATE = 60;

export class Match {
  readonly map: MapDef;
  readonly world: World;
  readonly nav: NavGrid;
  readonly mode: ModeDef;
  actors: Actor[] = [];
  time = 0;
  over = false;
  winnerTeam: -1 | 0 | 1 = -1;
  winner: Actor | null = null;
  teamScores: [number, number] = [0, 0];
  tags: DogTag[] = [];
  flags: Flag[] = [];
  hardpoint: Hardpoint | null = null;
  ffaSpawns: V3[] = [];
  firstBlood = false;
  /** When false, damage/kills are decided by the LAN server. */
  authority = true;
  onLocalHit: ((victim: Actor, amount: number, part: HitPart, distance: number, headshotKill: boolean) => void) | null = null;
  private listeners = new Set<(e: MatchEvent) => void>();
  private tagId = 1;
  private scoreTick = 0;
  private hpAccum = new Map<number, number>();
  private recentKills = new Map<number, number[]>();
  private lastKiller = new Map<number, number>();
  readonly rand = Math.random;

  constructor(readonly settings: MatchSettings) {
    this.map = getMap(settings.map);
    this.world = new World(this.map.boxes);
    this.nav = new NavGrid(this.world, this.map.bounds);
    this.mode = { ...MODES[settings.mode], scoreLimit: settings.scoreLimit, timeLimit: settings.timeLimit };
    if (settings.mode === 'dom') {
      this.flags = this.map.flags.map((pos, i) => ({ label: 'ABC'[i], pos, owner: -1, progress: 0, contested: false, capturing: 0 }));
    }
    if (settings.mode === 'hp') {
      this.hardpoint = { index: 0, pos: this.map.hardpoints[0], rotateAt: HP_ROTATE, holder: -1, contested: false };
    }
    this.buildFfaSpawns();
  }

  get teams(): boolean {
    return this.mode.teams;
  }

  get timeLeft(): number {
    return Math.max(0, this.mode.timeLimit - this.time);
  }

  on(fn: (e: MatchEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: MatchEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  addActor(a: Actor): void {
    this.actors.push(a);
  }

  removeActor(a: Actor): void {
    this.actors = this.actors.filter((x) => x !== a);
  }

  enemiesOf(a: Actor): Actor[] {
    return this.actors.filter((o) => o !== a && o.alive && (!this.teams || o.team !== a.team));
  }

  isEnemy(a: Actor, b: Actor): boolean {
    return a !== b && (!this.teams || a.team !== b.team);
  }

  private buildFfaSpawns(): void {
    const rand = rng(1234 + this.map.id.length);
    const out: V3[] = this.map.spawns.map((s) => ({ x: s.x, y: s.y, z: s.z }));
    for (let i = 0; i < 400 && out.length < 34; i++) {
      const n = this.nav.randomNode(rand);
      const p = { x: this.nav.nodeX[n], y: this.nav.nodeY[n], z: this.nav.nodeZ[n] };
      if (p.y > 0.6) continue;
      if (!this.world.lineOfSight(p.x, p.y + 1, p.z, p.x, p.y + 2.2, p.z)) continue;
      if (out.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 64)) continue;
      out.push(p);
    }
    this.ffaSpawns = out;
  }

  /** Picks the safest spawn point for an actor. */
  chooseSpawn(a: Actor): { x: number; y: number; z: number; yaw: number } {
    const enemies = this.actors.filter((o) => o.alive && this.isEnemy(a, o));
    let candidates: { x: number; y: number; z: number; yaw?: number }[];
    if (this.teams) {
      const own = this.map.spawns.filter((s) => s.team === a.team);
      candidates = own;
      // If the own side is overrun, allow neutral points too.
      const safe = own.filter((s) => !enemies.some((e) => dist2(e.body, s) < 15 * 15));
      if (safe.length === 0) candidates = [...own, ...this.ffaSpawns.filter((p) => Math.sign(p.x) === (a.team === 0 ? -1 : 1))];
    } else candidates = this.ffaSpawns;
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      let minD = 60;
      let seen = false;
      for (const e of enemies) {
        const d = Math.sqrt(dist2(e.body, c));
        minD = Math.min(minD, d);
        if (!seen && d < 45 && this.world.lineOfSight(e.body.x, e.eyeY, e.body.z, c.x, c.y + 1.5, c.z)) seen = true;
      }
      const score = minD - (seen ? 25 : 0) + Math.random() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    let yaw = best.yaw;
    if (yaw === undefined) {
      // Face toward the map center-ish.
      yaw = Math.atan2(-(0 - best.x), -(0 - best.z)) + (Math.random() - 0.5) * 0.8;
    }
    return { x: best.x + (Math.random() - 0.5) * 0.6, y: best.y + 0.05, z: best.z + (Math.random() - 0.5) * 0.6, yaw };
  }

  spawnActor(a: Actor): void {
    const s = this.chooseSpawn(a);
    a.spawn(s.x, s.y, s.z, s.yaw, this.time);
    this.emit({ type: 'spawn', actor: a });
  }

  // -------------------------------------------------------------------------
  // Shooting

  handleFire(shooter: Actor, req: FireRequest): void {
    const def = WEAPONS[shooter.classId];
    const traces: ShotTrace[] = [];
    const damageByVictim = new Map<Actor, { amount: number; head: boolean; part: HitPart; dist: number }>();
    let anyHit = false;
    for (const [dx, dy, dz] of req.dirs) {
      const wall = this.world.raycast(req.ox, req.oy, req.oz, dx, dy, dz, def.range);
      let maxT = wall ? wall.t : def.range;
      let hitActor: Actor | null = null;
      let hitPart: HitPart | null = null;
      for (const o of this.actors) {
        if (o === shooter || !o.alive) continue;
        if (this.teams && o.team === shooter.team) continue;
        // quick reject
        const cx = o.body.x - req.ox;
        const cz = o.body.z - req.oz;
        const along = cx * dx + cz * dz;
        if (along < -1) continue;
        for (const hb of o.hitboxes()) {
          const t = rayBox(req.ox, req.oy, req.oz, dx, dy, dz, hb, maxT);
          if (t >= 0 && t < maxT) {
            maxT = t;
            hitActor = o;
            hitPart = hb.part;
          }
        }
      }
      const ex = req.ox + dx * maxT;
      const ey = req.oy + dy * maxT;
      const ez = req.oz + dz * maxT;
      traces.push({
        ex,
        ey,
        ez,
        nx: hitActor ? 0 : wall?.nx ?? 0,
        ny: hitActor ? 0 : wall?.ny ?? 0,
        nz: hitActor ? 0 : wall?.nz ?? 0,
        hitActor,
        part: hitPart,
        hitWorld: !hitActor && wall !== null,
        decal: !hitActor && wall !== null && wall.box !== null && wall.box.visible,
      });
      if (hitActor && hitPart) {
        anyHit = true;
        const dist = maxT;
        const fall = falloff(def.falloffStart, def.falloffEnd, def.minDamageMult, dist);
        const mult = hitPart === 'head' ? def.headMult : hitPart === 'legs' ? def.legMult : 1;
        const entry = damageByVictim.get(hitActor) ?? { amount: 0, head: false, part: hitPart, dist };
        entry.amount += def.damage * mult * fall;
        if (hitPart === 'head') {
          entry.head = true;
          entry.part = 'head';
        }
        damageByVictim.set(hitActor, entry);
      }
    }
    if (anyHit) shooter.shotsHit++;
    this.emit({ type: 'shot', actor: shooter, req, traces });
    for (const [victim, d] of damageByVictim) {
      if (this.authority) this.applyDamage(victim, shooter, d.amount, d.part, d.dist);
      else if (shooter.isLocal && this.onLocalHit) this.onLocalHit(victim, d.amount, d.part, d.dist, d.head);
    }
  }

  applyDamage(victim: Actor, attacker: Actor | null, amount: number, part: HitPart, distance: number): void {
    if (!victim.alive || victim.spawnProtect > 0) return;
    amount = Math.round(amount);
    victim.health -= amount;
    victim.lastDamageTime = this.time;
    if (attacker) {
      victim.lastAttackerId = attacker.id;
      const prev = victim.damageFrom.get(attacker.id);
      victim.damageFrom.set(attacker.id, { amount: (prev?.amount ?? 0) + amount, time: this.time });
    }
    const killed = victim.health <= 0;
    this.emit({ type: 'damage', attacker, victim, amount, part, killed });
    if (killed) this.kill(victim, attacker, part === 'head', distance);
  }

  /** Kill bookkeeping. Also used by the network layer with server-decided kills. */
  kill(victim: Actor, killer: Actor | null, headshot: boolean, distance: number): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.deaths++;
    victim.streak = 0;
    victim.deathTime = this.time;
    victim.respawnAt = this.time + PLAYER.respawnTime;
    const assisters: Actor[] = [];
    for (const [id, d] of victim.damageFrom) {
      if (killer && id === killer.id) continue;
      if (this.time - d.time > 6 || d.amount < 20) continue;
      const a = this.actors.find((x) => x.id === id);
      if (a && (!killer || this.isEnemy(a, victim))) {
        a.assists++;
        a.score += 25;
        assisters.push(a);
        this.emit({ type: 'medal', actor: a, text: 'Assist', points: 25 });
      }
    }
    const weapon = killer?.classId ?? 'ar';
    if (killer && killer !== victim) {
      killer.kills++;
      killer.streak++;
      killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
      killer.score += 100;
      killer.classKills[WEAPONS[killer.classId].name] = (killer.classKills[WEAPONS[killer.classId].name] ?? 0) + 1;
      killer.longestKill = Math.max(killer.longestKill, distance);
      if (headshot) killer.headshots++;
      this.medalsForKill(killer, victim, headshot, distance);
      if (this.teams) {
        if (this.settings.mode === 'tdm') this.teamScores[killer.team]++;
      }
    }
    this.emit({
      type: 'kill',
      killer,
      victim,
      headshot,
      weapon,
      distance,
      assisters,
      sliding: killer?.stance === 'slide',
      airborne: killer ? !killer.body.onGround : false,
      noscope: killer ? killer.classId === 'sniper' && killer.ads < 0.5 : false,
    });
    if (this.settings.mode === 'kc') {
      this.tags.push({ id: this.tagId++, x: victim.body.x, y: victim.body.y + 0.6, z: victim.body.z, team: victim.team, victimId: victim.id, expires: this.time + 30 });
    }
    if (killer) this.lastKiller.set(victim.id, killer.id);
  }

  private medalsForKill(killer: Actor, victim: Actor, headshot: boolean, distance: number): void {
    const medal = (text: string, points: number, big = false) => {
      killer.score += points;
      this.emit({ type: 'medal', actor: killer, text, points, big });
    };
    this.emit({ type: 'medal', actor: killer, text: 'Eliminated ' + victim.name, points: 100 });
    if (headshot) medal('Headshot', 25);
    if (!this.firstBlood) {
      this.firstBlood = true;
      medal('First Blood', 50, true);
    }
    if (distance > 50) medal('Longshot', 50);
    if (this.lastKiller.get(killer.id) === victim.id) {
      this.lastKiller.delete(killer.id);
      medal('Payback', 25);
    }
    const times = (this.recentKills.get(killer.id) ?? []).filter((t) => this.time - t < 4);
    times.push(this.time);
    this.recentKills.set(killer.id, times);
    if (times.length === 2) medal('Double Kill', 50, true);
    else if (times.length === 3) medal('Triple Kill', 75, true);
    else if (times.length >= 4) medal('Multi Kill', 100, true);
    if (killer.streak === 5) medal('Killing Spree', 100, true);
    else if (killer.streak === 10) medal('Rampage', 150, true);
    else if (killer.streak === 15) medal('Unstoppable', 200, true);
    else if (killer.streak === 20) medal('Deadshot', 300, true);
  }

  // -------------------------------------------------------------------------
  // Per-frame update (everything except input/bots, which the game drives)

  update(dt: number): void {
    if (this.over) return;
    this.time += dt;
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.isRemote) continue;
      if (a.health < PLAYER.maxHealth && this.time - a.lastDamageTime > PLAYER.regenDelay) {
        a.health = Math.min(PLAYER.maxHealth, a.health + PLAYER.regenRate * dt);
      }
    }
    if (!this.authority) return;
    this.updateObjectives(dt);
    this.checkEnd();
  }

  private inZone(a: Actor, p: V3, r: number): boolean {
    return a.alive && (a.body.x - p.x) ** 2 + (a.body.z - p.z) ** 2 <= r * r && Math.abs(a.body.y - p.y) < 3.2;
  }

  private updateObjectives(dt: number): void {
    const mode = this.settings.mode;
    if (mode === 'kc') {
      this.tags = this.tags.filter((t) => t.expires > this.time);
      for (const tag of [...this.tags]) {
        for (const a of this.actors) {
          if (!a.alive || a.isRemote) continue;
          if ((a.body.x - tag.x) ** 2 + (a.body.z - tag.z) ** 2 > 1.5 * 1.5 || Math.abs(a.body.y + 0.6 - tag.y) > 2) continue;
          this.tags = this.tags.filter((t) => t !== tag);
          if (a.team !== tag.team) {
            this.teamScores[a.team]++;
            a.objective++;
            a.score += 50;
            this.emit({ type: 'medal', actor: a, text: 'Kill Confirmed', points: 50 });
          } else {
            a.objective++;
            a.score += 50;
            this.emit({ type: 'medal', actor: a, text: 'Kill Denied', points: 50 });
          }
          break;
        }
      }
    } else if (mode === 'dom') {
      for (const f of this.flags) {
        const c0 = this.actors.filter((a) => a.team === 0 && this.inZone(a, f.pos, FLAG_RADIUS));
        const c1 = this.actors.filter((a) => a.team === 1 && this.inZone(a, f.pos, FLAG_RADIUS));
        f.contested = c0.length > 0 && c1.length > 0;
        f.capturing = 0;
        if (f.contested || (c0.length === 0 && c1.length === 0)) continue;
        const team: 0 | 1 = c0.length ? 0 : 1;
        const n = Math.min(3, c0.length || c1.length);
        const dir = team === 0 ? 1 : -1;
        if (f.owner === team && Math.abs(f.progress) >= 1) continue;
        f.capturing = dir as 1 | -1;
        const before = f.progress;
        f.progress = Math.max(-1, Math.min(1, f.progress + dir * dt * (0.16 + 0.06 * (n - 1))));
        if (f.owner !== -1 && f.owner !== team && Math.sign(before) !== Math.sign(f.progress)) {
          f.owner = -1;
          this.emit({ type: 'objective', text: `${f.label} neutralized`, team });
        }
        if (Math.abs(f.progress) >= 1 && f.owner !== team) {
          f.owner = team;
          for (const a of team === 0 ? c0 : c1) {
            a.objective++;
            a.score += 150;
            this.emit({ type: 'medal', actor: a, text: `Captured ${f.label}`, points: 150 });
          }
          this.emit({ type: 'objective', text: `${team === 0 ? 'Teal' : 'Crimson'} captured ${f.label}`, team });
        }
      }
      this.scoreTick += dt;
      while (this.scoreTick >= 1.5) {
        this.scoreTick -= 1.5;
        for (const f of this.flags) if (f.owner !== -1) this.teamScores[f.owner]++;
      }
    } else if (mode === 'hp' && this.hardpoint) {
      const hp = this.hardpoint;
      if (this.time >= hp.rotateAt) {
        hp.index = (hp.index + 1) % this.map.hardpoints.length;
        hp.pos = this.map.hardpoints[hp.index];
        hp.rotateAt = this.time + HP_ROTATE;
        hp.holder = -1;
        this.emit({ type: 'objective', text: 'Hardpoint moved', team: -1 });
      }
      const c0 = this.actors.filter((a) => a.team === 0 && this.inZone(a, hp.pos, HP_RADIUS));
      const c1 = this.actors.filter((a) => a.team === 1 && this.inZone(a, hp.pos, HP_RADIUS));
      hp.contested = c0.length > 0 && c1.length > 0;
      const holder: -1 | 0 | 1 = hp.contested ? -1 : c0.length ? 0 : c1.length ? 1 : -1;
      if (holder !== hp.holder && holder !== -1) this.emit({ type: 'objective', text: `${holder === 0 ? 'Teal' : 'Crimson'} holds the hardpoint`, team: holder });
      hp.holder = holder;
      this.scoreTick += dt;
      while (this.scoreTick >= 1) {
        this.scoreTick -= 1;
        if (holder !== -1) {
          this.teamScores[holder]++;
          for (const a of holder === 0 ? c0 : c1) {
            a.score += 10;
            const acc = (this.hpAccum.get(a.id) ?? 0) + 1;
            this.hpAccum.set(a.id, acc);
            if (acc % 5 === 0) a.objective++;
          }
        }
      }
    }
  }

  checkEnd(): void {
    if (this.over) return;
    const limit = this.mode.scoreLimit;
    let ended = this.time >= this.mode.timeLimit;
    if (this.teams) {
      if (this.teamScores[0] >= limit || this.teamScores[1] >= limit) ended = true;
    } else if (this.actors.some((a) => a.kills >= limit)) ended = true;
    if (ended) this.finish();
  }

  finish(): void {
    if (this.over) return;
    this.over = true;
    if (this.teams) {
      this.winnerTeam = this.teamScores[0] === this.teamScores[1] ? -1 : this.teamScores[0] > this.teamScores[1] ? 0 : 1;
    } else {
      const sorted = this.standings();
      this.winner = sorted[0] ?? null;
    }
    this.emit({ type: 'end' });
  }

  standings(): Actor[] {
    return [...this.actors].sort((a, b) => (this.teams ? b.score - a.score : b.kills - a.kills || b.score - a.score));
  }

  /** Points for the HUD score bar. */
  scoreOf(a: Actor): number {
    return this.teams ? this.teamScores[a.team] : a.kills;
  }
}

function dist2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function falloff(start: number, end: number, min: number, d: number): number {
  if (d <= start) return 1;
  if (d >= end) return min;
  return 1 - ((d - start) / (end - start)) * (1 - min);
}

export { FLAG_RADIUS, HP_RADIUS };
