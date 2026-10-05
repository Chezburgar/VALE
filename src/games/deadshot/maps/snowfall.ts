import { MapBuilder, yawTo, type MapDef, type Theme } from './builder';
import { finish, hills, mountains, spawnColumn, treeline, v } from './common';
import { awning, bush, chimney, debris, detailedBuilding, fence, lantern, logPile, rockCluster, sign, snowCap, tree, trimRect, type BuildingOpts } from './props';

// ---------------------------------------------------------------------------
// SNOWFALL — mountain village with cabins, a fountain square and watchtowers.

const SNOW = 0xf2f6f9;

/** Log cabin: walls from `b.building`, snowy roof over dark shingles, shutters, chimney. */
function cabin(b: MapBuilder, o: BuildingOpts, chim?: [number, number]): void {
  detailedBuilding(b, { ...o, roofMat: 'snow' }, { trim: 0x4a3222, shutters: 0x2f5a46, sills: true, doorLamp: true, corners: true, plinth: 0x6f6a66, floor: { mat: 'wood', color: 0x8a6a4a }, ceilingLight: 0xffd9a0 });
  const x0 = Math.min(o.x0, o.x1);
  const x1 = Math.max(o.x0, o.x1);
  const z0 = Math.min(o.z0, o.z1);
  const z1 = Math.max(o.z0, o.z1);
  const w = x1 - x0 + 0.8;
  const d = z1 - z0 + 0.8;
  const alongX = w >= d;
  // Shingle layer peeking out under the snow along the eaves.
  b.prop({ kind: 'prism', x: (x0 + x1) / 2, y: o.h - 0.12, z: (z0 + z1) / 2, r: (alongX ? w : d) + 0.1, h: Math.min(w, d) * 0.42, d: (alongX ? d : w) + 0.24, color: 0x4a3a32, mat: 'roof', axis: alongX ? 'x' : 'z' });
  if (chim) chimney(b, chim[0], chim[1], { y: o.h, h: Math.min(w, d) * 0.42 + 0.9, snow: true });
  // Snow drifts against the walls
  b.decal('snowdrift', (x0 + x1) / 2, z0 - 0.4, x1 - x0 + 1.4, 1.6);
  b.decal('snowdrift', (x0 + x1) / 2, z1 + 0.4, x1 - x0 + 1.4, 1.6, { rot: Math.PI });
}

export function snowfall(): MapDef {
  const b = new MapBuilder();
  const W = 44;
  const D = 36;
  b.aabb(-W, -1, -D, W, 0, D, 'snow', 0xe9eff3, { patch: 0xd8e2ec });
  b.aabb(-7, 0, -7, 7, 0.02, 7, 'tile', 0xb8c0c6, { collide: false, patch: 0xd6dde2 });
  b.ribbon('curb', [[-7, -7], [-7, 7], [7, 7], [7, -7], [-7, -7]], 0.3, { y: 0.02, color: 0xc8cfd4 });
  b.bounds(-W, W, -D, D);
  // Fountain
  b.box(0, 0, 0, 4, 0.8, 4, 'rock', 0x9aa3a8);
  b.box(0, 0.8, 0, 1, 1.6, 1, 'rock', 0xa9b2b7);
  b.box(0, 0.62, 0, 3.4, 0.2, 3.4, 'glass', 0xbfe6f2, { collide: false });
  trimRect(b, -2, -2, 2, 2, 0.8, { h: 0.16, out: 0.12, color: 0xb8c0c4 });
  b.prop({ kind: 'cylinder', x: 0, y: 2.4, z: 0, r: 0.75, h: 0.22, d: 1.25, color: 0xa9b2b7, mat: 'rock', segments: 12 });
  b.prop({ kind: 'sphere', x: 0, y: 2.75, z: 0, r: 0.45, h: 0, color: 0xe8f4f8, mat: 'snow', segments: 8 });
  b.prop({ kind: 'blob', x: 0, y: 2.56, z: 0, r: 1.5, h: 0.22, d: 1.5, color: SNOW, mat: 'snow', seed: 3, ao: false });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.prop({ kind: 'cone', x: Math.cos(a) * 0.7, y: 2.41, z: Math.sin(a) * 0.7, r: 0.035, h: 0.25 + (i % 3) * 0.08, color: 0xdff2fa, mat: 'glass', segments: 5, rotX: Math.PI, ao: false });
  }

  b.symmetric((b) => {
    const wood = 0x7a5236;
    const snowRoof = 0xeef3f6;
    cabin(b, { x0: -18, z0: 8, x1: -11, z1: 14, h: 3.2, mat: 'wood', color: wood, doors: [{ side: 'S', at: -14.5 }], windows: [{ side: 'E', at: 11 }, { side: 'W', at: 11 }, { side: 'N', at: -14.5 }], roof: 'pitched', roofColor: snowRoof }, [-12.5, 12.5]);
    cabin(b, { x0: -30, z0: -10, x1: -24, z1: -2, h: 3.2, mat: 'wood', color: 0x6e4a32, doors: [{ side: 'E', at: -6 }], windows: [{ side: 'N', at: -27 }, { side: 'S', at: -27 }], roof: 'pitched', roofColor: snowRoof }, [-28.6, -8.6]);
    cabin(b, { x0: -38, z0: 14, x1: -32, z1: 20, h: 3.2, mat: 'wood', color: 0x80583b, doors: [{ side: 'S', at: -35 }], windows: [{ side: 'E', at: 17 }], roof: 'pitched', roofColor: snowRoof }, [-36.6, 18.6]);
    sign(b, 'INN', -16.4, 1.7, 7.96, { w: 1.0, h: 0.45, rot: Math.PI, bg: 0x3a2618, fg: 0xf0d090 });
    logPile(b, -30.75, -4.2, { len: 2.6, axis: 'z', rows: 2, r: 0.2 });
    logPile(b, -11, 14.75, { len: 2.4, axis: 'x', rows: 2, r: 0.18 });

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
    b.prop({ kind: 'prism', x: tx, y: 7.3, z: tz, r: 5.4, h: 1.6, d: 5.4, color: 0x4a3a32, mat: 'roof', axis: 'x' });
    b.prop({ kind: 'prism', x: tx, y: 7.4, z: tz, r: 5.2, h: 1.6, d: 5.2, color: snowRoof, mat: 'snow', axis: 'x' });
    // knee braces under the platform and a lantern under the roof
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
      b.prop({ kind: 'box', x: tx + px, y: 3.7, z: tz + pz, r: 0.1, h: 1.35, d: 0.1, color: 0x5a4030, mat: 'wood', rotZ: px > 0 ? 0.75 : -0.75, ao: false });
      b.prop({ kind: 'box', x: tx + px, y: 3.7, z: tz + pz, r: 0.1, h: 1.35, d: 0.1, color: 0x5a4030, mat: 'wood', rotX: pz > 0 ? -0.75 : 0.75, ao: false });
    }
    b.prop({ kind: 'box', x: tx, y: 6.9, z: tz, r: 0.22, h: 0.3, d: 0.22, color: 0xffd28a, emissive: 0xffc870 });
    b.glow(tx, 7.05, tz, 2.2, 0xffc070);
    snowCap(b, tx, tz - 2.1, 4.4, 0.2, 6);
    snowCap(b, tx - 2.1, tz, 0.2, 4.4, 6);

    // Cover: board fences, log piles, rocks
    b.aabb(-20, 0, -4.09, -13, 1.0, -3.91, 'wood', 0x6b4a32, { visible: false });
    fence(b, -20, -4, -13, -4, { kind: 'boards', h: 1.0, thick: 0.18, color: 0x6b4a32, collide: false });
    snowCap(b, -16.5, -4, 7.1, 0.24, 1.02, { h: 0.1 });
    b.aabb(-24.09, 0, 16, -23.91, 1.0, 24, 'wood', 0x6b4a32, { visible: false });
    fence(b, -24, 16, -24, 24, { kind: 'boards', h: 1.0, thick: 0.18, color: 0x6b4a32, collide: false });
    snowCap(b, -24, 20, 0.24, 8.1, 1.02, { h: 0.1 });
    b.box(-14, 0, -12, 3, 0.9, 1.2, 'bark', 0x6a4a35, { visible: false });
    logPile(b, -14, -12, { len: 3, axis: 'x', rows: 2, r: 0.22, collide: false });
    snowCap(b, -14, -12, 2.8, 0.7, 0.8, { h: 0.12 });
    b.box(-6, 0, 20, 1.2, 0.9, 3.2, 'bark', 0x6a4a35, { visible: false });
    logPile(b, -6, 20, { len: 3.2, axis: 'z', rows: 2, r: 0.22, collide: false });
    snowCap(b, -6, 20, 0.7, 3.0, 0.8, { h: 0.12 });
    rockCluster(b, -8, -16, { w: 2.4, h: 1.3, d: 1.8, color: 0x8d969c, snow: true });
    rockCluster(b, -36, 4, { w: 3, h: 1.6, d: 2.2, color: 0x8d969c, snow: true });
    rockCluster(b, -28, 28, { w: 3.4, h: 2.2, d: 2.6, color: 0x8d969c, snow: true });
    rockCluster(b, -4, 30, { w: 2.6, h: 1.2, d: 2.0, color: 0x8d969c, snow: true });
    b.crate(-20, 4, 1.1, 0, 0x8a6a48);
    b.crate(-21.1, 4, 1.1, 0, 0x8a6a48);
    b.crate(-20.5, 4, 1.1, 1.1, 0x8a6a48);
    snowCap(b, -20.5, 4, 1.1, 1.1, 2.2);
    // Market stall
    b.box(-30, 0, 9, 2.4, 1.0, 1.0, 'wood', 0x6b4a32);
    snowCap(b, -30, 9, 2.4, 1.0, 1.0, { h: 0.08 });
    for (const sx of [-1.15, 1.15]) b.prop({ kind: 'box', x: -30 + sx, y: 1.0, z: 9.42, r: 0.1, h: 1.5, d: 0.1, color: 0x4a3222, mat: 'wood' });
    awning(b, -30, 9.4, { w: 2.8, depth: 1.3, y: 2.45, rot: Math.PI, color: 0xb03a2e, stripes: 0xf2ece0 });
    for (const [dx, c] of [[-0.7, 0xc9a227], [0, 0x9a3030], [0.6, 0x2f6f5f]] as const) b.prop({ kind: 'box', x: -30 + dx, y: 1.0, z: 9, r: 0.45, h: 0.3, d: 0.4, color: c, mat: 'crate', rotY: dx });

    const trees: [number, number, number][] = [
      [-41, -31, 9], [-36, -33, 8], [-42, -20, 10], [-40, -6, 8], [-43, 26, 9], [-30, 33, 10], [-22, 32, 8],
      [-12, 33, 9], [-4, 25, 7], [-10, -30, 8], [-17, -33, 9], [-33, -16, 7], [-6, 13, 6], [-28, 16, 7],
      [-2, -33, 8], [-38, 32, 9],
    ];
    for (const [x, z, h] of trees) {
      tree(b, x, z, { kind: 'snowpine', h });
      b.decal('snowdrift', x + 0.4, z + 0.3, h * 0.45, h * 0.4, { rot: x });
    }
    spawnColumn(b, -41, [-12, 0, 12]);
    b.spawn(-36, -26, yawTo(-36, -26, 0, 0));
    b.spawn(-34, 26, yawTo(-34, 26, 0, 0));
    lantern(b, -8, 6);
    lantern(b, -20.5, -0.5, { h: 3.2 });
    lantern(b, -26.5, 12, { h: 3.2 });

    // Trodden paths
    b.ribbon('snowpath', [[-40, 0.5], [-33, 0.8], [-24, 1.2], [-16, 1.5], [-7.2, 1.2]], 2.0);
    b.ribbon('snowpath', [[-23.5, -6], [-20, -3], [-16, -0.5]], 1.4);
    b.ribbon('snowpath', [[-14.5, 7.6], [-14, 4.5], [-15, 1.8]], 1.4);
    b.ribbon('snowpath', [[-35, 13.6], [-33, 8], [-29, 4], [-24, 1.4]], 1.4);
    b.ribbon('snowpath', [[-22, -13], [-21.5, -8], [-20, -3.6]], 1.2);
    b.ribbon('tracks', [[-44, -24], [-30, -21], [-16, -24], [-6, -21.5], [0, -22]], 2.0, { color: 0x9aa6b4 });
    // Ground clutter
    b.scatterArea('snowclump', -44, -36, -7.5, 36, 160, { seed: 21, color: SNOW, on: ['snow'], s: [0.6, 1.6] });
    b.scatterArea('weed', -44, -36, -7.5, 36, 120, { seed: 22, color: 0x8a7a64, on: ['snow'], s: [0.7, 1.3] });
    b.scatterArea('twig', -44, -36, -7.5, 36, 70, { seed: 23, color: 0x5a4636, on: ['snow'] });
    b.scatterArea('pebble', -44, -36, -7.5, 36, 40, { seed: 24, color: 0x8d969c, on: ['snow'] });
    for (const [x, z] of [[-20, 12], [-33, -8.5], [-11, -20], [-39, 10]] as const) bush(b, x, z, { r: 0.7, color: 0x3d5a40, snow: true });
    debris(b, -18, -26, { radius: 1.2, count: 6, color: 0x7a6a5a, planks: true });
  });

  treeline(b, 52, 85, 130, 0x2f5446, 31, { snow: true, skip: (x, z) => Math.abs(x) < W + 4 && Math.abs(z) < D + 4 });
  hills(b, 110, 170, 0xe6edf2, 3, { count: 18, mat: 'snow', h: [8, 22] });
  mountains(b, 140, 0x7f8b96, 0xf4f8fb, 3, { height: 1.15 });

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
    clouds: { cover: 0.72, color: 0xf4f7fa, shade: 0x9aa8b8, scale: 0.9, speed: 0.8 },
    glow: 0.9,
    backdrop: { mat: 'snow', color: 0xe9eff3, patch: 0xd8e2ec },
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
