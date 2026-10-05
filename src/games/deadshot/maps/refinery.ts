import { MapBuilder, type MapDef, type Theme } from './builder';
import { finish, mountains, spawnColumn, v } from './common';

// ---------------------------------------------------------------------------
// REFINERY — storage tanks around a central plaza, raised pipe-rack walkways.

export function refinery(): MapDef {
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
    b.prop({ kind: 'cylinder', x: -9, y: 7.2, z: -4.9, r: 0.35, h: 9.8, color: 0x8c6a4a, mat: 'metal', axis: 'z', segments: 10 });
    b.prop({ kind: 'cylinder', x: -4.9, y: 7.8, z: 9, r: 0.3, h: 9.8, color: 0x7a7f84, mat: 'metal', axis: 'x', segments: 10 });
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
