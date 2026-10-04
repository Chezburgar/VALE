import type { Actor } from './actor';
import { DIFFICULTY, type ClassId, type Difficulty, type DifficultyDef } from './config';
import type { V3 } from './maps/builder';
import type { Match } from './match';
import { EDGE_JUMP } from './navgrid';

const HEAD_AIM: Record<Difficulty, number> = { easy: 0.05, normal: 0.18, hard: 0.38, insane: 0.6 };

/** Chooses a class for a bot, weighted toward the popular picks. */
export function pickBotClass(rand = Math.random): ClassId {
  const r = rand();
  if (r < 0.34) return 'ar';
  if (r < 0.58) return 'smg';
  if (r < 0.74) return 'shotgun';
  return 'sniper';
}

export class BotBrain {
  private diff: DifficultyDef;
  private path: number[] = [];
  private pathIdx = 0;
  private goal: V3 | null = null;
  private goalKind: 'roam' | 'chase' | 'objective' | 'investigate' | 'engage' = 'roam';
  private repathAt = 0;
  target: Actor | null = null;
  private targetVisible = false;
  private reaction = 0;
  private lastSeen: V3 | null = null;
  private lastSeenTime = -99;
  private errYaw = 0;
  private errPitch = 0;
  private aimHead = false;
  private strafe = 1;
  private strafeTimer = 0;
  private perceiveTimer = 0;
  private stuckTimer = 0;
  private stuckFrom: V3 = { x: 0, y: 0, z: 0 };
  private stuckCount = 0;
  private burstTimer = 0;
  private burstPause = 0;
  private semiToggle = false;
  investigate: V3 | null = null;
  private investigateTime = -99;
  private slideTimer = 0;
  private roamUntil = 0;

  constructor(
    readonly actor: Actor,
    readonly difficulty: Difficulty,
  ) {
    this.diff = DIFFICULTY[difficulty];
    this.strafeTimer = Math.random();
  }

  onSpawn(): void {
    this.path = [];
    this.goal = null;
    this.target = null;
    this.lastSeen = null;
    this.investigate = null;
    this.repathAt = 0;
  }

  hear(pos: V3, now: number): void {
    if (this.targetVisible) return;
    this.investigate = { ...pos };
    this.investigateTime = now;
  }

  onDamaged(attacker: Actor | null, now: number): void {
    if (!attacker || this.targetVisible) return;
    this.investigate = { x: attacker.body.x, y: attacker.body.y, z: attacker.body.z };
    this.investigateTime = now;
    // Snap attention toward the threat.
    const dx = attacker.body.x - this.actor.body.x;
    const dz = attacker.body.z - this.actor.body.z;
    this.desiredYaw = Math.atan2(-dx, -dz);
    this.turnBoost = 0.6;
  }

  private desiredYaw: number | null = null;
  private turnBoost = 0;

  think(dt: number, m: Match): void {
    const a = this.actor;
    const inp = a.input;
    inp.fire = false;
    inp.jump = false;
    inp.reload = false;
    if (!a.alive) {
      inp.fwd = inp.right = 0;
      inp.ads = false;
      inp.crouch = false;
      return;
    }
    const now = m.time;
    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = 0.12 + Math.random() * 0.08;
      this.perceive(m, now);
    }

    const def = a.weapon;
    let moveX = 0;
    let moveZ = 0;
    let lookTarget: V3 | null = null;
    inp.ads = false;
    inp.crouch = false;

    const t = this.target;
    if (t && this.targetVisible && t.alive) {
      this.goalKind = 'engage';
      const dist = Math.hypot(t.body.x - a.body.x, t.body.z - a.body.z);
      const aimY = this.aimHead ? t.eyeY + 0.02 : t.body.y + (t.eyeY - t.body.y) * 0.62;
      lookTarget = { x: t.body.x, y: aimY, z: t.body.z };

      // Shrink aim error while tracking.
      const decay = Math.exp(-this.diff.trackGain * dt);
      this.errYaw *= decay;
      this.errPitch *= decay;
      // Moving targets are harder to track.
      const tv = Math.hypot(t.body.vx, t.body.vz);
      if (tv > 5 && Math.random() < dt * 2) {
        this.errYaw += (Math.random() - 0.5) * this.diff.aimError * 0.6;
      }

      // Range management per class.
      const pref = a.classId === 'shotgun' ? 5 : a.classId === 'smg' ? 11 : a.classId === 'ar' ? 20 : 40;
      const dx = (t.body.x - a.body.x) / Math.max(dist, 0.01);
      const dz = (t.body.z - a.body.z) / Math.max(dist, 0.01);
      let approach = 0;
      if (dist > pref * 1.4) approach = 1;
      else if (dist < pref * 0.5 && a.classId !== 'shotgun') approach = -0.7;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafe = Math.random() < 0.5 ? -1 : 1;
        this.strafeTimer = 0.35 + Math.random() * (1.2 - this.diff.movement * 0.6);
      }
      const strafeAmt = a.classId === 'sniper' && a.ads > 0.5 ? 0.25 : this.diff.movement;
      // Perpendicular strafe
      moveX = dx * approach + -dz * this.strafe * strafeAmt;
      moveZ = dz * approach + dx * this.strafe * strafeAmt;
      if (approach > 0 && dist > 8) {
        // Use the nav graph to close in.
        const pv = this.followPath(m, t.body, dt, now);
        if (pv) {
          moveX = pv[0] + -dz * this.strafe * strafeAmt * 0.4;
          moveZ = pv[1] + dx * this.strafe * strafeAmt * 0.4;
        }
      }
      // Avoid strafing off ledges / into walls.
      if (!this.safeStep(m, moveX, moveZ)) {
        this.strafe = -this.strafe;
        moveX = dx * approach + -dz * this.strafe * strafeAmt;
        moveZ = dz * approach + dx * this.strafe * strafeAmt;
        if (!this.safeStep(m, moveX, moveZ)) {
          moveX = 0;
          moveZ = 0;
        }
      }
      // Advanced movement on higher difficulties.
      if (this.diff.movement > 0.8 && a.body.onGround) {
        if (Math.random() < dt * 0.5) inp.jump = true;
        this.slideTimer -= dt;
        if (approach > 0 && a.speed > 6 && this.slideTimer <= 0 && Math.random() < dt * 1.5) {
          this.slideTimer = 1.5;
        }
      }
      if (this.slideTimer > 0.9) inp.crouch = true;

      // ADS
      if (def.scope) inp.ads = dist > 9;
      else if (def.id === 'ar') inp.ads = dist > 22;
      else if (def.id === 'smg') inp.ads = dist > 16;

      // Fire control
      if (this.reaction > 0) this.reaction -= dt;
      else {
        const [lx, ly, lz] = a.lookDir();
        const tx = lookTarget.x - a.body.x;
        const ty = lookTarget.y - a.eyeY;
        const tz = lookTarget.z - a.body.z;
        const tl = Math.hypot(tx, ty, tz);
        const cos = (lx * tx + ly * ty + lz * tz) / tl;
        const ang = Math.acos(Math.min(1, cos));
        const tolerance = Math.atan(0.45 / tl) * 1.6 + 0.01 + this.diff.aimError * 0.4;
        const scopedReady = !def.scope || a.ads > 0.92 || dist < 9;
        const inRange = dist < (def.id === 'shotgun' ? 26 : def.range);
        if (ang < tolerance && scopedReady && inRange) {
          if (def.auto) {
            if (this.burstPause > 0) this.burstPause -= dt;
            else {
              inp.fire = true;
              this.burstTimer += dt;
              const maxBurst = 0.25 + this.diff.burst * 0.9 + (dist < 12 ? 0.8 : 0);
              if (this.burstTimer > maxBurst) {
                this.burstTimer = 0;
                this.burstPause = 0.12 + (1 - this.diff.burst) * 0.35;
              }
            }
          } else {
            this.semiToggle = !this.semiToggle;
            inp.fire = this.semiToggle;
          }
        } else this.burstTimer = 0;
      }
    } else {
      // Not engaged: chase, investigate, objective or roam.
      let goal: V3 | null = null;
      if (this.lastSeen && now - this.lastSeenTime < 5) {
        goal = this.lastSeen;
        this.goalKind = 'chase';
      } else if (this.investigate && now - this.investigateTime < 8) {
        goal = this.investigate;
        this.goalKind = 'investigate';
      } else {
        const obj = this.objectiveGoal(m);
        if (obj) {
          goal = obj;
          this.goalKind = 'objective';
        } else {
          if (!this.goal || this.goalKind !== 'roam' || now > this.roamUntil || this.reached(this.goal)) {
            this.goal = this.roamGoal(m);
            this.roamUntil = now + 12 + Math.random() * 10;
            this.path = [];
          }
          goal = this.goal;
          this.goalKind = 'roam';
        }
      }
      if (goal && this.reached(goal)) {
        if (this.goalKind === 'chase') this.lastSeen = null;
        if (this.goalKind === 'investigate') this.investigate = null;
      }
      if (goal) {
        if (!this.goal || dist2(goal, this.goal) > 4) {
          this.goal = { ...goal };
          this.repathAt = 0;
        }
        const pv = this.followPath(m, goal, dt, now);
        if (pv) {
          moveX = pv[0];
          moveZ = pv[1];
        }
      }
      if (this.goalKind === 'investigate' && this.investigate) lookTarget = { ...this.investigate, y: this.investigate.y + 1.4 };
      else if (this.goalKind === 'chase' && this.lastSeen) lookTarget = { ...this.lastSeen, y: this.lastSeen.y + 1.4 };
      if (a.ammo < def.mag * 0.5) inp.reload = true;
      this.burstTimer = 0;
    }

    // Convert world move into local input.
    const ml = Math.hypot(moveX, moveZ);
    if (ml > 1e-3) {
      moveX /= Math.max(1, ml);
      moveZ /= Math.max(1, ml);
    }
    const sy = Math.sin(a.yaw);
    const cy = Math.cos(a.yaw);
    inp.fwd = clamp(-sy * moveX + -cy * moveZ);
    inp.right = clamp(cy * moveX + -sy * moveZ);

    // Aim / look
    let wantYaw: number;
    let wantPitch: number;
    if (lookTarget) {
      const dx = lookTarget.x - a.body.x;
      const dy = lookTarget.y - a.eyeY;
      const dz = lookTarget.z - a.body.z;
      wantYaw = Math.atan2(-dx, -dz) + (this.targetVisible ? this.errYaw : 0);
      wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + (this.targetVisible ? this.errPitch : 0);
    } else if (this.desiredYaw !== null && this.turnBoost > 0) {
      wantYaw = this.desiredYaw;
      wantPitch = 0;
      this.turnBoost -= dt;
    } else if (ml > 0.1) {
      wantYaw = Math.atan2(-moveX, -moveZ);
      wantPitch = -0.05;
    } else {
      wantYaw = a.yaw;
      wantPitch = 0;
    }
    const turn = this.diff.turnSpeed * (this.targetVisible ? 1 : 0.7) * dt;
    a.yaw += clampAbs(wrapAngle(wantYaw - a.yaw) * Math.min(1, dt * 12), turn);
    a.pitch += clampAbs((wantPitch - a.pitch) * Math.min(1, dt * 10), turn);
    a.pitch = Math.max(-1.4, Math.min(1.4, a.pitch));

    // Stuck detection
    this.stuckTimer += dt;
    if (this.stuckTimer > 0.8) {
      const moved = Math.hypot(a.body.x - this.stuckFrom.x, a.body.z - this.stuckFrom.z);
      if (ml > 0.3 && moved < 0.45 && !this.targetVisible) {
        this.stuckCount++;
        inp.jump = true;
        this.repathAt = 0;
        if (this.stuckCount > 2) {
          this.goal = this.roamGoal(m);
          this.goalKind = 'roam';
          this.investigate = null;
          this.lastSeen = null;
          this.stuckCount = 0;
        }
      } else this.stuckCount = 0;
      this.stuckTimer = 0;
      this.stuckFrom = { x: a.body.x, y: a.body.y, z: a.body.z };
    }
  }

  private perceive(m: Match, now: number): void {
    const a = this.actor;
    const [lx, , lz] = a.lookDir();
    const ll = Math.hypot(lx, lz) || 1;
    let best: Actor | null = null;
    let bestScore = Infinity;
    for (const e of m.actors) {
      if (!e.alive || !m.isEnemy(a, e)) continue;
      const dx = e.body.x - a.body.x;
      const dy = e.eyeY - a.eyeY;
      const dz = e.body.z - a.body.z;
      const dist = Math.hypot(dx, dz);
      const maxRange = a.classId === 'sniper' ? 160 : 100;
      if (dist > maxRange) continue;
      const cos = (dx * lx + dz * lz) / (dist * ll || 1);
      const inFov = cos > Math.cos(this.diff.fov / 2) || dist < 7 || (now - e.lastShotTime < 0.5 && dist < 35);
      if (!inFov && e !== this.target) continue;
      const seesHead = m.world.lineOfSight(a.body.x, a.eyeY, a.body.z, e.body.x, e.eyeY, e.body.z);
      const seesBody = seesHead || m.world.lineOfSight(a.body.x, a.eyeY, a.body.z, e.body.x, e.body.y + 1.0 * (e.eyeHeight / 1.62), e.body.z);
      if (!seesBody) continue;
      const score = dist - (e === this.target ? 12 : 0) + (e.spawnProtect > 0 ? 30 : 0) + Math.abs(dy) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      if (best !== this.target || !this.targetVisible) {
        const dist = Math.hypot(best.body.x - a.body.x, best.body.z - a.body.z);
        this.reaction = this.diff.reaction * (0.75 + Math.random() * 0.6) * (best === this.target ? 0.4 : 1);
        const err = this.diff.aimError * (1 + Math.min(dist, 60) / 40);
        const ang = Math.random() * Math.PI * 2;
        this.errYaw = Math.cos(ang) * err * 1.4;
        this.errPitch = Math.sin(ang) * err * 0.8;
        this.aimHead = Math.random() < HEAD_AIM[this.difficulty];
      }
      this.target = best;
      this.targetVisible = true;
      this.lastSeen = { x: best.body.x, y: best.body.y, z: best.body.z };
      this.lastSeenTime = now;
    } else {
      this.targetVisible = false;
      if (this.target && !this.target.alive) {
        this.target = null;
        this.lastSeen = null;
      }
    }
  }

  private objectiveGoal(m: Match): V3 | null {
    const a = this.actor;
    const mode = m.settings.mode;
    if (mode === 'kc') {
      let best: V3 | null = null;
      let bd = 28 * 28;
      for (const t of m.tags) {
        const d = dist2(t, a.body);
        if (d < bd) {
          bd = d;
          best = { x: t.x, y: t.y - 0.6, z: t.z };
        }
      }
      return best;
    }
    if (mode === 'dom') {
      // Bots spread over flags: prefer flags not owned by the team, nearest first, with a per-bot bias.
      const bias = (a.id % 3) * 0.33;
      let best: V3 | null = null;
      let bs = Infinity;
      for (const [i, f] of m.flags.entries()) {
        const owned = f.owner === a.team && Math.abs(f.progress) >= 1;
        const d = Math.sqrt(dist2(f.pos, a.body));
        const score = d + (owned ? 45 : 0) + Math.abs(i / 2 - bias) * 25;
        if (score < bs) {
          bs = score;
          best = f.pos;
        }
      }
      return best && Math.random() < 0.995 ? jitter(best, 2.5, a.id) : null;
    }
    if (mode === 'hp' && m.hardpoint) {
      if (a.id % 4 === 3) return null; // some bots hunt instead
      return jitter(m.hardpoint.pos, 2.8, a.id);
    }
    return null;
  }

  private roamGoal(m: Match): V3 {
    const a = this.actor;
    const enemies = m.enemiesOf(a);
    if (enemies.length && Math.random() < 0.55) {
      const e = enemies[Math.floor(Math.random() * enemies.length)];
      return { x: e.body.x + (Math.random() - 0.5) * 16, y: e.body.y, z: e.body.z + (Math.random() - 0.5) * 16 };
    }
    // Snipers like high ground.
    const n = m.nav.randomNode();
    if (a.classId === 'sniper') {
      for (let i = 0; i < 12; i++) {
        const k = m.nav.randomNode();
        if (m.nav.nodeY[k] > 2.5) return { x: m.nav.nodeX[k], y: m.nav.nodeY[k], z: m.nav.nodeZ[k] };
      }
    }
    return { x: m.nav.nodeX[n], y: m.nav.nodeY[n], z: m.nav.nodeZ[n] };
  }

  private reached(p: V3): boolean {
    const b = this.actor.body;
    return (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 2.2 && Math.abs(b.y - p.y) < 1.5;
  }

  /** Returns a world-space move vector along the nav path toward `goal`. */
  private followPath(m: Match, goal: V3, _dt: number, now: number): [number, number] | null {
    const a = this.actor;
    const nav = m.nav;
    if (now >= this.repathAt || this.pathIdx >= this.path.length) {
      this.repathAt = now + 0.9 + Math.random() * 0.6;
      const s = nav.nearest(a.body.x, a.body.y, a.body.z);
      const g = nav.nearest(goal.x, goal.y, goal.z, 4);
      this.path = nav.findPath(s, g);
      this.pathIdx = this.path.length > 1 ? 1 : 0;
    }
    if (this.path.length === 0) {
      const dx = goal.x - a.body.x;
      const dz = goal.z - a.body.z;
      const l = Math.hypot(dx, dz);
      return l > 0.5 ? [dx / l, dz / l] : null;
    }
    // Advance past reached nodes.
    while (this.pathIdx < this.path.length) {
      const n = this.path[this.pathIdx];
      const dx = nav.nodeX[n] - a.body.x;
      const dz = nav.nodeZ[n] - a.body.z;
      const dy = nav.nodeY[n] - a.body.y;
      if (dx * dx + dz * dz < 0.55 * 0.55 && dy < 0.8 && dy > -1.5) this.pathIdx++;
      else break;
    }
    if (this.pathIdx >= this.path.length) return null;
    // Look ahead along straight, level stretches.
    let aim = this.pathIdx;
    const baseY = a.body.y;
    for (let k = this.pathIdx + 1; k < Math.min(this.path.length, this.pathIdx + 6); k++) {
      const n = this.path[k];
      const prev = this.path[k - 1];
      if (Math.abs(nav.nodeY[n] - baseY) > 0.3 || nav.edgeKindBetween(prev, n) !== 0) break;
      if (!m.world.lineOfSight(a.body.x, a.body.y + 0.35, a.body.z, nav.nodeX[n], nav.nodeY[n] + 0.35, nav.nodeZ[n], false)) break;
      aim = k;
    }
    const n = this.path[aim];
    const dx = nav.nodeX[n] - a.body.x;
    const dz = nav.nodeZ[n] - a.body.z;
    const l = Math.hypot(dx, dz);
    // Jump links
    if (this.pathIdx > 0) {
      const prev = this.path[this.pathIdx - 1];
      const next = this.path[this.pathIdx];
      const kind = nav.edgeKindBetween(prev, next);
      if (kind === EDGE_JUMP && l < 1.6 && a.body.onGround) a.input.jump = true;
    }
    if (nav.nodeY[n] - a.body.y > 0.7 && l < 1.4 && a.body.onGround) a.input.jump = true;
    return l > 1e-3 ? [dx / l, dz / l] : null;
  }

  /** Rough check that a step in this direction doesn't walk off a big drop. */
  private safeStep(m: Match, mx: number, mz: number): boolean {
    const a = this.actor;
    const l = Math.hypot(mx, mz);
    if (l < 1e-3) return true;
    const px = a.body.x + (mx / l) * 1.1;
    const pz = a.body.z + (mz / l) * 1.1;
    const g = m.world.groundAt(px, pz, a.body.y + 0.5, 0.2);
    return g > a.body.y - 1.6;
  }
}

function dist2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function jitter(p: V3, r: number, seed: number): V3 {
  const ang = (seed * 2.399) % (Math.PI * 2);
  return { x: p.x + Math.cos(ang) * r * 0.6, y: p.y, z: p.z + Math.sin(ang) * r * 0.6 };
}

function clamp(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function clampAbs(v: number, m: number): number {
  return v < -m ? -m : v > m ? m : v;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

