import * as THREE from 'three';
import type { MapDef } from '../maps';
import type { DecalId, Instance, PanelId, Prop, RibbonId, ScatterKind, Theme } from '../maps/builder';
import type { Box, MatId } from '../world';
import { cellRect, DECAL_CELL, decalAtlas, glowTexture, materialTexture, noiseTexture, PANEL_CELL, panelAtlas, RIBBON_COL, ribbonAtlas, signAtlas, type SignSpec } from './textures';

// Builds the static level. Boxes and solid props are merged into one mesh per
// material; decals, ribbons, panels, signs, glows and lit windows get one mesh
// each; ground clutter is instanced per kind. A shared shader patch adds
// world-space macro variation, ground patches and a baked heightfield ambient
// occlusion (contact darkening around walls, under overhangs and canopies).

interface Buf {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  /** Ground patch color (rgb) + strength (a). */
  pat: number[];
}

const NO_PATCH = [0, 0, 0, 0];
const newBuf = (): Buf => ({ pos: [], nor: [], uv: [], col: [], pat: [] });

function lin(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function hashColor(color: number, seed: number): [number, number, number] {
  const c = lin(color);
  const v = 1 + (((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.08 - 0.04);
  return [c[0] * v, c[1] * v, c[2] * v];
}

function pushQuad(g: Buf, v: number[][], n: number[], uvs: number[][], col: number[], pat = NO_PATCH): void {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    g.pos.push(v[i][0], v[i][1], v[i][2]);
    g.nor.push(n[0], n[1], n[2]);
    g.uv.push(uvs[i][0], uvs[i][1]);
    g.col.push(col[0], col[1], col[2]);
    g.pat.push(pat[0], pat[1], pat[2], pat[3]);
  }
}

/** Appends a non-indexed geometry with position/normal/uv/color attributes. */
function pushGeometry(g: Buf, geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const u = geo.getAttribute('uv');
  const c = geo.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    g.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    g.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    g.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    g.col.push(c.getX(i), c.getY(i), c.getZ(i));
    g.pat.push(0, 0, 0, 0);
  }
}

function toGeometry(g: Buf, patch = true): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  if (patch) geo.setAttribute('aPatch', new THREE.Float32BufferAttribute(g.pat, 4));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Boxes

function addBox(top: Buf, side: Buf, b: Box, topScale: number, sideScale: number, seed: number): void {
  const { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 } = b;
  const ct = hashColor(b.color, seed);
  const cs = b.sideColor !== undefined ? hashColor(b.sideColor, seed) : ct;
  const s = 1 / sideScale;
  const t = 1 / topScale;
  const k = (c: number[], f: number) => [c[0] * f, c[1] * f, c[2] * f];
  const pat = b.patch !== undefined ? [...lin(b.patch), 1] : NO_PATCH;
  pushQuad(side, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1 * s, y0 * s], [-z0 * s, y0 * s], [-z0 * s, y1 * s], [-z1 * s, y1 * s]], k(cs, 0.96));
  pushQuad(side, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]], k(cs, 0.96));
  pushQuad(top, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0 * t, -z1 * t], [x1 * t, -z1 * t], [x1 * t, -z0 * t], [x0 * t, -z0 * t]], ct, pat);
  // Underside only when something can see it (floating slabs, catwalks).
  if (y0 > 0.01 || y0 < -0.5) pushQuad(top, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0 * t, z0 * t], [x1 * t, z0 * t], [x1 * t, z1 * t], [x0 * t, z1 * t]], k(ct, 0.85));
  pushQuad(side, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]], k(cs, 0.98));
  pushQuad(side, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1 * s, y0 * s], [-x0 * s, y0 * s], [-x0 * s, y1 * s], [-x1 * s, y1 * s]], k(cs, 0.98));
}

// ---------------------------------------------------------------------------
// Prop geometry (local space, pivot at the bottom center unless noted)

/** Planar UVs picked per triangle from its face normal, in world meters / scale. */
function boxMapUV(geo: THREE.BufferGeometry, scale: number, ou = 0, ov = 0): void {
  const p = geo.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j);
      const y = p.getY(i + j);
      const z = p.getZ(i + j);
      let u: number;
      let v: number;
      if (ay >= ax && ay >= az) [u, v] = [x, z];
      else if (ax >= az) [u, v] = [z, y];
      else [u, v] = [x, y];
      uv[(i + j) * 2] = (u + ou) / scale;
      uv[(i + j) * 2 + 1] = (v + ov) / scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function cylinderUV(geo: THREE.BufferGeometry, r: number, h: number, scale: number): void {
  const uv = geo.getAttribute('uv');
  const n = geo.getAttribute('normal');
  const around = Math.max(1, Math.round((Math.PI * 2 * r) / scale));
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.99) uv.setXY(i, (uv.getX(i) * 2 * r) / scale, (uv.getY(i) * 2 * r) / scale);
    else uv.setXY(i, uv.getX(i) * around, (uv.getY(i) * h) / scale);
  }
}

/** Builds a non-indexed geometry from triangles, orienting each to face away from `inside(tri)`. */
function triGeometry(tris: number[][][], outward: (cx: number, cy: number, cz: number) => [number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let [a, b, c] of tris) {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = e1.cross(e2);
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    const o = outward(cx, cy, cz);
    if (n.x * o[0] + n.y * o[1] + n.z * o[2] < 0) {
      [b, c] = [c, b];
      n.negate();
    }
    n.normalize();
    for (const v of [a, b, c]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(n.x, n.y, n.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

function srand(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
}

/** Cone with an optional star-shaped, drooping skirt (pine layers) and a raised underside. */
function coneGeometry(r: number, h: number, seg: number, jag: number, seed: number): THREE.BufferGeometry {
  const rand = srand(seed || 1);
  const ring: number[][] = [];
  const n = jag > 0 ? Math.max(6, seg) * 2 : seg;
  const rot = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 + (seed ? (rand() - 0.5) * (1.2 / n) : 0);
    const out = jag > 0 ? (i % 2 ? 1 - jag : 1 + jag * 0.35) : 1;
    const rr = r * out * (seed ? 0.92 + rand() * 0.16 : 1);
    const y = jag > 0 && !(i % 2) ? -h * jag * 0.22 : 0;
    ring.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
  }
  const apex = [seed ? (rand() - 0.5) * r * 0.08 : 0, h, seed ? (rand() - 0.5) * r * 0.08 : 0];
  const under = [0, jag > 0 ? h * 0.16 : 0, 0];
  const tris: number[][][] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    tris.push([apex, a, b]);
    tris.push([under, b, a]);
  }
  // Side triangles contain the apex (centroid well above the skirt), underside ones do not.
  return triGeometry(tris, (cx, cy, cz) => (cy < h * 0.15 ? [0, -1, 0] : [cx, r * 0.3, cz]));
}

/** Icosphere fitted to w x h x d (bottom at 0) with seeded radial jitter. */
function lumpGeometry(w: number, h: number, d: number, seed: number, jitter: number, floor: number, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.5, detail);
  const p = geo.getAttribute('position');
  const rand = srand(seed || 7);
  const offs = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let f = offs.get(key);
    if (f === undefined) offs.set(key, (f = 1 + (rand() - 0.5) * 2 * jitter));
    p.setXYZ(i, p.getX(i) * f, Math.max(p.getY(i) * f, -floor), p.getZ(i) * f);
  }
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(w / (bb.max.x - bb.min.x), h / (bb.max.y - bb.min.y), d / (bb.max.z - bb.min.z));
  return geo;
}

/** Profile ([z, y] points) swept `len` along X, centered on the origin, with end caps. */
function extrudeGeometry(len: number, profile: [number, number][]): THREE.BufferGeometry {
  const L = len / 2;
  const tris: number[][][] = [];
  const n = profile.length;
  let cz = 0;
  let cy = 0;
  for (const [z, y] of profile) {
    cz += z / n;
    cy += y / n;
  }
  for (let i = 0; i < n; i++) {
    const [az, ay] = profile[i];
    const [bz, by] = profile[(i + 1) % n];
    tris.push([[-L, ay, az], [L, ay, az], [L, by, bz]]);
    tris.push([[-L, ay, az], [L, by, bz], [-L, by, bz]]);
  }
  const contour = profile.map(([z, y]) => new THREE.Vector2(z, y));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    for (const x of [-L, L]) tris.push([[x, profile[a][1], profile[a][0]], [x, profile[b][1], profile[b][0]], [x, profile[c][1], profile[c][0]]]);
  }
  return triGeometry(tris, (x, y, z) => (Math.abs(Math.abs(x) - L) < 1e-5 ? [Math.sign(x), 0, 0] : [0, y - cy, z - cz]));
}

function prismGeometry(len: number, h: number, depth: number): THREE.BufferGeometry {
  // Ridge along X, base in XZ at y = 0.
  const L = len / 2;
  const D = depth / 2;
  const g = newBuf();
  const slope = Math.hypot(D, h);
  const n1 = [0, D / slope, h / slope];
  const n2 = [0, D / slope, -h / slope];
  const w = [1, 1, 1];
  pushQuad(g, [[-L, 0, D], [L, 0, D], [L, h, 0], [-L, h, 0]], n1, [[0, 0], [len / 2, 0], [len / 2, slope / 2], [0, slope / 2]], w);
  pushQuad(g, [[L, 0, -D], [-L, 0, -D], [-L, h, 0], [L, h, 0]], n2, [[0, 0], [len / 2, 0], [len / 2, slope / 2], [0, slope / 2]], w);
  pushQuad(g, [[-L, 0, -D], [-L, 0, D], [-L, h, 0], [-L, h, 0]], [-1, 0, 0], [[0, 0], [1, 0], [0.5, 0.5], [0.5, 0.5]], [0.9, 0.9, 0.9]);
  pushQuad(g, [[L, 0, D], [L, 0, -D], [L, h, 0], [L, h, 0]], [1, 0, 0], [[0, 0], [1, 0], [0.5, 0.5], [0.5, 0.5]], [0.9, 0.9, 0.9]);
  pushQuad(g, [[-L, 0, -D], [L, 0, -D], [L, 0, D], [-L, 0, D]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.7, 0.7, 0.7]);
  return toGeometry(g, false);
}

/** Jagged distant peak with faceted snow cap (absolute vertex colors). */
function mountainGeometry(r: number, h: number, seed: number, color: number, cap: number | undefined): THREE.BufferGeometry {
  const rand = srand(seed || 3);
  const seg = 12;
  const fr = [1, 0.74, 0.5, 0.27, 0.1];
  const fy = [0, 0.3, 0.57, 0.8, 0.94];
  const rings: number[][][] = fr.map((f, j) =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const rr = r * f * (0.78 + rand() * 0.44);
      return [Math.cos(a) * rr, h * fy[j] * (j ? 0.88 + rand() * 0.24 : 1), Math.sin(a) * rr];
    }),
  );
  const apex = [(rand() - 0.5) * r * 0.12, h, (rand() - 0.5) * r * 0.12];
  const tris: number[][][] = [];
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = rings[j][i];
      const b = rings[j][(i + 1) % seg];
      const c = rings[j + 1][(i + 1) % seg];
      const d = rings[j + 1][i];
      tris.push([a, b, c], [a, c, d]);
    }
  const top = rings[rings.length - 1];
  for (let i = 0; i < seg; i++) tris.push([top[i], top[(i + 1) % seg], apex]);
  const geo = triGeometry(tris, (x, _y, z) => [x, r * 0.3, z]);
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const col = new Float32Array(p.count * 3);
  const rock = lin(color);
  const snow = cap !== undefined ? lin(cap) : rock;
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const line = h * (0.5 + ((Math.sin(i * 1.7 + seed) + 1) / 2) * 0.16);
    const isSnow = cap !== undefined && y > line && n.getY(i) > 0.25;
    const shade = 0.72 + 0.28 * Math.min(1, y / (h * 0.6));
    const c = isSnow ? snow : rock;
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = c[0] * (isSnow ? 1 : shade);
      col[(i + j) * 3 + 1] = c[1] * (isSnow ? 1 : shade);
      col[(i + j) * 3 + 2] = c[2] * (isSnow ? 1 : shade);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const AO_KINDS = new Set(['box', 'cylinder', 'cone', 'ellipsoid', 'rock', 'blob', 'extrude']);

/** World-space solid prop geometry with uv + vertex colors (contact darkening baked in). */
function propGeometry(p: Prop, scale: number): THREE.BufferGeometry | null {
  let geo: THREE.BufferGeometry;
  let placed = false;
  let absolute = false;
  const seg = p.segments ?? 10;
  switch (p.kind) {
    case 'box':
      geo = new THREE.BoxGeometry(p.r, p.h, p.d ?? p.r).toNonIndexed();
      geo.translate(0, p.h / 2, 0);
      boxMapUV(geo, scale, p.x + p.z, p.y);
      break;
    case 'cylinder': {
      geo = new THREE.CylinderGeometry(p.r * (p.d ?? 1), p.r, p.h, seg, 1, false).toNonIndexed();
      cylinderUV(geo, p.r, p.h, scale);
      if (p.axis === 'x' || p.axis === 'z') {
        // Legacy lying cylinder starting at (x, y, z).
        if (p.axis === 'x') {
          geo.rotateZ(-Math.PI / 2);
          geo.translate(p.x + p.h / 2, p.y, p.z);
        } else {
          geo.rotateX(Math.PI / 2);
          geo.translate(p.x, p.y, p.z + p.h / 2);
        }
        placed = true;
      } else geo.translate(0, p.h / 2, 0);
      break;
    }
    case 'cone':
      geo = coneGeometry(p.r, p.h, seg, p.jag ?? 0, p.seed ?? 0);
      boxMapUV(geo, scale);
      break;
    case 'sphere':
      geo = new THREE.IcosahedronGeometry(p.r, 1);
      boxMapUV(geo, scale);
      break;
    case 'ellipsoid':
      geo = new THREE.IcosahedronGeometry(0.5, 1);
      geo.scale(p.r, p.h, p.d ?? p.r);
      geo.translate(0, p.h / 2, 0);
      boxMapUV(geo, scale);
      break;
    case 'rock':
      geo = lumpGeometry(p.r, p.h, p.d ?? p.r, p.seed ?? Math.round(p.x * 13 + p.z * 7), 0.22, 0.3);
      boxMapUV(geo, scale, p.x, p.z);
      break;
    case 'blob':
      geo = lumpGeometry(p.r, p.h, p.d ?? p.r, p.seed ?? Math.round(p.x * 17 + p.z * 5), 0.12, 0.42);
      boxMapUV(geo, scale, p.x, p.z);
      break;
    case 'extrude':
      if (!p.profile || p.profile.length < 3) return null;
      geo = extrudeGeometry(p.r, p.profile);
      boxMapUV(geo, scale, p.x + p.z, 0);
      break;
    case 'prism':
      geo = prismGeometry(p.r, p.h, p.d ?? p.r);
      if (p.axis === 'z') geo.rotateY(Math.PI / 2);
      break;
    case 'mountain':
      geo = mountainGeometry(p.r, p.h, p.seed ?? Math.round(p.x + p.z), p.color, p.cap);
      boxMapUV(geo, scale * 6);
      absolute = true;
      break;
    default:
      return null;
  }
  if (!placed) {
    EULER.set(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0, 'YXZ');
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(EULER).setPosition(p.x, p.y, p.z));
  }
  // Vertex colors: tint x baked shading x contact darkening toward the base.
  const pos = geo.getAttribute('position');
  const prev = geo.getAttribute('color');
  const count = pos.count;
  const col = new Float32Array(count * 3);
  const c = lin(p.color);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    y0 = Math.min(y0, pos.getY(i));
    y1 = Math.max(y1, pos.getY(i));
  }
  const ao = (p.ao ?? AO_KINDS.has(p.kind)) && !absolute;
  const band = Math.min(0.7, Math.max(0.12, (y1 - y0) * 0.5));
  const kMin = p.mat === 'leaves' ? 0.8 : 0.62;
  for (let i = 0; i < count; i++) {
    let k = 1;
    if (ao) {
      const t = Math.min(1, (pos.getY(i) - y0) / band);
      k = kMin + (1 - kMin) * t * t * (3 - 2 * t);
    }
    for (let j = 0; j < 3; j++) col[i * 3 + j] = (absolute ? prev.getComponent(i, j) : c[j] * (prev ? prev.getComponent(i, j) : 1)) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ---------------------------------------------------------------------------
// Textured quads

function rotXZ(x: number, z: number, rot: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/** Horizontal quad (decals, flat panels): texture top toward local +Z. */
function flatQuad(g: Buf, x: number, y: number, z: number, w: number, d: number, rot: number, r: [number, number, number, number], col: number[]): void {
  const [u0, v0, u1, v1] = r;
  const P = (lx: number, lz: number) => {
    const [px, pz] = rotXZ(x, z, rot, lx, lz);
    return [px, y, pz];
  };
  pushQuad(g, [P(-w / 2, d / 2), P(w / 2, d / 2), P(w / 2, -d / 2), P(-w / 2, -d / 2)], [0, 1, 0], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], col);
}

/** Upright quad with its bottom center at (x, y, z), facing local +Z. */
function uprightQuad(g: Buf, x: number, y: number, z: number, w: number, h: number, rot: number, r: [number, number, number, number], col: number[]): void {
  const [u0, v0, u1, v1] = r;
  const [ax, az] = rotXZ(x, z, rot, -w / 2, 0);
  const [bx, bz] = rotXZ(x, z, rot, w / 2, 0);
  pushQuad(g, [[ax, y, az], [bx, y, bz], [bx, y + h, bz], [ax, y + h, az]], [Math.sin(rot), 0, Math.cos(rot)], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], col);
}

function addRibbon(g: Buf, p: Prop): void {
  const pts = p.pts;
  if (!pts || pts.length < 2) return;
  const w = p.r;
  const col = RIBBON_COL[p.tex as RibbonId] ?? 0;
  const u0 = col / 8 + 0.004;
  const u1 = (col + 1) / 8 - 0.004;
  const y = p.y + 0.008;
  const c = lin(p.color);
  // Mitered left/right edge points.
  const L: number[][] = [];
  const R: number[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    let rx = -dz;
    let rz = dx;
    if (i > 0 && i < pts.length - 1) {
      const [px, pz] = pts[i - 1];
      const [cx, cz] = pts[i];
      const sl = Math.hypot(cx - px, cz - pz) || 1;
      const k = Math.max(0.5, rx * -(cz - pz) / sl + rz * ((cx - px) / sl));
      rx /= k;
      rz /= k;
    }
    L.push([pts[i][0] - (rx * w) / 2, y, pts[i][1] - (rz * w) / 2]);
    R.push([pts[i][0] + (rx * w) / 2, y, pts[i][1] + (rz * w) / 2]);
  }
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const va = dist / (w * 4);
    const vb = (dist + seg) / (w * 4);
    dist += seg;
    pushQuad(g, [L[i], R[i], R[i + 1], L[i + 1]], [0, 1, 0], [[u0, va], [u1, va], [u1, vb], [u0, vb]], c);
  }
}

// ---------------------------------------------------------------------------
// Instanced ground clutter

interface ScatterDef {
  geo: THREE.BufferGeometry;
  /** Grass-like: double sided, up-facing normals, wind sway. */
  blade: boolean;
  wind: boolean;
  flat: boolean;
}

function bladeTris(out: number[][][], cols: number[][], x: number, z: number, a: number, h: number, w: number, lean: number, c0: number[], c1: number[], segs = 1): void {
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  // Blade plane is perpendicular to its lean direction.
  const px = -dz * w * 0.5;
  const pz = dx * w * 0.5;
  let prevL = [x - px, 0, z - pz];
  let prevR = [x + px, 0, z + pz];
  for (let s = 1; s <= segs; s++) {
    const t = s / segs;
    const off = lean * t * t;
    const cx = x + dx * off;
    const cz = z + dz * off;
    const cy = h * t;
    const taper = 1 - t;
    const cc = c0.map((v, i) => v + (c1[i] - v) * t);
    const cp = c0.map((v, i) => v + (c1[i] - v) * ((s - 1) / segs));
    if (s === segs) {
      out.push([prevL, prevR, [cx, cy, cz]]);
      cols.push(cp, cp, cc);
    } else {
      const L = [cx - px * taper, cy, cz - pz * taper];
      const R = [cx + px * taper, cy, cz + pz * taper];
      out.push([prevL, prevR, R], [prevL, R, L]);
      cols.push(cp, cp, cc, cp, cc, cc);
      prevL = L;
      prevR = R;
    }
  }
}

function geoFromTris(tris: number[][][], cols: number[][], up: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  tris.forEach((t, ti) => {
    e1.set(t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]);
    e2.set(t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]);
    const n = up ? new THREE.Vector3(0, 1, 0) : e1.cross(e2).normalize();
    for (let j = 0; j < 3; j++) {
      pos.push(...t[j]);
      col.push(...cols[ti * 3 + j]);
      nor.push(n.x, n.y, n.z);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeBoundingSphere();
  return geo;
}

/** Appends a lump (pebble/clump) with flat normals to a tri list. */
function lumpTris(tris: number[][][], cols: number[][], x: number, y: number, z: number, w: number, h: number, d: number, seed: number, c: number[], detail = 0, rotY = 0): void {
  const g = lumpGeometry(w, h, d, seed, 0.25, 0.2, detail);
  g.rotateY(rotY);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const t: number[][] = [];
    for (let j = 0; j < 3; j++) t.push([p.getX(i + j) + x, p.getY(i + j) + y, p.getZ(i + j) + z]);
    tris.push(t);
    const k = 0.85 + ((i * 7919) % 100) / 400;
    cols.push(c.map((v) => v * k), c.map((v) => v * k), c.map((v) => v * k));
  }
}

function boxTris(tris: number[][][], cols: number[][], x: number, y: number, z: number, w: number, h: number, d: number, rotY: number, c: number[], rotZ = 0): void {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.rotateZ(rotZ);
  g.rotateY(rotY);
  g.translate(x, y + h / 2, z);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const t: number[][] = [];
    for (let j = 0; j < 3; j++) t.push([p.getX(i + j), p.getY(i + j), p.getZ(i + j)]);
    tris.push(t);
    const k = i < 12 ? 0.9 : i < 24 ? 1.05 : 0.95;
    cols.push(c.map((v) => v * k), c.map((v) => v * k), c.map((v) => v * k));
  }
}

function scatterDef(kind: ScatterKind): ScatterDef {
  const r = srand(kind.length * 131 + kind.charCodeAt(0) * 7);
  const tris: number[][][] = [];
  const cols: number[][] = [];
  const dark = [0.5, 0.55, 0.45];
  const tip = [1.15, 1.18, 1.0];
  switch (kind) {
    case 'grass':
    case 'tallgrass': {
      const tall = kind === 'tallgrass';
      const n = tall ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.8;
        const rr = r() * (tall ? 0.12 : 0.08);
        bladeTris(tris, cols, Math.cos(a) * rr, Math.sin(a) * rr, a, (tall ? 0.45 : 0.13) + r() * (tall ? 0.3 : 0.12), tall ? 0.055 : 0.04, (tall ? 0.2 : 0.07) * (0.5 + r()), dark, tip, tall ? 3 : 2);
      }
      return { geo: geoFromTris(tris, cols, true), blade: true, wind: true, flat: false };
    }
    case 'flowers': {
      const heads = [[1.6, 1.55, 1.4], [1.7, 1.4, 0.35], [1.1, 0.55, 1.4], [1.6, 0.6, 0.55], [0.8, 0.9, 1.7]];
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2;
        const rr = 0.04 + r() * 0.12;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        const h = 0.18 + r() * 0.2;
        bladeTris(tris, cols, x, z, a, h, 0.025, 0.04, [0.3, 0.45, 0.2], [0.45, 0.65, 0.3], 1);
        const hc = heads[Math.floor(r() * heads.length)];
        const s = 0.035 + r() * 0.015;
        const top = [x + Math.cos(a) * 0.04, h, z + Math.sin(a) * 0.04];
        for (let k = 0; k < 5; k++) {
          const b0 = (k / 5) * Math.PI * 2;
          const b1 = ((k + 1) / 5) * Math.PI * 2;
          tris.push([top, [top[0] + Math.cos(b0) * s, top[1] + 0.012, top[2] + Math.sin(b0) * s], [top[0] + Math.cos(b1) * s, top[1] + 0.012, top[2] + Math.sin(b1) * s]]);
          cols.push([1.6, 1.4, 0.4], hc, hc);
        }
      }
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2;
        bladeTris(tris, cols, Math.cos(a) * 0.05, Math.sin(a) * 0.05, a, 0.14 + r() * 0.08, 0.04, 0.06, dark, tip, 1);
      }
      return { geo: geoFromTris(tris, cols, true), blade: true, wind: true, flat: false };
    }
    case 'fern': {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5;
        const len = 0.38 + r() * 0.18;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const px = -dz;
        const pz = dx;
        const pts = [0, 0.33, 0.66, 1].map((t) => [dx * len * t, Math.sin(t * Math.PI * 0.85) * 0.28 + 0.02, dz * len * t]);
        const widths = [0.02, 0.09, 0.07, 0];
        for (let s = 0; s < 3; s++) {
          const a0 = pts[s];
          const a1 = pts[s + 1];
          const w0 = widths[s];
          const w1 = widths[s + 1];
          const L0 = [a0[0] - px * w0, a0[1], a0[2] - pz * w0];
          const R0 = [a0[0] + px * w0, a0[1], a0[2] + pz * w0];
          const L1 = [a1[0] - px * w1, a1[1] - 0.02, a1[2] - pz * w1];
          const R1 = [a1[0] + px * w1, a1[1] - 0.02, a1[2] + pz * w1];
          const c0 = dark.map((v, k) => v + (tip[k] - v) * (s / 3));
          const c1 = dark.map((v, k) => v + (tip[k] - v) * ((s + 1) / 3));
          tris.push([L0, R0, R1], [L0, R1, L1]);
          cols.push(c0, c0, c1, c0, c1, c1);
        }
      }
      return { geo: geoFromTris(tris, cols, true), blade: true, wind: true, flat: false };
    }
    case 'weed': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r() * 0.4;
        const len = 0.14 + r() * 0.08;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const w = 0.045;
        const tipP = [dx * len, 0.1 + r() * 0.06, dz * len];
        const mid = [dx * len * 0.45, 0.05, dz * len * 0.45];
        tris.push([[0, 0.01, 0], [mid[0] - dz * w, mid[1], mid[2] + dx * w], tipP], [[0, 0.01, 0], tipP, [mid[0] + dz * w, mid[1], mid[2] - dx * w]]);
        cols.push(dark, [0.85, 0.9, 0.75], tip, dark, tip, [0.85, 0.9, 0.75]);
      }
      return { geo: geoFromTris(tris, cols, true), blade: true, wind: false, flat: false };
    }
    case 'reed': {
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2;
        const rr = r() * 0.1;
        bladeTris(tris, cols, Math.cos(a) * rr, Math.sin(a) * rr, a, 0.9 + r() * 0.5, 0.05, 0.2 + r() * 0.15, dark, tip, 3);
      }
      for (let i = 0; i < 2; i++) {
        const x = (r() - 0.5) * 0.1;
        const z = (r() - 0.5) * 0.1;
        boxTris(tris, cols, x, 0, z, 0.012, 1.1 + r() * 0.2, 0.012, 0, [0.5, 0.55, 0.35]);
        boxTris(tris, cols, x, 1.15, z, 0.04, 0.16, 0.04, r(), [0.42, 0.26, 0.14]);
      }
      return { geo: geoFromTris(tris, cols, false), blade: true, wind: true, flat: false };
    }
    case 'leaves': {
      const pal = [[0.75, 0.32, 0.08], [0.85, 0.55, 0.12], [0.55, 0.2, 0.06], [0.5, 0.45, 0.12], [0.4, 0.22, 0.08]];
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.3;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const o = r() * Math.PI;
        const l = 0.05 + r() * 0.03;
        const w = l * 0.55;
        const c = pal[Math.floor(r() * pal.length)];
        const y = 0.006 + r() * 0.01;
        const A = [x + Math.cos(o) * l, y, z + Math.sin(o) * l];
        const B = [x - Math.sin(o) * w, y + 0.006, z + Math.cos(o) * w];
        const C = [x - Math.cos(o) * l, y, z - Math.sin(o) * l];
        const D = [x + Math.sin(o) * w, y + 0.006, z - Math.cos(o) * w];
        tris.push([A, B, C], [A, C, D]);
        cols.push(c, c, c, c, c, c);
      }
      return { geo: geoFromTris(tris, cols, true), blade: true, wind: false, flat: false };
    }
    case 'pebble': {
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2;
        const d = i ? 0.1 + r() * 0.12 : 0;
        const s = i ? 0.06 + r() * 0.05 : 0.12;
        lumpTris(tris, cols, Math.cos(a) * d, -0.01, Math.sin(a) * d, s * 1.3, s * 0.7, s, 31 + i, [1, 1, 1], 0, r() * 3);
      }
      return { geo: geoFromTris(tris, cols, false), blade: false, wind: false, flat: true };
    }
    case 'snowclump':
      lumpTris(tris, cols, 0, -0.04, 0, 0.6, 0.18, 0.45, 77, [1, 1, 1], 1);
      return { geo: geoFromTris(tris, cols, false), blade: false, wind: false, flat: false };
    case 'debris': {
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * 0.25;
        const s = 0.07 + r() * 0.1;
        boxTris(tris, cols, Math.cos(a) * d, -0.01, Math.sin(a) * d, s * 1.4, s * 0.6, s, r() * 3, [1, 1, 1], (r() - 0.5) * 0.5);
      }
      lumpTris(tris, cols, 0.15, -0.02, -0.12, 0.16, 0.08, 0.12, 9, [0.9, 0.9, 0.9]);
      return { geo: geoFromTris(tris, cols, false), blade: false, wind: false, flat: true };
    }
    case 'twig': {
      const c = [0.42, 0.3, 0.2];
      boxTris(tris, cols, 0, 0, 0, 0.45, 0.025, 0.025, 0, c);
      boxTris(tris, cols, 0.08, 0, 0.05, 0.18, 0.018, 0.018, 0.7, c);
      boxTris(tris, cols, -0.1, 0, -0.03, 0.12, 0.015, 0.015, -0.6, c);
      return { geo: geoFromTris(tris, cols, false), blade: false, wind: false, flat: true };
    }
    case 'mushroom': {
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2;
        const d = i ? 0.06 + r() * 0.06 : 0;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const h = 0.05 + r() * 0.05;
        boxTris(tris, cols, x, 0, z, 0.02, h, 0.02, r(), [1.1, 1.05, 0.95]);
        const cap = [0.85, 0.32, 0.22];
        const s = 0.035 + r() * 0.02;
        const top = [x, h + s * 0.7, z];
        for (let k = 0; k < 6; k++) {
          const b0 = (k / 6) * Math.PI * 2;
          const b1 = ((k + 1) / 6) * Math.PI * 2;
          tris.push([top, [x + Math.cos(b1) * s, h, z + Math.sin(b1) * s], [x + Math.cos(b0) * s, h, z + Math.sin(b0) * s]]);
          cols.push(cap, cap.map((v) => v * 0.8), cap.map((v) => v * 0.8));
          tris.push([[x, h - 0.004, z], [x + Math.cos(b0) * s, h, z + Math.sin(b0) * s], [x + Math.cos(b1) * s, h, z + Math.sin(b1) * s]]);
          cols.push([0.9, 0.85, 0.75], [0.9, 0.85, 0.75], [0.9, 0.85, 0.75]);
        }
      }
      return { geo: geoFromTris(tris, cols, false), blade: false, wind: false, flat: false };
    }
  }
}

// ---------------------------------------------------------------------------
// Heightfield ambient occlusion

const AO_RES = 0.25;
const AO_MARGIN = 6;

function boxBlur(src: Float32Array, w: number, h: number, r: number, passes: number): Float32Array {
  let a = src.slice();
  let b = new Float32Array(a.length);
  const k = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += a[row + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * k;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += a[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        b[y * w + x] = acc * k;
        acc += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

/**
 * Rasterizes the tallest surface per 25 cm column, then blurs it at two radii.
 * The shader compares a fragment's height with the blurred neighbourhood height:
 * the more geometry rises above it nearby, the darker its ambient light.
 */
function buildAOMap(map: MapDef): { tex: THREE.DataTexture; box: THREE.Vector4 } {
  const b = map.bounds;
  const ox = b.minX - AO_MARGIN;
  const oz = b.minZ - AO_MARGIN;
  const W = Math.ceil((b.maxX - b.minX + AO_MARGIN * 2) / AO_RES);
  const H = Math.ceil((b.maxZ - b.minZ + AO_MARGIN * 2) / AO_RES);
  const hf = new Float32Array(W * H).fill(-2);
  const raster = (x0: number, z0: number, x1: number, z1: number, top: number) => {
    let i0 = Math.round((x0 - ox) / AO_RES);
    let i1 = Math.round((x1 - ox) / AO_RES);
    let j0 = Math.round((z0 - oz) / AO_RES);
    let j1 = Math.round((z1 - oz) / AO_RES);
    if (i1 <= i0) i1 = i0 + 1;
    if (j1 <= j0) j1 = j0 + 1;
    i0 = Math.max(0, i0);
    j0 = Math.max(0, j0);
    i1 = Math.min(W, i1);
    j1 = Math.min(H, j1);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (hf[j * W + i] < top) hf[j * W + i] = top;
  };
  for (const bx of map.boxes) {
    if (!(bx.collide || bx.visible || bx.soft) || bx.maxY > 28 || bx.maxY - bx.minY > 28) continue;
    raster(bx.minX, bx.minZ, bx.maxX, bx.maxZ, bx.maxY);
  }
  for (const p of map.props) {
    if (p.ao === false || !AO_KINDS.has(p.kind) || p.axis === 'x' || p.axis === 'z' || p.rotX || p.rotZ || p.h < 0.3) continue;
    const half = p.kind === 'cylinder' || p.kind === 'cone' ? p.r * 0.85 : Math.max(p.r, p.d ?? p.r) * 0.42;
    if (half < 0.12 || Math.abs(p.x) > 200 || Math.abs(p.z) > 200) continue;
    raster(p.x - half, p.z - half, p.x + half, p.z + half, p.y + p.h);
  }
  const near = boxBlur(hf, W, H, 2, 3);
  const far = boxBlur(hf, W, H, 9, 3);
  const data = new Uint8Array(W * H * 4);
  const enc = (v: number) => Math.max(0, Math.min(255, Math.round((v + 2) * 10)));
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = enc(near[i]);
    data[i * 4 + 1] = enc(far[i]);
    data[i * 4 + 2] = enc(hf[i]);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: new THREE.Vector4(ox, oz, 1 / (W * AO_RES), 1 / (H * AO_RES)) };
}

// ---------------------------------------------------------------------------
// Shader patch shared by every lit world material

interface Shared {
  uTime: { value: number };
  uMacro: { value: THREE.Texture };
  uAOMap: { value: THREE.Texture | null };
  uAOBox: { value: THREE.Vector4 };
  /** near strength, far strength, max occlusion */
  uAOStr: { value: THREE.Vector3 };
  ao: boolean;
}

interface PatchOpts {
  macro?: number;
  patch?: boolean;
  ao?: boolean;
  /** Scales the baked AO (foliage reads better with less). */
  aoAmt?: number;
  wind?: boolean;
}

const AO_GLSL = /* glsl */ `
float worldAO(vec3 wp, vec3 wn) {
  vec2 auv = (wp.xz + wn.xz * 0.45 - uAOBox.xy) * uAOBox.zw;
  vec4 hm = texture2D(uAOMap, auv);
  float y = wp.y - 0.06;
  float nearH = hm.r * 25.5 - 2.0 - y;
  float farH = hm.g * 25.5 - 2.0 - y;
  float o = 1.0 - (1.0 - clamp(nearH * 0.85, 0.0, 1.0) * uAOStr.x) * (1.0 - clamp(farH * 0.3, 0.0, 1.0) * uAOStr.y);
  return clamp(o, 0.0, uAOStr.z);
}`;

function patchWorld(m: THREE.Material, sh: Shared, o: PatchOpts): void {
  const ao = !!o.ao && sh.ao;
  m.defines = { ...(m.defines ?? {}), ...(o.patch ? { WORLD_PATCH: '' } : {}), ...(ao ? { WORLD_AO: '' } : {}), ...(o.wind ? { WORLD_WIND: '' } : {}) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sh.uTime;
    shader.uniforms.uMacro = sh.uMacro;
    shader.uniforms.uMacroAmt = { value: o.macro ?? 0 };
    shader.uniforms.uAOMap = sh.uAOMap;
    shader.uniforms.uAOBox = sh.uAOBox;
    shader.uniforms.uAOStr = sh.uAOStr;
    shader.uniforms.uAOAmt = { value: o.aoAmt ?? 1 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWP;
        varying vec3 vWN;
        uniform float uTime;
        #ifdef WORLD_PATCH
        attribute vec4 aPatch;
        varying vec4 vPatch;
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef WORLD_WIND
        {
          vec4 ip = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
          ip = instanceMatrix * ip;
          #endif
          float sway = sin(uTime * 1.7 + ip.x * 0.45 + ip.z * 0.31) * 0.6 + sin(uTime * 2.9 + ip.x * 1.3 - ip.z * 0.7) * 0.3;
          float k = max(position.y, 0.0);
          transformed.x += sway * 0.13 * k;
          transformed.z += sway * 0.08 * k;
        }
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
          #endif
          vWP = (modelMatrix * wp4).xyz;
          vWN = normalize(mat3(modelMatrix) * objectNormal);
          #ifdef WORLD_PATCH
          vPatch = aPatch;
          #endif
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWP;
        varying vec3 vWN;
        uniform sampler2D uMacro;
        uniform float uMacroAmt;
        #ifdef WORLD_PATCH
        varying vec4 vPatch;
        #endif
        #ifdef WORLD_AO
        uniform sampler2D uAOMap;
        uniform vec4 uAOBox;
        uniform vec3 uAOStr;
        uniform float uAOAmt;
        ${AO_GLSL}
        #endif`,
      )
      .replace(
        '#include <color_fragment>',
        `{
          vec3 wn = normalize(vWN);
          vec2 mp = vWP.xz + vec2(vWP.y * 0.37, -vWP.y * 0.29);
          float mA = texture2D(uMacro, mp * 0.017).r;
          float mB = texture2D(uMacro, mp * 0.061 + 0.31).g;
          vec3 tint = vec3(1.0);
          #ifdef USE_COLOR
          tint = vColor.rgb;
          #endif
          #ifdef WORLD_PATCH
          float up = smoothstep(0.5, 0.9, wn.y);
          float pm = smoothstep(0.48, 0.64, mA * 0.72 + mB * 0.38) * vPatch.a * up;
          tint = mix(tint, vPatch.rgb, pm);
          #endif
          diffuseColor.rgb *= tint * (1.0 + ((mA - 0.5) * 0.9 + (mB - 0.5) * 0.5) * uMacroAmt);
        }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        #ifdef WORLD_AO
        {
          float occ = worldAO(vWP, normalize(vWN)) * uAOAmt;
          reflectedLight.indirectDiffuse *= 1.0 - occ;
          reflectedLight.directDiffuse *= 1.0 - occ * 0.45;
        }
        #endif`,
      );
  };
}

const MACRO: Partial<Record<MatId, number>> = {
  grass: 0.55,
  dirt: 0.45,
  snow: 0.22,
  asphalt: 0.4,
  concrete: 0.32,
  sand: 0.35,
  gravel: 0.35,
  rock: 0.35,
  leaves: 0.35,
  plaster: 0.25,
  brick: 0.22,
  roof: 0.25,
};

function solidMaterial(mat: MatId, anisotropy: number, sh: Shared): THREE.Material {
  const { tex } = materialTexture(mat, anisotropy);
  if (mat === 'glass') return new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.55, shininess: 100, specular: 0xffffff });
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, flatShading: mat === 'leaves' || mat === 'rock' });
  patchWorld(m, sh, { macro: MACRO[mat] ?? 0.15, patch: true, ao: true, aoAmt: mat === 'leaves' ? 0.5 : 1 });
  return m;
}

// ---------------------------------------------------------------------------
// Water, sky, glows

function waterMaterial(theme: Theme, sh: Shared): THREE.ShaderMaterial {
  const wc = theme.water ?? { shallow: 0x4f9aa6, deep: 0x1d4f63 };
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    defines: sh.ao ? { WORLD_AO: '' } : {},
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color(wc.deep) },
        uShallow: { value: new THREE.Color(wc.shallow) },
        uSky: { value: new THREE.Color(theme.skyHorizon) },
        uSunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
        uSunColor: { value: new THREE.Color(theme.sun) },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vWP;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMacro;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      #ifdef WORLD_AO
      uniform sampler2D uAOMap;
      uniform vec4 uAOBox;
      #endif
      varying vec3 vWP;
      #include <fog_pars_fragment>
      float hgt(vec2 p) {
        return texture2D(uMacro, p * 0.09 + vec2(uTime * 0.035, 0.0)).b * 0.6
          + texture2D(uMacro, p * 0.21 + vec2(-uTime * 0.02, uTime * 0.05)).g * 0.4;
      }
      void main() {
        vec2 p = vWP.xz;
        float e = 0.12;
        float h0 = hgt(p);
        vec3 n = normalize(vec3((h0 - hgt(p + vec2(e, 0.0))) * 3.2, 1.0, (h0 - hgt(p + vec2(0.0, e))) * 3.2));
        vec3 V = normalize(cameraPosition - vWP);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        float shallow = 0.0;
        #ifdef WORLD_AO
        vec4 hm = texture2D(uAOMap, (p - uAOBox.xy) * uAOBox.zw);
        shallow = clamp((hm.r * 25.5 - 2.0 - vWP.y) * 1.6, 0.0, 1.0);
        #endif
        vec3 col = mix(uDeep, uShallow, shallow * 0.8 + h0 * 0.25);
        col = mix(col, uSky, 0.12 + fres * 0.6);
        vec3 R = reflect(-V, n);
        float spec = pow(max(dot(R, uSunDir), 0.0), 160.0);
        col += uSunColor * spec * 1.8;
        float foam = smoothstep(0.6, 1.0, shallow) * smoothstep(0.55, 0.8, texture2D(uMacro, p * 0.35 + vec2(uTime * 0.06, 0.0)).b);
        col = mix(col, vec3(0.8, 0.86, 0.86), foam * 0.22);
        gl_FragColor = vec4(col, mix(0.78, 0.96, max(fres, foam)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function makeSky(theme: Theme, sh: Shared, detail: boolean): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const cl = theme.clouds ?? { cover: 0.4 };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: detail ? { CLOUD_SHADE: '' } : {},
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
      bottom: { value: new THREE.Color(theme.skyBottom) },
      sunColor: { value: new THREE.Color(theme.sun) },
      sunDir: { value: sunDir },
      cloudLit: { value: new THREE.Color(cl.color ?? 0xffffff) },
      cloudShade: { value: new THREE.Color(cl.shade ?? new THREE.Color(theme.skyHorizon).lerp(new THREE.Color(theme.skyTop), 0.35).multiplyScalar(0.92).getHex()) },
      cover: { value: cl.cover },
      cscale: { value: cl.scale ?? 1 },
      cspeed: { value: cl.speed ?? 1 },
      uTime: sh.uTime,
      uNoise: sh.uMacro,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir;
      uniform vec3 cloudLit; uniform vec3 cloudShade; uniform float cover; uniform float cscale; uniform float cspeed;
      uniform float uTime; uniform sampler2D uNoise;
      varying vec3 vDir;
      float clouds(vec2 p) {
        return texture2D(uNoise, p).r * 0.62 + texture2D(uNoise, p * 2.7 + 0.37).g * 0.28 + texture2D(uNoise, p * 6.3 + 0.71).b * 0.1;
      }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-y * 3.0, 0.0, 1.0), 0.6));
        float s = max(dot(d, sunDir), 0.0);
        // warm scattering toward the sun along the horizon, plus a pale haze band
        col += sunColor * pow(s, 5.0) * 0.16 * (1.0 - clamp(y * 1.6, 0.0, 1.0));
        col = mix(col, horizon * 1.05, exp(-abs(y) * 16.0) * 0.5);
        float dens = 0.0;
        if (y > 0.0 && cover > 0.0) {
          vec2 p = d.xz / (y + 0.12) * 0.2 * cscale + vec2(uTime * 0.004, uTime * 0.0017) * cspeed;
          float n = clouds(p);
          dens = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n) * smoothstep(0.0, 0.1, y);
          float lit = 0.7;
          #ifdef CLOUD_SHADE
          float nl = clouds(p + sunDir.xz * 0.025);
          lit = clamp(0.62 + (n - nl) * 5.0, 0.0, 1.0);
          #endif
          vec3 cc = mix(cloudShade, cloudLit, lit) + sunColor * pow(s, 10.0) * 0.4 * (1.0 - dens);
          col = mix(col, cc, dens * 0.93);
        }
        col += sunColor * (pow(s, 900.0) * 3.0 * (1.0 - dens) + pow(s, 14.0) * 0.2);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

function glowMaterial(glow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uGlow: { value: glow } }]),
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute float size;
      attribute vec3 gcolor;
      uniform float uGlow;
      varying vec2 vUv;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // pull toward the camera so halos are not clipped by the lamp housing
        mvPosition.xyz += normalize(-mvPosition.xyz) * size * 0.35;
        mvPosition.xy += corner * size * 0.5;
        vUv = corner * 0.5 + 0.5;
        vCol = gcolor * uGlow;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        float a = texture2D(map, vUv).a;
        float f = 1.0;
        #ifdef USE_FOG
        f = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor = vec4(vCol * a * a * 0.55 * f, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------

export interface WorldVisuals {
  group: THREE.Group;
  sky: THREE.Mesh;
  /** Baked AO strength (near, far, max); live-tweakable for debugging. */
  ao: THREE.Vector3;
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

/**
 * @param detail decals, light pools, instanced ground clutter and baked AO
 *   (pass false for quality 'low'); defaults to `shadows`.
 */
export function buildWorld(map: MapDef, anisotropy: number, shadows: boolean, particlesOn: boolean, detail = shadows): WorldVisuals {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const theme = map.theme;
  const glow = theme.glow ?? 1;
  const sh: Shared = {
    uTime: { value: 0 },
    uMacro: { value: noiseTexture() },
    uAOMap: { value: null },
    uAOBox: { value: new THREE.Vector4() },
    uAOStr: { value: new THREE.Vector3(0.72, 0.5, 0.72) },
    ao: detail,
  };
  if (detail) {
    const ao = buildAOMap(map);
    sh.uAOMap.value = ao.tex;
    sh.uAOBox.value = ao.box;
    disposables.push(ao.tex);
  }
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, o: { cast?: boolean; receive?: boolean; order?: number } = {}): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadows && !!o.cast;
    mesh.receiveShadow = shadows && (o.receive ?? true);
    mesh.matrixAutoUpdate = false;
    if (o.order !== undefined) mesh.renderOrder = o.order;
    group.add(mesh);
    disposables.push(geo, mat);
    return mesh;
  };

  // ---- Solids: boxes + props merged per material
  const solids = new Map<string, Buf>();
  const bufFor = (key: string) => {
    let g = solids.get(key);
    if (!g) solids.set(key, (g = newBuf()));
    return g;
  };
  const water = newBuf();
  map.boxes.forEach((b, i) => {
    if (!b.visible) return;
    if (b.mat === 'water') {
      const s = 1;
      pushQuad(water, [[b.minX, b.maxY, b.maxZ], [b.maxX, b.maxY, b.maxZ], [b.maxX, b.maxY, b.minZ], [b.minX, b.maxY, b.minZ]], [0, 1, 0], [[0, 0], [s, 0], [s, s], [0, s]], [1, 1, 1]);
      return;
    }
    const side = b.sideMat ?? b.mat;
    addBox(bufFor(b.mat), bufFor(side), b, materialTexture(b.mat, anisotropy).scale, materialTexture(side, anisotropy).scale, i);
  });

  const decals = newBuf();
  const lights = newBuf();
  const ribbons = newBuf();
  const panels = newBuf();
  const litPanels = newBuf();
  const emissive = newBuf();
  const signs: Prop[] = [];
  const glows: Prop[] = [];
  const b = map.bounds;
  const far = (p: Prop) => p.kind === 'mountain' || p.x < b.minX - 10 || p.x > b.maxX + 10 || p.z < b.minZ - 10 || p.z > b.maxZ + 10;
  for (const p of map.props) {
    switch (p.kind) {
      case 'decal': {
        const light = p.tex === 'light';
        if (!detail) break;
        flatQuad(light ? lights : decals, p.x, p.y + (light ? 0.016 : 0.012), p.z, p.r, p.d ?? p.r, p.rotY ?? 0, cellRect(DECAL_CELL[p.tex as DecalId] ?? 0, 4, 4), light ? lin(p.color).map((v) => v * glow) : lin(p.color));
        break;
      }
      case 'ribbon':
        addRibbon(ribbons, p);
        break;
      case 'panel': {
        const lit = p.tex === 'windowLit';
        const r = cellRect(PANEL_CELL[p.tex as PanelId] ?? 1, 4, 2);
        const col = lit ? lin(p.color).map((v) => v * glow) : lin(p.color);
        if (p.flat) flatQuad(lit ? litPanels : panels, p.x, p.y + 0.004, p.z, p.r, p.h, p.rotY ?? 0, r, col);
        else uprightQuad(lit ? litPanels : panels, p.x, p.y, p.z, p.r, p.h, p.rotY ?? 0, r, col);
        break;
      }
      case 'sign':
        signs.push(p);
        break;
      case 'glow':
        glows.push(p);
        break;
      default: {
        const mat = p.mat ?? 'plain';
        const geo = propGeometry(p, materialTexture(mat, anisotropy).scale);
        if (!geo) break;
        if (p.emissive !== undefined) {
          const e = lin(p.emissive).map((v) => v * glow);
          const c = geo.getAttribute('color');
          for (let i = 0; i < c.count; i++) c.setXYZ(i, e[0], e[1], e[2]);
          pushGeometry(emissive, geo);
        } else pushGeometry(bufFor(far(p) ? `far:${mat}` : mat), geo);
        geo.dispose();
      }
    }
  }

  for (const [key, g] of solids) {
    if (!g.pos.length) continue;
    const distant = key.startsWith('far:');
    const mat = (distant ? key.slice(4) : key) as MatId;
    addMesh(toGeometry(g), solidMaterial(mat, anisotropy, sh), { cast: !distant && mat !== 'glass', receive: !distant });
  }
  if (emissive.pos.length) addMesh(toGeometry(emissive, false), new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (water.pos.length) {
    const wm = waterMaterial(theme, sh);
    wm.uniforms.uTime = sh.uTime;
    wm.uniforms.uMacro = sh.uMacro;
    wm.uniforms.uAOMap = sh.uAOMap;
    wm.uniforms.uAOBox = sh.uAOBox;
    addMesh(toGeometry(water, false), wm, { receive: false, order: 2 });
  }

  // ---- Backdrop: ground ring from the map edge to the horizon
  const ground = theme.backdrop ?? autoBackdrop(map);
  if (ground) {
    const shape = new THREE.Shape();
    const R = 850;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      if (i === 0) shape.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      else shape.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    const e = 0.05;
    const [hx0, hz0, hx1, hz1] = ground.hole ?? [b.minX, b.minZ, b.maxX, b.maxZ];
    const hole = new THREE.Path();
    hole.moveTo(hx0 + e, -hz1 + e);
    hole.lineTo(hx0 + e, -hz0 - e);
    hole.lineTo(hx1 - e, -hz0 - e);
    hole.lineTo(hx1 - e, -hz1 + e);
    hole.closePath();
    shape.holes.push(hole);
    const sg = new THREE.ShapeGeometry(shape, 4).toNonIndexed();
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, (ground.y ?? 0) - 0.01, 0);
    const bg = newBuf();
    const p = sg.getAttribute('position');
    const scale = materialTexture(ground.mat, anisotropy).scale;
    const c = lin(ground.color);
    const pat = ground.patch !== undefined ? [...lin(ground.patch), 1] : NO_PATCH;
    for (let i = 0; i < p.count; i++) {
      bg.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      bg.nor.push(0, 1, 0);
      bg.uv.push(p.getX(i) / scale, -p.getZ(i) / scale);
      bg.col.push(...c);
      bg.pat.push(...pat);
    }
    sg.dispose();
    addMesh(toGeometry(bg), solidMaterial(ground.mat, anisotropy, { ...sh, ao: false }), { receive: false });
  }

  // ---- Decals, light pools, ribbons, panels
  if (ribbons.pos.length) {
    const m = new THREE.MeshLambertMaterial({ map: ribbonAtlas(anisotropy), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    patchWorld(m, sh, { ao: true });
    addMesh(toGeometry(ribbons, false), m, { order: 1 });
  }
  if (decals.pos.length) {
    const m = new THREE.MeshLambertMaterial({ map: decalAtlas(anisotropy), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    patchWorld(m, sh, { ao: true });
    addMesh(toGeometry(decals, false), m, { order: 2 });
  }
  if (lights.pos.length)
    addMesh(toGeometry(lights, false), new THREE.MeshBasicMaterial({ map: decalAtlas(anisotropy), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), { receive: false, order: 3 });
  if (panels.pos.length) {
    const m = new THREE.MeshLambertMaterial({ map: panelAtlas(anisotropy), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    patchWorld(m, sh, { ao: true });
    addMesh(toGeometry(panels, false), m);
  }
  if (litPanels.pos.length) addMesh(toGeometry(litPanels, false), new THREE.MeshBasicMaterial({ map: panelAtlas(anisotropy), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), { receive: false });

  // ---- Signs (one canvas atlas per map)
  if (signs.length) {
    const specs: SignSpec[] = signs.map((p) => ({ text: p.text ?? '', bg: p.color, fg: p.fg ?? 0xffffff, w: p.r, h: p.h }));
    const { tex, rects } = signAtlas(specs, anisotropy);
    const g = newBuf();
    signs.forEach((p, i) => uprightQuad(g, p.x, p.y, p.z, p.r, p.h, p.rotY ?? 0, rects[i], [1, 1, 1]));
    const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    patchWorld(m, sh, { ao: true });
    addMesh(toGeometry(g, false), m);
    disposables.push(tex);
  }

  // ---- Glow halos (camera-facing additive quads)
  if (glows.length) {
    const pos: number[] = [];
    const corner: number[] = [];
    const size: number[] = [];
    const col: number[] = [];
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const p of glows) {
      const c = lin(p.color);
      for (const [cx, cy] of cs) {
        pos.push(p.x, p.y, p.z);
        corner.push(cx, cy);
        size.push(p.r);
        col.push(...c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('gcolor', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius += 4;
    const m = glowMaterial(glow);
    m.uniforms.map.value = glowTexture();
    disposables.push(m.uniforms.map.value as THREE.Texture);
    addMesh(geo, m, { receive: false, order: 4 });
  }

  // ---- Instanced ground clutter
  if (detail && map.instances.length) {
    const byKind = new Map<ScatterKind, Instance[]>();
    for (const it of map.instances) {
      let l = byKind.get(it.kind);
      if (!l) byKind.set(it.kind, (l = []));
      l.push(it);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    for (const [kind, list] of byKind) {
      const def = scatterDef(kind);
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: def.blade ? THREE.DoubleSide : THREE.FrontSide, flatShading: def.flat });
      patchWorld(m, sh, { macro: 0.3, ao: true, aoAmt: 0.75, wind: def.wind });
      const mesh = new THREE.InstancedMesh(def.geo, m, list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        m4.compose(v.set(it.x, it.y, it.z), q, s.set(it.s, it.s, it.s));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, c.setHex(it.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = shadows;
      mesh.castShadow = false;
      group.add(mesh);
      disposables.push(def.geo, m, { dispose: () => mesh.dispose() });
    }
  }

  // ---- Sky dome
  const sky = makeSky(theme, sh, detail);
  group.add(sky);
  disposables.push(sky.geometry, sky.material as THREE.Material);

  // ---- Ambient particles
  let particles: THREE.Points | null = null;
  let pVel: Float32Array | null = null;
  const area = 50;
  if (particlesOn && theme.particles) {
    const kind = theme.particles;
    const n = kind === 'snow' ? 1800 : 260;
    const pos = new Float32Array(n * 3);
    pVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * area;
      pos[i * 3 + 1] = Math.random() * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * area;
      pVel[i * 3] = (Math.random() - 0.5) * (kind === 'snow' ? 0.6 : 0.2);
      pVel[i * 3 + 1] = kind === 'snow' ? -(0.8 + Math.random() * 0.9) : (Math.random() - 0.5) * 0.1;
      pVel[i * 3 + 2] = (Math.random() - 0.5) * (kind === 'snow' ? 0.6 : 0.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: kind === 'snow' ? 0.09 : 0.05,
      map: glowTexture(),
      color: kind === 'snow' ? 0xffffff : kind === 'pollen' ? 0xfff2b0 : 0xffe6c0,
      transparent: true,
      opacity: kind === 'snow' ? 0.9 : 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    particles = new THREE.Points(geo, mat);
    particles.frustumCulled = false;
    group.add(particles);
    disposables.push(geo, mat, mat.map!);
  }

  let t = 0;
  return {
    group,
    sky,
    ao: sh.uAOStr.value,
    update(dt: number, camera: THREE.Camera) {
      t += dt;
      sh.uTime.value = t;
      sky.position.copy(camera.position);
      if (particles && pVel) {
        const attr = particles.geometry.getAttribute('position') as THREE.BufferAttribute;
        const p = attr.array as Float32Array;
        const cx = camera.position.x;
        const cy = camera.position.y;
        const cz = camera.position.z;
        const half = area / 2;
        for (let i = 0; i < p.length; i += 3) {
          p[i] += (pVel[i] + Math.sin(t * 0.7 + i) * 0.15) * dt;
          p[i + 1] += pVel[i + 1] * dt;
          p[i + 2] += pVel[i + 2] * dt;
          if (p[i] < cx - half) p[i] += area;
          else if (p[i] > cx + half) p[i] -= area;
          if (p[i + 2] < cz - half) p[i + 2] += area;
          else if (p[i + 2] > cz + half) p[i + 2] -= area;
          if (p[i + 1] < cy - 6) p[i + 1] += 22;
          else if (p[i + 1] > cy + 16) p[i + 1] -= 22;
        }
        attr.needsUpdate = true;
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** The largest ground-level box decides the backdrop ring material. */
function autoBackdrop(map: MapDef): Theme['backdrop'] | null {
  let best: Box | null = null;
  for (const b of map.boxes) {
    if (!b.visible || b.maxY > 0.05 || b.maxY < -0.2) continue;
    if (!best || (b.maxX - b.minX) * (b.maxZ - b.minZ) > (best.maxX - best.minX) * (best.maxZ - best.minZ)) best = b;
  }
  return best ? { mat: best.mat, color: best.color, patch: best.patch, y: best.maxY } : null;
}
