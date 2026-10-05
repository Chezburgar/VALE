import type { MapId } from '../config';
import { MapBuilder, rng, yawTo, type MapDef, type V3 } from './builder';

export const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

export function finish(id: MapId, b: MapBuilder, o: Omit<MapDef, 'id' | 'boxes' | 'props' | 'spawns'>): MapDef {
  return { id, boxes: b.boxes, props: b.props, spawns: b.spawns, ...o };
}

/** Spawns in a column facing the map center. */
export function spawnColumn(b: MapBuilder, x: number, zs: number[]): void {
  for (const z of zs) b.spawn(x, z, yawTo(x, z, 0, z * 0.3));
}

/** Distant scenery ring (purely visual). */
export function mountains(b: MapBuilder, r: number, color: number, snow: number | null, seed: number): void {
  const rand = rng(seed);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rand() * 0.2;
    const d = r + 50 + rand() * 60;
    const h = 22 + rand() * 38;
    const rad = 40 + rand() * 30;
    b.prop({ kind: 'cone', x: Math.cos(a) * d, y: -4, z: Math.sin(a) * d, r: rad, h, color, mat: 'rock', segments: 9 });
    if (snow !== null) b.prop({ kind: 'cone', x: Math.cos(a) * d, y: -4 + h * 0.62, z: Math.sin(a) * d, r: rad * 0.39, h: h * 0.38 + 0.4, color: snow, mat: 'snow', segments: 9 });
  }
}
