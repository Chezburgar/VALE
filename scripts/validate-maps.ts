import { getMap } from '../src/games/deadshot/maps/index';
import { World } from '../src/games/deadshot/world';
import { NavGrid } from '../src/games/deadshot/navgrid';
import { MAP_ORDER } from '../src/games/deadshot/config';

for (const id of MAP_ORDER) {
  const t0 = performance.now();
  const m = getMap(id);
  const w = new World(m.boxes);
  const t1 = performance.now();
  const nav = new NavGrid(w, m.bounds);
  const t2 = performance.now();
  const problems: string[] = [];
  // Spawns must be clear; objectives are zones, so they only need a reachable node nearby.
  const check = (label: string, p: { x: number; y: number; z: number }, zone = false) => {
    const g = w.groundAt(p.x, p.z, p.y + 2);
    const blocked = w.overlaps(p.x - 0.32, g + 0.02, p.z - 0.32, p.x + 0.32, g + 1.8, p.z + 0.32);
    const n = nav.nearest(p.x, g, p.z, 4);
    const inMain = n >= 0 && nav.nodeComp[n] === nav.mainComp;
    const dist = n >= 0 ? Math.hypot(nav.nodeX[n] - p.x, nav.nodeZ[n] - p.z) : -1;
    if ((blocked && !zone) || !inMain || dist > 2.5) problems.push(`${label} (${p.x},${p.z}) ground=${g.toFixed(2)} blocked=${blocked} main=${inMain} nodeDist=${dist.toFixed(2)}`);
  };
  m.spawns.forEach((s, i) => check(`spawn${i} t${s.team}`, s));
  m.flags.forEach((f, i) => check(`flag${i}`, f, true));
  m.hardpoints.forEach((f, i) => check(`hp${i}`, f, true));
  // path test between team spawns
  const a = nav.nearest(m.spawns[0].x, 0, m.spawns[0].z);
  const bIdx = m.spawns.findIndex((s) => s.team === 1);
  const b = nav.nearest(m.spawns[bIdx].x, 0, m.spawns[bIdx].z);
  const t3 = performance.now();
  const path = nav.findPath(a, b);
  const t4 = performance.now();
  // elevated spots reachable?
  let high = 0;
  for (const n of nav.mainNodes) if (nav.nodeY[n] > 3) high++;
  // Render budget (see maps/props.ts): merged props, instanced clutter, sane data.
  if (m.props.length > 8000) problems.push(`props=${m.props.length} exceeds the 8000 budget`);
  if (m.instances.length > 15000) problems.push(`instances=${m.instances.length} exceeds the 15000 budget`);
  const bad = m.props.find((p) => ![p.x, p.y, p.z, p.r, p.h].every(Number.isFinite)) ?? m.instances.find((p) => ![p.x, p.y, p.z, p.s].every(Number.isFinite));
  if (bad) problems.push(`non-finite placement ${JSON.stringify(bad).slice(0, 120)}`);
  const kinds = new Map<string, number>();
  for (const p of m.props) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  console.log(`${id}: boxes=${m.boxes.length} colliders=${w.colliders.length} props=${m.props.length} instances=${m.instances.length} nodes=${nav.count} main=${nav.mainNodes.length} highMain=${high} edges=${nav.edgeTo.length} world=${(t1-t0).toFixed(1)}ms nav=${(t2-t1).toFixed(1)}ms path=${path.length} (${(t4-t3).toFixed(2)}ms)`);
  console.log(`   props: ${[...kinds].map(([k, n]) => `${k}=${n}`).join(' ')}`);
  for (const p of problems) console.log('   !', p);
  if (problems.length) process.exitCode = 1;
}
