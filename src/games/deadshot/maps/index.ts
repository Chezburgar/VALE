import type { MapId } from '../config';
import { MapBuilder, rng, yawTo, type MapDef, type Theme, type V3 } from './builder';

export type { MapDef } from './builder';

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

function finish(id: MapId, b: MapBuilder, o: Omit<MapDef, 'id' | 'boxes' | 'props' | 'spawns'>): MapDef {
  return { id, boxes: b.boxes, props: b.props, spawns: b.spawns, ...o };
}

/** Spawns in a column facing the map center. */
function spawnColumn(b: MapBuilder, x: number, zs: number[]): void {
  for (const z of zs) b.spawn(x, z, yawTo(x, z, 0, z * 0.3));
}

/** Distant scenery ring (purely visual). */
function mountains(b: MapBuilder, r: number, color: number, snow: number | null, seed: number): void {
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

// ---------------------------------------------------------------------------
// FACTORY — industrial plant with a central hall, catwalks and container yards.

function factory(): MapDef {
  const b = new MapBuilder();
  const W = 46;
  const D = 34;
  b.aabb(-W, -1, -D, W, 0, D, 'asphalt', 0x5b5e61);
  b.aabb(-15, 0, -10, 15, 0.02, 10, 'concrete', 0x8e8b85, { collide: false });
  // Perimeter wall
  b.aabb(-W, 0, D - 0.4, W, 6, D + 0.2, 'concrete', 0xa9a59d);
  b.aabb(-W, 0, -D - 0.2, W, 6, -D + 0.4, 'concrete', 0xa9a59d);
  b.aabb(-W - 0.2, 0, -D, -W + 0.4, 6, D, 'concrete', 0xa9a59d);
  b.aabb(W - 0.4, 0, -D, W + 0.2, 6, D, 'concrete', 0xa9a59d);
  b.bounds(-W, W, -D, D);
  b.crate(0, 0, 1.1, 0, 0xa07a48);

  b.symmetric((b) => {
    const hall = 0x7d8a93;
    // Hall walls (west with big door, north with a door and high windows)
    b.wallZ(-10, 10, -15, 0, 9, 0.6, 'metal', hall, [[-3, 3, 0, 5]]);
    b.wallX(-15.3, 15.3, 10, 0, 9, 0.6, 'metal', hall, [
      [-11, -7, 0, 3.4],
      [-4, -1, 5.0, 6.4],
      [3, 6, 5.0, 6.4],
    ]);
    b.aabb(-15.3, 9, 4, 15.3, 9.4, 10.3, 'metal', 0x4b5258);
    // Catwalk along the north wall
    b.platform(-14.7, 7.2, 14.7, 9.7, 4, 0.3, 'metal', 0x5c656b);
    b.aabb(-14.7, 4, 7.0, -13.3, 5.0, 7.2, 'metal', 0x6f7a80);
    b.aabb(-11.1, 4, 7.0, 14.7, 5.0, 7.2, 'metal', 0x6f7a80);
    b.stairs(-12.2, 1.7, 'N', 2.0, 0, 4, 'metal', 0x6b7177);
    for (const x of [-7, 0, 7]) b.post(x, 8.4, 0, 3.7, 0.35);
    // Hall floor: conveyor, machines, crates
    b.box(-7, 0, 0, 10, 1.0, 1.6, 'metal', 0x3d4348);
    b.box(-7, 1.0, 0, 9.6, 0.08, 1.2, 'plain', 0x1d2022, { collide: false });
    b.box(-8, 0, -5.5, 3.2, 3.0, 3.2, 'metal', 0xc58a2c);
    b.box(-3, 0, 5, 2.4, 2.2, 2.0, 'metal', 0x4f6f8a);
    b.crate(-12, -6.2);
    b.crate(-12, -7.4);
    b.crate(-12, -6.8, 1.1, 1.1);
    b.crate(-4.5, -3.2, 1.0);

    // West spawn yard
    spawnColumn(b, -42, [-14, -7, 0, 7, 14]);
    b.spawn(-38, -20, yawTo(-38, -20, 0, 0));
    b.spawn(-38, 20, yawTo(-38, 20, 0, 0));
    b.container(-30, -5, false, 0xa3412f);
    b.container(-27, 8, true, 0x2f5f8f);
    b.container(-36, -22, true, 0x3f7f4a);
    b.crate(-32.4, -21.6, 1.1);
    b.crate(-32.4, -22.8, 1.1);
    b.crate(-32.4, -22.8, 1.1, 1.1);
    b.container(-24, -27, true, 0x7a7f84);
    b.container(-24, -27, true, 0x8a3a30, 2.6);
    b.crate(-36, 4, 1.1);
    b.crate(-36, 5.2, 1.1);

    // North-west: office with roof access and a loading dock
    b.building({
      x0: -42,
      z0: 21,
      x1: -34,
      z1: 30,
      h: 4.2,
      mat: 'brick',
      color: 0x9a5a44,
      doors: [{ side: 'E', at: 24 }],
      windows: [
        { side: 'S', at: -38 },
        { side: 'E', at: 27.5 },
      ],
      roof: 'access',
      roofColor: 0x6d6a66,
    });
    b.platform(-32, 22, -18, 33.6, 1.3, 1.3, 'concrete', 0x8a8780);
    b.stairs(-25, 19.8, 'N', 3, 0, 1.3, 'concrete', 0x8a8780);
    b.crate(-21, 24, 1.1, 1.3);
    b.crate(-28.5, 30, 1.1, 1.3);
    b.crate(-28.5, 31.2, 1.1, 1.3);
    b.box(-14, 0, 27, 2.6, 3.2, 8, 'metal', 0xdedbd2);
    b.box(-14, 0, 22, 2.4, 2.4, 2, 'metal', 0x2a6db0);

    // North lane cover
    b.box(-6, 0, 15, 3, 1.0, 0.7, 'concrete', 0xb5b2aa);
    b.box(4, 0, 18.5, 3, 1.0, 0.7, 'concrete', 0xb5b2aa);
    b.container(-4, 24, true, 0x2f6f5f);
    b.crate(6, 28.5);
    b.crate(7.1, 28.5);
    b.crate(6.5, 28.5, 1.1, 1.1);

    // South-west: generator shed, barrels, crates
    b.building({
      x0: -22,
      z0: -31,
      x1: -15,
      z1: -22,
      h: 3.2,
      mat: 'concrete',
      color: 0xa8a49c,
      doors: [
        { side: 'N', at: -18.5 },
        { side: 'E', at: -26.5 },
      ],
      windows: [{ side: 'W', at: -26.5 }],
      roof: 'flat',
    });
    b.barrel(-12, -15, 0x2f6fa0);
    b.barrel(-11.2, -15.6, 0x2f6fa0);
    b.barrel(-12.3, -16.4, 0x9a3030);
    b.crate(-20, -15);
    b.crate(-21.1, -15);
    b.crate(-20.5, -15, 1.1, 1.1);

    // Lamps
    for (const [x, z] of [
      [-20, 12],
      [-34, -12],
    ])
      lamp(b, x, z);
  });

  mountains(b, 160, 0x7d8b80, null, 7);

  const theme: Theme = {
    skyTop: 0x4f86d0,
    skyHorizon: 0xcfe0ea,
    skyBottom: 0x8a9aa6,
    fog: 0xbfd0dc,
    fogNear: 70,
    fogFar: 300,
    sun: 0xfff0d8,
    sunIntensity: 2.6,
    sunDir: [-0.55, 0.8, 0.35],
    hemiSky: 0xd4e6ff,
    hemiGround: 0x5e584f,
    hemiIntensity: 1.2,
    particles: 'dust',
    exposure: 1.0,
    ambience: 'industrial',
  };

  return finish('factory', b, {
    flags: [v(-30, 0, 1), v(0, 0, 0), v(30, 0, -1)],
    hardpoints: [v(0, 0, 0), v(-24, 0, 14), v(24, 0, -14), v(6, 0, 20), v(-6, 0, -20)],
    theme,
    bounds: { minX: -W, maxX: W, minZ: -D, maxZ: D },
    menuCam: [
      { from: v(-40, 14, 30), to: v(0, 2, 0) },
      { from: v(38, 10, -24), to: v(-10, 2, 5) },
      { from: v(-8, 6.5, -8), to: v(12, 3, 8) },
    ],
  });
}

function lamp(b: MapBuilder, x: number, z: number): void {
  b.post(x, z, 0, 6, 0.22, 0x50565b);
  b.prop({ kind: 'box', x, y: 6, z, r: 1.4, h: 0.18, d: 0.5, color: 0x3a3f43, mat: 'metal' });
  b.prop({ kind: 'box', x, y: 5.94, z, r: 1.1, h: 0.06, d: 0.35, color: 0xfff3c4, emissive: 0xfff0c0 });
}

// ---------------------------------------------------------------------------
// REFINERY — storage tanks around a central plaza, raised pipe-rack walkways.

function refinery(): MapDef {
  const b = new MapBuilder();
  const W = 46;
  const D = 36;
  b.aabb(-W, -1, -D, W, 0, D, 'dirt', 0x8b7660);
  b.aabb(-16, 0, -16, 16, 0.02, 16, 'concrete', 0x9a948a, { collide: false });
  b.aabb(-W, 0, D - 0.4, W, 3.2, D + 0.2, 'concrete', 0xb3a894);
  b.aabb(-W, 0, -D - 0.2, W, 3.2, -D + 0.4, 'concrete', 0xb3a894);
  b.aabb(-W - 0.2, 0, -D, -W + 0.4, 3.2, D, 'concrete', 0xb3a894);
  b.aabb(W - 0.4, 0, -D, W + 0.2, 3.2, D, 'concrete', 0xb3a894);
  b.bounds(-W, W, -D, D);

  b.symmetric((b) => {
    // Main tanks around the plaza
    b.tank(-9, 9, 4.2, 9, 0xddd6c6);
    b.tank(-9, -9, 4.2, 9, 0xc9ced1);
    b.prop({ kind: 'cylinder', x: -9, y: 7.2, z: 0, r: 0.35, h: 10, color: 0x8c6a4a, mat: 'metal', axis: 'z', segments: 10 });
    b.prop({ kind: 'cylinder', x: 0, y: 7.8, z: 9, r: 0.3, h: 10, color: 0x7a7f84, mat: 'metal', axis: 'x', segments: 10 });
    // Plaza cover
    b.box(0, 0, 3.2, 2.4, 1.1, 0.6, 'concrete', 0xb9b2a5);
    b.box(-2.8, 0, 0, 1.0, 1.4, 1.6, 'metal', 0x9c3b2c);

    // Pipe-rack walkway (x = -22) with stairs at both ends
    const wx = -22;
    b.platform(wx - 1.3, -24, wx + 1.3, 24, 4.5, 0.3, 'metal', 0x6a6f73);
    b.aabb(wx - 1.3, 4.5, -24, wx - 1.1, 5.5, 24, 'metal', 0x80868b);
    b.aabb(wx + 1.1, 4.5, -24, wx + 1.3, 5.5, 24, 'metal', 0x80868b);
    b.stairs(wx, 30.6, 'S', 2.4, 0, 4.5, 'metal', 0x6b7177);
    b.stairs(wx, -30.6, 'N', 2.4, 0, 4.5, 'metal', 0x6b7177);
    for (let z = -21; z <= 21; z += 7) {
      b.post(wx - 1.1, z, 0, 4.2, 0.28);
      b.post(wx + 1.1, z, 0, 4.2, 0.28);
    }
    for (const [y, r, c] of [
      [3.3, 0.32, 0xb5552f],
      [3.85, 0.22, 0x8a8f94],
    ] as const)
      b.prop({ kind: 'cylinder', x: wx + 0.4, y, z: -24, r, h: 48, color: c, mat: 'metal', axis: 'z', segments: 10 });

    // Control building with roof access
    b.building({
      x0: -40,
      z0: -6,
      x1: -31,
      z1: 6,
      h: 4.5,
      mat: 'concrete',
      color: 0xb7ad9c,
      doors: [
        { side: 'E', at: -3 },
        { side: 'E', at: 3 },
      ],
      windows: [
        { side: 'N', at: -35.5 },
        { side: 'S', at: -35.5 },
        { side: 'E', at: 0 },
      ],
      roof: 'access',
      roofColor: 0x8a8378,
    });
    spawnColumn(b, -43, [-26, -18, -11, 11, 18, 26]);

    // Small tanks, containers, barrels
    b.tank(-30, 22, 2.4, 5, 0xe0ddd2);
    b.tank(-37, 27, 2.4, 5, 0xe0ddd2);
    b.tank(-31, -24, 3, 6, 0xb7c0c4);
    b.container(-12, 24, true, 0x8f3b2b);
    b.container(-12, 21.5, true, 0x2f5f8f);
    b.barrel(-14, -20, 0xc9a227);
    b.barrel(-14.8, -20.6, 0xc9a227);
    b.barrel(-13.3, -20.8, 0x9a3030);
    b.barrel(-14.2, -21.5, 0xc9a227);
    b.crate(-4, -22);
    b.crate(-4, -23.1);
    b.crate(-4, -22.5, 1.1, 1.1);
    b.box(-30, 0, 11, 4, 1.1, 0.8, 'concrete', 0xb9b2a5);
    b.box(-6, 0, 30, 3, 1.1, 0.8, 'concrete', 0xb9b2a5);
    // Flare stack (visual)
    b.prop({ kind: 'cylinder', x: -40, y: 0, z: 32, r: 0.6, h: 22, d: 0.6, color: 0x8b8f92, mat: 'metal', segments: 10 });
    b.prop({ kind: 'sphere', x: -40, y: 22.6, z: 32, r: 0.9, h: 0, color: 0xffb347, emissive: 0xff8a2a, segments: 8 });
  });

  mountains(b, 170, 0x6a4a48, null, 11);

  const theme: Theme = {
    skyTop: 0x34437c,
    skyHorizon: 0xffa56b,
    skyBottom: 0x5a3e3a,
    fog: 0xd99a72,
    fogNear: 60,
    fogFar: 280,
    sun: 0xffb27a,
    sunIntensity: 2.8,
    sunDir: [-0.85, 0.32, 0.25],
    hemiSky: 0xffcfa8,
    hemiGround: 0x4a3a35,
    hemiIntensity: 1.0,
    particles: 'dust',
    exposure: 1.05,
    ambience: 'industrial',
  };

  return finish('refinery', b, {
    flags: [v(-26, 0, 0), v(0, 0, 0), v(26, 0, 0)],
    hardpoints: [v(0, 0, 0), v(-22, 0, 0), v(22, 0, 0), v(-20, 0, 28), v(20, 0, -28)],
    theme,
    bounds: { minX: -W, maxX: W, minZ: -D, maxZ: D },
    menuCam: [
      { from: v(-36, 12, 30), to: v(0, 4, 0) },
      { from: v(-22, 6.2, -20), to: v(0, 3, 10) },
      { from: v(30, 9, -30), to: v(-5, 4, 5) },
    ],
  });
}

// ---------------------------------------------------------------------------
// SNOWFALL — mountain village with cabins, a fountain square and watchtowers.

function snowfall(): MapDef {
  const b = new MapBuilder();
  const W = 44;
  const D = 36;
  b.aabb(-W, -1, -D, W, 0, D, 'snow', 0xe9eff3);
  b.aabb(-7, 0, -7, 7, 0.02, 7, 'rock', 0xb8c0c6, { collide: false });
  b.bounds(-W, W, -D, D);
  // Fountain
  b.box(0, 0, 0, 4, 0.8, 4, 'rock', 0x9aa3a8);
  b.box(0, 0.8, 0, 1, 1.6, 1, 'rock', 0xa9b2b7);
  b.box(0, 0.62, 0, 3.4, 0.2, 3.4, 'glass', 0xbfe6f2, { collide: false });
  b.prop({ kind: 'sphere', x: 0, y: 2.55, z: 0, r: 0.45, h: 0, color: 0xe8f4f8, mat: 'snow', segments: 8 });

  b.symmetric((b) => {
    const wood = 0x7a5236;
    const snowRoof = 0xeef3f6;
    b.building({ x0: -18, z0: 8, x1: -11, z1: 14, h: 3.2, mat: 'wood', color: wood, doors: [{ side: 'S', at: -14.5 }], windows: [{ side: 'E', at: 11 }, { side: 'W', at: 11 }, { side: 'N', at: -14.5 }], roof: 'pitched', roofColor: snowRoof });
    b.building({ x0: -30, z0: -10, x1: -24, z1: -2, h: 3.2, mat: 'wood', color: 0x6e4a32, doors: [{ side: 'E', at: -6 }], windows: [{ side: 'N', at: -27 }, { side: 'S', at: -27 }], roof: 'pitched', roofColor: snowRoof });
    b.building({ x0: -38, z0: 14, x1: -32, z1: 20, h: 3.2, mat: 'wood', color: 0x80583b, doors: [{ side: 'S', at: -35 }], windows: [{ side: 'E', at: 17 }], roof: 'pitched', roofColor: snowRoof });
    // Chimneys (visual)
    b.prop({ kind: 'box', x: -12.5, y: 3.2, z: 12.5, r: 0.7, h: 3.0, d: 0.7, color: 0x7d6f66, mat: 'brick' });

    // Watchtower
    const tx = -22;
    const tz = -22;
    for (const [px, pz] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ])
      b.post(tx + px, tz + pz, 0, 7.4, 0.32, 0x5a4030, 'wood');
    b.platform(tx - 2.2, tz - 2.2, tx + 2.2, tz + 2.2, 5, 0.3, 'wood', 0x7a5a3c);
    b.aabb(tx - 2.2, 5, tz - 2.2, tx + 2.2, 6, tz - 2.0, 'wood', 0x6b4a32);
    b.aabb(tx - 2.2, 5, tz - 2.0, tx - 2.0, 6, tz + 2.2, 'wood', 0x6b4a32);
    b.aabb(tx + 2.0, 5, tz - 2.0, tx + 2.2, 6, tz + 2.2, 'wood', 0x6b4a32);
    b.aabb(tx - 2.2, 5, tz + 2.0, tx - 0.75, 6, tz + 2.2, 'wood', 0x6b4a32);
    b.aabb(tx + 0.75, 5, tz + 2.0, tx + 2.2, 6, tz + 2.2, 'wood', 0x6b4a32);
    b.stairs(tx, tz + 2.2 + 6.6, 'S', 1.4, 0, 5, 'wood', 0x7a5a3c, 5 / 12 + 1e-6, 0.55);
    b.prop({ kind: 'prism', x: tx, y: 7.4, z: tz, r: 5.2, h: 1.6, d: 5.2, color: snowRoof, mat: 'snow', axis: 'x' });

    // Cover: fences, logs, rocks
    b.wallX(-20, -13, -4, 0, 1.0, 0.18, 'wood', 0x6b4a32);
    b.wallZ(16, 24, -24, 0, 1.0, 0.18, 'wood', 0x6b4a32);
    b.box(-14, 0, -12, 3, 0.9, 1.2, 'bark', 0x6a4a35);
    b.box(-6, 0, 20, 1.2, 0.9, 3.2, 'bark', 0x6a4a35);
    b.rock(-8, -16, 2.4, 1.3, 1.8, 0x8d969c);
    b.rock(-36, 4, 3, 1.6, 2.2, 0x8d969c);
    b.rock(-28, 28, 3.4, 2.2, 2.6, 0x8d969c);
    b.rock(-4, 30, 2.6, 1.2, 2.0, 0x8d969c);
    b.crate(-20, 4, 1.1, 0, 0x8a6a48);
    b.crate(-21.1, 4, 1.1, 0, 0x8a6a48);
    b.crate(-20.5, 4, 1.1, 1.1, 0x8a6a48);
    b.box(-30, 0, 9, 2.4, 1.0, 1.0, 'wood', 0x6b4a32);

    for (const [x, z, h] of [
      [-41, -31, 9], [-36, -33, 8], [-42, -20, 10], [-40, -6, 8], [-43, 26, 9], [-30, 33, 10], [-22, 32, 8],
      [-12, 33, 9], [-4, 25, 7], [-10, -30, 8], [-17, -33, 9], [-33, -16, 7], [-6, 13, 6], [-28, 16, 7],
      [-2, -33, 8], [-38, 32, 9],
    ])
      b.tree(x, z, h, 'snowpine');
    spawnColumn(b, -41, [-12, 0, 12]);
    b.spawn(-36, -26, yawTo(-36, -26, 0, 0));
    b.spawn(-34, 26, yawTo(-34, 26, 0, 0));
    lampSnow(b, -8, 6);
  });

  mountains(b, 140, 0x7f8b96, 0xf4f8fb, 3);

  const theme: Theme = {
    skyTop: 0x7c97b8,
    skyHorizon: 0xe3ebf2,
    skyBottom: 0xc9d4dc,
    fog: 0xdbe4ec,
    fogNear: 30,
    fogFar: 230,
    sun: 0xf2f6ff,
    sunIntensity: 1.7,
    sunDir: [0.4, 0.75, -0.5],
    hemiSky: 0xeaf2ff,
    hemiGround: 0xb8c2cc,
    hemiIntensity: 1.5,
    particles: 'snow',
    exposure: 0.95,
    ambience: 'snow',
  };

  return finish('snowfall', b, {
    flags: [v(-26, 0, 5), v(0, 0, 0), v(26, 0, -5)],
    hardpoints: [v(0, 0, 0), v(-22, 0, -22), v(22, 0, 22), v(-14.5, 0, 11), v(14.5, 0, -11)],
    theme,
    bounds: { minX: -W, maxX: W, minZ: -D, maxZ: D },
    menuCam: [
      { from: v(-30, 10, 26), to: v(0, 2, 0) },
      { from: v(-22, 6.8, -22), to: v(10, 2, 10) },
      { from: v(28, 8, -20), to: v(-6, 2, 6) },
    ],
  });
}

function lampSnow(b: MapBuilder, x: number, z: number): void {
  b.post(x, z, 0, 3.4, 0.18, 0x2e2a28);
  b.prop({ kind: 'box', x, y: 3.4, z, r: 0.45, h: 0.55, d: 0.45, color: 0xffe2a0, emissive: 0xffc870 });
}

// ---------------------------------------------------------------------------
// FOREST — a river splits the map; lumber yard, ridge, bridges and dense trees.

function forest(): MapDef {
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

const BUILDERS: Record<MapId, () => MapDef> = { factory, refinery, snowfall, forest };
const cache = new Map<MapId, MapDef>();

export function getMap(id: MapId): MapDef {
  let m = cache.get(id);
  if (!m) cache.set(id, (m = BUILDERS[id]()));
  return m;
}
