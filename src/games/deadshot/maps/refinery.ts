import { MapBuilder, type MapDef, type Theme } from './builder';
import { finish, hills, mountains, spawnColumn, v } from './common';
import {
  acUnit,
  barrels,
  container,
  debris,
  detailedBuilding,
  drum,
  fence,
  generator,
  jersey,
  ladder,
  palletStack,
  pipeLine,
  pipeRun,
  roofVent,
  sign,
  streetLamp,
  tank,
  trafficCone,
  van,
  wallWindows,
} from './props';

// ---------------------------------------------------------------------------
// REFINERY — storage tanks around a central plaza, raised pipe-rack walkways.

export function refinery(): MapDef {
  const b = new MapBuilder();
  const W = 46;
  const D = 36;
  b.aabb(-W, -1, -D, W, 0, D, 'dirt', 0x8b7660, { patch: 0x9a8a6a });
  b.aabb(-16, 0, -16, 16, 0.02, 16, 'concrete', 0x9a948a, { collide: false, patch: 0x8a8378 });
  b.aabb(-W, 0, D - 0.4, W, 3.2, D + 0.2, 'concrete', 0xb3a894);
  b.aabb(-W, 0, -D - 0.2, W, 3.2, -D + 0.4, 'concrete', 0xb3a894);
  b.aabb(-W - 0.2, 0, -D, -W + 0.4, 3.2, D, 'concrete', 0xb3a894);
  b.aabb(W - 0.4, 0, -D, W + 0.2, 3.2, D, 'concrete', 0xb3a894);
  b.bounds(-W, W, -D, D);
  // Plaza curb and center marking
  b.ribbon('curb', [[-16, -16], [-16, 16], [16, 16], [16, -16], [-16, -16]], 0.35, { y: 0.02 });
  b.decal('manhole', 0, -6, 1.2, 1.2, { y: 0.02 });

  b.symmetric((b) => {
    // Main tanks around the plaza
    tank(b, -9, 9, 4.2, 9, 0xddd6c6, { ladder: 'W', label: 'TK-101', labelColor: 0x8a3a2a });
    tank(b, -9, -9, 4.2, 9, 0xc9ced1, { ladder: 'W', label: 'TK-102', labelColor: 0x2a4d6a });
    pipeRun(b, -9, -4.9, -9, 4.9, { y: 7.2, r: 0.35, color: 0x8c6a4a, supports: false, flangeEvery: 2.4 });
    pipeRun(b, -4.9, 9, 4.9, 9, { y: 7.8, r: 0.3, color: 0x7a7f84, supports: false, flangeEvery: 2.4 });
    // Tank manifolds: pipes from the tank walls into the ground with valves
    for (const z of [9, -9]) {
      pipeLine(b, [[-4.9, 1.5, z - 0.7], [-4.35, 1.5, z - 0.7], [-4.35, -0.2, z - 0.7]], { r: 0.14, color: 0x8a8f94 });
      b.prop({ kind: 'cylinder', x: -4.35, y: 0.9, z: z - 0.7, r: 0.2, h: 0.3, color: 0x5d6266, mat: 'steel', segments: 10 });
      b.prop({ kind: 'cylinder', x: -4.12, y: 1.05, z: z - 0.7, r: 0.16, h: 0.04, color: 0xb8402e, mat: 'steel', segments: 10, rotZ: -Math.PI / 2, ao: false });
    }
    // Plaza cover
    jersey(b, 0, 3.2, { len: 2.4, h: 1.1, depth: 0.6, stripe: true });
    b.box(-2.8, 0, 0, 1.0, 1.4, 1.6, 'metal', 0x9c3b2c);
    b.prop({ kind: 'box', x: -2.8, y: 1.4, z: 0, r: 1.06, h: 0.06, d: 1.66, color: 0x6a2a20, mat: 'steel', ao: false });
    b.panel('vent', -2.29, 0.35, 0, 1.2, 0.6, Math.PI / 2, 0xd8d8d8);
    b.decal('oil', -1.6, 1.4, 2.2, 1.6, { rot: 0.7 });
    b.decal('hazard', -8, 0, 0.6, 4.6, { rot: 0 });

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
      b.prop({ kind: 'box', x: wx, y: 2.6, z, r: 2.5, h: 0.18, d: 0.2, color: 0x5d6266, mat: 'steel', ao: false });
    }
    for (const sx of [-1.2, 1.2]) b.prop({ kind: 'cylinder', x: wx + sx, y: 5.55, z: -24, r: 0.045, h: 48, color: 0xd8b23a, mat: 'steel', segments: 6, rotX: Math.PI / 2, ao: false });
    pipeRun(b, wx + 0.4, -24, wx + 0.4, 24, { y: 3.3, r: 0.32, color: 0xb5552f, supports: false, flangeEvery: 4 });
    pipeRun(b, wx - 0.45, -24, wx - 0.45, 24, { y: 3.85, r: 0.22, color: 0x8a8f94, supports: false, flangeEvery: 4 });
    pipeRun(b, wx - 0.3, -24, wx - 0.3, 24, { y: 2.95, r: 0.14, color: 0x3f6f8f, supports: false, flangeEvery: 6 });
    sign(b, 'PIPE RACK 3', wx - 1.32, 4.72, 17.5, { w: 2.2, h: 0.5, rot: -Math.PI / 2, bg: 0xd8b23a, fg: 0x222222 });

    // Control building with roof access
    detailedBuilding(
      b,
      {
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
      },
      { trim: 0x857c6e, plinth: 0x6f665a, doorLamp: true, floor: { mat: 'tile', color: 0xa8a49a }, ceilingLight: 0xfff0d0 },
    );
    wallWindows(b, 'x', 6, 1, -39, -37, 1.6, { w: 1.2, h: 1.0, spacing: 2, lit: true });
    wallWindows(b, 'x', -6, -1, -39, -37, 1.6, { w: 1.2, h: 1.0, spacing: 2, lit: true });
    sign(b, 'CONTROL', -30.95, 3.55, 0, { w: 2.4, h: 0.6, rot: Math.PI / 2, bg: 0x2e3338, fg: 0xf0c02c });
    acUnit(b, -33, -4.2, { y: 4.8, dir: 'N' });
    acUnit(b, -33, 4.2, { y: 4.8, dir: 'S' });
    roofVent(b, -37, -4.6, { y: 4.8, kind: 'mushroom' });
    b.prop({ kind: 'cylinder', x: -39.2, y: 4.8, z: -5.2, r: 0.06, h: 5, d: 0.5, color: 0x9aa0a4, mat: 'steel', segments: 6 });
    for (const t of [2.2, 3.4, 4.4]) b.prop({ kind: 'box', x: -39.2, y: 4.8 + t, z: -5.2, r: 0.7 - t * 0.1, h: 0.04, d: 0.04, color: 0x9aa0a4, mat: 'steel', ao: false });
    b.prop({ kind: 'sphere', x: -39.2, y: 9.85, z: -5.2, r: 0.08, h: 0, color: 0xff3a2a, emissive: 0xff3a2a });
    b.glow(-39.2, 9.85, -5.2, 1.0, 0xff4a2a);
    spawnColumn(b, -43, [-26, -18, -11, 11, 18, 26]);
    for (const z of [-22, -14.5, 14.5, 22]) b.ribbon('dashed', [[-45.4, z], [-41, z]], 0.14, { color: 0xe8e0c8 });

    // Small tanks, containers, barrels
    tank(b, -30, 22, 2.4, 5, 0xe0ddd2, { ladder: 'N' });
    tank(b, -37, 27, 2.4, 5, 0xe0ddd2, { ladder: 'S' });
    tank(b, -31, -24, 3, 6, 0xb7c0c4, { ladder: 'E', label: 'H2O', labelColor: 0x2a4d6a });
    pipeLine(b, [[-28, 4.4, 22], [-27.4, 3.2, 22], [-21.2, 3.2, 22]], { r: 0.14, color: 0xb5552f });
    pipeLine(b, [[-34.7, 3.4, 27], [-32.2, 3.4, 27], [-32.2, 3.4, 22.4]], { r: 0.12, color: 0x8a8f94 });
    container(b, -12, 24, true, 0x8f3b2b);
    container(b, -12, 21.5, true, 0x2f5f8f, { doors: -1 });
    barrels(b, -14.2, -20.8, { count: 4, colors: [0xc9a227, 0xc9a227, 0x9a3030, 0xc9a227] });
    drum(b, -16.2, -19.4, { color: 0xc9a227, fallen: true, rot: 0.5 });
    b.decal('oil', -14.4, -19.6, 2.8, 2.2, { rot: 0.3 });
    b.crate(-4, -22);
    b.crate(-4, -23.1);
    b.crate(-4, -22.5, 1.1, 1.1);
    palletStack(b, -6.2, -24.6, { count: 2, cargo: 'sacks', dir: 'N' });
    jersey(b, -30, 11, { len: 4, h: 1.1, depth: 0.8, color: 0xc2b8a4 });
    jersey(b, -6, 30, { len: 3, h: 1.1, depth: 0.8, color: 0xc2b8a4, stripe: true });
    generator(b, -26.5, -14, { dir: 'E', color: 0xc9a227 });
    van(b, -12, 28.4, { dir: 'W', color: 0xe8e4dc, stripe: 0xc9402a });
    trafficCone(b, -15.6, 27.4);
    trafficCone(b, -16.2, 28.8, { rot: 0.7 });
    debris(b, -34, 13, { radius: 1.6, count: 10 });
    debris(b, -6, -31.5, { radius: 1.4, count: 8 });

    // Flare stack (visual)
    b.prop({ kind: 'cylinder', x: -40, y: 0, z: 32, r: 0.6, h: 22, d: 0.6, color: 0x8b8f92, mat: 'steel', segments: 10 });
    b.prop({ kind: 'cylinder', x: -40, y: 0, z: 32, r: 1.2, h: 0.4, color: 0x6a6e72, mat: 'concrete', segments: 12 });
    for (const y of [7, 14]) {
      b.prop({ kind: 'cylinder', x: -40, y, z: 32, r: 1.1, h: 0.12, color: 0x5d6266, mat: 'steel', segments: 12, ao: false });
      b.prop({ kind: 'cylinder', x: -40, y: y + 0.12, z: 32, r: 1.12, h: 0.9, d: 1, color: 0xd8b23a, mat: 'steel', segments: 12, ao: false });
    }
    b.prop({ kind: 'cylinder', x: -40, y: 21.6, z: 32, r: 0.45, h: 0.8, color: 0x3a3d40, mat: 'steel', segments: 10, ao: false });
    b.prop({ kind: 'cone', x: -40, y: 22.3, z: 32, r: 0.55, h: 2.4, color: 0xffb347, emissive: 0xff8a2a, segments: 8, jag: 0.25, seed: 4 });
    b.prop({ kind: 'cone', x: -40, y: 22.3, z: 32, r: 0.32, h: 1.6, color: 0xfff0a0, emissive: 0xffe08a, segments: 8, seed: 5 });
    b.glow(-40, 23.3, 32, 9, 0xff9a40);
    ladder(b, -40, 32.62, { y1: 21.5, dir: 'N', cage: true });

    // Lamps
    streetLamp(b, -18.6, 12, { rot: Math.PI / 2, h: 7 });
    streetLamp(b, -18.6, -12, { rot: Math.PI / 2, h: 7 });
    streetLamp(b, -29.2, 8.2, { rot: Math.PI / 2, h: 6 });

    // Ground: gravel service road, tyre tracks, dry scrub
    b.ribbon('gravel', [[-43, -31], [-35, -31], [-26, -30], [-22, -30.6]], 3.2);
    b.ribbon('gravel', [[-28, 30.6], [-22, 31.6], [-10, 31.2], [-3, 32.6]], 3.2);
    b.ribbon('tracks', [[-26, -9], [-24.2, -2], [-25, 6], [-26.5, 10]], 2.2);
    b.ribbon('tracks', [[-40, 15], [-30, 16.5], [-20, 16]], 2.2);
    b.decal('gravel', -26, 18, 4, 3, { rot: 0.4 });
    b.decal('gravel', -38, -18, 5, 3.5, { rot: 1.1 });
    b.decal('crack', -10, -2, 3.2, 1.4, { rot: 1.3 });
    b.decal('stain', -11, 14, 3.2, 2.4);
    b.decal('sand', -34, -30, 6, 4, { rot: 0.3 });
    b.decal('sand', -44, 2, 3, 6, { rot: 1.4 });
    b.scatterArea('weed', -45, -35, -16.5, 35, 260, { seed: 11, color: 0xb0a060, on: ['dirt'], s: [0.8, 1.6] });
    b.scatterArea('grass', -45, -35, -16.5, 35, 220, { seed: 12, color: 0xa89a5a, on: ['dirt'], s: [0.7, 1.2] });
    b.scatterArea('pebble', -45, -35, -16, 35, 200, { seed: 13, color: 0x9a8a74, on: ['dirt'] });
    b.scatterArea('debris', -16, -16, 0, 16, 26, { seed: 14, color: 0x8f8a80, on: ['concrete'], s: [0.6, 1.0] });
    // Chain-link topping on the perimeter wall
    fence(b, -45.8, -35.8, -45.8, 35.8, { kind: 'chain', h: 1.2, y: 3.2, collide: false });
    fence(b, -45.8, 35.8, 0, 35.8, { kind: 'chain', h: 1.2, y: 3.2, collide: false });
  });

  // Distant refinery silhouettes, desert hills and mesas
  for (const [x, z, r, h] of [[-95, 70, 7, 16], [-82, 84, 5, 12], [104, -64, 8, 18], [90, -82, 5, 11], [-120, -40, 6, 14], [118, 46, 6, 13]] as const) {
    b.prop({ kind: 'cylinder', x, y: 0, z, r, h, color: 0xb9b2a4, mat: 'steel', segments: 16, ao: false });
    b.prop({ kind: 'cylinder', x, y: h, z, r: r * 1.01, h: 0.8, d: 0.6, color: 0x9a948a, mat: 'steel', segments: 16, ao: false });
  }
  for (const [x, z, h] of [[-70, -95, 30], [80, 92, 26], [128, 5, 34]] as const) {
    b.prop({ kind: 'cylinder', x, y: 0, z, r: 0.9, h, d: 0.6, color: 0x8b8f92, mat: 'steel', segments: 8, ao: false });
    b.prop({ kind: 'cone', x, y: h, z, r: 0.9, h: 3.4, color: 0xffb347, emissive: 0xff8a2a, segments: 7, jag: 0.3, seed: 9 });
    b.glow(x, h + 1.4, z, 14, 0xff9a40);
  }
  hills(b, 140, 200, 0x9a7a5c, 11, { count: 18, mat: 'sand', h: [8, 20] });
  mountains(b, 170, 0x6a4a48, null, 11);

  const theme: Theme = {
    skyTop: 0x34437c,
    skyHorizon: 0xffa56b,
    skyBottom: 0x5a3e3a,
    fog: 0xd99a72,
    fogNear: 60,
    fogFar: 300,
    sun: 0xffb27a,
    sunIntensity: 2.8,
    sunDir: [-0.85, 0.32, 0.25],
    hemiSky: 0xffcfa8,
    hemiGround: 0x4a3a35,
    hemiIntensity: 1.0,
    particles: 'dust',
    exposure: 1.05,
    ambience: 'industrial',
    clouds: { cover: 0.5, color: 0xffc29a, shade: 0x6a4a66, scale: 0.8, speed: 0.6 },
    glow: 1.3,
    backdrop: { mat: 'dirt', color: 0x8b7660, patch: 0x9e8a68 },
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
