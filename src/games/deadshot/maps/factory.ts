import { MapBuilder, yawTo, type MapDef, type Theme } from './builder';
import { finish, hills, mountains, skyline, spawnColumn, v } from './common';
import {
  acUnit,
  barrels,
  cableSpool,
  container,
  debris,
  detailedBuilding,
  drum,
  forklift,
  frameOpening,
  generator,
  jersey,
  ladder,
  pallet,
  palletStack,
  pipeLine,
  pipeRun,
  roofVent,
  sign,
  streetLamp,
  trafficCone,
  trimRect,
  truck,
  wallWindows,
} from './props';

// ---------------------------------------------------------------------------
// FACTORY — industrial plant with a central hall, catwalks and container yards.

export function factory(): MapDef {
  const b = new MapBuilder();
  const W = 46;
  const D = 34;
  b.aabb(-W, -1, -D, W, 0, D, 'asphalt', 0x5b5e61, { patch: 0x6a6c6a });
  b.aabb(-15, 0, -10, 15, 0.02, 10, 'concrete', 0x8e8b85, { collide: false, patch: 0x7e7a72 });
  // Perimeter wall with coping and a darker plinth
  b.aabb(-W, 0, D - 0.4, W, 6, D + 0.2, 'concrete', 0xa9a59d);
  b.aabb(-W, 0, -D - 0.2, W, 6, -D + 0.4, 'concrete', 0xa9a59d);
  b.aabb(-W - 0.2, 0, -D, -W + 0.4, 6, D, 'concrete', 0xa9a59d);
  b.aabb(W - 0.4, 0, -D, W + 0.2, 6, D, 'concrete', 0xa9a59d);
  trimRect(b, -W - 0.2, -D - 0.2, W + 0.2, D + 0.2, 6, { h: 0.18, out: 0.1, color: 0x8f8b84 });
  trimRect(b, -W + 0.4, -D + 0.4, W - 0.4, D - 0.4, 6, { h: 0.18, out: 0.1, color: 0x8f8b84 });
  b.bounds(-W, W, -D, D);
  b.crate(0, 0, 1.1, 0, 0xa07a48);

  b.symmetric((b) => {
    const hall = 0x7d8a93;
    const steel = 0x3a4046;
    // Hall walls (west with big door, north with a door and high windows)
    b.wallZ(-10, 10, -15, 0, 9, 0.6, 'metal', hall, [[-3, 3, 0, 5]]);
    b.wallX(-15.3, 15.3, 10, 0, 9, 0.6, 'metal', hall, [
      [-11, -7, 0, 3.4],
      [-4, -1, 5.0, 6.4],
      [3, 6, 5.0, 6.4],
    ]);
    b.aabb(-15.3, 9, 4, 15.3, 9.4, 10.3, 'metal', 0x4b5258);
    // Hall dressing: plinth, coping, door/window frames, fake high windows, signage
    b.aabb(-15.38, 0, -10.3, -15.3, 0.55, -3, 'concrete', 0x77746e, { collide: false });
    b.aabb(-15.38, 0, 3, -15.3, 0.55, 10.3, 'concrete', 0x77746e, { collide: false });
    b.aabb(-15.3, 0, 10.3, -11, 0.55, 10.38, 'concrete', 0x77746e, { collide: false });
    b.aabb(-7, 0, 10.3, 15.3, 0.55, 10.38, 'concrete', 0x77746e, { collide: false });
    b.aabb(-15.45, 9, -10.3, -14.55, 9.18, 10.3, 'steel', 0x5b6268, { collide: false });
    b.aabb(-15.45, 9.25, 10.15, 15.45, 9.5, 10.45, 'steel', 0x5b6268, { collide: false });
    frameOpening(b, 'z', -15, -3, 3, 0, 5, { t: 0.6, color: 0xc9a32e, mat: 'steel', w: 0.18 });
    frameOpening(b, 'x', 10, -11, -7, 0, 3.4, { t: 0.6, color: steel, mat: 'steel' });
    frameOpening(b, 'x', 10, -4, -1, 5, 6.4, { t: 0.6, color: steel, mat: 'steel', kind: 'window' });
    frameOpening(b, 'x', 10, 3, 6, 5, 6.4, { t: 0.6, color: steel, mat: 'steel', kind: 'window' });
    b.prop({ kind: 'box', x: -15.55, y: 5.18, z: 0, r: 0.5, h: 0.55, d: 6.4, color: 0x4a5056, mat: 'steel', ao: false });
    wallWindows(b, 'z', -15.3, -1, -10, -4, 6.2, { w: 2.2, h: 1.3, spacing: 3, frame: 0x50575d });
    wallWindows(b, 'z', -15.3, -1, 4, 10, 6.2, { w: 2.2, h: 1.3, spacing: 3, frame: 0x50575d });
    sign(b, 'HALL 2', -15.36, 6.05, 0, { w: 3.2, h: 0.9, rot: -Math.PI / 2, bg: 0x1f4f7a });
    sign(b, 'AUTHORIZED ONLY', -9, 3.75, 10.33, { w: 2.6, h: 0.42, bg: 0xf2f2ee, fg: 0xb02a22 });
    b.decal('hazard', -15.9, 0, 1.0, 6.2, { rot: 0 });
    b.decal('hazard', -9, 10.9, 4.2, 0.8);
    for (const z of [-7, 7]) roofVent(b, -11 + (z > 0 ? 6 : 0), z * 0.9, { y: 9.4, kind: 'box' });
    roofVent(b, -4, 7.5, { y: 9.4, kind: 'mushroom' });
    roofVent(b, 9, 8.6, { y: 9.4, kind: 'pipe' });
    acUnit(b, 2, 7, { y: 9.4, dir: 'S', collide: false });

    // Catwalk along the north wall
    b.platform(-14.7, 7.2, 14.7, 9.7, 4, 0.3, 'metal', 0x5c656b);
    b.aabb(-14.7, 4, 7.0, -13.3, 5.0, 7.2, 'metal', 0x6f7a80);
    b.aabb(-11.1, 4, 7.0, 14.7, 5.0, 7.2, 'metal', 0x6f7a80);
    b.stairs(-12.2, 1.7, 'N', 2.0, 0, 4, 'metal', 0x6b7177);
    for (const x of [-7, 0, 7]) b.post(x, 8.4, 0, 3.7, 0.35);
    b.prop({ kind: 'cylinder', x: -14.7, y: 5.05, z: 7.1, r: 0.04, h: 1.4, color: 0xc9a32e, mat: 'steel', segments: 6, rotZ: -Math.PI / 2, ao: false });
    b.prop({ kind: 'cylinder', x: -11.1, y: 5.05, z: 7.1, r: 0.04, h: 25.8, color: 0xc9a32e, mat: 'steel', segments: 6, rotZ: -Math.PI / 2, ao: false });
    // Ceiling light strips under the roof
    for (const x of [-11, -3.5, 4, 11.5]) {
      b.prop({ kind: 'box', x, y: 8.78, z: 5.8, r: 2.4, h: 0.12, d: 0.4, color: 0x3a3f43, mat: 'steel', ao: false });
      b.prop({ kind: 'box', x, y: 8.74, z: 5.8, r: 2.2, h: 0.04, d: 0.26, color: 0xfff6dc, emissive: 0xfff3d0 });
      b.glow(x, 8.6, 5.8, 2.4, 0xfff0c8);
    }
    // Pipes along the inside of the north wall
    pipeRun(b, -14.6, 9.32, 14.6, 9.32, { y: 7.6, r: 0.14, count: 2, gap: 0.34, colors: [0x9a3a2a, 0x8a8f94], supports: false, flangeEvery: 2.4 });

    // Hall floor: conveyor, machines, crates
    b.box(-7, 0, 0, 10, 1.0, 1.6, 'metal', 0x3d4348);
    b.box(-7, 0.96, 0, 9.8, 0.02, 1.3, 'plain', 0x1d2022, { collide: false });
    for (let x = -11.7; x <= -2.3; x += 0.36) b.prop({ kind: 'cylinder', x, y: 1.04, z: -0.62, r: 0.055, h: 1.24, color: 0xa8aeb2, mat: 'steel', segments: 6, rotX: Math.PI / 2, ao: false });
    for (const z of [-0.78, 0.78]) b.prop({ kind: 'box', x: -7, y: 0.95, z, r: 10, h: 0.22, d: 0.08, color: 0xc9a32e, mat: 'steel', ao: false });
    for (const [x, s, r] of [[-10.5, 0.55, 0.1], [-8.2, 0.5, -0.2], [-5.4, 0.62, 0.05], [-3.1, 0.45, 0.3]] as const)
      b.prop({ kind: 'box', x, y: 1.095, z: 0, r: s, h: s * 0.8, d: s * 0.9, color: 0xc4a074, mat: 'crate', rotY: r });
    b.prop({ kind: 'box', x: -1.6, y: 0, z: 0, r: 0.9, h: 1.5, d: 1.8, color: 0x50565c, mat: 'steel' });
    b.prop({ kind: 'box', x: -1.15, y: 0.9, z: 0, r: 0.04, h: 0.35, d: 0.5, color: 0x1e2226, mat: 'plain', ao: false });
    b.prop({ kind: 'box', x: -1.12, y: 1.1, z: -0.12, r: 0.02, h: 0.06, d: 0.06, color: 0x7dff8a, emissive: 0x7dff8a });
    b.prop({ kind: 'box', x: -1.12, y: 1.1, z: 0.05, r: 0.02, h: 0.06, d: 0.06, color: 0xff5040, emissive: 0xff5040 });
    // Press (orange machine) with ducting to the roof
    b.box(-8, 0, -5.5, 3.2, 3.0, 3.2, 'metal', 0xc58a2c);
    b.prop({ kind: 'box', x: -8, y: 3.0, z: -5.5, r: 3.3, h: 0.12, d: 3.3, color: 0x8f6420, mat: 'steel', ao: false });
    b.prop({ kind: 'box', x: -8, y: 0, z: -5.5, r: 3.4, h: 0.3, d: 3.4, color: 0x3a3d40, mat: 'steel' });
    b.panel('vent', -8, 0.6, -3.88, 2.2, 1.0, 0, 0xd0d0d0);
    b.panel('poster', -6.38, 1.4, -5.5, 0.8, 0.8, Math.PI / 2);
    b.prop({ kind: 'box', x: -6.15, y: 0.9, z: -4.6, r: 0.3, h: 0.7, d: 0.5, color: 0x2c3034, mat: 'steel' });
    pipeLine(b, [[-8.6, 3.1, -6.1], [-8.6, 9.0, -6.1]], { r: 0.28, color: 0x9aa0a4 });
    pipeLine(b, [[-7.2, 3.1, -4.9], [-7.2, 5.5, -4.9], [-5.2, 5.5, -4.9], [-5.2, 9.0, -4.9]], { r: 0.12, color: 0x9a3a2a });
    b.decal('hazard', -8, -3.6, 3.8, 0.5);
    b.decal('hazard', -9.85, -5.5, 3.8, 0.5, { rot: Math.PI / 2 });
    // Control unit (blue machine)
    b.box(-3, 0, 5, 2.4, 2.2, 2.0, 'metal', 0x4f6f8a);
    b.prop({ kind: 'box', x: -3, y: 2.2, z: 5, r: 2.5, h: 0.1, d: 2.1, color: 0x34495a, mat: 'steel', ao: false });
    b.panel('vent', -3, 0.4, 3.99, 1.6, 0.8, Math.PI, 0xd0d0d0);
    for (const [dx, c] of [[-0.5, 0x7dff8a], [-0.2, 0xffc840], [0.1, 0x7dff8a]] as const)
      b.prop({ kind: 'box', x: -3 + dx, y: 1.7, z: 3.985, r: 0.1, h: 0.06, d: 0.02, color: c, emissive: c });
    b.crate(-12, -6.2);
    b.crate(-12, -7.4);
    b.crate(-12, -6.8, 1.1, 1.1);
    b.crate(-4.5, -3.2, 1.0);
    palletStack(b, -9.6, 8.7, { count: 3, cargo: 'boxes', dir: 'E' });
    barrels(b, -4.6, -8.6, { count: 3, colors: [0x2f6fa0, 0x9a3030, 0x2f6fa0] });
    pallet(b, -13.6, -2.4, { rot: 0.2 });
    // Floor markings
    b.ribbon('line', [[-14.4, 2.3], [-11.5, 2.3]], 0.12, { color: 0xe8c040 });
    b.ribbon('line', [[-10.6, 2.3], [-4.5, 2.3], [-4.5, 3.8]], 0.12, { color: 0xe8c040 });
    b.ribbon('line', [[-14.4, -2.3], [-10, -2.3], [-10, -3.7]], 0.12, { color: 0xe8c040 });
    b.ribbon('line', [[-5.9, -2.3], [-0.6, -2.3]], 0.12, { color: 0xe8c040 });
    b.decal('oil', -6.5, 2.6, 2.4, 1.8, { rot: 0.4 });
    b.decal('stain', -11, -4.4, 3, 2.2);

    // West spawn yard
    spawnColumn(b, -42, [-14, -7, 0, 7, 14]);
    b.spawn(-38, -20, yawTo(-38, -20, 0, 0));
    b.spawn(-38, 20, yawTo(-38, 20, 0, 0));
    container(b, -30, -5, false, 0xa3412f, { doors: -1 });
    container(b, -27, 8, true, 0x2f5f8f);
    container(b, -36, -22, true, 0x3f7f4a, { doors: -1 });
    b.crate(-32.4, -21.6, 1.1);
    b.crate(-32.4, -22.8, 1.1);
    b.crate(-32.4, -22.8, 1.1, 1.1);
    container(b, -24, -27, true, 0x7a7f84);
    container(b, -24, -27, true, 0x8a3a30, { y: 2.6, doors: -1 });
    b.crate(-36, 4, 1.1);
    b.crate(-36, 5.2, 1.1);
    palletStack(b, -44.6, 27, { count: 5, dir: 'E' });
    palletStack(b, -44.6, -27.5, { count: 3, cargo: 'sacks', dir: 'E' });
    forklift(b, -33, 13.2, { dir: 'E', load: true });
    trafficCone(b, -30.5, 12.4);
    trafficCone(b, -29.6, 13.1, { rot: 0.6 });
    trafficCone(b, -31.2, 15.6, { fallen: true, rot: 1.2 });
    b.decal('oil', -32.6, 13.4, 2.2, 1.6, { rot: 1.1 });
    b.decal('puddle', -38.5, -8.5, 3.2, 2.2, { rot: 0.3 });
    b.decal('manhole', -39, 9.5, 1.1, 1.1);
    for (const z of [-17, -10.5, -3.5, 3.5, 10.5, 17]) b.ribbon('dashed', [[-45.4, z], [-40.6, z]], 0.14, { color: 0xe8e4d8 });
    sign(b, 'SECTOR B', -45.58, 3.2, -9, { w: 3.0, h: 0.8, rot: Math.PI / 2, bg: 0x2e3338, fg: 0xf0c02c });
    // Perimeter wall lights
    for (const z of [-24, 0, 24]) {
      b.prop({ kind: 'box', x: -45.45, y: 4.6, z, r: 0.3, h: 0.22, d: 0.7, color: 0x2e3134, mat: 'steel', ao: false });
      b.prop({ kind: 'box', x: -45.29, y: 4.58, z, r: 0.02, h: 0.06, d: 0.56, color: 0xfff0c8, emissive: 0xfff0c8 });
      b.glow(-45.1, 4.55, z, 1.6, 0xfff0c8);
    }

    // North-west: office with roof access and a loading dock
    detailedBuilding(
      b,
      {
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
      },
      { trim: 0xc9c2b4, plinth: 0x6f6a64, doorLamp: true, floor: { mat: 'tile', color: 0xb8b4aa }, ceilingLight: 0xfff4dc },
    );
    acUnit(b, -35.0, 21.86, { y: 4.5, dir: 'S' });
    roofVent(b, -40.6, 22.2, { y: 4.5, kind: 'pipe' });
    sign(b, 'OFFICE', -33.95, 3.0, 24, { w: 1.6, h: 0.45, rot: Math.PI / 2, bg: 0x2e3338 });
    b.panel('poster', -33.97, 1.2, 26.2, 0.6, 0.8, Math.PI / 2);
    b.platform(-32, 22, -18, 33.6, 1.3, 1.3, 'concrete', 0x8a8780);
    b.aabb(-32, 1.22, 21.9, -18, 1.36, 22.0, 'steel', 0xc9a32e, { collide: false });
    for (const x of [-30.5, -27.4, -22.6, -19.5]) b.prop({ kind: 'box', x, y: 0.35, z: 21.9, r: 0.5, h: 0.6, d: 0.2, color: 0x1e1f20, mat: 'plain' });
    b.stairs(-25, 19.8, 'N', 3, 0, 1.3, 'concrete', 0x8a8780);
    b.crate(-21, 24, 1.1, 1.3);
    b.crate(-28.5, 30, 1.1, 1.3);
    b.crate(-28.5, 31.2, 1.1, 1.3);
    pallet(b, -21.2, 26.2, { y: 1.3, rot: 0.15 });
    drum(b, -30.8, 32.7, { y: 1.3, color: 0x9a3030 });
    drum(b, -30.1, 33.0, { y: 1.3, color: 0x2f6fa0 });
    sign(b, 'LOADING DOCK', -25, 4.8, 33.58, { w: 4.2, h: 0.8, rot: Math.PI, bg: 0x1f4f7a });
    for (const x of [-30, -25, -20]) b.panel('shutter', x, 1.3, 33.58, 3.2, 3.2, Math.PI, 0xc8c4bc);
    // Semi-trailer by the dock
    truck(b, -14, 24.2, { dir: 'S', color: 0x2a6db0, cargo: 0xdedbd2, len: 8 });
    cableSpool(b, -29.4, 18.6, { axis: 'z' });
    // Parking bays
    for (const x of [-12, -8, -4, 0]) b.ribbon('line', [[x, 30.6], [x, 33.4]], 0.12, { color: 0xe8e4d8 });

    // North lane cover
    jersey(b, -6, 15, { len: 3, h: 1.0, depth: 0.7, stripe: true });
    jersey(b, 4, 18.5, { len: 3, h: 1.0, depth: 0.7 });
    container(b, -4, 24, true, 0x2f6f5f, { doors: -1 });
    b.crate(6, 28.5);
    b.crate(7.1, 28.5);
    b.crate(6.5, 28.5, 1.1, 1.1);
    b.decal('crack', -1, 19, 3, 1.5, { rot: 0.5 });
    b.decal('arrow', -10, 16.5, 1.4, 3.2, { rot: Math.PI / 2, color: 0xe8e4d8 });

    // South-west: generator shed, barrels, crates
    detailedBuilding(
      b,
      {
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
      },
      { trim: 0x7f7b74, plinth: 0x6f6a64, doorLamp: true },
    );
    roofVent(b, -20, -28, { y: 3.5, kind: 'mushroom' });
    roofVent(b, -16.8, -24, { y: 3.5, kind: 'box' });
    sign(b, 'DANGER  HIGH VOLTAGE', -18.5, 2.55, -21.97, { w: 2.4, h: 0.4, bg: 0xf2c230, fg: 0x1e1e1e });
    generator(b, -24.3, -24.8, { dir: 'W' });
    pipeLine(b, [[-23.6, 1.0, -24.6], [-22.05, 1.0, -24.6]], { r: 0.08, color: 0x2a2c2e });
    barrels(b, -12, -15.6, { count: 3, colors: [0x2f6fa0, 0x2f6fa0, 0x9a3030] });
    b.crate(-20, -15);
    b.crate(-21.1, -15);
    b.crate(-20.5, -15, 1.1, 1.1);
    debris(b, -26.5, -15.5, { radius: 1.3, count: 9 });
    b.decal('oil', -12.3, -14.6, 2.4, 2.0);

    // Yard markings around the hall
    b.ribbon('line', [[-17.4, -12.4], [-17.4, 12.4], [17.4, 12.4]], 0.14, { color: 0xe8c040 });
    b.ribbon('line', [[-17.4, -12.4], [-11, -12.4]], 0.14, { color: 0xe8c040 });
    b.decal('arrow', -19.6, -6, 1.4, 3.2, { color: 0xe8e4d8 });
    b.decal('arrow', -19.6, 6, 1.4, 3.2, { rot: Math.PI, color: 0xe8e4d8 });
    b.decal('crack', -24, -11, 3.5, 1.6, { rot: 1.2 });
    b.decal('puddle', -18, 20.5, 2.6, 1.8, { rot: 0.8 });
    b.decal('manhole', -9, -18.5, 1.1, 1.1);
    b.decal('stain', -28, 20, 3.2, 2.6);

    // Weeds in the cracks along the walls, grit on the asphalt
    b.scatterArea('weed', -45.6, -33.6, -44.5, 33.6, 70, { seed: 41, color: 0x7f8f52, on: ['asphalt'], s: [0.7, 1.4] });
    b.scatterArea('grass', -45.6, -33.6, -44.8, 33.6, 60, { seed: 42, color: 0x7a8a50, on: ['asphalt'], s: [0.6, 1.0] });
    b.scatterArea('weed', -45.6, 32.4, 45.6, 33.6, 60, { seed: 43, color: 0x7f8f52, on: ['asphalt'], s: [0.7, 1.4] });
    b.scatterArea('weed', -15.9, -10.3, -15.3, 10.3, 16, { seed: 44, color: 0x7f8f52, on: ['asphalt'] });
    b.scatterArea('pebble', -45, -33, -16, 33, 90, { seed: 45, color: 0x8a8a86, on: ['asphalt'], s: [0.5, 0.9] });
    b.scatterArea('debris', -45, -33, -16, 33, 24, { seed: 46, color: 0x8f8a80, on: ['asphalt'], s: [0.5, 0.9] });

    // Lamps
    streetLamp(b, -20, 12, { rot: Math.PI / 2, h: 6 });
    streetLamp(b, -34, -12, { rot: Math.PI / 2, h: 6 });

    // Pipe rack along the north perimeter wall
    pipeRun(b, -17, 33.2, 1, 33.2, { y: 4.4, r: 0.16, count: 2, gap: 0.4, colors: [0x8a8f94, 0x3f6f8f], supports: false, flangeEvery: 3.5 });
    for (let x = -15; x <= 0; x += 5) b.prop({ kind: 'box', x, y: 4.1, z: 33.25, r: 0.12, h: 0.14, d: 0.6, color: 0x5d6266, mat: 'steel', ao: false });
    ladder(b, -17.6, 33.55, { y1: 6, dir: 'S' });
  });

  // Scenery outside the walls
  skyline(b, 75, 120, 17, { count: 16, stacks: 3 });
  hills(b, 150, 210, 0x6f7a5a, 9, { count: 16 });
  mountains(b, 170, 0x7d8b80, null, 7);

  const theme: Theme = {
    skyTop: 0x4f86d0,
    skyHorizon: 0xcfe0ea,
    skyBottom: 0x8a9aa6,
    fog: 0xbfd0dc,
    fogNear: 70,
    fogFar: 320,
    sun: 0xfff0d8,
    sunIntensity: 2.6,
    sunDir: [-0.55, 0.8, 0.35],
    hemiSky: 0xd4e6ff,
    hemiGround: 0x5e584f,
    hemiIntensity: 1.2,
    particles: 'dust',
    exposure: 1.0,
    ambience: 'industrial',
    clouds: { cover: 0.42, scale: 1, speed: 1 },
    glow: 0.4,
    backdrop: { mat: 'dirt', color: 0x8a8068, patch: 0x7a8a5a },
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
