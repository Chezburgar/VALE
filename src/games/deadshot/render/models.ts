import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ClassId } from '../config';
import playerUrl from '../assets/models/player.glb?url';
import arUrl from '../assets/models/ar.glb?url';
import smgUrl from '../assets/models/smg.glb?url';
import shotgunUrl from '../assets/models/shotgun.glb?url';
import sniperUrl from '../assets/models/sniper.glb?url';

// Loads the GLB player and weapon models once per game session. Everything
// here is a shared template: characters and guns clone it, so geometry,
// textures and animation clips exist once no matter how many players spawn.

export interface PlayerAsset {
  /** Template hierarchy (never added to a scene); clone with SkeletonUtils. */
  scene: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  clips: Map<string, THREE.AnimationClip>;
}

export interface GunAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

export interface Models {
  player: PlayerAsset;
  guns: Record<ClassId, GunAsset>;
}

const GUN_URLS: Record<ClassId, string> = { ar: arUrl, smg: smgUrl, shotgun: shotgunUrl, sniper: sniperUrl };

let models: Models | null = null;
let pending: Promise<Models | null> | null = null;
let failed = false;
let envTex: THREE.Texture | null = null;

export function getModels(): Models | null {
  return models;
}

/** Loads all five models; resolves null (procedural fallback) on any failure. */
export function loadModels(onProgress?: (frac: number) => void): Promise<Models | null> {
  if (models || failed) return Promise.resolve(models);
  if (pending) return pending;
  const loader = new GLTFLoader();
  const urls = [playerUrl, ...Object.values(GUN_URLS)];
  const fracs = urls.map(() => 0);
  const report = () => onProgress?.(fracs.reduce((s, f) => s + f, 0) / fracs.length);
  const load = (url: string, i: number) =>
    new Promise<GLTF>((resolve, reject) =>
      loader.load(
        url,
        (g) => {
          fracs[i] = 1;
          report();
          resolve(g);
        },
        (e) => {
          if (e.lengthComputable && e.total > 0) {
            fracs[i] = Math.min(0.95, e.loaded / e.total);
            report();
          }
        },
        reject,
      ),
    );
  pending = Promise.all(urls.map(load))
    .then(([player, ...guns]) => {
      const gunAssets = {} as Record<ClassId, GunAsset>;
      (Object.keys(GUN_URLS) as ClassId[]).forEach((cls, i) => (gunAssets[cls] = prepareGun(guns[i])));
      models = { player: preparePlayer(player), guns: gunAssets };
      return models;
    })
    .catch((err) => {
      console.warn('[deadshot] model load failed, using procedural models', err);
      failed = true;
      return null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  if (!found) throw new Error('model has no mesh');
  return found;
}

function prepareGun(g: GLTF): GunAsset {
  const mesh = firstMesh(g.scene);
  const material = mesh.material as THREE.MeshStandardMaterial;
  mesh.geometry.computeBoundingSphere();
  return { geometry: mesh.geometry, material };
}

/** Bones that belong to the locomotion (lower body) layer. */
export const LOWER_BONES = new Set(
  ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End'].map((b) => 'mixamorig' + b),
);

function trackBone(t: THREE.KeyframeTrack): string {
  return t.name.slice(0, t.name.lastIndexOf('.'));
}

/** Removes the forward drift of the hips while keeping the bob and sway. */
function stripRootMotion(clip: THREE.AnimationClip, keepY = true): void {
  const t = clip.tracks.find((k) => k.name === 'mixamorigHips.position');
  if (!t) return;
  const v = t.values;
  const n = t.times.length;
  const t0 = t.times[0];
  const span = t.times[n - 1] - t0 || 1;
  const dx = v[(n - 1) * 3] - v[0];
  const dz = v[(n - 1) * 3 + 2] - v[2];
  for (let i = 0; i < n; i++) {
    const f = (t.times[i] - t0) / span;
    v[i * 3] -= dx * f;
    v[i * 3 + 2] -= dz * f;
    if (!keepY) v[i * 3 + 1] = v[1];
  }
}

/** Single-keyframe clip holding the pose of `bones` at time `at`. */
function poseClip(name: string, clip: THREE.AnimationClip, at: number, filter: (bone: string) => boolean): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    if (!filter(trackBone(t))) continue;
    const out = t.createInterpolant().evaluate(at).slice() as unknown as number[];
    const T = t.constructor as new (n: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    tracks.push(new T(t.name, [0], Array.from(out)));
  }
  return new THREE.AnimationClip(name, 0, tracks);
}

function filtered(name: string, clip: THREE.AnimationClip, filter: (bone: string) => boolean): THREE.AnimationClip {
  return new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((t) => filter(trackBone(t))));
}

function preparePlayer(g: GLTF): PlayerAsset {
  const src = new Map(g.animations.map((c) => [c.name, c]));
  const get = (n: string) => {
    const c = src.get(n);
    if (!c) throw new Error(`missing clip ${n}`);
    return c;
  };
  const lower = (b: string) => LOWER_BONES.has(b);
  const upper = (b: string) => !LOWER_BONES.has(b);
  const clips = new Map<string, THREE.AnimationClip>();

  const run = get('Run_and_Shoot').clone();
  stripRootMotion(run);
  clips.set('run', filtered('run', run, lower));
  clips.set('back', filtered('back', get('Walk_Backward_with_Gun_inplace'), lower));
  const strafe = get('Walk_Left_with_Gun_inplace').clone();
  stripRootMotion(strafe);
  clips.set('strafe', filtered('strafe', strafe, lower));
  clips.set('idle', poseClip('idle', get('Walk_Backward_with_Gun_inplace'), 0.0, lower));
  const leap = get('Run_and_Leap').clone();
  stripRootMotion(leap);
  clips.set('air', poseClip('air', leap, 1.38, lower));
  // Upper body holds one rifle pose; the arms are then solved onto the gun.
  clips.set('aim', poseClip('aim', get('Walk_Backward_with_Gun_inplace'), 0.0, upper));
  for (const [key, name] of [
    ['dieFwd', 'Shot_and_Fall_Forward'],
    ['dieBack', 'Shot_and_Slow_Fall_Backward'],
    ['dieShotBack', 'Shot_in_the_Back_and_Fall'],
  ] as const) {
    const c = get(name).clone();
    // Tone down the slide across the floor so bodies stay near where they fell.
    const hips = c.tracks.find((k) => k.name === 'mixamorigHips.position');
    if (hips) {
      const v = hips.values;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = v[0] + (v[i] - v[0]) * 0.6;
        v[i + 2] = v[2] + (v[i + 2] - v[2]) * 0.6;
      }
    }
    c.name = key;
    clips.set(key, c);
  }

  const mesh = firstMesh(g.scene) as THREE.SkinnedMesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  return { scene: g.scene, material, clips };
}

// ---------------------------------------------------------------------------
// Environment lighting for PBR materials (guns, characters). Assigned per
// material so the Lambert world keeps its look.

export function setModelEnvironment(tex: THREE.Texture | null): void {
  envTex = tex;
}

export function modelEnvironment(): THREE.Texture | null {
  return envTex;
}

export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const tex = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return tex;
}

/** Frees GPU memory; the next loadModels() call fetches the files again. */
export function disposeModels(): void {
  if (models) {
    const seen = new Set<THREE.Texture>();
    const freeMat = (m: THREE.MeshStandardMaterial) => {
      for (const t of [m.map, m.metalnessMap, m.roughnessMap, m.normalMap]) if (t && !seen.has(t)) (seen.add(t), t.dispose());
      m.dispose();
    };
    for (const g of Object.values(models.guns)) {
      g.geometry.dispose();
      freeMat(g.material);
    }
    firstMesh(models.player.scene).geometry.dispose();
    freeMat(models.player.material);
  }
  models = null;
  failed = false;
  envTex = null;
}
