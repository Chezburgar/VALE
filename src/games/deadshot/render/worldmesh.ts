import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDef } from '../maps';
import type { Prop, Theme } from '../maps/builder';
import type { Box, MatId } from '../world';
import { glowTexture, materialTexture } from './textures';

// Builds the static level: boxes merged per material, props merged per
// material, sky dome and ambient particles.

interface GeoBuffers {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
}

function hashColor(color: number, seed: number): [number, number, number] {
  const c = new THREE.Color(color);
  const v = 1 + (((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.08 - 0.04);
  return [c.r * v, c.g * v, c.b * v];
}

function pushQuad(g: GeoBuffers, v: number[][], n: number[], uvs: number[][], col: [number, number, number]): void {
  const order = [0, 1, 2, 0, 2, 3];
  for (const i of order) {
    g.pos.push(v[i][0], v[i][1], v[i][2]);
    g.nor.push(n[0], n[1], n[2]);
    g.uv.push(uvs[i][0], uvs[i][1]);
    g.col.push(col[0], col[1], col[2]);
  }
}

function addBox(g: GeoBuffers, b: Box, scale: number, seed: number): void {
  const { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 } = b;
  const col = hashColor(b.color, seed);
  const s = 1 / scale;
  const shade = (k: number): [number, number, number] => [col[0] * k, col[1] * k, col[2] * k];
  // +X
  pushQuad(g, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1 * s, y0 * s], [-z0 * s, y0 * s], [-z0 * s, y1 * s], [-z1 * s, y1 * s]], shade(0.96));
  // -X
  pushQuad(g, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]], shade(0.96));
  // +Y
  pushQuad(g, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0 * s, -z1 * s], [x1 * s, -z1 * s], [x1 * s, -z0 * s], [x0 * s, -z0 * s]], shade(1));
  // -Y (skip for boxes resting on the ground)
  if (y0 > 0.01 || y0 < -0.5) pushQuad(g, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]], shade(0.85));
  // +Z
  pushQuad(g, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]], shade(0.98));
  // -Z
  pushQuad(g, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1 * s, y0 * s], [-x0 * s, y0 * s], [-x0 * s, y1 * s], [-x1 * s, y1 * s]], shade(0.98));
}

function toGeometry(g: GeoBuffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.computeBoundingSphere();
  return geo;
}

function prismGeometry(len: number, h: number, depth: number): THREE.BufferGeometry {
  // Ridge along X, base in XZ at y=0.
  const L = len / 2;
  const D = depth / 2;
  const g: GeoBuffers = { pos: [], nor: [], uv: [], col: [] };
  const white: [number, number, number] = [1, 1, 1];
  const slope = Math.hypot(D, h);
  const n1 = [0, D / slope, h / slope];
  const n2 = [0, D / slope, -h / slope];
  pushQuad(g, [[-L, 0, D], [L, 0, D], [L, h, 0], [-L, h, 0]], n1, [[0, 0], [len / 2, 0], [len / 2, slope / 2], [0, slope / 2]], white);
  pushQuad(g, [[L, 0, -D], [-L, 0, -D], [-L, h, 0], [L, h, 0]], n2, [[0, 0], [len / 2, 0], [len / 2, slope / 2], [0, slope / 2]], white);
  // gable ends (as degenerate quads = triangles)
  pushQuad(g, [[-L, 0, -D], [-L, 0, D], [-L, h, 0], [-L, h, 0]], [-1, 0, 0], [[0, 0], [1, 0], [0.5, 0.5], [0.5, 0.5]], [0.9, 0.9, 0.9]);
  pushQuad(g, [[L, 0, D], [L, 0, -D], [L, h, 0], [L, h, 0]], [1, 0, 0], [[0, 0], [1, 0], [0.5, 0.5], [0.5, 0.5]], [0.9, 0.9, 0.9]);
  pushQuad(g, [[-L, 0, -D], [L, 0, -D], [L, 0, D], [-L, 0, D]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.7, 0.7, 0.7]);
  return toGeometry(g);
}

function propGeometry(p: Prop): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  const seg = p.segments ?? 10;
  switch (p.kind) {
    case 'cylinder': {
      geo = new THREE.CylinderGeometry(p.r * (p.d ?? 1), p.r, p.h, seg, 1, false);
      if (p.axis === 'x') {
        geo.rotateZ(-Math.PI / 2);
        geo.translate(p.x + p.h / 2, p.y, p.z);
      } else if (p.axis === 'z') {
        geo.rotateX(Math.PI / 2);
        geo.translate(p.x, p.y, p.z + p.h / 2);
      } else geo.translate(p.x, p.y + p.h / 2, p.z);
      break;
    }
    case 'cone':
      geo = new THREE.ConeGeometry(p.r, p.h, seg, 1, false);
      geo.translate(p.x, p.y + p.h / 2, p.z);
      break;
    case 'sphere':
      geo = new THREE.IcosahedronGeometry(p.r, 1);
      geo.translate(p.x, p.y, p.z);
      break;
    case 'box':
      geo = new THREE.BoxGeometry(p.r, p.h, p.d ?? p.r);
      if (p.rotY) geo.rotateY(p.rotY);
      geo.translate(p.x, p.y + p.h / 2, p.z);
      break;
    case 'prism':
      geo = prismGeometry(p.r, p.h, p.d ?? p.r);
      if (p.axis === 'z') geo.rotateY(Math.PI / 2);
      geo.translate(p.x, p.y, p.z);
      break;
  }
  if (geo.index) geo = geo.toNonIndexed();
  const count = geo.getAttribute('position').count;
  const c = new THREE.Color(p.color);
  const prev = geo.getAttribute('color');
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const k = prev ? prev.getX(i) : 1;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  // Scale uv roughly to world size for tiling textures.
  const uv = geo.getAttribute('uv');
  const k = p.kind === 'cylinder' ? Math.max(1, p.h / 2) : 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (p.kind === 'cylinder' ? Math.max(1, p.r * 3) : 1), uv.getY(i) * k);
  return geo;
}

export interface WorldVisuals {
  group: THREE.Group;
  sky: THREE.Mesh;
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

export function buildWorld(map: MapDef, anisotropy: number, shadows: boolean, particlesOn: boolean): WorldVisuals {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  // ---- Boxes grouped by material
  const byMat = new Map<MatId, GeoBuffers>();
  map.boxes.forEach((b, i) => {
    if (!b.visible) return;
    let g = byMat.get(b.mat);
    if (!g) byMat.set(b.mat, (g = { pos: [], nor: [], uv: [], col: [] }));
    addBox(g, b, materialTexture(b.mat, anisotropy).scale, i);
  });
  for (const [mat, g] of byMat) {
    const geo = toGeometry(g);
    const material = makeMaterial(mat, anisotropy);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadows && mat !== 'water' && mat !== 'glass';
    mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    disposables.push(geo, material);
  }

  // ---- Props grouped by material (+ emissive ones separately)
  const propGroups = new Map<string, THREE.BufferGeometry[]>();
  for (const p of map.props) {
    const key = p.emissive !== undefined ? `emissive:${p.emissive}` : (p.mat ?? 'plain');
    let list = propGroups.get(key);
    if (!list) propGroups.set(key, (list = []));
    list.push(propGeometry(p));
  }
  for (const [key, geos] of propGroups) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    let material: THREE.Material;
    if (key.startsWith('emissive:')) material = new THREE.MeshBasicMaterial({ color: Number(key.split(':')[1]), fog: true });
    else material = makeMaterial(key as MatId, anisotropy);
    const mesh = new THREE.Mesh(merged, material);
    const distant = key === 'rock' && map.props.some((p) => p.mat === 'rock' && Math.abs(p.x) > 100);
    mesh.castShadow = shadows && !distant && key !== 'snow';
    mesh.receiveShadow = shadows && key !== 'leaves';
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    disposables.push(merged, material);
  }

  // ---- Sky dome
  const sky = makeSky(map.theme);
  group.add(sky);
  disposables.push(sky.geometry, sky.material as THREE.Material);

  // ---- Ambient particles
  let particles: THREE.Points | null = null;
  let pVel: Float32Array | null = null;
  const area = 50;
  if (particlesOn && map.theme.particles) {
    const kind = map.theme.particles;
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
    disposables.push(geo, mat);
  }

  let t = 0;
  return {
    group,
    sky,
    update(dt: number, camera: THREE.Camera) {
      t += dt;
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

function makeMaterial(mat: MatId, anisotropy: number): THREE.Material {
  const { tex } = materialTexture(mat, anisotropy);
  if (mat === 'water') {
    return new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.78, shininess: 90, specular: 0x88aacc });
  }
  if (mat === 'glass') {
    return new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.55, shininess: 100, specular: 0xffffff });
  }
  const m = new THREE.MeshLambertMaterial({
    map: tex,
    vertexColors: true,
    flatShading: mat === 'leaves' || mat === 'rock',
  });
  return m;
}

function makeSky(theme: Theme): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
      bottom: { value: new THREE.Color(theme.skyBottom) },
      sunColor: { value: new THREE.Color(theme.sun) },
      sunDir: { value: sunDir },
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
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 col = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-y * 3.0, 0.0, 1.0), 0.6));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25);
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
