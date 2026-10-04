import { Actor, type HitPart } from './actor';
import type { ClassId, MapId, ModeId, Tier } from './config';
import type { Match, MatchEvent, ShotTrace } from './match';
import type { LanRoom } from './menu';

// Client side of LAN play. The Vale server relays movement and shots and is
// authoritative for health, kills and scores. Each client simulates its own
// player and interpolates everyone else.

export interface JoinedRoom {
  id: string;
  name: string;
  mode: ModeId;
  map: MapId;
  scoreLimit: number;
  timeLimit: number;
  timeLeft: number;
}

interface NetPlayer {
  id: number;
  name: string;
  team: 0 | 1;
  cls: ClassId;
  tier: Tier;
  alive: boolean;
  kills: number;
  deaths: number;
  score: number;
  assists: number;
}

interface GameHooks {
  match: Match | null;
  local: Actor | null;
  netEvent(e: MatchEvent): void;
}

const STANCES = ['stand', 'crouch', 'slide'] as const;
const CLASSES: ClassId[] = ['ar', 'smg', 'shotgun', 'sniper'];
const PARTS: HitPart[] = ['head', 'body', 'legs'];

export class NetClient {
  private ws: WebSocket | null = null;
  id = 0;
  you: { id: number; team: 0 | 1 } | null = null;
  rooms: LanRoom[] = [];
  room: JoinedRoom | null = null;
  private game: GameHooks | null = null;
  private remotes = new Map<number, Actor>();
  private pendingPlayers: NetPlayer[] = [];
  private closedByUser = false;
  onStatus: ((status: 'idle' | 'connecting' | 'connected' | 'error', message: string) => void) | null = null;
  onRooms: ((rooms: LanRoom[]) => void) | null = null;
  onJoined: ((room: JoinedRoom) => void) | null = null;

  constructor(
    private url: string,
    private name: string,
  ) {}

  connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.onStatus?.('error', `Bad server address: ${(err as Error).message}`);
      return;
    }
    this.ws = ws;
    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        this.onStatus?.('error', 'Could not reach the server. Is `npm start` running on that PC, and is the address right?');
      }
    }, 5000);
    ws.onopen = () => {
      clearTimeout(timeout);
      this.send({ t: 'hello', name: this.name });
    };
    ws.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(String(ev.data)));
      } catch (err) {
        console.warn('bad message', err);
      }
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (this.closedByUser) return;
      this.onStatus?.('error', this.room ? 'Lost connection to the server.' : 'Disconnected from the server.');
      this.room = null;
    };
    ws.onerror = () => {
      /* onclose reports */
    };
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  /** Called once the game has built the match for the joined room. */
  attach(game: GameHooks): void {
    this.game = game;
    this.remotes.clear();
    for (const p of this.pendingPlayers) this.upsertPlayer(p);
    this.pendingPlayers = [];
    const m = game.match;
    if (m && this.room) m.time = Math.max(0, this.room.timeLimit - this.room.timeLeft);
  }

  sendState(a: Actor): void {
    const b = a.body;
    this.send({
      t: 'state',
      s: [
        round(b.x),
        round(b.y),
        round(b.z),
        round(a.yaw, 3),
        round(a.pitch, 3),
        round(b.vx),
        round(b.vz),
        STANCES.indexOf(a.stance),
        CLASSES.indexOf(a.classId),
        a.tier,
        round(a.ads, 2),
        b.onGround ? 1 : 0,
      ],
    });
  }

  sendShot(origin: [number, number, number], traces: ShotTrace[], cls: ClassId): void {
    this.send({
      t: 'shot',
      c: CLASSES.indexOf(cls),
      o: origin.map((v) => round(v)),
      e: traces.map((tr) => [round(tr.ex), round(tr.ey), round(tr.ez), tr.hitWorld ? 1 : 0, tr.nx, tr.ny, tr.nz]),
    });
  }

  /** Smoothly moves remote players toward their latest network state. */
  interpolate(): void {
    for (const a of this.remotes.values()) {
      const t = a.netTarget;
      if (!t || !a.alive) continue;
      const k = 0.35;
      a.body.x += (t.x - a.body.x) * k;
      a.body.y += (t.y - a.body.y) * k;
      a.body.z += (t.z - a.body.z) * k;
      let dy = t.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.yaw += dy * 0.5;
      a.pitch += (t.pitch - a.pitch) * 0.5;
      a.speed = Math.hypot(a.body.vx, a.body.vz);
      if (a.body.onGround) a.walkPhase += a.speed * (1 / 60) * 1.25;
    }
  }

  private upsertPlayer(p: NetPlayer): Actor | null {
    const g = this.game;
    if (!g?.match) {
      this.pendingPlayers = this.pendingPlayers.filter((x) => x.id !== p.id);
      this.pendingPlayers.push(p);
      return null;
    }
    if (p.id === this.id) {
      if (g.local) {
        g.local.team = p.team;
        Object.assign(g.local, { kills: p.kills, deaths: p.deaths, score: p.score, assists: p.assists });
      }
      return g.local;
    }
    let a = this.remotes.get(p.id);
    if (!a) {
      a = new Actor(p.name);
      a.isRemote = true;
      a.netId = p.id;
      a.alive = false;
      this.remotes.set(p.id, a);
      g.match.addActor(a);
    }
    a.name = p.name;
    a.team = p.team;
    a.classId = p.cls;
    a.tier = p.tier;
    Object.assign(a, { kills: p.kills, deaths: p.deaths, score: p.score, assists: p.assists });
    return a;
  }

  private actor(id: number): Actor | null {
    if (id === this.id) return this.game?.local ?? null;
    return this.remotes.get(id) ?? null;
  }

  private handle(msg: Record<string, unknown> & { t: string }): void {
    const g = this.game;
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id as number;
        this.rooms = msg.rooms as LanRoom[];
        this.onStatus?.('connected', '');
        this.onRooms?.(this.rooms);
        break;
      case 'rooms':
        this.rooms = msg.rooms as LanRoom[];
        if (!this.room) this.onRooms?.(this.rooms);
        break;
      case 'error':
        this.onStatus?.('connected', String(msg.message ?? 'Server error'));
        break;
      case 'joined': {
        this.room = msg.room as JoinedRoom;
        this.you = msg.you as { id: number; team: 0 | 1 };
        this.pendingPlayers = (msg.players as NetPlayer[]).filter((p) => p.id !== this.id);
        this.game = null;
        this.onJoined?.(this.room);
        break;
      }
      case 'restart': {
        if (!this.room) break;
        this.room.timeLeft = this.room.timeLimit;
        this.pendingPlayers = [...this.remotes.values()].map((a) => ({
          id: a.netId,
          name: a.name,
          team: a.team,
          cls: a.classId,
          tier: a.tier,
          alive: false,
          kills: 0,
          deaths: 0,
          score: 0,
          assists: 0,
        }));
        this.game = null;
        this.onJoined?.(this.room);
        break;
      }
      case 'player':
        this.upsertPlayer(msg.p as NetPlayer);
        break;
      case 'left': {
        const a = this.remotes.get(msg.id as number);
        if (a && g?.match) {
          g.match.removeActor(a);
          g.netEvent({ type: 'chat', name: '', text: `${a.name} left the match`, team: -1, system: true });
        }
        this.remotes.delete(msg.id as number);
        break;
      }
      case 'states': {
        for (const row of msg.list as number[][]) {
          const [id, x, y, z, yaw, pitch, vx, vz, stance, cls, tier, ads, ground] = row;
          const a = this.remotes.get(id);
          if (!a) continue;
          a.netTarget = { x, y, z, yaw, pitch, t: performance.now() };
          a.body.vx = vx;
          a.body.vz = vz;
          a.body.onGround = ground === 1;
          a.stance = STANCES[stance] ?? 'stand';
          a.classId = CLASSES[cls] ?? 'ar';
          a.tier = (tier as Tier) ?? 0;
          a.ads = ads;
        }
        break;
      }
      case 'spawned': {
        const a = this.actor(msg.id as number);
        if (!a || a === g?.local) break;
        a.alive = true;
        a.health = 100;
        a.spawnProtect = 1.5;
        Object.assign(a.body, { x: msg.x, y: msg.y, z: msg.z });
        a.netTarget = { x: msg.x as number, y: msg.y as number, z: msg.z as number, yaw: a.yaw, pitch: 0, t: performance.now() };
        break;
      }
      case 'shot': {
        const a = this.remotes.get(msg.id as number);
        if (!a || !g?.match) break;
        a.lastShotTime = g.match.time;
        a.classId = CLASSES[msg.c as number] ?? a.classId;
        const [ox, oy, oz] = msg.o as number[];
        const traces: ShotTrace[] = (msg.e as number[][]).map(([ex, ey, ez, w, nx, ny, nz]) => ({ ex, ey, ez, nx, ny, nz, hitWorld: w === 1, hitActor: null, part: null }));
        g.netEvent({ type: 'shot', actor: a, req: { ox, oy, oz, dirs: [] }, traces });
        break;
      }
      case 'damage': {
        const victim = this.actor(msg.vic as number);
        const attacker = this.actor(msg.att as number);
        if (!victim || !g?.match) break;
        victim.health = msg.hp as number;
        victim.lastDamageTime = g.match.time;
        g.netEvent({ type: 'damage', attacker, victim, amount: msg.dmg as number, part: PARTS[msg.part as number] ?? 'body', killed: false });
        break;
      }
      case 'kill': {
        const victim = this.actor(msg.victim as number);
        const killer = this.actor(msg.killer as number);
        if (!victim || !g?.match) break;
        victim.alive = true; // let Match.kill run its bookkeeping
        g.match.kill(victim, killer, Boolean(msg.head), msg.dist as number);
        break;
      }
      case 'chat':
        g?.netEvent({ type: 'chat', name: String(msg.name), text: String(msg.text), team: (msg.team as 0 | 1 | -1) ?? -1 });
        break;
      case 'scores': {
        if (!g?.match) break;
        const m = g.match;
        m.teamScores = msg.teams as [number, number];
        m.time = Math.max(0, m.mode.timeLimit - (msg.timeLeft as number));
        for (const [id, kills, deaths, score, assists] of msg.players as number[][]) {
          const a = this.actor(id);
          if (a) Object.assign(a, { kills, deaths, score, assists });
        }
        break;
      }
      case 'end': {
        if (!g?.match) break;
        g.match.teamScores = msg.teams as [number, number];
        g.match.finish();
        break;
      }
    }
  }
}

function round(v: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
