import * as THREE from 'three';
import { TIERS, type ClassId, type Tier } from '../config';

// Low-poly weapon models built from primitives. Origin is at the trigger,
// barrel points down -Z. Tier finishes recolor the accent parts.

export interface GunModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** Height of the sight line above the origin. */
  sightY: number;
  /** Z of the rear sight / scope eyepiece. */
  sightZ: number;
  mag: THREE.Object3D | null;
  bolt: THREE.Object3D | null;
  scope: boolean;
}

const matCache = new Map<string, THREE.Material>();

function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

function materials(tier: Tier) {
  const t = TIERS[tier];
  return {
    body: mat('body', () => new THREE.MeshPhongMaterial({ color: 0x4a5058, shininess: 50, specular: 0x555555 })),
    dark: mat('dark', () => new THREE.MeshPhongMaterial({ color: 0x2b2f34, shininess: 40, specular: 0x333333 })),
    wood: mat('wood', () => new THREE.MeshPhongMaterial({ color: 0x7a4c2a, shininess: 20, specular: 0x221810 })),
    lens: mat('lens', () => new THREE.MeshPhongMaterial({ color: 0x1b3c5a, shininess: 120, specular: 0x88ccff, emissive: 0x06121c })),
    accent: mat(`accent${tier}`, () =>
      new THREE.MeshPhongMaterial({
        color: t.color,
        shininess: tier === 3 ? 120 : 60,
        specular: tier === 3 ? 0xfff0b0 : 0x666666,
        emissive: tier >= 2 ? new THREE.Color(t.color).multiplyScalar(0.12) : 0x000000,
      }),
    ),
    sight: mat('sight', () => new THREE.MeshBasicMaterial({ color: 0xff3b2f })),
  };
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);

function box(g: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  g.add(mesh);
  return mesh;
}

/** Cylinder along Z from z0 to z1. */
function tube(g: THREE.Object3D, m: THREE.Material, r: number, x: number, y: number, z0: number, z1: number): THREE.Mesh {
  const mesh = new THREE.Mesh(cylGeo, m);
  mesh.scale.set(r, Math.abs(z1 - z0), r);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, (z0 + z1) / 2);
  g.add(mesh);
  return mesh;
}

export function buildGun(cls: ClassId, tier: Tier): GunModel {
  const g = new THREE.Group();
  const M = materials(tier);
  const muzzle = new THREE.Object3D();
  let sightY = 0.15;
  let sightZ = 0;
  let mag: THREE.Object3D | null = null;
  let bolt: THREE.Object3D | null = null;
  let scope = false;

  if (cls === 'ar') {
    box(g, M.body, 0.07, 0.1, 0.42, 0, 0.05, -0.12);
    box(g, M.dark, 0.05, 0.02, 0.38, 0, 0.11, -0.13);
    box(g, M.accent, 0.078, 0.085, 0.27, 0, 0.055, -0.45);
    tube(g, M.dark, 0.013, 0, 0.06, -0.58, -0.8);
    tube(g, M.dark, 0.021, 0, 0.06, -0.78, -0.84);
    mag = box(g, M.dark, 0.05, 0.2, 0.085, 0, -0.07, -0.17, 0.22);
    box(g, M.dark, 0.045, 0.12, 0.06, 0, -0.045, 0.03, -0.3);
    box(g, M.accent, 0.06, 0.11, 0.26, 0, 0.025, 0.23);
    box(g, M.dark, 0.065, 0.13, 0.04, 0, 0.02, 0.37);
    box(g, M.dark, 0.044, 0.035, 0.025, 0, 0.135, 0.02);
    box(g, M.dark, 0.01, 0.05, 0.012, 0, 0.13, -0.53);
    box(g, M.sight, 0.006, 0.008, 0.006, 0, 0.158, -0.53);
    muzzle.position.set(0, 0.06, -0.86);
    sightY = 0.155;
    sightZ = 0.02;
  } else if (cls === 'smg') {
    box(g, M.body, 0.07, 0.11, 0.3, 0, 0.05, -0.1);
    box(g, M.dark, 0.045, 0.02, 0.26, 0, 0.115, -0.1);
    tube(g, M.accent, 0.028, 0, 0.06, -0.25, -0.42);
    tube(g, M.dark, 0.013, 0, 0.06, -0.42, -0.47);
    mag = box(g, M.dark, 0.04, 0.25, 0.06, 0, -0.11, -0.12);
    box(g, M.dark, 0.045, 0.11, 0.055, 0, -0.04, 0.04, -0.25);
    box(g, M.accent, 0.02, 0.07, 0.22, 0.025, 0.03, 0.18);
    box(g, M.accent, 0.02, 0.07, 0.22, -0.025, 0.03, 0.18);
    box(g, M.dark, 0.06, 0.09, 0.03, 0, 0.03, 0.3);
    box(g, M.dark, 0.04, 0.03, 0.02, 0, 0.135, 0.02);
    box(g, M.dark, 0.008, 0.04, 0.01, 0, 0.13, -0.23);
    box(g, M.sight, 0.006, 0.007, 0.006, 0, 0.148, -0.23);
    muzzle.position.set(0, 0.06, -0.49);
    sightY = 0.145;
    sightZ = 0.02;
  } else if (cls === 'shotgun') {
    tube(g, M.dark, 0.02, 0.021, 0.06, -0.18, -0.76);
    tube(g, M.dark, 0.02, -0.021, 0.06, -0.18, -0.76);
    box(g, M.body, 0.02, 0.012, 0.56, 0, 0.085, -0.47);
    box(g, M.wood, 0.075, 0.06, 0.26, 0, 0.025, -0.36);
    box(g, M.accent, 0.075, 0.095, 0.15, 0, 0.045, -0.04);
    box(g, M.wood, 0.06, 0.12, 0.36, 0, 0.0, 0.22, 0.12);
    box(g, M.wood, 0.045, 0.1, 0.06, 0, -0.05, 0.05, -0.3);
    box(g, M.accent, 0.065, 0.135, 0.03, 0, -0.02, 0.4, 0.12);
    box(g, M.sight, 0.01, 0.01, 0.01, 0, 0.096, -0.74);
    muzzle.position.set(0, 0.06, -0.78);
    sightY = 0.097;
    sightZ = 0.0;
  } else {
    box(g, M.body, 0.07, 0.09, 0.38, 0, 0.04, -0.08);
    tube(g, M.dark, 0.017, 0, 0.05, -0.27, -0.84);
    box(g, M.dark, 0.04, 0.035, 0.07, 0, 0.05, -0.86);
    box(g, M.accent, 0.065, 0.13, 0.38, 0, -0.0, 0.27);
    box(g, M.accent, 0.05, 0.04, 0.16, 0, 0.08, 0.24);
    box(g, M.dark, 0.07, 0.15, 0.035, 0, -0.01, 0.46);
    mag = box(g, M.dark, 0.05, 0.08, 0.09, 0, -0.035, -0.08);
    box(g, M.dark, 0.045, 0.1, 0.06, 0, -0.045, 0.06, -0.3);
    const b = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), M.body);
    knob.position.set(0.07, 0, 0);
    b.add(knob);
    const arm = new THREE.Mesh(boxGeo, M.body);
    arm.scale.set(0.07, 0.012, 0.012);
    arm.position.set(0.035, 0, 0);
    b.add(arm);
    b.position.set(0.02, 0.06, 0.06);
    g.add(b);
    bolt = b;
    // Scope
    tube(g, M.dark, 0.022, 0, 0.15, -0.2, 0.08);
    tube(g, M.dark, 0.033, 0, 0.15, -0.3, -0.2);
    tube(g, M.dark, 0.029, 0, 0.15, 0.08, 0.13);
    tube(g, M.lens, 0.028, 0, 0.15, -0.302, -0.298);
    box(g, M.dark, 0.03, 0.05, 0.03, 0, 0.11, -0.15);
    box(g, M.dark, 0.03, 0.05, 0.03, 0, 0.11, 0.03);
    box(g, M.accent, 0.03, 0.02, 0.02, 0, 0.18, -0.06);
    muzzle.position.set(0, 0.05, -0.9);
    sightY = 0.15;
    sightZ = 0.13;
    scope = true;
  }

  g.add(muzzle);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
    }
  });
  return { group: g, muzzle, sightY, sightZ, mag, bolt, scope };
}
