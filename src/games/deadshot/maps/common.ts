import type { MapId } from '../config';
import type { MatId } from '../world';
import { MapBuilder, rng, yawTo, type MapDef, type V3 } from './builder';

export const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

export function finish(id: MapId, b: MapBuilder, o: Omit<MapDef, 'id' | 'boxes' | 'props' | 'instances' | 'spawns'>): MapDef {
  return { id, boxes: b.boxes, props: b.props, instances: b.instances, spawns: b.spawns, ...o };
}

/** Spawns in a column facing the map center. */
export function spawnColumn(b: MapBuilder, x: number, zs: number[]): void {
  for (const z of zs) b.spawn(x, z, yawTo(x, z, 0, z * 0.3));
}

// ---------------------------------------------------------------------------
// Backdrop scenery (visual only, rendered without shadows outside the bounds)

/** Ring of jagged distant peaks `r + 60..140` m from the center, optional snow caps. */
export function mountains(b: MapBuilder, r: number, color: number, snow: number | null, seed: number, o: { count?: number; height?: number } = {}): void {
  const rand = rng(seed);
  const n = o.count ?? 26;
  const hk = o.height ?? 1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2;
    const d = r + 60 + rand() * 80;
    const h = (30 + rand() * 55) * hk;
    const rad = 45 + rand() * 35;
    const k = 0.88 + rand() * 0.24;
    const c = (Math.min(255, Math.round(((color >> 16) & 255) * k)) << 16) | (Math.min(255, Math.round(((color >> 8) & 255) * k)) << 8) | Math.min(255, Math.round((color & 255) * k));
    b.prop({ kind: 'mountain', x: Math.cos(a) * d, y: -3, z: Math.sin(a) * d, r: rad, h, color: c, mat: 'rock', seed: seed * 31 + i * 7 + 1, cap: snow ?? undefined });
  }
}

/** Low rolling hills between the map edge and the mountains (`r0..r1` from the center). */
export function hills(b: MapBuilder, r0: number, r1: number, color: number, seed: number, o: { count?: number; mat?: MatId; h?: [number, number] } = {}): void {
  const rand = rng(seed);
  const n = o.count ?? 22;
  const [h0, h1] = o.h ?? [6, 16];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.25;
    const d = r0 + rand() * (r1 - r0);
    const w = 40 + rand() * 50;
    b.prop({ kind: 'blob', x: Math.cos(a) * d, y: -h1 * 0.35, z: Math.sin(a) * d, r: w, h: h0 + rand() * (h1 - h0) + h1 * 0.35, d: w * (0.6 + rand() * 0.5), color, mat: o.mat ?? 'grass', seed: seed + i * 13, rotY: rand() * 6.28, ao: false });
  }
}

/**
 * Distant forest silhouette: low-poly pines scattered in a band `r0..r1` around
 * the center (outside the playable area). `snow` adds white tips.
 */
export function treeline(b: MapBuilder, r0: number, r1: number, count: number, color: number, seed: number, o: { snow?: boolean; h?: [number, number]; skip?: (x: number, z: number) => boolean } = {}): void {
  const rand = rng(seed);
  const [h0, h1] = o.h ?? [9, 16];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = r0 + Math.sqrt(rand()) * (r1 - r0);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (o.skip?.(x, z)) continue;
    const h = h0 + rand() * (h1 - h0);
    const k = 0.85 + rand() * 0.3;
    const c = (Math.round(((color >> 16) & 255) * k) << 16) | (Math.round(((color >> 8) & 255) * k) << 8) | Math.round((color & 255) * k);
    b.prop({ kind: 'cylinder', x, y: 0, z, r: 0.3, h: h * 0.3, color: 0x4a3626, mat: 'bark', segments: 5, ao: false });
    b.prop({ kind: 'cone', x, y: h * 0.18, z, r: h * 0.24, h: h * 0.55, color: c, mat: 'leaves', segments: 7, jag: 0.2, seed: i + 1, ao: false });
    b.prop({ kind: 'cone', x, y: h * 0.5, z, r: h * 0.16, h: h * 0.5, color: c, mat: 'leaves', segments: 7, jag: 0.2, seed: i + 500, ao: false });
    if (o.snow) b.prop({ kind: 'cone', x, y: h * 0.72, z, r: h * 0.09, h: h * 0.3, color: 0xeef4f8, mat: 'snow', segments: 7, seed: i + 900, ao: false });
  }
}

/**
 * Industrial skyline beyond the walls: warehouse blocks, smokestacks and a water
 * tower placed on a ring `r0..r1` from the center.
 */
export function skyline(b: MapBuilder, r0: number, r1: number, seed: number, o: { count?: number; colors?: number[]; stacks?: number } = {}): void {
  const rand = rng(seed);
  const cols = o.colors ?? [0x8d9399, 0x9a8f80, 0x7d858c, 0xa59b8c, 0x6f777e];
  const n = o.count ?? 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2;
    const d = r0 + rand() * (r1 - r0);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const w = 14 + rand() * 26;
    const dd = 10 + rand() * 20;
    const h = 7 + rand() * 16;
    const c = cols[i % cols.length];
    const rot = -a + (rand() - 0.5) * 0.3;
    b.prop({ kind: 'box', x, y: 0, z, r: w, h, d: dd, color: c, mat: 'metal', rotY: rot, ao: false });
    b.prop({ kind: 'prism', x, y: h, z, r: w, h: 2.2, d: dd, color: 0x5d646b, mat: 'metal', rotY: rot, ao: false });
  }
  const stacks = o.stacks ?? 3;
  for (let i = 0; i < stacks; i++) {
    const a = rand() * Math.PI * 2;
    const d = r0 + 10 + rand() * (r1 - r0);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 34 + rand() * 18;
    b.prop({ kind: 'cylinder', x, y: 0, z, r: 2.2, h, d: 0.7, color: 0xa39c94, mat: 'concrete', segments: 12, ao: false });
    for (const t of [0.78, 0.88]) b.prop({ kind: 'cylinder', x, y: h * t, z, r: 2.2 * (1 - t * 0.3) + 0.05, h: h * 0.05, color: 0xb8402e, mat: 'plain', segments: 12, ao: false });
  }
}
