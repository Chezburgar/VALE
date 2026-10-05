import { MapBuilder, rng, yawTo, type MapDef, type Theme } from './builder';
import { finish, hills, mountains, spawnColumn, treeline, v } from './common';
import { bush, debris, detailedBuilding, logPile, rockCluster, shade, sign, tree, trimRect } from './props';

// ---------------------------------------------------------------------------
// FOREST — a river splits the map; lumber yard, ridge, bridges and dense trees.

const GRASS = 0x5f8f45;

/** Mossy fallen log lying over an existing collider (visual only). */
function fallenLog(b: MapBuilder, x: number, z: number, len: number, axis: 'x' | 'z', r = 0.4): void {
  const sx = axis === 'x' ? x - len / 2 : x;
  const sz = axis === 'z' ? z - len / 2 : z;
  const tilt = axis === 'x' ? { rotZ: -Math.PI / 2 } : { rotX: Math.PI / 2 };
  b.prop({ kind: 'cylinder', x: sx, y: r, z: sz, r, h: len, color: 0x6e4e32, mat: 'bark', segments: 10, ...tilt, ao: false });
  for (const t of [-0.004, len - 0.01]) b.prop({ kind: 'cylinder', x: axis === 'x' ? sx + t : sx, y: r, z: axis === 'z' ? sz + t : sz, r: r * 0.86, h: 0.014, color: 0xc9a46e, mat: 'wood', segments: 10, ...tilt, ao: false });
  b.prop({ kind: 'blob', x, y: r * 1.55, z, r: axis === 'x' ? len * 0.55 : r * 1.2, h: r * 0.5, d: axis === 'z' ? len * 0.55 : r * 1.2, color: 0x557a32, mat: 'leaves', seed: Math.round(x * 3 + z), ao: false });
  b.prop({ kind: 'cylinder', x: axis === 'x' ? x + len * 0.18 : x + r * 0.7, y: r * 1.1, z: axis === 'z' ? z + len * 0.18 : z + r * 0.7, r: 0.07, h: 0.9, d: 0.4, color: 0x5e4630, mat: 'bark', segments: 5, rotY: axis === 'x' ? 0.4 : 1.9, rotX: 0.9, ao: false });
}

export function forest(): MapDef {
  const b = new MapBuilder();
  const W = 46;
  const D = 38;
  const EXT = 120;
  b.aabb(-W, -1.5, -3, W, -0.85, 3, 'gravel', 0x77705f);
  b.box(0, -0.85, 0, 1.6, 0.85, 1.6, 'rock', 0x80847f);
  b.aabb(-W, -0.55, -3, W, -0.5, 3, 'water', 0x3d7f9a, { collide: false });
  // The river keeps flowing past the bounds (visual only).
  for (const s of [-1, 1]) {
    b.aabb(s * W, -1.5, -3, s * EXT, -0.85, 3, 'gravel', 0x77705f, { collide: false });
    b.aabb(s * W, -0.55, -3, s * EXT, -0.5, 3, 'water', 0x3d7f9a, { collide: false });
    for (const zs of [-1, 1]) b.aabb(s * W, -1, zs * 3, s * EXT, 0, zs * D, 'grass', GRASS, { collide: false, patch: 0x7a8a48, sideMat: 'dirt', sideColor: 0x6a5640 });
  }
  b.bounds(-W, W, -D, D);

  b.symmetric((b) => {
    b.aabb(-W, -1, 3, W, 0, D, 'grass', GRASS, { patch: 0x7f8c4a, sideMat: 'dirt', sideColor: 0x6a5640 });
    b.box(0, -0.85, -1.85, 1.6, 0.85, 1.6, 'rock', 0x80847f);
    // Bridge
    b.platform(-18, -4.6, -14, 4.6, 0.3, 0.5, 'wood', 0x8a6a48);
    b.aabb(-18, 0.3, -4.6, -17.8, 1.3, 4.6, 'wood', 0x6b4a32);
    b.aabb(-14.2, 0.3, -4.6, -14, 1.3, 4.6, 'wood', 0x6b4a32);
    for (const x of [-17.6, -14.4]) for (const z of [-2.2, 2.2]) b.prop({ kind: 'cylinder', x, y: -1.0, z, r: 0.18, h: 0.85, color: 0x5a4030, mat: 'bark', segments: 7 });
    for (let z = -4.2; z <= 4.21; z += 1.4)
      for (const x of [-17.9, -14.1]) b.prop({ kind: 'box', x, y: 1.3, z, r: 0.26, h: 0.08, d: 0.26, color: 0x5a3e2a, mat: 'wood', ao: false });
    for (let z = -4.4; z <= 4.41; z += 0.55) b.prop({ kind: 'box', x: -16, y: 0.3, z, r: 3.6, h: 0.012, d: 0.04, color: 0x4a3222, mat: 'plain', ao: false });

    // Lumber yard
    b.box(-30, 0, 20, 7, 1.8, 2.4, 'bark', 0x6b4b33, { visible: false });
    logPile(b, -30, 20, { len: 7, axis: 'x', rows: 2, r: 0.42, collide: false, color: 0x8a6440 });
    for (const [px, pz] of [
      [-24, 24],
      [-16, 24],
      [-24, 30],
      [-16, 30],
    ])
      b.post(px, pz, 0, 3.6, 0.3, 0x5a4030, 'wood');
    b.aabb(-24.4, 3.6, 23.6, -15.6, 3.9, 30.4, 'wood', 0x7a5a3c);
    b.prop({ kind: 'prism', x: -20, y: 3.9, z: 27, r: 9.2, h: 0.9, d: 7.4, color: 0x5b6670, mat: 'metal', axis: 'x' });
    trimRect(b, -24.4, 23.6, -15.6, 30.4, 3.6, { h: 0.3, out: 0.06, color: 0x5a3e2a, mat: 'wood' });
    b.box(-20, 0, 27, 3, 1.0, 1.2, 'metal', 0x7d8389);
    b.prop({ kind: 'box', x: -20, y: 1.0, z: 27, r: 3.1, h: 0.06, d: 1.3, color: 0x9a7a52, mat: 'wood', ao: false });
    b.prop({ kind: 'cylinder', x: -19.6, y: 1.06, z: 26.6, r: 0.42, h: 0.02, color: 0xc8ccd0, mat: 'steel', segments: 18, rotX: Math.PI / 2, ao: false });
    b.prop({ kind: 'box', x: -21.2, y: 1.06, z: 27, r: 0.9, h: 0.22, d: 0.3, color: 0xd8b48a, mat: 'wood', ao: false });
    b.decal('sand', -20, 27, 4.6, 3.2, { color: 0xe8d0a0 });
    b.box(-22.6, 0, 29, 2.2, 0.6, 1.0, 'wood', 0xb08a5a, { visible: false });
    for (let i = 0; i < 4; i++) b.prop({ kind: 'box', x: -22.6, y: i * 0.15, z: 29 + (i % 2 ? 0.05 : -0.04), r: 2.2, h: 0.14, d: 0.98, color: shade(0xb08a5a, 0.9 + (i % 2) * 0.12), mat: 'wood' });
    b.box(-11, 0, 26, 1.1, 1.1, 1.1, 'crate', 0xa07a48);
    detailedBuilding(b, { x0: -40, z0: 24, x1: -33, z1: 32, h: 4, mat: 'wood', color: 0x7a5a3c, doors: [{ side: 'E', at: 27 }], windows: [{ side: 'S', at: -36.5 }], roof: 'access', roofColor: 0x5e4834 }, { trim: 0x4a3222, shutters: 0x3f6a3a, doorLamp: true, plinth: 0x6a6a62, floor: { mat: 'wood', color: 0x9a7a5a } });
    sign(b, 'RANGER STATION', -32.97, 2.75, 29.2, { w: 2.4, h: 0.45, rot: Math.PI / 2, bg: 0x2f4a2a, fg: 0xf0e2b0 });
    b.decal('dirt', -30, 26, 9, 7, { rot: 0.3 });
    b.decal('dirt', -25, 18, 6, 4, { rot: 1.2 });

    // Ridge terraces
    b.box(-30, 0, -22, 14, 0.5, 10, 'grass', 0x58853f, { patch: 0x7f8c4a, sideMat: 'rock', sideColor: 0x7d7a6c });
    b.box(-30, 0.5, -22, 10, 0.5, 7, 'grass', 0x527d3b, { patch: 0x7f8c4a, sideMat: 'rock', sideColor: 0x7d7a6c });
    b.box(-31, 1.0, -22, 6, 0.5, 4.5, 'grass', 0x4d7637, { patch: 0x7f8c4a, sideMat: 'rock', sideColor: 0x7d7a6c });
    rockCluster(b, -32.5, -21, { w: 1.6, h: 1.1, d: 1.4, y: 1.5, color: 0x7d807a, moss: true, pebbles: 2 });
    rockCluster(b, -26, -26.2, { w: 2, h: 1.0, d: 1.4, y: 0.5, color: 0x7d807a, moss: true, pebbles: 2 });

    // Fallen logs & rocks
    for (const [x, z, len, axis] of [
      [-10, 14, 5, 'x'],
      [-24, 8, 4, 'z'],
      [-6, -12, 4.5, 'x'],
      [-36, 10, 4, 'x'],
    ] as const) {
      const w = axis === 'x' ? len : 0.8;
      const d = axis === 'x' ? 0.8 : len;
      b.box(x, 0, z, w, 0.8, d, 'bark', 0x6b4b33, { visible: false });
      fallenLog(b, x, z, len, axis);
    }
    rockCluster(b, -16, -16, { w: 2.6, h: 1.4, d: 2.0, color: 0x80847f, moss: true });
    rockCluster(b, -4, 22, { w: 2.2, h: 1.2, d: 1.8, color: 0x80847f, moss: true });
    rockCluster(b, -38, -6, { w: 2.4, h: 1.3, d: 2.0, color: 0x80847f, moss: true });
    b.crate(-26, 14, 1.1, 0, 0x9a7448);
    b.crate(-27.1, 14, 1.1, 0, 0x9a7448);

    spawnColumn(b, -43, [-14, -7, 7, 14]);
    b.spawn(-42, 20, yawTo(-42, 20, 0, 0));
    b.spawn(-42, -30, yawTo(-42, -30, 0, 0));

    // Trees: seeded scatter over this half, avoiding paths and features.
    const rand = rng(42);
    const noGo: [number, number, number, number][] = [
      [-48, -6, 48, 6], // river
      [-21, -8, -11, 8], // bridge approach
      [-42.5, 16.5, -13.5, 33.5], // lumber yard + cabin
      [-38.5, -28.5, -21.5, -15.5], // ridge
      [-46, -18, -37, 18], // spawn
      [-31, 8, -21, 16], // flag A
      [-13.5, 11.5, -6.5, 16.5],
      [-26.5, 5.5, -21.5, 10.5],
      [-9, -14.5, -3, -9.5],
      [-39, 8, -33, 12],
      [-18, -18, -14, -14],
      [-6, 20, -2, 24],
      [-40, -8, -36, -4],
    ];
    const placed: [number, number][] = [];
    for (let i = 0; i < 500 && placed.length < 46; i++) {
      const x = -45 + rand() * 43.5;
      const z = -37 + rand() * 74;
      const h = 7 + rand() * 6;
      const kind = rand() < 0.7 ? 'pine' : 'oak';
      if (noGo.some(([a, c, bb, d]) => x > a && x < bb && z > c && z < d)) continue;
      if (placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 3.6 ** 2)) continue;
      placed.push([x, z]);
      const birch = kind === 'oak' && (Math.floor(Math.abs(x * 7 + z * 3)) & 3) === 0;
      tree(b, x, z, { kind: birch ? 'birch' : kind, h: birch ? h * 0.9 : h });
      if (kind === 'oak' && !birch) b.decal('leaves', x + 0.6, z - 0.4, h * 0.45, h * 0.45, { rot: x * 3 });
      else b.decal('moss', x, z, 2.4, 2.4, { rot: z });
    }
    // Bushes (visual)
    for (let i = 0; i < 26; i++) {
      const x = -45 + rand() * 43;
      const z = 6 + rand() * 31;
      if (noGo.some(([a, c, bb, d]) => x > a && x < bb && z > c && z < d)) continue;
      bush(b, x, z, { r: 0.6 + rand() * 0.4, color: rand() < 0.5 ? 0x4a7a36 : 0x56843a });
    }

    // Paths and ground cover
    b.ribbon('path', [[-44, 10.5], [-36, 11.5], [-28, 10.8], [-22, 7.5], [-18.2, 4.4]], 2.2);
    b.ribbon('path', [[-44, -10.5], [-36, -11.4], [-27, -10], [-21, -7.4], [-18.2, -4.4]], 2.2);
    b.ribbon('path', [[-28, 11], [-26, 15.5], [-24.5, 22], [-21, 25.5]], 1.8);
    b.ribbon('path', [[-26, 15.5], [-31.5, 17.6], [-32.6, 25.8]], 1.6);
    b.ribbon('path', [[-24, -11.5], [-25.5, -15.6]], 1.6);
    const grassAvoid: [number, number, number, number][] = [[-25, 23, -15, 31]];
    b.scatterArea('grass', -46, 3.2, -1, 38, 1500, { seed: 31, color: 0x6f9a48, colorVar: 0.22, on: ['grass'], avoid: grassAvoid, maxY: 1.6 });
    b.scatterArea('grass', -46, -38, -1, -3.2, 1500, { seed: 32, color: 0x6f9a48, colorVar: 0.22, on: ['grass'], maxY: 1.6 });
    b.scatterArea('tallgrass', -46, -38, -1, 38, 260, { seed: 33, color: 0x7a9a4a, on: ['grass'], avoid: grassAvoid, maxY: 1.6 });
    b.scatterArea('flowers', -46, -38, -1, 38, 180, { seed: 34, color: 0xffffff, colorVar: 0.1, on: ['grass'], avoid: grassAvoid, maxY: 1.6 });
    b.scatterArea('fern', -46, -38, -1, 38, 160, { seed: 35, color: 0x5f8a3e, on: ['grass'], avoid: grassAvoid, maxY: 1.6 });
    b.scatterArea('mushroom', -46, -38, -1, 38, 40, { seed: 36, on: ['grass'] });
    b.scatterArea('twig', -46, -38, -1, 38, 70, { seed: 37, color: 0x6a5240, on: ['grass'] });
    b.scatterArea('reed', -46, 3.0, -1, 4.2, 70, { seed: 38, color: 0x7a9050, on: ['grass'] });
    b.scatterArea('pebble', -46, -2.8, -1, 2.8, 120, { seed: 39, color: 0x8a8678, on: ['gravel'], maxY: -0.8 });
    debris(b, -28.5, 23, { radius: 1.6, count: 8, color: 0x9a7a52 });
  });

  // Scenery: dense forest beyond the bounds, rolling hills and mountains
  treeline(b, 52, 110, 260, 0x2f5a36, 5, { skip: (x, z) => (Math.abs(x) < W + 3 && Math.abs(z) < D + 3) || Math.abs(z) < 6 });
  hills(b, 125, 180, 0x4f6f40, 6, { count: 20, h: [10, 26] });
  mountains(b, 150, 0x51704a, null, 5);

  const theme: Theme = {
    skyTop: 0x4a84c8,
    skyHorizon: 0xc8dfd2,
    skyBottom: 0x5a6a50,
    fog: 0xa9c6b2,
    fogNear: 35,
    fogFar: 250,
    sun: 0xfff2d6,
    sunIntensity: 2.5,
    sunDir: [0.45, 0.85, 0.3],
    hemiSky: 0xd8f0ff,
    hemiGround: 0x3e5230,
    hemiIntensity: 1.1,
    particles: 'pollen',
    exposure: 1.0,
    ambience: 'forest',
    clouds: { cover: 0.46, scale: 1.1, speed: 1 },
    glow: 0.5,
    water: { shallow: 0x5a9a8a, deep: 0x1d4a52 },
    backdrop: { mat: 'grass', color: GRASS, patch: 0x7a8a48, hole: [-EXT, -D, EXT, D] },
  };

  return finish('forest', b, {
    flags: [v(-27, 0, 12), v(0, 0, 0), v(27, 0, -12)],
    hardpoints: [v(0, 0, 0), v(-16, 0, 0), v(16, 0, 0), v(-20, 0, 25), v(20, 0, -25)],
    theme,
    bounds: { minX: -W, maxX: W, minZ: -D, maxZ: D },
    menuCam: [
      { from: v(-34, 9, -6), to: v(0, 1, 0) },
      { from: v(-20, 6, 34), to: v(-20, 2, 0) },
      { from: v(28, 10, 26), to: v(0, 1, -8) },
    ],
  });
}
