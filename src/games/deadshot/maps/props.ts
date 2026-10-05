/**
 * Deadshot prop library
 * =====================
 * Detailed low-poly decorations built on top of MapBuilder. Every helper has the
 * shape `name(b, x, z, opts?)` (fences/pipes take two end points) and works inside
 * `b.symmetric(...)`: the mirrored copy is rotated 180° around the origin, never
 * reflected, so seeded shapes and sign text stay correct.
 *
 * Conventions
 * - Meters, +Y up. (x, z) is the footprint center on the ground; `y` lifts the prop
 *   (default 0). To sit a prop on a roof/platform use `y: b.groundAt(x, z).y`.
 * - Orientation: props with colliders take `dir: Dir` ('N' = front faces +Z,
 *   'E' = +X, 'S' = -Z, 'W' = -X) because colliders are axis-aligned boxes.
 *   Visual-only props take `rot` (radians, any angle; 0 = front faces +Z).
 * - Collision: [C] = adds invisible AABB colliders (block movement and bullets),
 *   [V] = visual only. Most [C] props accept `collide: false`. Keep [C] props off
 *   spawns/objectives and out of 1-wide corridors, then run `npm run check:maps`.
 * - Colors are 0xRRGGBB tints over the grayscale material textures (MatId).
 *
 * Index
 *   Industrial  pallet [V] · palletStack [C] · drum [C] · barrels [C] · sandbags [C] · jersey [C]
 *               cableSpool [C] · generator [C] · acUnit [C] · roofVent [V] · pipeRun [V|C] · pipeLine [V]
 *               ladder [V] · trafficCone [V] · streetLamp [C pole] · lantern [C post] · container [C]
 *               tank [C] · crateStack [C] · debris [V] · hazardFloor [V]
 *   Buildings   detailedBuilding [C walls, like b.building] · frameOpening [V] · trimRect [V]
 *               awning [V] · sign [V] · wallWindows [V] · chimney [V]
 *   Fences      fence [C|V] (chain, wood, boards, picket, rail)
 *   Nature      tree [C trunk] (pine, oak, birch, dead, snowpine) · bush [V] · rockCluster [C]
 *               logPile [C] · snowCap [V] · grassPatch [V, instanced]
 *   Vehicles    truck [C] · van [C] · forklift [C] · car [C]
 *   Ground      puddle / oil / decal helpers are on the builder: b.decal, b.ribbon (paths, lines)
 *
 * Builder primitives (maps/builder.ts) used by these helpers and available directly:
 *   b.aabb / b.box / b.wallX / b.wallZ / b.stairs / b.platform / b.post     collision boxes
 *   b.prop({ kind, x, y, z, r, h, d, color, mat, rotY, rotX, rotZ, ... })  visual mesh:
 *       box | ellipsoid | rock | blob    r = width (X), h = height, d = depth (Z); pivot = bottom center
 *       cylinder | cone                 r = radius, h = height (cylinder: d = top radius ratio,
 *                                       axis 'x'/'z' = lying, starting at x/z); cone: jag = star skirt
 *       extrude                         profile [[z, y]...] swept along local X for length r
 *       sphere | prism | mountain       see builder.ts
 *     Rotations are radians in YXZ order about the pivot. `seed` varies rock/blob/cone jitter.
 *   b.decal(id, x, z, w, d, { rot, y, color })   flat ground decal (DecalId: puddle, oil, crack, ...)
 *   b.ribbon(id, pts, width, { y, color })        strip along a polyline (RibbonId: path, line, ...)
 *   b.panel(id, x, y, z, w, h, rot, color?)       upright textured quad (PanelId: window, door, ...)
 *   b.sign(text, x, y, z, w, h, rot, { bg, fg })  canvas-text sign face facing local +Z
 *   b.glow(x, y, z, size, color)                  additive halo sprite (lamps, flares)
 *   b.scatter / b.scatterArea                     instanced grass, flowers, pebbles, debris, ...
 *   b.groundAt(x, z) -> { y, mat }                top of the highest box under a point
 */
import type { Box, MatId } from '../world';
import { MapBuilder, rng, type Dir, type Prop } from './builder';

const QUARTER: Record<Dir, number> = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };

/** Rotation (radians) for a facing direction. */
export function dirRot(d: Dir): number {
  return QUARTER[d];
}

type Extra = Partial<Pick<Prop, 'rotX' | 'rotZ' | 'seed' | 'jag' | 'ao' | 'segments' | 'emissive' | 'profile'>> & { rotY?: number };

/**
 * Local coordinate frame: +X right, +Z front, rotated by `rot` around (x, z).
 * Converts local placements to builder calls.
 */
class Frame {
  readonly c: number;
  readonly s: number;
  constructor(
    readonly b: MapBuilder,
    readonly x: number,
    readonly z: number,
    readonly rot = 0,
    readonly y = 0,
  ) {
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
  }
  wx(lx: number, lz: number): number {
    return this.x + lx * this.c + lz * this.s;
  }
  wz(lx: number, lz: number): number {
    return this.z - lx * this.s + lz * this.c;
  }
  /** Visual shape with its bottom center at local (lx, ly, lz). */
  shape(kind: 'box' | 'ellipsoid' | 'rock' | 'blob', lx: number, ly: number, lz: number, w: number, h: number, d: number, color: number, mat: MatId, o: Extra = {}): void {
    const { rotY = 0, ...rest } = o;
    this.b.prop({ kind, x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), r: w, h, d, color, mat, rotY: this.rot + rotY, ...rest });
  }
  box(lx: number, ly: number, lz: number, w: number, h: number, d: number, color: number, mat: MatId = 'steel', o: Extra = {}): void {
    this.shape('box', lx, ly, lz, w, h, d, color, mat, o);
  }
  /** Upright cylinder (topRatio scales the top radius). */
  cyl(lx: number, ly: number, lz: number, r: number, h: number, color: number, mat: MatId = 'steel', seg = 10, topRatio = 1, o: Extra = {}): void {
    const { rotY = 0, ...rest } = o;
    this.b.prop({ kind: 'cylinder', x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), r, h, d: topRatio, color, mat, segments: seg, rotY: this.rot + rotY, ...rest });
  }
  /** Lying cylinder starting at local (lx, ly, lz) running `len` along local X or Z (ly = axis height). */
  hcyl(lx: number, ly: number, lz: number, axis: 'x' | 'z', len: number, r: number, color: number, mat: MatId = 'steel', seg = 10, o: Extra = {}): void {
    const tilt = axis === 'x' ? { rotZ: -Math.PI / 2 } : { rotX: Math.PI / 2 };
    const { rotY = 0, ...rest } = o;
    this.b.prop({ kind: 'cylinder', x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), r, h: len, color, mat, segments: seg, rotY: this.rot + rotY, ...tilt, ao: false, ...rest });
  }
  cone(lx: number, ly: number, lz: number, r: number, h: number, color: number, mat: MatId, seg = 8, o: Extra = {}): void {
    const { rotY = 0, ...rest } = o;
    this.b.prop({ kind: 'cone', x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), r, h, color, mat, segments: seg, rotY: this.rot + rotY, ...rest });
  }
  /** Extruded profile ([z, y] points) swept `len` along local X, centered at (lx, ly, lz). */
  extrude(lx: number, ly: number, lz: number, len: number, profile: [number, number][], color: number, mat: MatId, o: Extra = {}): void {
    const { rotY = 0, ...rest } = o;
    this.b.prop({ kind: 'extrude', x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), r: len, h: 0, profile, color, mat, rotY: this.rot + rotY, ...rest });
  }
  emissive(lx: number, ly: number, lz: number, w: number, h: number, d: number, color: number, o: Extra = {}): void {
    this.shape('box', lx, ly, lz, w, h, d, color, 'plain', { ...o, emissive: color });
  }
  panel(id: Parameters<MapBuilder['panel']>[0], lx: number, ly: number, lz: number, w: number, h: number, extraRot = 0, color = 0xffffff): void {
    this.b.panel(id, this.wx(lx, lz), this.y + ly, this.wz(lx, lz), w, h, this.rot + extraRot, color);
  }
  glow(lx: number, ly: number, lz: number, size: number, color: number): void {
    this.b.glow(this.wx(lx, lz), this.y + ly, this.wz(lx, lz), size, color);
  }
  /** Invisible collider from local center/bottom/size. Only valid for quarter-turn frames. */
  solid(lx: number, ly: number, lz: number, w: number, h: number, d: number, mat: MatId = 'plain', color = 0x808080, opts: Partial<Box> = {}): void {
    const q = (((Math.round(this.rot / (Math.PI / 2)) % 2) + 2) % 2) === 1;
    this.b.box(this.wx(lx, lz), this.y + ly, this.wz(lx, lz), q ? d : w, h, q ? w : d, mat, color, { visible: false, ...opts });
  }
}

const jit = (r: () => number, a: number) => (r() - 0.5) * 2 * a;
/**
 * Default seed derived from the authoring position, so a prop looks the same in both
 * halves of a symmetric map and on every client regardless of map build order.
 */
const posSeed = (x: number, z: number, salt = 0) => (Math.floor(Math.abs(x * 73.13 + z * 37.71 + salt * 11.3) * 10) % 2147483646) + 1;

// ---------------------------------------------------------------------------
// Industrial

/** [V] Wooden pallet, 1.2 x 0.14 x 1.0 m. */
export function pallet(b: MapBuilder, x: number, z: number, o: { rot?: number; y?: number; color?: number } = {}): void {
  const f = new Frame(b, x, z, o.rot ?? 0, o.y ?? 0);
  const c = o.color ?? 0xb8925c;
  const dark = shade(c, 0.82);
  for (const lz of [-0.45, 0, 0.45]) {
    f.box(0, 0, lz, 1.2, 0.022, 0.1, dark, 'wood');
    for (const lx of [-0.54, 0, 0.54]) f.box(lx, 0.022, lz, 0.12, 0.08, 0.1, dark, 'wood', { ao: false });
    f.box(0, 0.102, lz, 1.2, 0.022, 0.1, c, 'wood', { ao: false });
  }
  for (let i = 0; i < 7; i++) f.box(-0.54 + i * 0.18, 0.124, 0, 0.12, 0.02, 1.0, c, 'wood', { ao: false });
}

/** [C] Stack of pallets, optionally topped with shrink-wrapped boxes. */
export function palletStack(b: MapBuilder, x: number, z: number, o: { count?: number; dir?: Dir; y?: number; color?: number; cargo?: 'boxes' | 'sacks' | null; seed?: number; collide?: boolean } = {}): void {
  const n = o.count ?? 4;
  const rot = dirRot(o.dir ?? 'N');
  const r = rng(o.seed ?? posSeed(x, z));
  const y = o.y ?? 0;
  for (let i = 0; i < n; i++) pallet(b, x, z, { rot: rot + jit(r, 0.05), y: y + i * 0.144, color: o.color });
  let top = n * 0.144;
  const f = new Frame(b, x, z, rot, y);
  if (o.cargo === 'boxes') {
    const ch = 0.9;
    f.box(0, top, 0, 1.16, ch, 0.96, 0xc89f68, 'crate', { seed: 1 });
    f.box(0, top, 0, 1.18, ch * 0.92, 0.98, 0xdfe6e8, 'plain', { ao: false });
    top += ch;
  } else if (o.cargo === 'sacks') {
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 3; i++) f.shape('ellipsoid', -0.38 + i * 0.38, top + row * 0.2, (row ? 0.18 : -0.18) + jit(r, 0.03), 0.42, 0.24, 0.62, 0xd9cfae, 'plaster', { rotY: Math.PI / 2 + jit(r, 0.2), ao: false });
    top += 0.42;
  }
  if (o.collide ?? top > 0.5) f.solid(0, 0, 0, 1.2, top, 1.0, 'wood', o.color ?? 0xb8925c);
}

/** [C] Detailed 200 l drum (r 0.3, h 0.9 by default). `fallen` lays it along local X. */
export function drum(b: MapBuilder, x: number, z: number, o: { color?: number; y?: number; rot?: number; r?: number; h?: number; fallen?: boolean; collide?: boolean } = {}): void {
  const c = o.color ?? 0x2f6fa0;
  const r = o.r ?? 0.3;
  const h = o.h ?? 0.9;
  const f = new Frame(b, x, z, o.rot ?? 0, o.y ?? 0);
  if (o.fallen) {
    f.hcyl(-h / 2, r, 0, 'x', h, r, c, 'steel', 14);
    for (const t of [0.02, 0.33, 0.64, 0.95]) f.hcyl(-h / 2 + t * h - 0.015, r, 0, 'x', 0.03, r * 1.04, shade(c, 0.85), 'steel', 14);
    if (o.collide ?? false) f.solid(0, 0, 0, h, r * 2, r * 2, 'steel', c);
    return;
  }
  f.cyl(0, 0, 0, r, h, c, 'steel', 14);
  for (const t of [0, 0.33, 0.64]) f.cyl(0, t * h, 0, r * 1.04, 0.035, shade(c, 0.85), 'steel', 14, 1, { ao: false });
  f.cyl(0, h - 0.01, 0, r * 1.05, 0.04, shade(c, 0.8), 'steel', 14, 1, { ao: false });
  f.cyl(0, h - 0.005, 0, r * 0.92, 0.02, shade(c, 0.65), 'steel', 14, 1, { ao: false });
  f.cyl(r * 0.5, h, 0.05, 0.05, 0.035, 0x9aa0a4, 'steel', 6, 1, { ao: false });
  if (o.collide ?? true) f.solid(0, 0, 0, r * 2.1, h, r * 2.1, 'steel', c);
}

/** [C] Cluster of drums around (x, z). One may lie on its side when `fallen` is set. */
export function barrels(b: MapBuilder, x: number, z: number, o: { count?: number; colors?: number[]; seed?: number; fallen?: boolean; collide?: boolean } = {}): void {
  const r = rng(o.seed ?? posSeed(x, z));
  const cols = o.colors ?? [0x2f6fa0, 0x2f6fa0, 0x9a3030, 0xc9a227];
  const spots = [[0, 0], [0.64, 0.12], [0.3, -0.58], [-0.36, 0.55], [-0.6, -0.2], [0.95, -0.5]];
  const n = Math.min(o.count ?? 3, spots.length);
  for (let i = 0; i < n; i++) drum(b, x + spots[i][0] + jit(r, 0.04), z + spots[i][1] + jit(r, 0.04), { color: cols[i % cols.length], rot: r() * 6.28, collide: o.collide });
  if (o.fallen) drum(b, x - 0.2, z - 1.25, { color: cols[0], rot: r() * 0.6 - 0.3, fallen: true, collide: o.collide });
}

/** [C] Sandbag wall `len` m long along `axis`, `rows` high (each row ~0.17 m). */
export function sandbags(b: MapBuilder, x: number, z: number, o: { len?: number; rows?: number; axis?: 'x' | 'z'; y?: number; color?: number; seed?: number; collide?: boolean } = {}): void {
  const len = o.len ?? 3;
  const rows = o.rows ?? 4;
  const f = new Frame(b, x, z, o.axis === 'z' ? Math.PI / 2 : 0, o.y ?? 0);
  const r = rng(o.seed ?? posSeed(x, z));
  const c = o.color ?? 0xb5a47a;
  const bw = 0.56;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? bw / 2 : 0;
    const depthRows = row < rows - 1 ? 2 : 1;
    for (let dz = 0; dz < depthRows; dz++) {
      const lz = depthRows === 2 ? (dz ? 0.16 : -0.16) : 0;
      for (let lx = -len / 2 + bw / 2 + off; lx <= len / 2 - bw / 2 + 0.01; lx += bw) {
        const k = 0.9 + r() * 0.16;
        f.shape('ellipsoid', lx + jit(r, 0.02), row * 0.165 - 0.02, lz + jit(r, 0.02), bw * 1.04, 0.22, 0.36, shade(c, k), 'plaster', { rotY: jit(r, 0.08), ao: row === 0 });
      }
    }
  }
  if (o.collide ?? true) f.solid(0, 0, 0, len, rows * 0.165 + 0.04, 0.62, 'dirt', c);
}

const JERSEY: [number, number][] = [
  [-0.5, 0],
  [0.5, 0],
  [0.5, 0.1],
  [0.2, 0.36],
  [0.15, 1],
  [-0.15, 1],
  [-0.2, 0.36],
  [-0.5, 0.1],
];

/**
 * [C] Concrete jersey barrier run: segments ~2 m along `axis`, profile scaled to
 * `h` x `depth` (defaults 0.85 x 0.62), so it can dress an existing cover box exactly.
 */
export function jersey(b: MapBuilder, x: number, z: number, o: { len?: number; axis?: 'x' | 'z'; h?: number; depth?: number; color?: number; y?: number; stripe?: boolean; collide?: boolean } = {}): void {
  const len = o.len ?? 2;
  const h = o.h ?? 0.85;
  const dep = o.depth ?? 0.62;
  const f = new Frame(b, x, z, o.axis === 'z' ? Math.PI / 2 : 0, o.y ?? 0);
  const n = Math.max(1, Math.round(len / 2));
  const seg = len / n;
  const prof = JERSEY.map(([pz, py]) => [pz * dep, py * h] as [number, number]);
  const c = o.color ?? 0xb9b5ad;
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + seg * (i + 0.5);
    f.extrude(cx, 0, 0, seg - 0.04, prof, shade(c, 0.96 + (i % 2) * 0.05), 'concrete');
    if (o.stripe) for (const sz of [-1, 1]) f.box(cx, h * 0.55, sz * dep * 0.19, seg * 0.7, 0.12, 0.012, 0xd8b23a, 'stripe', { ao: false, rotX: sz * 0.12 });
  }
  if (o.collide ?? true) f.solid(0, 0, 0, len, h, dep, 'concrete', c);
}

/** [C] Wooden cable spool standing on its rims (axle along `axis`). */
export function cableSpool(b: MapBuilder, x: number, z: number, o: { r?: number; w?: number; axis?: 'x' | 'z'; color?: number; cable?: number; y?: number; collide?: boolean } = {}): void {
  const r = o.r ?? 0.65;
  const w = o.w ?? 0.75;
  const f = new Frame(b, x, z, o.axis === 'z' ? Math.PI / 2 : 0, o.y ?? 0);
  const c = o.color ?? 0xa47a4c;
  f.hcyl(-w / 2, r, 0, 'x', 0.07, r, c, 'wood', 16);
  f.hcyl(w / 2 - 0.07, r, 0, 'x', 0.07, r, c, 'wood', 16);
  f.hcyl(-w / 2 + 0.07, r, 0, 'x', w - 0.14, r * 0.72, o.cable ?? 0x2a2c2e, 'plain', 14);
  f.hcyl(-w / 2 - 0.02, r, 0, 'x', w + 0.04, 0.09, 0x6a6d70, 'steel', 8);
  if (o.collide ?? r >= 0.45) f.solid(0, 0, 0, w, r * 2, r * 2, 'wood', c);
}

/** [C] Skid-mounted diesel generator, ~2.4 x 1.5 x 1.1 m, front (panel side) facing `dir`. */
export function generator(b: MapBuilder, x: number, z: number, o: { dir?: Dir; color?: number; y?: number; collide?: boolean } = {}): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), o.y ?? 0);
  const c = o.color ?? 0xd0a033;
  for (const lz of [-0.4, 0.4]) f.box(0, 0, lz, 2.5, 0.12, 0.14, 0x3a3d40, 'steel');
  f.box(0, 0.12, 0, 2.3, 1.12, 1.0, c, 'steel');
  f.box(0, 1.24, 0, 2.38, 0.08, 1.08, shade(c, 0.85), 'steel', { ao: false });
  f.panel('vent', -0.55, 0.35, 0.505, 0.9, 0.55, 0, 0xd8d8d8);
  f.panel('vent', 0.55, 0.35, 0.505, 0.9, 0.55, 0, 0xd8d8d8);
  f.panel('vent', 0.3, 0.35, -0.505, 1.3, 0.55, Math.PI, 0xd8d8d8);
  f.box(-0.75, 0.75, 0.5, 0.42, 0.34, 0.06, 0x2c3034, 'steel', { ao: false });
  f.emissive(-0.85, 0.95, 0.535, 0.06, 0.04, 0.01, 0x7dff8a);
  f.cyl(0.85, 1.32, -0.2, 0.07, 0.55, 0x45484b, 'steel', 8, 1, { ao: false });
  f.cyl(0.85, 1.85, -0.2, 0.09, 0.05, 0x2a2c2e, 'steel', 8, 1, { ao: false });
  f.cyl(-0.9, 1.32, -0.25, 0.08, 0.05, 0x26282a, 'steel', 8, 1, { ao: false });
  if (o.collide ?? true) f.solid(0, 0, 0, 2.5, 1.32, 1.1, 'steel', c);
}

/** [C] Rooftop AC unit ~1.2 x 0.95 x 1.0 m with a fan grille on top. */
export function acUnit(b: MapBuilder, x: number, z: number, o: { dir?: Dir; y?: number; color?: number; collide?: boolean } = {}): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), o.y ?? 0);
  const c = o.color ?? 0xc7cbcc;
  for (const lx of [-0.5, 0.5]) f.box(lx, 0, 0, 0.1, 0.1, 0.95, 0x55595c, 'steel');
  f.box(0, 0.1, 0, 1.2, 0.82, 1.0, c, 'steel');
  f.box(0, 0.92, 0, 1.24, 0.04, 1.04, shade(c, 0.9), 'steel', { ao: false });
  f.panel('vent', 0, 0.2, 0.505, 1.05, 0.62, 0, 0xe0e0e0);
  f.panel('vent', 0.605, 0.2, 0, 0.9, 0.62, Math.PI / 2, 0xe0e0e0);
  f.cyl(0, 0.96, 0, 0.38, 0.06, 0x3a3d40, 'steel', 14, 1, { ao: false });
  b.panel('fan', f.wx(0, 0), (o.y ?? 0) + 1.025, f.wz(0, 0), 0.74, 0.74, f.rot, 0xd0d0d0, true);
  if (o.collide ?? true) f.solid(0, 0, 0, 1.24, 0.96, 1.04, 'steel', c);
}

/** [V] Roof vent: 'mushroom' (round cap), 'box' (louvred hood) or 'pipe' (stack). */
export function roofVent(b: MapBuilder, x: number, z: number, o: { y?: number; kind?: 'mushroom' | 'box' | 'pipe'; color?: number; rot?: number } = {}): void {
  const f = new Frame(b, x, z, o.rot ?? 0, o.y ?? 0);
  const c = o.color ?? 0xa9adb0;
  const k = o.kind ?? 'mushroom';
  if (k === 'mushroom') {
    f.cyl(0, 0, 0, 0.18, 0.45, c, 'steel', 10);
    f.cone(0, 0.45, 0, 0.36, 0.22, shade(c, 1.05), 'steel', 12);
    f.cyl(0, 0.4, 0, 0.34, 0.06, shade(c, 0.8), 'steel', 12, 1, { ao: false });
  } else if (k === 'box') {
    f.box(0, 0, 0, 0.7, 0.5, 0.7, c, 'steel');
    f.panel('vent', 0, 0.08, 0.355, 0.6, 0.34, 0, 0xd0d0d0);
    f.box(0, 0.5, 0, 0.8, 0.06, 0.8, shade(c, 0.85), 'steel', { ao: false });
  } else {
    f.cyl(0, 0, 0, 0.11, 1.1, c, 'steel', 8);
    f.cyl(0, 1.1, 0, 0.14, 0.08, shade(c, 0.7), 'steel', 8, 1, { ao: false });
  }
}

/**
 * [V|C] Straight pipe run at height `y` from (x0, z0) to (x1, z1), with flanges
 * and optional H-frame supports down to `base` (default ground 0). `count` pipes
 * run side by side, `gap` apart. `collide` adds one AABB per pipe (axis-aligned runs only).
 */
export function pipeRun(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, o: { y?: number; r?: number; color?: number; count?: number; gap?: number; flangeEvery?: number; supports?: boolean; supportEvery?: number; base?: number; collide?: boolean; colors?: number[] } = {}): void {
  const y = o.y ?? 2.5;
  const r = o.r ?? 0.18;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(z0 - z1, x1 - x0); // local +X along the run
  const f = new Frame(b, x0, z0, rot, 0);
  const n = o.count ?? 1;
  const gap = o.gap ?? r * 2 + 0.12;
  const base = o.base ?? 0;
  for (let i = 0; i < n; i++) {
    const lz = (i - (n - 1) / 2) * gap;
    const c = o.colors?.[i % o.colors.length] ?? o.color ?? 0x8a8f94;
    f.hcyl(0, y, lz, 'x', len, r, c, 'steel', 12);
    const fe = o.flangeEvery ?? 3;
    for (let t = fe / 2; t < len; t += fe) f.hcyl(t - 0.05, y, lz, 'x', 0.1, r * 1.32, shade(c, 0.85), 'steel', 12);
    if (o.collide) {
      const cx = (x0 + x1) / 2 + (-lz * f.s);
      const cz = (z0 + z1) / 2 + lz * f.c;
      const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      b.box(cx, y - r, cz, ax ? len : r * 2, r * 2, ax ? r * 2 : len, 'steel', c, { visible: false });
    }
  }
  if (o.supports ?? true) {
    const se = o.supportEvery ?? 4;
    const half = ((n - 1) / 2) * gap + r + 0.15;
    for (let t = Math.min(se / 2, len / 2); t < len; t += se) {
      for (const s of [-half, half]) f.box(t, base, s, 0.12, y - r - base, 0.12, 0x5d6266, 'steel');
      f.box(t, y - r - 0.12, 0, 0.14, 0.12, half * 2 + 0.12, 0x5d6266, 'steel', { ao: false });
    }
  }
}

/** [V] Pipe through 3D points [x, y, z] with elbow joints (use for vertical drops and bends). */
export function pipeLine(b: MapBuilder, pts: [number, number, number][], o: { r?: number; color?: number } = {}): void {
  const r = o.r ?? 0.15;
  const c = o.color ?? 0x8a8f94;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) continue;
    b.prop({ kind: 'cylinder', x: ax, y: ay, z: az, r, h: len, color: c, mat: 'steel', segments: 10, rotY: Math.atan2(dx, dz), rotX: Math.acos(Math.max(-1, Math.min(1, dy / len))), ao: false });
    if (i > 0) b.prop({ kind: 'sphere', x: ax, y: ay, z: az, r: r * 1.12, h: 0, color: shade(c, 0.9), mat: 'steel', segments: 8 });
  }
}

/** [V] Ladder against a wall; `dir` is the direction the climber faces away from (the wall normal). */
export function ladder(b: MapBuilder, x: number, z: number, o: { y0?: number; y1: number; dir?: Dir; w?: number; color?: number; cage?: boolean }): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), 0);
  const y0 = o.y0 ?? 0;
  const w = o.w ?? 0.5;
  const c = o.color ?? 0x6d7378;
  for (const s of [-w / 2, w / 2]) f.box(s, y0, 0.08, 0.05, o.y1 - y0 + 0.9, 0.05, c, 'steel', { ao: false });
  for (let y = y0 + 0.3; y < o.y1 + 0.1; y += 0.3) f.box(0, y, 0.08, w, 0.035, 0.035, c, 'steel', { ao: false });
  if (o.cage)
    for (let y = y0 + 2.4; y < o.y1 + 0.8; y += 0.9) {
      f.box(0, y, 0.75, w + 0.3, 0.04, 0.04, c, 'steel', { ao: false });
      for (const s of [-1, 1]) f.box(s * (w / 2 + 0.15), y, 0.42, 0.04, 0.04, 0.66, c, 'steel', { ao: false });
    }
}

/** [V] Traffic cone (orange with reflective band). */
export function trafficCone(b: MapBuilder, x: number, z: number, o: { rot?: number; y?: number; fallen?: boolean } = {}): void {
  const f = new Frame(b, x, z, o.rot ?? 0, o.y ?? 0);
  if (o.fallen) {
    f.box(0, 0, 0, 0.36, 0.03, 0.36, 0x2a2a2a, 'plain', { rotZ: 1.2 });
    b.prop({ kind: 'cone', x: f.wx(0.02, 0), y: (o.y ?? 0) + 0.15, z: f.wz(0.02, 0), r: 0.14, h: 0.52, color: 0xf06a1c, mat: 'plain', segments: 10, rotY: f.rot, rotZ: -Math.PI / 2 + 0.25, ao: false });
    return;
  }
  f.box(0, 0, 0, 0.38, 0.035, 0.38, 0x2a2a2a, 'plain');
  f.cyl(0, 0.035, 0, 0.15, 0.5, 0xf06a1c, 'plain', 10, 0.12);
  f.cyl(0, 0.24, 0, 0.105, 0.09, 0xf2f2f2, 'plain', 10, 0.85, { ao: false });
}

/**
 * [C pole] Street lamp `h` m tall with an arm reaching toward `rot` (0 = +Z),
 * emissive head, halo and a light pool decal on the ground.
 */
export function streetLamp(b: MapBuilder, x: number, z: number, o: { h?: number; rot?: number; color?: number; light?: number; y?: number; arm?: number; collide?: boolean; pool?: boolean } = {}): void {
  const h = o.h ?? 6;
  const y = o.y ?? 0;
  const f = new Frame(b, x, z, o.rot ?? 0, y);
  const c = o.color ?? 0x50565b;
  const L = o.light ?? 0xfff0c0;
  const arm = o.arm ?? 1.3;
  f.cyl(0, 0, 0, 0.2, 0.35, shade(c, 0.85), 'steel', 8);
  f.cyl(0, 0.35, 0, 0.1, h - 0.35, c, 'steel', 8, 0.7);
  f.box(0, h - 0.12, arm / 2 - 0.05, 0.08, 0.08, arm, c, 'steel', { ao: false });
  f.box(0, h - 0.4, 0.25, 0.05, 0.05, 0.6, c, 'steel', { rotX: -0.65, ao: false });
  f.box(0, h - 0.2, arm, 0.38, 0.14, 0.62, shade(c, 0.8), 'steel', { ao: false });
  f.emissive(0, h - 0.23, arm, 0.3, 0.03, 0.5, L);
  f.glow(0, h - 0.32, arm, 2.2, L);
  if (o.pool ?? true) b.decal('light', f.wx(0, arm), f.wz(0, arm), 6, 6, { y: y + 0.015, color: L });
  if (o.collide ?? true) b.box(x, y, z, 0.22, h, 0.22, 'steel', c, { visible: false });
}

/** [C post] Old-town lantern post (snowfall style). */
export function lantern(b: MapBuilder, x: number, z: number, o: { h?: number; y?: number; color?: number; light?: number; collide?: boolean; rot?: number } = {}): void {
  const h = o.h ?? 3.4;
  const y = o.y ?? 0;
  const f = new Frame(b, x, z, o.rot ?? 0, y);
  const c = o.color ?? 0x2e2a28;
  const L = o.light ?? 0xffc870;
  f.cyl(0, 0, 0, 0.16, 0.5, c, 'steel', 8, 0.75);
  f.cyl(0, 0.5, 0, 0.07, h - 0.5, c, 'steel', 8);
  f.box(0, h - 0.06, 0, 0.36, 0.06, 0.36, c, 'steel', { ao: false });
  f.emissive(0, h, 0, 0.3, 0.42, 0.3, L);
  for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) f.box(lx, h, lz, 0.04, 0.44, 0.04, c, 'steel', { ao: false });
  f.box(0, h + 0.44, 0, 0.42, 0.05, 0.42, c, 'steel', { ao: false });
  f.cone(0, h + 0.49, 0, 0.3, 0.24, c, 'steel', 4, { rotY: Math.PI / 4 });
  f.glow(0, h + 0.22, 0, 1.8, L);
  b.decal('light', x, z, 4.5, 4.5, { y: y + 0.015, color: L });
  if (o.collide ?? true) b.box(x, y, z, 0.18, h, 0.18, 'steel', c, { visible: false });
}

/**
 * [C] 6 m shipping container with doors (on the `doors` end), corner castings and
 * top rails. Same collider as `b.container`. `alongX` = long side along X.
 */
export function container(b: MapBuilder, cx: number, cz: number, alongX: boolean, color: number, o: { y?: number; doors?: 1 | -1; open?: boolean } = {}): void {
  const y = o.y ?? 0;
  b.container(cx, cz, alongX, color, y);
  const f = new Frame(b, cx, cz, alongX ? 0 : Math.PI / 2, y);
  const L = 6.1;
  const W = 2.45;
  const H = 2.6;
  const dark = shade(color, 0.72);
  // corner posts + castings
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      f.box(sx * (L / 2 - 0.06), 0, sz * (W / 2 - 0.06), 0.14, H, 0.14, dark, 'steel', { ao: false });
      for (const cy of [0, H - 0.12]) f.box(sx * (L / 2 - 0.08), cy, sz * (W / 2 - 0.08), 0.18, 0.12, 0.18, 0x3b3d3f, 'steel', { ao: false });
    }
  for (const sz of [-1, 1]) {
    f.box(0, H - 0.1, sz * (W / 2 + 0.005), L - 0.3, 0.1, 0.03, dark, 'steel', { ao: false });
    f.box(0, 0, sz * (W / 2 + 0.005), L - 0.3, 0.12, 0.03, dark, 'steel', { ao: false });
  }
  const end = (o.doors ?? 1) * (L / 2 + 0.015);
  // door bars + handles
  for (const lz of [-0.82, -0.42, 0.42, 0.82]) f.box(end, 0.12, lz, 0.03, H - 0.26, 0.05, shade(color, 0.6), 'steel', { ao: false });
  for (const lz of [-0.62, 0.62]) f.box(end + Math.sign(end) * 0.02, 1.0, lz, 0.03, 0.05, 0.28, 0x2c2e30, 'steel', { ao: false });
  f.box(end, 0.12, 0, 0.02, H - 0.24, 0.025, 0x1e2022, 'plain', { ao: false });
}

/** [C] Storage tank (same colliders as `b.tank`) with bands, a caged ladder, roof rail and plinth. */
export function tank(b: MapBuilder, cx: number, cz: number, r: number, h: number, color: number, o: { y?: number; ladder?: Dir; bands?: number; label?: string; labelColor?: number } = {}): void {
  const y = o.y ?? 0;
  b.tank(cx, cz, r, h, color, y);
  const f = new Frame(b, cx, cz, 0, y);
  f.cyl(0, -0.02, 0, r + 0.35, 0.22, 0x9c968c, 'concrete', 28);
  const bands = o.bands ?? Math.max(1, Math.floor(h / 2.6));
  for (let i = 1; i <= bands; i++) f.cyl(0, (h * i) / (bands + 1), 0, r * 1.012, 0.07, shade(color, 0.86), 'steel', 28, 1, { ao: false });
  f.cyl(0, h - 0.04, 0, r * 1.02, 0.08, shade(color, 0.8), 'steel', 28, 1, { ao: false });
  // roof rail posts on the ladder side
  const d = o.ladder ?? 'S';
  const lr = dirRot(d);
  const lf = new Frame(b, cx, cz, lr, y);
  ladder(b, lf.wx(0, r + 0.02), lf.wz(0, r + 0.02), { y1: h, dir: d, cage: h > 4 });
  for (let a = -0.5; a <= 0.5; a += 0.25) {
    const px = Math.sin(a) * (r - 0.15);
    const pz = Math.cos(a) * (r - 0.15);
    lf.box(px, h + 0.3, pz, 0.05, 0.95, 0.05, 0xd8c040, 'steel', { ao: false });
  }
  for (let a = -0.5; a < 0.5; a += 0.25) {
    const a2 = a + 0.25;
    const mx = (Math.sin(a) + Math.sin(a2)) / 2 * (r - 0.15);
    const mz = (Math.cos(a) + Math.cos(a2)) / 2 * (r - 0.15);
    lf.box(mx, h + 1.2, mz, (r - 0.15) * 0.26, 0.05, 0.05, 0xd8c040, 'steel', { rotY: (a + a2) / 2 + Math.PI / 2, ao: false });
  }
  if (o.label) b.sign(o.label, lf.wx(0, r + 0.03), y + h * 0.55, lf.wz(0, r + 0.03), Math.min(r * 1.2, 4), 0.9, lr, { bg: color, fg: o.labelColor ?? 0x2a2d30, frame: false });
}

/** [C] Crates stacked in a pyramid-ish pile (count 2..6), using the crate material. */
export function crateStack(b: MapBuilder, x: number, z: number, o: { count?: number; size?: number; color?: number; y?: number; axis?: 'x' | 'z' } = {}): void {
  const s = o.size ?? 1.1;
  const n = o.count ?? 3;
  const ax = o.axis !== 'z';
  const y = o.y ?? 0;
  const base = Math.ceil(n / 2);
  for (let i = 0; i < base; i++) {
    const off = (i - (base - 1) / 2) * s;
    b.crate(ax ? x + off : x, ax ? z : z + off, s, y, o.color);
  }
  for (let i = 0; i < n - base; i++) {
    const off = (i - (n - base - 1) / 2) * s;
    b.crate(ax ? x + off : x, ax ? z : z + off, s, y + s, o.color);
  }
}

/** [V] Rubble and litter around a point (instanced chunks + a few planks). */
export function debris(b: MapBuilder, x: number, z: number, o: { radius?: number; count?: number; seed?: number; y?: number; color?: number; planks?: boolean } = {}): void {
  const r = rng(o.seed ?? posSeed(x, z));
  const rad = o.radius ?? 1.6;
  const n = o.count ?? 10;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283;
    const d = Math.sqrt(r()) * rad;
    b.scatter(r() < 0.6 ? 'debris' : 'pebble', x + Math.cos(a) * d, z + Math.sin(a) * d, { y: o.y, s: 0.6 + r() * 0.9, rot: r() * 6.28, color: shade(o.color ?? 0x9a958c, 0.8 + r() * 0.3) });
  }
  if (o.planks ?? true)
    for (let i = 0; i < 2; i++) {
      const a = r() * 6.283;
      b.prop({ kind: 'box', x: x + Math.cos(a) * rad * 0.5, y: (o.y ?? 0) + 0.01, z: z + Math.sin(a) * rad * 0.5, r: 1.1 + r() * 0.6, h: 0.04, d: 0.16, color: 0x8a6a48, mat: 'wood', rotY: r() * 3.14, rotZ: r() * 0.12, ao: false });
    }
}

/** [V] Yellow/black hazard floor marking around a rectangle edge (e.g. in front of a door). */
export function hazardFloor(b: MapBuilder, x: number, z: number, w: number, d: number, o: { rot?: number; y?: number } = {}): void {
  b.decal('hazard', x, z, w, d, { rot: o.rot, y: o.y });
}

// ---------------------------------------------------------------------------
// Buildings

export type BuildingOpts = Parameters<MapBuilder['building']>[0];

export interface BuildingStyle {
  /** Trim color for frames, coping and corners. */
  trim?: number;
  /** Base band color (0 to skip). */
  plinth?: number;
  /** Interior floor overlay. */
  floor?: { mat: MatId; color: number } | null;
  /** Lamp above each door. */
  doorLamp?: boolean;
  /** Corner boards/pilasters. */
  corners?: boolean;
  /** Ceiling light panel inside (emissive). */
  ceilingLight?: number | null;
  /** Window shutters (wood cabins). */
  shutters?: number | null;
  /** Downspouts at two corners. */
  gutters?: boolean;
  /** Sills under windows. */
  sills?: boolean;
}

/**
 * [C] `b.building(opts)` plus visual detailing: door/window frames, sills, plinth,
 * roof coping or eaves, corner trims, door lamps, downspouts and an interior floor.
 * Colliders are exactly those of `b.building` (all details are visual and ≤ 6 cm proud).
 */
export function detailedBuilding(b: MapBuilder, o: BuildingOpts, s: BuildingStyle = {}): void {
  b.building(o);
  const t = o.t ?? 0.35;
  const y = o.y ?? 0;
  const x0 = Math.min(o.x0, o.x1);
  const x1 = Math.max(o.x0, o.x1);
  const z0 = Math.min(o.z0, o.z1);
  const z1 = Math.max(o.z0, o.z1);
  const trim = s.trim ?? shade(o.color, 0.7);
  const roof = o.roof ?? 'flat';
  // Openings
  const lineOf = (side: Dir) => (side === 'N' ? z1 - t / 2 : side === 'S' ? z0 + t / 2 : side === 'W' ? x0 + t / 2 : x1 - t / 2);
  for (const d of o.doors) {
    const w = d.w ?? 1.6;
    frameOpening(b, d.side === 'N' || d.side === 'S' ? 'x' : 'z', lineOf(d.side), d.at - w / 2, d.at + w / 2, y, y + (d.h ?? 2.4), { t, color: trim, kind: 'door' });
    if (s.doorLamp) {
      const out = outward(d.side);
      const lx = d.side === 'N' || d.side === 'S' ? d.at : lineOf(d.side) + out[0] * (t / 2 + 0.12);
      const lz = d.side === 'N' || d.side === 'S' ? lineOf(d.side) + out[1] * (t / 2 + 0.12) : d.at;
      const ly = y + (d.h ?? 2.4) + 0.35;
      b.prop({ kind: 'box', x: lx, y: ly, z: lz, r: 0.22, h: 0.16, d: 0.22, color: 0x2e3134, mat: 'steel', ao: false });
      b.prop({ kind: 'box', x: lx, y: ly - 0.05, z: lz, r: 0.16, h: 0.05, d: 0.16, color: 0xffe2a8, mat: 'plain', emissive: 0xffe2a8 });
      b.glow(lx, ly - 0.1, lz, 1.1, 0xffd890);
    }
  }
  for (const w of o.windows ?? []) {
    const ww = w.w ?? 1.4;
    frameOpening(b, w.side === 'N' || w.side === 'S' ? 'x' : 'z', lineOf(w.side), w.at - ww / 2, w.at + ww / 2, y + (w.bottom ?? 1.1), y + (w.top ?? 2.1), { t, color: trim, kind: 'window', sill: s.sills ?? true });
    if (s.shutters != null) {
      const out = outward(w.side);
      const along = w.side === 'N' || w.side === 'S';
      const ln = lineOf(w.side) + (along ? out[1] : out[0]) * (t / 2 + 0.03);
      const hgt = (w.top ?? 2.1) - (w.bottom ?? 1.1);
      for (const sd of [-1, 1]) {
        const a = w.at + sd * (ww / 2 + 0.3);
        b.prop({ kind: 'box', x: along ? a : ln, y: y + (w.bottom ?? 1.1), z: along ? ln : a, r: along ? 0.5 : 0.04, h: hgt, d: along ? 0.04 : 0.5, color: s.shutters, mat: 'wood', ao: false });
      }
    }
  }
  // Plinth band (just proud of the walls), skipping door gaps
  const pl = s.plinth ?? 0;
  if (pl) bandAround(b, x0, z0, x1, z1, y, 0.4, 0.035, pl, 'concrete', o.doors.map((d) => ({ side: d.side, a0: d.at - (d.w ?? 1.6) / 2, a1: d.at + (d.w ?? 1.6) / 2 })));
  // Corners
  if (s.corners ?? true)
    for (const cx of [x0, x1])
      for (const cz of [z0, z1]) b.prop({ kind: 'box', x: cx, y, z: cz, r: 0.3, h: o.h + (roof === 'access' ? 0.3 + (o.parapet ?? 0.9) : roof === 'flat' ? 0.3 : 0), d: 0.3, color: trim, mat: o.mat, ao: true });
  // Roof edge
  if (roof === 'flat') trimRect(b, x0, z0, x1, z1, y + o.h + 0.3, { h: 0.16, out: 0.08, color: trim, mat: 'concrete' });
  else if (roof === 'access') trimRect(b, x0, z0, x1, z1, y + o.h + 0.3 + (o.parapet ?? 0.9), { h: 0.1, out: 0.05, color: trim, mat: 'concrete' });
  else if (roof === 'pitched') trimRect(b, x0, z0, x1, z1, y + o.h - 0.22, { h: 0.22, out: 0.12, color: trim, mat: 'wood' });
  if (s.gutters ?? roof !== 'pitched') {
    for (const [cx, cz] of [[x0 - 0.1, z1 - 0.5], [x1 + 0.1, z0 + 0.5]] as const) b.prop({ kind: 'cylinder', x: cx, y, z: cz, r: 0.06, h: o.h + 0.3, color: 0x7b8086, mat: 'steel', segments: 6, ao: false });
  }
  if (s.floor) b.aabb(x0 + t, y, z0 + t, x1 - t, y + 0.025, z1 - t, s.floor.mat, s.floor.color, { collide: false });
  if (s.ceilingLight != null) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    b.prop({ kind: 'box', x: cx, y: y + o.h - 0.08, z: cz, r: 1.2, h: 0.06, d: 0.3, color: s.ceilingLight, mat: 'plain', emissive: s.ceilingLight });
  }
}

function outward(side: Dir): [number, number] {
  return side === 'N' ? [0, 1] : side === 'S' ? [0, -1] : side === 'E' ? [1, 0] : [-1, 0];
}

/** Thin band around the outside of a rectangle (gaps for doors). */
function bandAround(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y: number, h: number, out: number, color: number, mat: MatId, gaps: { side: Dir; a0: number; a1: number }[]): void {
  const run = (side: Dir, a0: number, a1: number, emit: (a: number, c: number) => void) => {
    const gs = gaps.filter((g) => g.side === side).sort((p, q) => p.a0 - q.a0);
    let cur = a0;
    for (const g of gs) {
      if (g.a0 > cur) emit(cur, g.a0);
      cur = Math.max(cur, g.a1);
    }
    if (cur < a1) emit(cur, a1);
  };
  run('N', x0, x1, (a, c) => b.aabb(a, y, z1, c, y + h, z1 + out, mat, color, { collide: false }));
  run('S', x0, x1, (a, c) => b.aabb(a, y, z0 - out, c, y + h, z0, mat, color, { collide: false }));
  run('E', z0, z1, (a, c) => b.aabb(x1, y, a, x1 + out, y + h, c, mat, color, { collide: false }));
  run('W', z0, z1, (a, c) => b.aabb(x0 - out, y, a, x0, y + h, c, mat, color, { collide: false }));
}

/**
 * [V] Frame around a wall opening. `axis` is the wall direction ('x' = wall runs
 * along X at z = `line`), the opening spans a0..a1 along it and yBottom..yTop.
 * Adds jambs + header on both faces and, for windows, a sill.
 */
export function frameOpening(b: MapBuilder, axis: 'x' | 'z', line: number, a0: number, a1: number, yBottom: number, yTop: number, o: { t?: number; color?: number; kind?: 'door' | 'window'; sill?: boolean; mat?: MatId; w?: number } = {}): void {
  const t = o.t ?? 0.35;
  const fw = o.w ?? 0.12;
  const c = o.color ?? 0x6a6560;
  const mat = o.mat ?? 'wood';
  const depth = t + 0.08;
  const piece = (a: number, bb: number, y0: number, y1: number, d = depth) => {
    if (axis === 'x') b.aabb(a, y0, line - d / 2, bb, y1, line + d / 2, mat, c, { collide: false });
    else b.aabb(line - d / 2, y0, a, line + d / 2, y1, bb, mat, c, { collide: false });
  };
  piece(a0 - fw, a0, yBottom, yTop + fw);
  piece(a1, a1 + fw, yBottom, yTop + fw);
  piece(a0 - fw, a1 + fw, yTop, yTop + fw);
  if (o.kind === 'window' && (o.sill ?? true)) piece(a0 - fw * 1.6, a1 + fw * 1.6, yBottom - 0.07, yBottom, t + 0.22);
}

/** [V] Coping/trim ring around a rectangle's top edge at height y. */
export function trimRect(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y: number, o: { h?: number; out?: number; color?: number; mat?: MatId } = {}): void {
  const h = o.h ?? 0.15;
  const e = o.out ?? 0.08;
  const c = o.color ?? 0x8a8780;
  const m = o.mat ?? 'concrete';
  const opts = { collide: false };
  b.aabb(x0 - e, y, z1 - 0.05, x1 + e, y + h, z1 + e, m, c, opts);
  b.aabb(x0 - e, y, z0 - e, x1 + e, y + h, z0 + 0.05, m, c, opts);
  b.aabb(x0 - e, y, z0 + 0.05, x0 + 0.05, y + h, z1 - 0.05, m, c, opts);
  b.aabb(x1 - 0.05, y, z0 + 0.05, x1 + e, y + h, z1 - 0.05, m, c, opts);
}

/**
 * [V] Fake windows (textured panels) along a solid wall face. `axis`: wall
 * direction; `line`: the face coordinate; `facing`: +1/-1 outward along the normal.
 */
export function wallWindows(b: MapBuilder, axis: 'x' | 'z', line: number, facing: 1 | -1, a0: number, a1: number, y: number, o: { w?: number; h?: number; spacing?: number; lit?: boolean; color?: number; frame?: number } = {}): void {
  const w = o.w ?? 1.4;
  const h = o.h ?? 1.2;
  const sp = o.spacing ?? 3;
  const n = Math.max(1, Math.floor((a1 - a0) / sp));
  const step = (a1 - a0) / n;
  const rot = axis === 'x' ? (facing > 0 ? 0 : Math.PI) : facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + step * (i + 0.5);
    const px = axis === 'x' ? a : line + facing * 0.02;
    const pz = axis === 'x' ? line + facing * 0.02 : a;
    b.panel(o.lit ? 'windowLit' : 'window', px, y, pz, w, h, rot, o.color ?? 0xffffff);
    if (o.frame !== undefined) {
      const fx = axis === 'x' ? a : line + facing * 0.03;
      const fz = axis === 'x' ? line + facing * 0.03 : a;
      b.prop({ kind: 'box', x: fx, y: y - 0.08, z: fz, r: axis === 'x' ? w + 0.24 : 0.12, h: 0.08, d: axis === 'x' ? 0.12 : w + 0.24, color: o.frame, mat: 'concrete', ao: false });
    }
  }
}

/** [V] Sloped canopy over a door: `rot` = direction it sticks out toward. */
export function awning(b: MapBuilder, x: number, z: number, o: { w?: number; depth?: number; y?: number; rot?: number; color?: number; stripes?: number | null; slope?: number } = {}): void {
  const w = o.w ?? 2.6;
  const dp = o.depth ?? 1.3;
  const y = o.y ?? 2.7;
  const f = new Frame(b, x, z, o.rot ?? 0, 0);
  const c = o.color ?? 0x2f6f8f;
  const slope = o.slope ?? 0.32;
  const n = o.stripes != null ? Math.max(3, Math.round(w / 0.45)) : 1;
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const col = o.stripes != null && i % 2 ? o.stripes : c;
    f.box(-w / 2 + sw * (i + 0.5), y, 0, sw + 0.002, 0.04, dp / Math.cos(slope), col, 'plain', { rotX: slope, ao: false });
    f.box(-w / 2 + sw * (i + 0.5), y - Math.sin(slope) * dp - 0.22, dp * 0.98, sw + 0.002, 0.24, 0.02, col, 'plain', { ao: false });
  }
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) f.box(sx, y - 0.7, 0.35, 0.04, 0.04, 0.9, 0x3a3d40, 'steel', { rotX: -0.75, ao: false });
}

/**
 * [V] Sign with a canvas-text face. Wall-mounted by default (board only); `posts`
 * puts it on two posts with the bottom edge at `y`. `rot` = direction the text faces.
 */
export function sign(b: MapBuilder, text: string, x: number, y: number, z: number, o: { w?: number; h?: number; rot?: number; bg?: number; fg?: number; posts?: boolean; frame?: number } = {}): void {
  const w = o.w ?? Math.max(1.2, text.length * 0.32);
  const h = o.h ?? 0.7;
  const rot = o.rot ?? 0;
  const f = new Frame(b, x, z, rot, 0);
  const fr = o.frame ?? 0x3a3d40;
  f.box(0, y - 0.04, -0.03, w + 0.1, h + 0.08, 0.06, fr, 'steel', { ao: false });
  b.sign(text, f.wx(0, 0.005), y, f.wz(0, 0.005), w, h, rot, { bg: o.bg ?? 0x1f4f7a, fg: o.fg ?? 0xffffff });
  if (o.posts) for (const sx of [-w * 0.35, w * 0.35]) f.box(sx, 0, -0.07, 0.08, y, 0.08, fr, 'steel');
}

/** [V] Brick chimney with a cap (and optional snow on top). */
export function chimney(b: MapBuilder, x: number, z: number, o: { y: number; h?: number; w?: number; color?: number; snow?: boolean }): void {
  const w = o.w ?? 0.7;
  const h = o.h ?? 2.2;
  const c = o.color ?? 0x7d6f66;
  b.prop({ kind: 'box', x, y: o.y, z, r: w, h, d: w, color: c, mat: 'brick' });
  b.prop({ kind: 'box', x, y: o.y + h, z, r: w + 0.14, h: 0.12, d: w + 0.14, color: shade(c, 0.8), mat: 'concrete', ao: false });
  b.prop({ kind: 'box', x, y: o.y + h + 0.12, z, r: w * 0.5, h: 0.08, d: w * 0.5, color: 0x1e1e1e, mat: 'plain', ao: false });
  if (o.snow) b.prop({ kind: 'ellipsoid', x, y: o.y + h + 0.1, z, r: w + 0.2, h: 0.18, d: w + 0.2, color: 0xf4f8fb, mat: 'snow', ao: false });
}

// ---------------------------------------------------------------------------
// Fences

/**
 * Fence from (x0, z0) to (x1, z1). Kinds: 'chain' (posts, rails, chain-link mesh),
 * 'wood' (ranch rails), 'boards' (solid vertical boards, good over cover walls),
 * 'picket', 'rail' (metal guard rail). [C] when `collide` (default true for
 * axis-aligned runs) with a 0.12 m thick collider; diagonal runs are visual only.
 */
export function fence(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, o: { kind?: 'chain' | 'wood' | 'boards' | 'picket' | 'rail'; h?: number; color?: number; y?: number; collide?: boolean; thick?: number; postEvery?: number; seed?: number } = {}): void {
  const kind = o.kind ?? 'chain';
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(z0 - z1, x1 - x0);
  const y = o.y ?? 0;
  const f = new Frame(b, (x0 + x1) / 2, (z0 + z1) / 2, rot, y);
  const h = o.h ?? (kind === 'chain' ? 2.4 : kind === 'rail' ? 0.8 : 1.1);
  const r = rng(o.seed ?? posSeed(x0 + x1, z0 + z1));
  const pe = o.postEvery ?? (kind === 'chain' ? 2.5 : 2.2);
  const np = Math.max(1, Math.round(len / pe));
  const step = len / np;
  if (kind === 'chain') {
    const c = o.color ?? 0x8c9296;
    for (let i = 0; i <= np; i++) f.cyl(-len / 2 + i * step, 0, 0, 0.04, h + 0.05, c, 'steel', 6);
    f.hcyl(-len / 2, h, 0, 'x', len, 0.03, c, 'steel', 6);
    f.hcyl(-len / 2, 0.1, 0, 'x', len, 0.02, c, 'steel', 6);
    for (let i = 0; i < np; i++) f.panel('chain', -len / 2 + (i + 0.5) * step, 0.05, 0, step, h - 0.05, 0, c);
  } else if (kind === 'wood' || kind === 'picket') {
    const c = o.color ?? 0x7a5a3c;
    for (let i = 0; i <= np; i++) f.box(-len / 2 + i * step, 0, 0, 0.12, h + 0.08, 0.12, shade(c, 0.85), 'wood', { rotY: jit(r, 0.04) });
    const rails = kind === 'wood' ? [h * 0.35, h * 0.8] : [h * 0.25, h * 0.75];
    for (const ry of rails) f.box(0, ry, kind === 'wood' ? 0 : -0.07, len, 0.1, 0.05, c, 'wood', { ao: false });
    if (kind === 'picket') {
      const n = Math.floor(len / 0.16);
      for (let i = 0; i < n; i++) {
        const lx = -len / 2 + (i + 0.5) * (len / n);
        f.box(lx, 0.05, 0.0, 0.09, h - 0.1, 0.025, shade(c, 0.95 + jit(r, 0.06)), 'wood', { ao: false });
        f.cone(lx, h - 0.05, 0, 0.065, 0.1, shade(c, 0.95), 'wood', 4, { rotY: Math.PI / 4, ao: false });
      }
    }
  } else if (kind === 'boards') {
    const c = o.color ?? 0x6b4a32;
    const th = o.thick ?? 0.18;
    const n = Math.max(2, Math.round(len / 0.2));
    const bw = len / n;
    for (let i = 0; i < n; i++) f.box(-len / 2 + (i + 0.5) * bw, 0, 0, bw - 0.012, h + jit(r, 0.04), th * 0.7, shade(c, 0.88 + r() * 0.2), 'wood');
    for (const ry of [0.18, h - 0.28]) for (const sz of [-1, 1]) f.box(0, ry, sz * th * 0.42, len, 0.12, 0.04, shade(c, 0.75), 'wood', { ao: false });
    for (let i = 0; i <= np; i++) f.box(-len / 2 + i * step, 0, 0, 0.14, h + 0.1, th + 0.04, shade(c, 0.7), 'wood');
  } else {
    const c = o.color ?? 0xb8bcc0;
    for (let i = 0; i <= np; i++) f.box(-len / 2 + i * step, 0, 0, 0.1, h, 0.1, 0x6d7276, 'steel');
    f.extrude(0, h - 0.34, 0.06, len, [[-0.02, 0], [0.04, 0.04], [0.04, 0.26], [-0.02, 0.3]], c, 'steel');
  }
  const axisAligned = Math.abs(x1 - x0) < 1e-6 || Math.abs(z1 - z0) < 1e-6;
  if ((o.collide ?? true) && axisAligned) {
    const th = kind === 'boards' ? (o.thick ?? 0.18) : 0.12;
    if (Math.abs(z1 - z0) < 1e-6) b.aabb(Math.min(x0, x1), y, z0 - th / 2, Math.max(x0, x1), y + h, z0 + th / 2, 'wood', 0, { visible: false });
    else b.aabb(x0 - th / 2, y, Math.min(z0, z1), x0 + th / 2, y + h, Math.max(z0, z1), 'wood', 0, { visible: false });
  }
}

// ---------------------------------------------------------------------------
// Nature

export type TreeKind = 'pine' | 'oak' | 'birch' | 'dead' | 'snowpine';

/**
 * [C trunk] Tree `h` m tall. Colliders match `b.tree` (0.5 m trunk box plus a soft
 * canopy box that blocks bot sight but not bullets) so swapping is gameplay-neutral.
 * Birch/dead trees get a slimmer trunk and a smaller (birch) or no (dead) canopy.
 */
export function tree(b: MapBuilder, x: number, z: number, o: { kind?: TreeKind; h?: number; seed?: number; y?: number; collide?: boolean; tint?: number } = {}): void {
  const kind = o.kind ?? 'pine';
  const h = o.h ?? 9;
  const y = o.y ?? 0;
  const seed = o.seed ?? Math.floor(Math.abs(x * 73.1 + z * 37.7 + h * 11)) + 1;
  const r = rng(seed);
  const f = new Frame(b, x, z, r() * 6.283, y);
  const collide = o.collide ?? true;
  if (kind === 'pine' || kind === 'snowpine') {
    const trunkH = h * 0.3;
    if (collide) {
      b.box(x, y, z, 0.5, h * 0.8, 0.5, 'bark', 0x5a4030, { visible: false });
      b.box(x, y + trunkH, z, h * 0.32, (h - trunkH) * 0.8, h * 0.32, 'leaves', 0x2d5e33, { collide: false, soft: true, visible: false });
    }
    f.cyl(0, 0, 0, 0.26, h * 0.75, 0x5b4230, 'bark', 7, 0.35);
    const base = o.tint ?? (kind === 'snowpine' ? 0x2c5644 : 0x2f6236);
    const layers = 5 + Math.floor(r() * 2);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const ly = trunkH * 0.75 + t * (h - trunkH * 0.75) * 0.8;
      const lr = h * 0.25 * (1 - t * 0.78) * (0.92 + r() * 0.16);
      const lh = (h - trunkH) * (0.36 - t * 0.12);
      const col = shade(base, 0.78 + t * 0.35 + jit(r, 0.05));
      f.cone(jit(r, 0.08), ly, jit(r, 0.08), lr, lh, col, 'leaves', 9, { seed: seed + i, jag: 0.28, rotY: r() * 6.28 });
      if (kind === 'snowpine') f.cone(jit(r, 0.05), ly + lh * 0.3, jit(r, 0.05), lr * 0.78, lh * 0.62, 0xeef4f8, 'snow', 9, { seed: seed + 40 + i, jag: 0.3, rotY: r() * 6.28 });
    }
    f.cone(0, h * 0.86, 0, h * 0.05, h * 0.16, shade(base, 1.15), 'leaves', 6, { seed: seed + 99 });
    if (kind === 'snowpine') f.cone(0, h * 0.92, 0, h * 0.03, h * 0.1, 0xeef4f8, 'snow', 6);
  } else if (kind === 'oak') {
    const trunkH = h * 0.45;
    if (collide) {
      b.box(x, y, z, 0.5, h * 0.8, 0.5, 'bark', 0x5a4030, { visible: false });
      b.box(x, y + trunkH + 0.2, z, h * 0.45, h * 0.45, h * 0.45, 'leaves', 0x3f7a35, { collide: false, soft: true, visible: false });
    }
    f.cyl(0, 0, 0, 0.34, trunkH + h * 0.12, 0x5b4230, 'bark', 8, 0.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283 + r();
      b.prop({ kind: 'cylinder', x: f.wx(0, 0), y: y + trunkH * 0.8, z: f.wz(0, 0), r: 0.14, h: h * 0.28, d: 0.5, color: 0x5b4230, mat: 'bark', segments: 6, rotY: a, rotX: 0.8 + r() * 0.3, ao: false });
    }
    const base = o.tint ?? 0x467f37;
    const blobs = 6 + Math.floor(r() * 3);
    const cr = h * 0.27;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * 6.283 + jit(r, 0.3);
      const ring = i === 0 ? 0 : cr * (0.55 + r() * 0.3);
      const by = trunkH + cr * 0.15 + (i === 0 ? cr * 0.6 : r() * cr * 0.8);
      const s = cr * (i === 0 ? 1.5 : 0.85 + r() * 0.35);
      f.shape('blob', Math.cos(a) * ring, by, Math.sin(a) * ring, s * 1.15, s * 0.95, s * 1.15, shade(base, 0.82 + r() * 0.3), 'leaves', { seed: seed + i, rotY: r() * 6.28, ao: false });
    }
  } else if (kind === 'birch') {
    if (collide) {
      b.box(x, y, z, 0.4, h * 0.8, 0.4, 'bark', 0xd8d4c8, { visible: false });
      b.box(x, y + h * 0.4, z, h * 0.3, h * 0.45, h * 0.3, 'leaves', 0x7ea845, { collide: false, soft: true, visible: false });
    }
    const lean = jit(r, 0.06);
    f.cyl(0, 0, 0, 0.17, h * 0.92, 0xe4e0d4, 'bark', 7, 0.45, { rotZ: lean });
    const base = o.tint ?? 0x86ad4a;
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const a = r() * 6.283;
      const ring = h * 0.08 * (1 - t * 0.5);
      const s = h * (0.2 - t * 0.06);
      f.shape('blob', Math.cos(a) * ring - lean * h * 0.5, h * (0.42 + t * 0.38), Math.sin(a) * ring, s, s * 1.2, s, shade(base, 0.85 + r() * 0.3), 'leaves', { seed: seed + i, rotY: r() * 6.28, ao: false });
    }
  } else {
    if (collide) b.box(x, y, z, 0.4, h * 0.7, 0.4, 'bark', 0x5a4a3c, { visible: false });
    const c = o.tint ?? 0x6b5a4a;
    f.cyl(0, 0, 0, 0.24, h * 0.8, c, 'bark', 7, 0.3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283 + jit(r, 0.4);
      const by = h * (0.35 + r() * 0.35);
      const len = h * (0.22 + r() * 0.15);
      b.prop({ kind: 'cylinder', x: f.wx(0, 0), y: y + by, z: f.wz(0, 0), r: 0.08, h: len, d: 0.25, color: c, mat: 'bark', segments: 5, rotY: a, rotX: 0.6 + r() * 0.5, ao: false });
      const tx = Math.sin(a) * Math.sin(0.85) * len * 0.7;
      const tz = Math.cos(a) * Math.sin(0.85) * len * 0.7;
      b.prop({ kind: 'cylinder', x: f.wx(0, 0) + tx, y: y + by + len * 0.5, z: f.wz(0, 0) + tz, r: 0.04, h: len * 0.5, d: 0.2, color: c, mat: 'bark', segments: 4, rotY: a + jit(r, 1), rotX: 0.3 + r() * 0.4, ao: false });
    }
  }
}

/** [V] Leafy bush made of 2-4 blobs (optionally with snow on top). */
export function bush(b: MapBuilder, x: number, z: number, o: { r?: number; color?: number; seed?: number; y?: number; snow?: boolean; soft?: boolean } = {}): void {
  const rad = o.r ?? 0.9;
  const seed = o.seed ?? Math.floor(Math.abs(x * 91.7 + z * 53.3)) + 7;
  const r = rng(seed);
  const f = new Frame(b, x, z, r() * 6.283, o.y ?? 0);
  const c = o.color ?? 0x4a7a36;
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283;
    const d = i === 0 ? 0 : rad * 0.45;
    const s = rad * (i === 0 ? 1.5 : 1 + r() * 0.3);
    f.shape('blob', Math.cos(a) * d, -0.1, Math.sin(a) * d, s, s * 0.8, s, shade(c, 0.85 + r() * 0.3), 'leaves', { seed: seed + i, rotY: r() * 6.28, ao: true });
    if (o.snow) f.shape('blob', Math.cos(a) * d, s * 0.45, Math.sin(a) * d, s * 0.8, s * 0.32, s * 0.8, 0xf2f6f8, 'snow', { seed: seed + 20 + i, ao: false });
  }
  if (o.soft) b.box(x, o.y ?? 0, z, rad * 1.6, rad * 1.2, rad * 1.6, 'leaves', c, { collide: false, soft: true, visible: false });
}

/**
 * [C] Rock outcrop: one invisible w x h x d collider dressed with irregular rocks
 * that fill it, plus small loose stones around the base. Optional snow/moss caps.
 * Use `collide: false` + `box: existing` style by passing the collider size of a rock you replace.
 */
export function rockCluster(b: MapBuilder, x: number, z: number, o: { w?: number; h?: number; d?: number; color?: number; seed?: number; y?: number; collide?: boolean; snow?: boolean; moss?: boolean; pebbles?: number } = {}): void {
  const w = o.w ?? 2.4;
  const h = o.h ?? 1.3;
  const d = o.d ?? 1.8;
  const y = o.y ?? 0;
  const seed = o.seed ?? Math.floor(Math.abs(x * 31.7 + z * 17.3)) + 3;
  const r = rng(seed);
  const c = o.color ?? 0x7d7f80;
  if (o.collide ?? true) b.box(x, y, z, w, h, d, 'rock', c, { visible: false });
  const f = new Frame(b, x, z, 0, y);
  f.shape('rock', 0, -0.08, 0, w * 1.08, h * 1.08, d * 1.08, c, 'rock', { seed, rotY: (r() - 0.5) * 0.3 });
  const parts = 1 + Math.floor(r() * 2);
  for (let i = 0; i < parts; i++) {
    const sx = (r() - 0.5) * w * 0.5;
    const sz = (r() - 0.5) * d * 0.5;
    const s = 0.55 + r() * 0.25;
    f.shape('rock', sx, -0.05, sz, w * s, h * (0.7 + r() * 0.35), d * s, shade(c, 0.9 + r() * 0.2), 'rock', { seed: seed + 11 + i, rotY: r() * 6.28 });
  }
  const pn = o.pebbles ?? 4;
  for (let i = 0; i < pn; i++) {
    const a = r() * 6.283;
    const rr = Math.max(w, d) * 0.5 + 0.25 + r() * 0.5;
    const s = 0.22 + r() * 0.3;
    f.shape('rock', Math.cos(a) * rr * (w / Math.max(w, d)), -0.04, Math.sin(a) * rr * (d / Math.max(w, d)), s * 1.3, s, s * 1.1, shade(c, 0.85 + r() * 0.25), 'rock', { seed: seed + 30 + i, rotY: r() * 6.28 });
  }
  if (o.snow) f.shape('blob', 0, h * 0.82, 0, w * 0.9, h * 0.32, d * 0.9, 0xf2f6f9, 'snow', { seed: seed + 50, ao: false });
  if (o.moss) f.shape('blob', w * 0.1, h * 0.75, -d * 0.05, w * 0.7, h * 0.3, d * 0.6, 0x5f7d3a, 'leaves', { seed: seed + 60, ao: false });
}

/** [C] Pile of logs along `axis` (lumber yard / firewood). */
export function logPile(b: MapBuilder, x: number, z: number, o: { len?: number; axis?: 'x' | 'z'; rows?: number; r?: number; color?: number; y?: number; collide?: boolean; seed?: number } = {}): void {
  const len = o.len ?? 4;
  const rows = o.rows ?? 3;
  const lr = o.r ?? 0.32;
  const f = new Frame(b, x, z, o.axis === 'z' ? Math.PI / 2 : 0, o.y ?? 0);
  const c = o.color ?? 0x8a6440;
  const r = rng(o.seed ?? posSeed(x, z));
  let width = 0;
  for (let row = 0; row < rows; row++) {
    const n = rows - row + 1;
    width = Math.max(width, n * lr * 2);
    for (let i = 0; i < n; i++) {
      const lz = (i - (n - 1) / 2) * lr * 2;
      const ly = lr + row * lr * 1.72;
      const l = len * (0.94 + r() * 0.08);
      f.hcyl(-l / 2 + jit(r, 0.1), ly, lz, 'x', l, lr * (0.92 + r() * 0.12), shade(c, 0.9 + r() * 0.2), 'bark', 9);
      f.hcyl(-l / 2 - 0.004, ly, lz, 'x', 0.01, lr * 0.86, 0xd9b98a, 'wood', 9);
      f.hcyl(l / 2 - 0.006, ly, lz, 'x', 0.01, lr * 0.86, 0xd9b98a, 'wood', 9);
    }
  }
  if (o.collide ?? true) f.solid(0, 0, 0, len, lr * 2 + (rows - 1) * lr * 1.72, width, 'bark', c);
}

/** [V] Snow layer on top of a box-shaped object (crates, walls, roofs, cars). */
export function snowCap(b: MapBuilder, x: number, z: number, w: number, d: number, y: number, o: { h?: number; seed?: number } = {}): void {
  b.prop({ kind: 'blob', x, y: y - 0.04, z, r: w + 0.08, h: o.h ?? 0.14, d: d + 0.08, color: 0xf4f8fb, mat: 'snow', seed: o.seed ?? 5, ao: false });
}

/** [V] Instanced grass/flower patch filling a rectangle (skips anything not on `on` ground). */
export function grassPatch(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, o: { count?: number; color?: number; flowers?: number; seed?: number; on?: MatId[]; tall?: number } = {}): void {
  const n = o.count ?? Math.round(Math.abs((x1 - x0) * (z1 - z0)) * 0.8);
  const on = o.on ?? ['grass'];
  b.scatterArea('grass', x0, z0, x1, z1, n, { seed: o.seed, color: o.color ?? 0x6f9a48, colorVar: 0.22, on });
  if (o.tall) b.scatterArea('tallgrass', x0, z0, x1, z1, o.tall, { seed: (o.seed ?? 1) + 5, color: o.color ?? 0x7a9a4a, colorVar: 0.2, on });
  if (o.flowers) b.scatterArea('flowers', x0, z0, x1, z1, o.flowers, { seed: (o.seed ?? 1) + 9, color: 0xffffff, colorVar: 0.1, on });
}

// ---------------------------------------------------------------------------
// Vehicles (colliders are axis-aligned: use dir)

/** [C] Box truck (~7.4 x 2.5 x 3.3 m) or 'flatbed' / 'tanker'; cab faces `dir`. */
export function truck(b: MapBuilder, x: number, z: number, o: { dir?: Dir; color?: number; cargo?: number; kind?: 'box' | 'flatbed' | 'tanker'; y?: number; collide?: boolean } = {}): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), o.y ?? 0);
  const c = o.color ?? 0xd8d4cc;
  const cargo = o.cargo ?? 0xe8e6e0;
  const kind = o.kind ?? 'box';
  // chassis + wheels (front = +Z local)
  f.box(0, 0.45, -0.4, 1.9, 0.3, 6.6, 0x2a2c2e, 'steel');
  for (const lz of [2.3, -1.4, -2.6]) for (const sx of [-1, 1]) wheel(f, sx * 1.02, lz, 0.5, 0.36);
  // cab
  f.box(0, 0.75, 2.45, 2.3, 1.15, 1.9, c, 'steel');
  f.box(0, 1.9, 2.3, 2.3, 1.05, 1.6, c, 'steel', { ao: false });
  f.box(0, 1.98, 3.115, 2.0, 0.78, 0.04, 0x1c2830, 'plain', { rotX: -0.12, ao: false });
  for (const sx of [-1, 1]) f.box(sx * 1.16, 2.0, 2.45, 0.02, 0.6, 0.9, 0x1c2830, 'plain', { ao: false });
  f.box(0, 0.62, 3.42, 2.3, 0.3, 0.12, 0x3a3d40, 'steel', { ao: false });
  for (const sx of [-0.85, 0.85]) f.emissive(sx, 1.0, 3.405, 0.32, 0.16, 0.02, 0xfff4d8);
  f.box(0, 0.95, 3.405, 1.0, 0.38, 0.02, 0x2a2d30, 'steel', { ao: false });
  for (const sx of [-1, 1]) f.box(sx * 1.3, 2.0, 3.0, 0.06, 0.32, 0.18, 0x2a2c2e, 'steel', { ao: false });
  // body
  if (kind === 'box') {
    f.box(0, 0.75, -1.2, 2.44, 2.55, 4.9, cargo, 'steel');
    f.box(0, 3.3, -1.2, 2.46, 0.06, 4.92, shade(cargo, 0.85), 'steel', { ao: false });
    f.box(0, 0.8, -3.66, 2.3, 2.4, 0.03, shade(cargo, 0.88), 'steel', { ao: false });
    f.box(0, 0.8, -3.68, 0.03, 2.4, 0.02, 0x3a3d40, 'plain', { ao: false });
  } else if (kind === 'flatbed') {
    f.box(0, 0.75, -1.2, 2.44, 0.18, 4.9, 0x5a4c3e, 'wood');
    f.box(0, 0.93, -0.6, 1.2, 1.0, 1.0, 0xb08850, 'crate', { rotY: 0.05 });
    f.box(0.1, 0.93, -2.0, 1.1, 1.1, 1.1, 0xa07a48, 'crate', { rotY: -0.08 });
  } else {
    f.hcyl(0, 1.95, -3.6, 'z', 4.8, 1.12, cargo, 'steel', 18);
    f.box(0, 0.75, -1.2, 1.6, 0.5, 4.6, 0x3a3d40, 'steel');
    f.box(0, 3.05, -1.2, 0.5, 0.12, 3.8, 0x5a5f63, 'steel', { ao: false });
  }
  if (o.collide ?? true) {
    f.solid(0, 0, 2.45, 2.3, 2.95, 1.95);
    f.solid(0, 0, -1.2, 2.46, kind === 'flatbed' ? 2.0 : 3.3, 4.92);
  }
}

/** [C] Delivery van (~5 x 2 x 2.3 m), front faces `dir`. */
export function van(b: MapBuilder, x: number, z: number, o: { dir?: Dir; color?: number; y?: number; collide?: boolean; stripe?: number } = {}): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), o.y ?? 0);
  const c = o.color ?? 0xe6e6e2;
  for (const lz of [1.55, -1.5]) for (const sx of [-1, 1]) wheel(f, sx * 0.9, lz, 0.38, 0.28);
  f.box(0, 0.3, -0.25, 2.0, 1.95, 4.2, c, 'steel');
  f.box(0, 0.3, 2.15, 2.0, 0.95, 0.75, c, 'steel');
  f.box(0, 1.25, 1.98, 1.98, 0.88, 0.5, c, 'steel', { rotX: -0.45, ao: false });
  f.box(0, 1.32, 2.12, 1.8, 0.62, 0.03, 0x1c2830, 'plain', { rotX: -0.45, ao: false });
  for (const sx of [-1, 1]) f.box(sx * 1.005, 1.3, 1.45, 0.02, 0.55, 0.8, 0x1c2830, 'plain', { ao: false });
  for (const sx of [-0.72, 0.72]) f.emissive(sx, 0.95, 2.53, 0.3, 0.14, 0.02, 0xfff4d8);
  f.box(0, 0.32, 2.56, 2.04, 0.22, 0.1, 0x3a3d40, 'steel', { ao: false });
  for (const sx of [-0.72, 0.72]) f.emissive(sx, 1.0, -2.36, 0.18, 0.3, 0.02, 0xc8302a);
  if (o.stripe !== undefined) for (const sx of [-1, 1]) f.box(sx * 1.005, 1.05, -0.4, 0.02, 0.3, 3.6, o.stripe, 'plain', { ao: false });
  if (o.collide ?? true) f.solid(0, 0, 0, 2.0, 2.3, 5.1);
}

/** [C] Forklift (~2.6 x 1.2 x 2.3 m), forks face `dir`. */
export function forklift(b: MapBuilder, x: number, z: number, o: { dir?: Dir; color?: number; y?: number; collide?: boolean; load?: boolean } = {}): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), o.y ?? 0);
  const c = o.color ?? 0xe0a823;
  wheel(f, -0.5, 0.45, 0.3, 0.22);
  wheel(f, 0.5, 0.45, 0.3, 0.22);
  wheel(f, -0.48, -0.55, 0.24, 0.2);
  wheel(f, 0.48, -0.55, 0.24, 0.2);
  f.box(0, 0.18, -0.1, 1.1, 0.75, 1.6, c, 'steel');
  f.box(0, 0.18, -0.85, 1.1, 0.95, 0.4, 0x3a3d40, 'steel');
  f.box(0, 0.93, -0.25, 0.5, 0.12, 0.45, 0x2a2c2e, 'plain', { ao: false });
  f.box(0, 1.05, -0.45, 0.5, 0.5, 0.1, 0x2a2c2e, 'plain', { ao: false });
  for (const [sx, sz] of [[-0.5, 0.35], [0.5, 0.35], [-0.5, -0.65], [0.5, -0.65]]) f.box(sx, 0.93, sz, 0.06, 1.25, 0.06, 0x2a2c2e, 'steel', { ao: false });
  f.box(0, 2.18, -0.15, 1.1, 0.06, 1.1, 0x2a2c2e, 'steel', { ao: false });
  for (const sx of [-0.4, 0.4]) f.box(sx, 0.1, 0.85, 0.08, 2.1, 0.08, 0x3a3d40, 'steel');
  f.box(0, 0.25, 0.9, 0.9, 0.5, 0.04, 0x3a3d40, 'steel', { ao: false });
  for (const sx of [-0.3, 0.3]) f.box(sx, 0.08, 1.45, 0.12, 0.05, 1.1, 0x55595c, 'steel', { ao: false });
  if (o.load) pallet(b, f.wx(0, 1.45), f.wz(0, 1.45), { rot: f.rot + Math.PI / 2, y: (o.y ?? 0) + 0.13 });
  if (o.collide ?? true) f.solid(0, 0, 0.1, 1.2, 2.2, 2.0);
}

/** [C] Small hatchback car (~4 x 1.8 x 1.5 m). */
export function car(b: MapBuilder, x: number, z: number, o: { dir?: Dir; color?: number; y?: number; collide?: boolean; snow?: boolean } = {}): void {
  const f = new Frame(b, x, z, dirRot(o.dir ?? 'N'), o.y ?? 0);
  const c = o.color ?? 0x8c2f2a;
  for (const lz of [1.25, -1.2]) for (const sx of [-1, 1]) wheel(f, sx * 0.8, lz, 0.32, 0.22);
  f.box(0, 0.25, 0, 1.76, 0.7, 3.9, c, 'steel');
  f.box(0, 0.95, -0.35, 1.6, 0.6, 2.2, c, 'steel', { ao: false });
  f.box(0, 0.98, 0.83, 1.5, 0.52, 0.03, 0x1c2830, 'plain', { rotX: -0.6, ao: false });
  f.box(0, 0.98, -1.47, 1.5, 0.5, 0.03, 0x1c2830, 'plain', { rotX: 0.35, ao: false });
  for (const sx of [-1, 1]) f.box(sx * 0.805, 1.0, -0.35, 0.02, 0.45, 2.0, 0x1c2830, 'plain', { ao: false });
  for (const sx of [-0.6, 0.6]) f.emissive(sx, 0.7, 1.955, 0.32, 0.12, 0.02, 0xfff4d8);
  for (const sx of [-0.65, 0.65]) f.emissive(sx, 0.72, -1.955, 0.26, 0.12, 0.02, 0xc8302a);
  f.box(0, 0.25, 1.96, 1.8, 0.2, 0.08, 0x2a2c2e, 'plain', { ao: false });
  f.box(0, 0.25, -1.96, 1.8, 0.2, 0.08, 0x2a2c2e, 'plain', { ao: false });
  if (o.snow) snowCap(b, f.wx(0, -0.35), f.wz(0, -0.35), 1.5, 2.0, (o.y ?? 0) + 1.55);
  if (o.collide ?? true) f.solid(0, 0, 0, 1.8, 1.55, 4.0);
}

function wheel(f: Frame, lx: number, lz: number, r: number, w: number): void {
  const sx = lx < 0 ? -1 : 1;
  f.hcyl(lx - (sx > 0 ? 0 : w), r, lz, 'x', w, r, 0x1e1f20, 'plain', 12);
  f.hcyl(lx + (sx > 0 ? w - 0.005 : -w - 0.005) + (sx > 0 ? 0 : 0.0), r, lz, 'x', 0.012, r * 0.55, 0x8a8f94, 'steel', 10);
}

/** Scales a 0xRRGGBB color's brightness. */
export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const bl = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | bl;
}
