import type { MapId } from '../config';
import type { Box, MatId } from '../world';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Spawn extends V3 {
  yaw: number;
  team: 0 | 1;
}

export type PropKind = 'cylinder' | 'cone' | 'sphere' | 'box' | 'prism';

/** Visual-only mesh (colliders for props are added separately as boxes). */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  /** cylinder/cone/sphere radius, or box width */
  r: number;
  /** height (or box height) */
  h: number;
  /** box depth / cylinder top radius ratio */
  d?: number;
  color: number;
  mat?: MatId;
  axis?: 'x' | 'y' | 'z';
  rotY?: number;
  segments?: number;
  emissive?: number;
}

export interface Theme {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  particles: 'snow' | 'dust' | 'pollen' | null;
  exposure: number;
  ambience: 'wind' | 'industrial' | 'forest' | 'snow';
}

export interface MapDef {
  id: MapId;
  boxes: Box[];
  props: Prop[];
  spawns: Spawn[];
  flags: V3[];
  hardpoints: V3[];
  theme: Theme;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Camera fly-over path for the menu background. */
  menuCam: { from: V3; to: V3 }[];
}

export type Dir = 'N' | 'S' | 'E' | 'W';

/** Seeded PRNG so every client builds identical maps (needed for LAN play). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Helper for authoring maps. With `flip` set, every placement is rotated 180°
 * around the origin, so a map can be authored as one half and mirrored for
 * point-symmetric (fair) team layouts.
 */
export class MapBuilder {
  boxes: Box[] = [];
  props: Prop[] = [];
  spawns: Spawn[] = [];
  flip = false;

  private fx(x: number): number {
    return this.flip ? -x : x;
  }
  private fz(z: number): number {
    return this.flip ? -z : z;
  }
  private fdir(d: Dir): Dir {
    if (!this.flip) return d;
    return ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[d];
  }

  /** Axis-aligned box from two corners (any order). */
  aabb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MatId, color: number, opts: Partial<Box> = {}): Box {
    const ax = this.fx(x0);
    const bx = this.fx(x1);
    const az = this.fz(z0);
    const bz = this.fz(z1);
    const box: Box = {
      minX: Math.min(ax, bx),
      maxX: Math.max(ax, bx),
      minY: Math.min(y0, y1),
      maxY: Math.max(y0, y1),
      minZ: Math.min(az, bz),
      maxZ: Math.max(az, bz),
      mat,
      color,
      collide: true,
      visible: true,
      ...opts,
    };
    this.boxes.push(box);
    return box;
  }

  /** Box by center x/z, bottom y and size. */
  box(cx: number, y: number, cz: number, w: number, h: number, d: number, mat: MatId, color: number, opts: Partial<Box> = {}): Box {
    return this.aabb(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, mat, color, opts);
  }

  /** Wall along X at z (center line), with door/window gaps [x0, x1, gapBottom, gapTop]. */
  wallX(x0: number, x1: number, z: number, y: number, h: number, t: number, mat: MatId, color: number, gaps: [number, number, number?, number?][] = []): void {
    this.wallRun(x0, x1, (a, b, y0, y1) => this.aabb(a, y0, z - t / 2, b, y1, z + t / 2, mat, color), y, h, gaps);
  }

  /** Wall along Z at x (center line), with gaps [z0, z1, gapBottom, gapTop]. */
  wallZ(z0: number, z1: number, x: number, y: number, h: number, t: number, mat: MatId, color: number, gaps: [number, number, number?, number?][] = []): void {
    this.wallRun(z0, z1, (a, b, y0, y1) => this.aabb(x - t / 2, y0, a, x + t / 2, y1, b, mat, color), y, h, gaps);
  }

  private wallRun(a0: number, a1: number, emit: (a: number, b: number, y0: number, y1: number) => void, y: number, h: number, gaps: [number, number, number?, number?][]): void {
    const sorted = [...gaps].sort((p, q) => p[0] - q[0]);
    let cursor = a0;
    for (const [g0, g1, gb = 0, gt = h] of sorted) {
      if (g0 > cursor) emit(cursor, g0, y, y + h);
      if (gb > 0) emit(g0, g1, y, y + gb);
      if (gt < h) emit(g0, g1, y + gt, y + h);
      cursor = g1;
    }
    if (cursor < a1) emit(cursor, a1, y, y + h);
  }

  /**
   * Solid staircase. (x, z) is the center of the bottom edge; it climbs
   * `rise` meters in direction `dir`.
   */
  stairs(x: number, z: number, dir: Dir, width: number, y0: number, rise: number, mat: MatId, color: number, stepRise = 0.42, run = 0.55): { topX: number; topZ: number; length: number } {
    const n = Math.max(1, Math.ceil(rise / stepRise));
    const hStep = rise / n;
    const d = this.fdir(dir);
    const X = this.fx(x);
    const Z = this.fz(z);
    const saved = this.flip;
    this.flip = false;
    for (let i = 0; i < n; i++) {
      const a = i * run;
      const b = (i + 1) * run;
      const top = y0 + (i + 1) * hStep;
      if (d === 'N') this.aabb(X - width / 2, y0, Z + a, X + width / 2, top, Z + b, mat, color);
      if (d === 'S') this.aabb(X - width / 2, y0, Z - b, X + width / 2, top, Z - a, mat, color);
      if (d === 'E') this.aabb(X + a, y0, Z - width / 2, X + b, top, Z + width / 2, mat, color);
      if (d === 'W') this.aabb(X - b, y0, Z - width / 2, X - a, top, Z + width / 2, mat, color);
    }
    this.flip = saved;
    const len = n * run;
    return { topX: x + (dir === 'E' ? len : dir === 'W' ? -len : 0), topZ: z + (dir === 'N' ? len : dir === 'S' ? -len : 0), length: len };
  }

  crate(cx: number, cz: number, size = 1.1, y = 0, color = 0xb08850): Box {
    return this.box(cx, y, cz, size, size, size, 'crate', color);
  }

  barrel(cx: number, cz: number, color = 0x2f6fa0, y = 0): void {
    this.box(cx, y, cz, 0.75, 1.05, 0.75, 'plain', color, { visible: false });
    this.prop({ kind: 'cylinder', x: cx, y, z: cz, r: 0.38, h: 1.05, color, mat: 'metal', segments: 14 });
  }

  /** 6m shipping container. */
  container(cx: number, cz: number, alongX: boolean, color: number, y = 0): void {
    const w = alongX ? 6.1 : 2.45;
    const d = alongX ? 2.45 : 6.1;
    this.box(cx, y, cz, w, 2.6, d, 'metal', color);
  }

  /** Cylindrical tank: visual cylinder plus an octagon-ish collider. */
  tank(cx: number, cz: number, r: number, h: number, color: number, y = 0): void {
    this.prop({ kind: 'cylinder', x: cx, y, z: cz, r, h, color, mat: 'metal', segments: 28 });
    this.prop({ kind: 'cylinder', x: cx, y: y + h, z: cz, r: r * 1.0, h: 0.35, d: 0.65, color: 0x9aa0a4, mat: 'metal', segments: 28 });
    const s = r * 0.707;
    const inv = { visible: false };
    this.box(cx, y, cz, s * 2, h, s * 2, 'plain', color, inv);
    this.box(cx, y, cz, r * 2, h, r * 0.8, 'plain', color, inv);
    this.box(cx, y, cz, r * 0.8, h, r * 2, 'plain', color, inv);
  }

  /** Tree: trunk collider + foliage that blocks sight but not bullets. */
  tree(cx: number, cz: number, h: number, kind: 'pine' | 'oak' | 'snowpine', y = 0): void {
    const trunkH = kind === 'oak' ? h * 0.45 : h * 0.3;
    this.box(cx, y, cz, 0.5, h * 0.8, 0.5, 'bark', 0x5a4030, { visible: false });
    this.prop({ kind: 'cylinder', x: cx, y, z: cz, r: kind === 'oak' ? 0.32 : 0.24, h: trunkH + 0.4, d: 0.75, color: 0x5b4230, mat: 'bark', segments: 7 });
    if (kind === 'oak') {
      const fc = 0x3f7a35;
      this.prop({ kind: 'sphere', x: cx, y: y + trunkH + h * 0.25, z: cz, r: h * 0.3, h: 0, color: fc, mat: 'leaves', segments: 7 });
      this.prop({ kind: 'sphere', x: cx + h * 0.12, y: y + trunkH + h * 0.42, z: cz - h * 0.08, r: h * 0.22, h: 0, color: 0x4b8a3c, mat: 'leaves', segments: 6 });
      this.box(cx, y + trunkH + 0.2, cz, h * 0.45, h * 0.45, h * 0.45, 'leaves', fc, { collide: false, soft: true, visible: false });
    } else {
      const fc = kind === 'snowpine' ? 0x2f5a46 : 0x2d5e33;
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const ly = y + trunkH + i * (h - trunkH) * 0.28;
        const lr = (h * 0.24) * (1 - i * 0.25);
        this.prop({ kind: 'cone', x: cx, y: ly, z: cz, r: lr, h: (h - trunkH) * 0.5, color: fc, mat: 'leaves', segments: 8 });
        if (kind === 'snowpine')
          this.prop({ kind: 'cone', x: cx, y: ly + (h - trunkH) * 0.22, z: cz, r: lr * 0.6, h: (h - trunkH) * 0.28, color: 0xeef4f8, mat: 'snow', segments: 8 });
      }
      this.box(cx, y + trunkH, cz, h * 0.32, (h - trunkH) * 0.8, h * 0.32, 'leaves', fc, { collide: false, soft: true, visible: false });
    }
  }

  rock(cx: number, cz: number, w: number, h: number, d: number, color = 0x7d7f80, y = 0, mat: MatId = 'rock'): void {
    this.box(cx, y, cz, w, h, d, mat, color);
  }

  /**
   * Hollow building with a door, optional windows and optional roof access
   * via interior stairs along the west inner wall.
   */
  building(o: {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    h: number;
    mat: MatId;
    color: number;
    t?: number;
    y?: number;
    doors: { side: Dir; at: number; w?: number; h?: number }[];
    windows?: { side: Dir; at: number; w?: number; bottom?: number; top?: number }[];
    roof?: 'flat' | 'access' | 'none' | 'pitched';
    roofColor?: number;
    parapet?: number;
  }): void {
    const t = o.t ?? 0.35;
    const y = o.y ?? 0;
    const x0 = Math.min(o.x0, o.x1);
    const x1 = Math.max(o.x0, o.x1);
    const z0 = Math.min(o.z0, o.z1);
    const z1 = Math.max(o.z0, o.z1);
    const gapsFor = (side: Dir): [number, number, number?, number?][] => {
      const g: [number, number, number?, number?][] = [];
      for (const d of o.doors) if (d.side === side) g.push([d.at - (d.w ?? 1.6) / 2, d.at + (d.w ?? 1.6) / 2, 0, d.h ?? 2.4]);
      for (const w of o.windows ?? []) if (w.side === side) g.push([w.at - (w.w ?? 1.4) / 2, w.at + (w.w ?? 1.4) / 2, w.bottom ?? 1.1, w.top ?? 2.1]);
      return g;
    };
    this.wallX(x0, x1, z1 - t / 2, y, o.h, t, o.mat, o.color, gapsFor('N'));
    this.wallX(x0, x1, z0 + t / 2, y, o.h, t, o.mat, o.color, gapsFor('S'));
    this.wallZ(z0 + t, z1 - t, x0 + t / 2, y, o.h, t, o.mat, o.color, gapsFor('W'));
    this.wallZ(z0 + t, z1 - t, x1 - t / 2, y, o.h, t, o.mat, o.color, gapsFor('E'));
    const roofC = o.roofColor ?? 0x6a6e72;
    const roof = o.roof ?? 'flat';
    if (roof === 'flat') {
      this.aabb(x0, y + o.h, z0, x1, y + o.h + 0.3, z1, 'concrete', roofC);
    } else if (roof === 'pitched') {
      // Flat collider slab hidden under a visual gable roof.
      this.aabb(x0, y + o.h, z0, x1, y + o.h + 0.2, z1, 'wood', roofC, { visible: false });
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const w = x1 - x0 + 0.8;
      const d = z1 - z0 + 0.8;
      this.prop({ kind: 'prism', x: cx, y: y + o.h, z: cz, r: w, h: Math.min(w, d) * 0.42, d, color: roofC, mat: 'wood', axis: w >= d ? 'x' : 'z' });
    } else if (roof === 'access') {
      // Stairs along the inside of the west wall climbing north, with a hatch above the top steps.
      // The hatch is wider than the stairs so a 1m nav column always has headroom.
      const sw = 1.6;
      const ix0 = x0 + t;
      const iz1 = z1 - t;
      const stepRise = 0.42;
      const run = 0.55;
      const n = Math.ceil(o.h / stepRise);
      const len = n * run;
      const startZ = iz1 - len;
      this.stairs(ix0 + sw / 2, startZ, 'N', sw, y, o.h + 0.3, 'metal', 0x6b7177, (o.h + 0.3) / n + 1e-6, run);
      const hatchZ0 = iz1 - 3.4;
      const hatchX1 = ix0 + sw + 0.5;
      const ry0 = y + o.h;
      const ry1 = y + o.h + 0.3;
      this.aabb(x0, ry0, z0, x1, ry1, hatchZ0, 'concrete', roofC);
      this.aabb(hatchX1, ry0, hatchZ0, x1, ry1, z1, 'concrete', roofC);
      this.aabb(x0, ry0, iz1, hatchX1, ry1, z1, 'concrete', roofC);
      const p = o.parapet ?? 0.9;
      if (p > 0) {
        this.aabb(x0, ry1, z0, x1, ry1 + p, z0 + 0.25, o.mat, o.color);
        this.aabb(x0, ry1, z1 - 0.25, x1, ry1 + p, z1, o.mat, o.color);
        this.aabb(x0, ry1, z0 + 0.25, x0 + 0.25, ry1 + p, z1 - 0.25, o.mat, o.color);
        this.aabb(x1 - 0.25, ry1, z0 + 0.25, x1, ry1 + p, z1 - 0.25, o.mat, o.color);
      }
    }
  }

  /** Flat platform with its top at `top`. */
  platform(x0: number, z0: number, x1: number, z1: number, top: number, thick: number, mat: MatId, color: number): void {
    this.aabb(x0, top - thick, z0, x1, top, z1, mat, color);
  }

  post(cx: number, cz: number, y0: number, y1: number, size = 0.3, color = 0x5d6266, mat: MatId = 'metal'): void {
    this.aabb(cx - size / 2, y0, cz - size / 2, cx + size / 2, y1, cz + size / 2, mat, color);
  }

  prop(p: Prop): void {
    // Horizontal cylinders are placed by their start point; mirroring must
    // move the start to the other end so the span lands in the same place.
    let x = this.fx(p.x);
    let z = this.fz(p.z);
    if (this.flip && p.kind === 'cylinder' && p.axis === 'x') x -= p.h;
    if (this.flip && p.kind === 'cylinder' && p.axis === 'z') z -= p.h;
    this.props.push({ ...p, x, z, rotY: p.rotY !== undefined && this.flip ? p.rotY + Math.PI : p.rotY });
  }

  /** Spawn facing yaw (radians, 0 = looking toward -Z). Flipped spawns go to team 1. */
  spawn(x: number, z: number, yaw: number, y = 0): void {
    this.spawns.push({ x: this.fx(x), y, z: this.fz(z), yaw: this.flip ? yaw + Math.PI : yaw, team: this.flip ? 1 : 0 });
  }

  /** Invisible boundary walls around the playable area. */
  bounds(minX: number, maxX: number, minZ: number, maxZ: number, h = 40): void {
    const saved = this.flip;
    this.flip = false;
    const inv = { visible: false };
    this.aabb(minX - 2, -5, minZ - 2, minX, h, maxZ + 2, 'plain', 0, inv);
    this.aabb(maxX, -5, minZ - 2, maxX + 2, h, maxZ + 2, 'plain', 0, inv);
    this.aabb(minX, -5, minZ - 2, maxX, h, minZ, 'plain', 0, inv);
    this.aabb(minX, -5, maxZ, maxX, h, maxZ + 2, 'plain', 0, inv);
    this.aabb(minX - 2, h, minZ - 2, maxX + 2, h + 2, maxZ + 2, 'plain', 0, inv);
    this.flip = saved;
  }

  /** Run `fn` for this half, then again rotated 180° for the other half. */
  symmetric(fn: (b: MapBuilder) => void): void {
    this.flip = false;
    fn(this);
    this.flip = true;
    fn(this);
    this.flip = false;
  }
}

/** Yaw that faces from (x, z) toward (tx, tz). Yaw 0 looks toward -Z. */
export function yawTo(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}
