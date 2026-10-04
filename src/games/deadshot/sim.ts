import { Actor } from './actor';
import { BotBrain, pickBotClass } from './bot';
import { BOT_NAMES, type ClassId, type Tier } from './config';
import type { Match } from './match';

/**
 * Drives a match: bot thinking, movement, weapons and respawns.
 * Rendering-free so it can also run headless (tests, dedicated hosts).
 */
export class Simulation {
  brains = new Map<number, BotBrain>();
  private usedNames = new Set<string>();
  /** Set false to keep the local player dead until they choose to respawn. */
  autoRespawnLocal = false;

  constructor(readonly match: Match) {
    match.on((e) => {
      if (e.type === 'shot') {
        const s = e.actor;
        const loud = s.classId === 'sniper' || s.classId === 'shotgun' ? 55 : 40;
        for (const brain of this.brains.values()) {
          const b = brain.actor;
          if (!b.alive || !match.isEnemy(b, s)) continue;
          if ((b.body.x - s.body.x) ** 2 + (b.body.z - s.body.z) ** 2 < loud * loud) brain.hear({ x: s.body.x, y: s.body.y, z: s.body.z }, match.time);
        }
      } else if (e.type === 'damage') {
        this.brains.get(e.victim.id)?.onDamaged(e.attacker, match.time);
      } else if (e.type === 'spawn') {
        this.brains.get(e.actor.id)?.onSpawn();
      }
    });
  }

  botName(): string {
    const pool = BOT_NAMES.filter((n) => !this.usedNames.has(n));
    const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : `Bot${this.usedNames.size}`;
    this.usedNames.add(name);
    return name;
  }

  addBot(team: 0 | 1, cls?: ClassId, tier?: Tier): Actor {
    const a = new Actor(this.botName());
    a.isBot = true;
    a.team = team;
    a.nextClass = cls ?? pickBotClass();
    a.tier = tier ?? (Math.random() < 0.15 ? 3 : Math.random() < 0.3 ? 2 : Math.random() < 0.5 ? 1 : 0);
    this.match.addActor(a);
    this.brains.set(a.id, new BotBrain(a, this.match.settings.difficulty));
    return a;
  }

  removeBot(a: Actor): void {
    this.brains.delete(a.id);
    this.usedNames.delete(a.name);
    this.match.removeActor(a);
  }

  step(dt: number): void {
    const m = this.match;
    if (m.over) return;
    for (const a of m.actors) {
      if (a.isRemote) continue;
      if (!a.alive) {
        if (m.time >= a.respawnAt && (a.isBot || this.autoRespawnLocal) && m.authority) {
          if (a.isBot && Math.random() < 0.25) a.nextClass = pickBotClass();
          m.spawnActor(a);
        }
        continue;
      }
      const brain = this.brains.get(a.id);
      if (brain) brain.think(dt, m);
      const mv = a.simulateMovement(dt, m.world, m.time);
      if (mv.jumped) m.emit({ type: 'jump', actor: a });
      if (mv.landed) m.emit({ type: 'land', actor: a });
      if (mv.slid) m.emit({ type: 'slide', actor: a });
      const wasReloading = a.reloading;
      const fire = a.updateWeapon(dt, m.time);
      if (!wasReloading && a.reloading) m.emit({ type: 'reload', actor: a });
      if (fire) m.handleFire(a, fire);
    }
    m.update(dt);
  }
}
