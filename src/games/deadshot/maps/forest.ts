import { MapBuilder, rng, yawTo, type MapDef, type Theme } from './builder';
import { finish, mountains, spawnColumn, v } from './common';

// ---------------------------------------------------------------------------
// FOREST — a river splits the map; lumber yard, ridge, bridges and dense trees.

export function forest(): MapDef {
  const b = new MapBuilder();
  const W = 46;
  const D = 38;
  b.aabb(-W, -1.5, -3, W, -0.85, 3, 'dirt', 0x6d5a44);
  b.box(0, -0.85, 0, 1.6, 0.85, 1.6, 'rock', 0x80847f);
  b.aabb(-W, -0.55, -3, W, -0.5, 3, 'water', 0x3d7f9a, { collide: false });
  b.bounds(-W, W, -D, D);

  b.symmetric((b) => {
    b.aabb(-W, -1, 3, W, 0, D, 'grass', 0x5f8f45);
    b.box(0, -0.85, -1.85, 1.6, 0.85, 1.6, 'rock', 0x80847f);
    // Bridge
    b.platform(-18, -4.6, -14, 4.6, 0.3, 0.5, 'wood', 0x8a6a48);
    b.aabb(-18, 0.3, -4.6, -17.8, 1.3, 4.6, 'wood', 0x6b4a32);
    b.aabb(-14.2, 0.3, -4.6, -14, 1.3, 4.6, 'wood', 0x6b4a32);

    // Lumber yard
    b.box(-30, 0, 20, 7, 1.8, 2.4, 'bark', 0x6b4b33, { visible: false });
    for (const [y, z] of [
      [0.42, 19.2],
      [0.42, 20.0],
      [0.42, 20.8],
      [1.2, 19.6],
      [1.2, 20.4],
    ])
      b.prop({ kind: 'cylinder', x: -33.5, y, z, r: 0.42, h: 7, color: 0x8a6440, mat: 'bark', axis: 'x', segments: 9 });
    for (const [px, pz] of [
      [-24, 24],
      [-16, 24],
      [-24, 30],
      [-16, 30],
    ])
      b.post(px, pz, 0, 3.6, 0.3, 0x5a4030, 'wood');
    b.aabb(-24.4, 3.6, 23.6, -15.6, 3.9, 30.4, 'wood', 0x7a5a3c);
    b.box(-20, 0, 27, 3, 1.0, 1.2, 'metal', 0x7d8389);
    b.box(-11, 0, 26, 1.1, 1.1, 1.1, 'crate', 0xa07a48);
    b.building({ x0: -40, z0: 24, x1: -33, z1: 32, h: 4, mat: 'wood', color: 0x7a5a3c, doors: [{ side: 'E', at: 27 }], windows: [{ side: 'S', at: -36.5 }], roof: 'access', roofColor: 0x5e4834 });

    // Ridge terraces
    b.box(-30, 0, -22, 14, 0.5, 10, 'grass', 0x58853f);
    b.box(-30, 0.5, -22, 10, 0.5, 7, 'grass', 0x527d3b);
    b.box(-31, 1.0, -22, 6, 0.5, 4.5, 'grass', 0x4d7637);
    b.rock(-32.5, -21, 1.6, 1.1, 1.4, 0x7d807a, 1.5);
    b.rock(-26, -26.2, 2, 1.0, 1.4, 0x7d807a, 0.5);

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
      b.prop({ kind: 'cylinder', x: axis === 'x' ? x - len / 2 : x, y: 0.4, z: axis === 'z' ? z - len / 2 : z, r: 0.4, h: len, color: 0x7a5636, mat: 'bark', axis, segments: 9 });
    }
    b.rock(-16, -16, 2.6, 1.4, 2.0, 0x80847f);
    b.rock(-4, 22, 2.2, 1.2, 1.8, 0x80847f);
    b.rock(-38, -6, 2.4, 1.3, 2.0, 0x80847f);
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
      b.tree(x, z, h, kind);
    }
    // Bushes (visual)
    for (let i = 0; i < 26; i++) {
      const x = -45 + rand() * 43;
      const z = 6 + rand() * 31;
      if (noGo.some(([a, c, bb, d]) => x > a && x < bb && z > c && z < d)) continue;
      b.prop({ kind: 'sphere', x, y: 0.2, z, r: 0.7 + rand() * 0.5, h: 0, color: 0x4a7a36, mat: 'leaves', segments: 6 });
    }
  });

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
