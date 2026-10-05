import { MapBuilder, yawTo, type MapDef, type Theme } from './builder';
import { finish, mountains, spawnColumn, v } from './common';

// ---------------------------------------------------------------------------
// SNOWFALL — mountain village with cabins, a fountain square and watchtowers.

export function snowfall(): MapDef {
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
