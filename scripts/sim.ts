import { Match } from '../src/games/deadshot/match';
import { Simulation } from '../src/games/deadshot/sim';
import { MAP_ORDER, MODE_ORDER, type ModeId, type MapId } from '../src/games/deadshot/config';

const modes = (process.argv[2] ?? 'ffa').split(',') as ModeId[];
const maps = (process.argv[3] ?? MAP_ORDER.join(',')).split(',') as MapId[];
const secs = Number(process.argv[4] ?? 120);
for (const map of maps) for (const mode of modes) {
  const m = new Match({ mode, map, bots: 8, difficulty: 'normal', scoreLimit: 999, timeLimit: secs + 10 });
  const sim = new Simulation(m);
  for (let i = 0; i < 8; i++) sim.addBot((i % 2) as 0 | 1);
  for (const a of m.actors) m.spawnActor(a);
  const t0 = performance.now();
  const dt = 1 / 60;
  let maxY = 0; const visitedCells = new Set<string>();
  let shots = 0; m.on((e) => { if (e.type === 'shot') shots++; });
  for (let i = 0; i < secs * 60; i++) {
    sim.step(dt);
    if (i % 30 === 0) for (const a of m.actors) if (a.alive) { maxY = Math.max(maxY, a.body.y); visitedCells.add(`${Math.floor(a.body.x/4)},${Math.floor(a.body.z/4)}`); }
  }
  const t1 = performance.now();
  const kills = m.actors.reduce((s, a) => s + a.kills, 0);
  const hs = m.actors.reduce((s, a) => s + a.headshots, 0);
  const fired = m.actors.reduce((s, a) => s + a.shotsFired, 0);
  const hit = m.actors.reduce((s, a) => s + a.shotsHit, 0);
  console.log(`${map}/${mode}: ${secs}s sim in ${(t1-t0).toFixed(0)}ms | kills=${kills} hs=${hs} acc=${(hit/Math.max(1,fired)*100).toFixed(0)}% teamScores=${m.teamScores} maxY=${maxY.toFixed(1)} cells=${visitedCells.size}`);
  console.log('   ', m.actors.map(a => `${a.name}(${a.classId}) ${a.kills}/${a.deaths}`).join(', '));
}
