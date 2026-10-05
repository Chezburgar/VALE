import type { MapId } from '../config';
import type { MapDef } from './builder';
import { factory } from './factory';
import { forest } from './forest';
import { refinery } from './refinery';
import { snowfall } from './snowfall';

export type { MapDef } from './builder';

const BUILDERS: Record<MapId, () => MapDef> = { factory, refinery, snowfall, forest };
const cache = new Map<MapId, MapDef>();

export function getMap(id: MapId): MapDef {
  let m = cache.get(id);
  if (!m) cache.set(id, (m = BUILDERS[id]()));
  return m;
}
