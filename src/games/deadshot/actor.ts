import { PLAYER, WEAPONS, type ClassId, type Tier, type WeaponDef } from './config';
import { bodyFits, moveBody, type Body, type World } from './world';

export type Stance = 'stand' | 'crouch' | 'slide';
export type HitPart = 'head' | 'body' | 'legs';

export interface ActorInput {
  fwd: number;
  right: number;
  jump: boolean;
  crouch: boolean;
  fire: boolean;
  ads: boolean;
  reload: boolean;
}

export interface Hitbox {
  part: HitPart;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface FireRequest {
  ox: number;
  oy: number;
  oz: number;
  dirs: [number, number, number][];
}

let nextId = 1;

export class Actor {
  id = nextId++;
  /** Player id on the LAN server (0 when offline). */
  netId = 0;
  name: string;
  team: 0 | 1 = 0;
  isBot = false;
  isLocal = false;
  isRemote = false;
  classId: ClassId = 'ar';
  nextClass: ClassId = 'ar';
  tier: Tier = 0;

  body: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, half: PLAYER.radius, height: PLAYER.heightStand, onGround: false };
  yaw = 0;
  pitch = 0;
  stance: Stance = 'stand';
  slideTime = 0;
  slideCooldown = 0;
  private crouchWasHeld = false;
  private jumpWasHeld = false;
  landedAt = 0;
  airTime = 0;

  health: number = PLAYER.maxHealth;
  alive = false;
  respawnAt = 0;
  deathTime = 0;
  spawnProtect = 0;
  lastDamageTime = -99;
  lastAttackerId = 0;
  damageFrom = new Map<number, { amount: number; time: number }>();

  // Weapon state
  ammo = 30;
  reloadLeft = 0;
  fireCooldown = 0;
  boltLeft = 0;
  ads = 0;
  adsLatched = false;
  bloom = 0;
  private fireWasHeld = false;
  /** Visual recoil impulse consumed by the view model / camera shake. */
  kick = 0;
  lastShotTime = -99;

  // Stats
  kills = 0;
  deaths = 0;
  assists = 0;
  score = 0;
  headshots = 0;
  streak = 0;
  bestStreak = 0;
  shotsFired = 0;
  shotsHit = 0;
  objective = 0;
  longestKill = 0;
  classKills: Record<string, number> = {};

  input: ActorInput = { fwd: 0, right: 0, jump: false, crouch: false, fire: false, ads: false, reload: false };

  /** Animation helpers (also driven for remote actors). */
  walkPhase = 0;
  speed = 0;

  // Remote interpolation
  netTarget: { x: number; y: number; z: number; yaw: number; pitch: number; t: number } | null = null;

  constructor(name: string) {
    this.name = name;
  }

  get weapon(): WeaponDef {
    return WEAPONS[this.classId];
  }

  get eyeHeight(): number {
    return this.stance === 'slide' ? PLAYER.eyeSlide : this.stance === 'crouch' ? PLAYER.eyeCrouch : PLAYER.eyeStand;
  }

  get eyeY(): number {
    return this.body.y + this.eyeHeight;
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  /** Unit look direction. Yaw 0 looks toward -Z, positive pitch looks up. */
  lookDir(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  spawn(x: number, y: number, z: number, yaw: number, now: number): void {
    this.classId = this.nextClass;
    Object.assign(this.body, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, height: PLAYER.heightStand });
    this.yaw = yaw;
    this.pitch = 0;
    this.stance = 'stand';
    this.slideTime = 0;
    this.health = PLAYER.maxHealth;
    this.alive = true;
    this.spawnProtect = PLAYER.spawnProtection;
    this.ammo = this.weapon.mag;
    this.reloadLeft = 0;
    this.fireCooldown = 0.25;
    this.boltLeft = 0;
    this.ads = 0;
    this.adsLatched = false;
    this.bloom = 0;
    this.damageFrom.clear();
    this.lastDamageTime = -99;
    this.streak = 0;
    this.landedAt = now;
  }

  hitboxes(): Hitbox[] {
    const { x, y, z } = this.body;
    const h = this.stance === 'slide' ? PLAYER.heightSlide : this.stance === 'crouch' ? PLAYER.heightCrouch : PLAYER.heightStand;
    const box = (part: HitPart, half: number, y0: number, y1: number): Hitbox => ({
      part,
      minX: x - half,
      maxX: x + half,
      minZ: z - half,
      maxZ: z + half,
      minY: y + y0,
      maxY: y + y1,
    });
    return [box('head', 0.18, h * 0.8, h + 0.02), box('body', 0.28, h * 0.47, h * 0.8), box('legs', 0.22, 0, h * 0.47)];
  }

  // -------------------------------------------------------------------------
  // Movement

  simulateMovement(dt: number, world: World, now: number): { landed: boolean; jumped: boolean; slid: boolean } {
    const b = this.body;
    const inp = this.input;
    const def = this.weapon;
    let jumped = false;
    let slid = false;
    const hspeed = Math.hypot(b.vx, b.vz);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);

    // Stance
    const crouchPressed = inp.crouch && !this.crouchWasHeld;
    this.crouchWasHeld = inp.crouch;
    if (this.stance === 'slide') {
      this.slideTime += dt;
      if (this.slideTime > PLAYER.slideDuration || hspeed < 3.2 || !inp.crouch) {
        this.stance = 'crouch';
        this.slideCooldown = PLAYER.slideCooldown;
      }
    } else if (crouchPressed && b.onGround && hspeed > PLAYER.slideMinSpeed && this.slideCooldown <= 0) {
      this.stance = 'slide';
      this.slideTime = 0;
      const boost = Math.max(hspeed, PLAYER.slideBoost);
      b.vx = (b.vx / hspeed) * boost;
      b.vz = (b.vz / hspeed) * boost;
      slid = true;
    } else if (inp.crouch) {
      this.stance = 'crouch';
    }
    // Stand back up when crouch is released (stays crouched under low ceilings).
    if (this.stance === 'crouch' && !inp.crouch && bodyFits(world, b, PLAYER.heightStand)) this.stance = 'stand';
    const targetH = this.stance === 'slide' ? PLAYER.heightSlide : this.stance === 'crouch' ? PLAYER.heightCrouch : PLAYER.heightStand;
    if (targetH <= b.height || bodyFits(world, b, targetH)) b.height = targetH;

    // Wish direction
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let wx = -sy * inp.fwd + cy * inp.right;
    let wz = -cy * inp.fwd - sy * inp.right;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-4) {
      wx /= wl;
      wz /= wl;
    }
    let maxSpeed = PLAYER.walkSpeed * def.moveMult;
    if (this.stance === 'crouch') maxSpeed = PLAYER.crouchSpeed * def.moveMult;
    maxSpeed *= 1 + (def.adsMoveMult - 1) * this.ads;

    if (this.stance === 'slide') {
      // Linear slowdown with a little steering.
      const sp = Math.hypot(b.vx, b.vz);
      const decel = ((PLAYER.slideBoost - 4) / PLAYER.slideDuration) * dt;
      const ns = Math.max(0, sp - decel);
      if (sp > 1e-4) {
        let dx = b.vx / sp;
        let dz = b.vz / sp;
        if (wl > 1e-4) {
          dx += wx * dt * 1.5;
          dz += wz * dt * 1.5;
          const l = Math.hypot(dx, dz);
          dx /= l;
          dz /= l;
        }
        b.vx = dx * ns;
        b.vz = dz * ns;
      }
    } else if (b.onGround) {
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const drop = Math.max(sp, 1.5) * PLAYER.friction * dt;
        const ns = Math.max(0, sp - drop) / sp;
        b.vx *= ns;
        b.vz *= ns;
      }
      if (wl > 1e-4) accelerate(b, wx, wz, maxSpeed, PLAYER.groundAccel * dt);
    } else if (wl > 1e-4) {
      accelerate(b, wx, wz, maxSpeed, PLAYER.airAccel * dt);
    }

    const jumpPressed = inp.jump && !this.jumpWasHeld;
    this.jumpWasHeld = inp.jump;
    if ((jumpPressed || (inp.jump && now - this.landedAt < 0.05)) && b.onGround) {
      b.vy = PLAYER.jumpVelocity;
      b.onGround = false;
      jumped = true;
      if (this.stance === 'slide') {
        this.stance = 'stand';
        this.slideCooldown = PLAYER.slideCooldown * 0.5;
        if (!bodyFits(world, b, PLAYER.heightStand)) this.stance = 'crouch';
      }
    }

    b.vy -= PLAYER.gravity * dt;
    if (b.vy < -40) b.vy = -40;
    const wasAir = !b.onGround;
    const res = moveBody(world, b, dt, b.onGround ? PLAYER.stepHeight : 0);
    if (!b.onGround) this.airTime += dt;
    let landed = false;
    if (res.landed || (wasAir && b.onGround)) {
      landed = this.airTime > 0.25;
      this.airTime = 0;
      this.landedAt = now;
    }
    if (b.y < -30) b.y = 2; // safety net, never expected
    this.speed = Math.hypot(b.vx, b.vz);
    if (b.onGround) this.walkPhase += this.speed * dt * 1.25;
    return { landed, jumped, slid };
  }

  // -------------------------------------------------------------------------
  // Weapon

  /** Advances weapon timers. Returns a fire request when a shot goes off. */
  updateWeapon(dt: number, now: number, rand: () => number = Math.random): FireRequest | null {
    const def = this.weapon;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.boltLeft = Math.max(0, this.boltLeft - dt);
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.09);
    this.kick = Math.max(0, this.kick - dt * 6);

    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = def.mag;
      }
    }
    if (this.input.reload && this.ammo < def.mag && this.reloadLeft <= 0) this.startReload();

    const wantAds = this.input.ads && this.reloadLeft <= 0 && this.boltLeft <= 0;
    this.ads = clamp01(this.ads + (wantAds ? 1 : -1.6) * (dt / def.adsTime));

    const held = this.input.fire;
    const pressed = held && !this.fireWasHeld;
    this.fireWasHeld = held;
    const trigger = def.auto ? held : pressed;
    if (!trigger || this.fireCooldown > 0 || this.reloadLeft > 0 || !this.alive) return null;
    if (this.ammo <= 0) {
      this.startReload();
      return null;
    }

    this.ammo--;
    this.fireCooldown = def.fireInterval;
    this.shotsFired++;
    this.lastShotTime = now;
    this.spawnProtect = 0;
    if (def.bolt) this.boltLeft = def.fireInterval * 0.85;

    const spread = this.currentSpread();
    const base = this.lookDir();
    const dirs: [number, number, number][] = [];
    for (let i = 0; i < def.pellets; i++) dirs.push(coneDir(base, spread, rand));

    // Recoil
    const adsK = 1 - this.ads * 0.4;
    const stanceK = this.stance === 'stand' ? 1 : 0.75;
    this.pitch = Math.min(1.45, this.pitch + def.recoilPitch * adsK * stanceK);
    this.yaw += (rand() * 2 - 1) * def.recoilYaw * adsK;
    this.bloom = Math.min(def.bloomMax, this.bloom + def.bloomPerShot);
    this.kick = Math.min(1, this.kick + (def.pellets > 1 || def.bolt ? 1 : 0.45));

    if (this.ammo === 0 && !this.isRemote) {
      // auto-reload after the last round
      this.reloadLeft = def.reloadTime + def.fireInterval * 0.6;
      this.ads = 0;
    }
    return { ox: this.body.x, oy: this.eyeY, oz: this.body.z, dirs };
  }

  startReload(): void {
    if (this.reloadLeft > 0 || this.ammo >= this.weapon.mag) return;
    this.reloadLeft = this.weapon.reloadTime;
  }

  currentSpread(): number {
    const def = this.weapon;
    const a = 1 - this.ads;
    let s = def.adsSpread + (def.hipSpread - def.adsSpread) * a * a;
    const moveFrac = Math.min(1, this.speed / PLAYER.walkSpeed);
    s += def.moveSpread * moveFrac * (1 - this.ads * 0.5);
    if (!this.body.onGround) s += def.airSpread;
    if (this.stance === 'crouch') s *= 0.85;
    s += this.bloom;
    return s;
  }

  resetStats(): void {
    this.kills = this.deaths = this.assists = this.score = this.headshots = 0;
    this.streak = this.bestStreak = this.shotsFired = this.shotsHit = this.objective = 0;
    this.longestKill = 0;
    this.classKills = {};
  }
}

function accelerate(b: Body, wx: number, wz: number, wishSpeed: number, accel: number): void {
  const cur = b.vx * wx + b.vz * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const acc = Math.min(accel, add);
  b.vx += wx * acc;
  b.vz += wz * acc;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Random direction inside a cone of half-angle `spread` around `d`. */
export function coneDir(d: [number, number, number], spread: number, rand: () => number): [number, number, number] {
  if (spread <= 0) return d;
  // Orthonormal basis around d
  const [dx, dy, dz] = d;
  let ux = 0;
  let uy = 1;
  let uz = 0;
  if (Math.abs(dy) > 0.95) {
    ux = 1;
    uy = 0;
  }
  // r = normalize(u x d)
  let rx = uy * dz - uz * dy;
  let ry = uz * dx - ux * dz;
  let rz = ux * dy - uy * dx;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // up = d x r
  const qx = dy * rz - dz * ry;
  const qy = dz * rx - dx * rz;
  const qz = dx * ry - dy * rx;
  const ang = rand() * Math.PI * 2;
  const rad = Math.sqrt(rand()) * Math.tan(spread);
  const ox = Math.cos(ang) * rad;
  const oy = Math.sin(ang) * rad;
  const x = dx + rx * ox + qx * oy;
  const y = dy + ry * ox + qy * oy;
  const z = dz + rz * ox + qz * oy;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/** Ray vs AABB; returns distance or -1. */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Hitbox, maxT: number): number {
  let tmin = 0;
  let tmax = maxT;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}
