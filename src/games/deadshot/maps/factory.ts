import { MapBuilder, yawTo, type MapDef, type Theme } from './builder';
import { finish, mountains, spawnColumn, v } from './common';

// ---------------------------------------------------------------------------
// FACTORY — industrial plant with a central hall, catwalks and container yards.

export function factory(): MapDef {
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
