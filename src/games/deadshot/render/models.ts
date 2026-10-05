import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TIERS, type ClassId, type Tier } from '../config';
import playerUrl from '../assets/models/player.glb?url';
import arUrl from '../assets/models/ar.glb?url';
import smgUrl from '../assets/models/smg.glb?url';
import shotgunUrl from '../assets/models/shotgun.glb?url';
import sniperUrl from '../assets/models/sniper.glb?url';

// Loads the GLB player and weapon models once per game session. Everything
// here is a shared template: characters and guns clone it, so geometry,
// textures and animation clips exist once no matter how many players spawn.

/**
 * Hand-measured points on each gun in the file's own space: every gun is
 * normalized to 1 m along X with the muzzle at -X and up at +Y. Only x/y are
 * given because the guns are centred on z = 0.
 */
export interface GunSpec {
  /** Real-world length in metres (the file is 1 m long). */
  length: number;
  muzzle: [number, number];
  /** Palm centre on the pistol grip (right hand). */
  grip: [number, number];
  /** Palm centre of the supporting left hand. */
  fore: [number, number];
  /** Sight line height and the x of the rear sight / eyepiece. */
  sight: [number, number];
  /** Triangles whose centroid falls in this x/y box form the detachable magazine. */
  mag?: [number, number, number, number];
}

export const GUN_SPECS: Record<ClassId, GunSpec> = {
  ar: { length: 0.88, muzzle: [-0.5, 0.068], grip: [0.185, -0.055], fore: [-0.17, 0.03], sight: [0.116, 0.148], mag: [-0.045, -0.2, 0.078, -0.022] },
  smg: { length: 0.64, muzzle: [-0.5, 0.075], grip: [0.11, -0.075], fore: [-0.28, -0.05], sight: [0.12, 0.218], mag: [-0.2, -0.3, -0.04, -0.03] },
  shotgun: { length: 1.0, muzzle: [-0.5, 0.066], grip: [0.205, -0.04], fore: [-0.225, 0.028], sight: [0.116, 0.096] },
  sniper: { length: 1.18, muzzle: [-0.5, 0.039], grip: [0.24, -0.075], fore: [-0.1, -0.018], sight: [0.262, 0.101], mag: [0.045, -0.15, 0.156, -0.04] },
};

export interface PlayerAsset {
  /** Template hierarchy (never added to a scene); clone with SkeletonUtils. */
  scene: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  clips: Map<string, THREE.AnimationClip>;
  /** Just the arms of the skinned mesh (first-person view model). */
  arms: THREE.BufferGeometry;
}

export interface GunAsset {
  spec: GunSpec;
  /** Gun body without the magazine (or the whole gun when no mag is split off). */
  body: THREE.BufferGeometry;
  mag: THREE.BufferGeometry | null;
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
const tierMats = new Map<string, THREE.MeshStandardMaterial>();

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
      (Object.keys(GUN_URLS) as ClassId[]).forEach((cls, i) => (gunAssets[cls] = prepareGun(guns[i], GUN_SPECS[cls])));
      models = { player: preparePlayer(player), guns: gunAssets };
      if (envTex) applyEnvironment();
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

/** Splits the magazine triangles into their own geometry (sharing attributes). */
function prepareGun(g: GLTF, spec: GunSpec): GunAsset {
  const mesh = firstMesh(g.scene);
  const material = mesh.material as THREE.MeshStandardMaterial;
  const geo = mesh.geometry;
  let body = geo;
  let mag: THREE.BufferGeometry | null = null;
  const index = geo.getIndex();
  if (spec.mag && index) {
    const [x0, y0, x1, y1] = spec.mag;
    const pos = geo.getAttribute('position');
    const keep: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      (cx > x0 && cx < x1 && cy > y0 && cy < y1 ? out : keep).push(a, b, c);
    }
    if (out.length) {
      const split = (ids: number[]) => {
        const s = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(geo.attributes)) s.setAttribute(name, attr);
        s.setIndex(ids);
        s.computeBoundingSphere();
        return s;
      };
      body = split(keep);
      mag = split(out);
      geo.dispose();
    }
  }
  body.computeBoundingSphere();
  return { spec, body, mag, material };
}

/**
 * Gun material for a tier finish. Gray is the factory texture; the others
 * multiply it with an anodized colour, and gold also polishes the metal.
 */
export function gunMaterial(cls: ClassId, tier: Tier): THREE.MeshStandardMaterial | null {
  if (!models) return null;
  const key = `${cls}:${tier}`;
  let m = tierMats.get(key);
  if (m) return m;
  m = models.guns[cls].material.clone();
  m.envMapIntensity = 0.85;
  const c = new THREE.Color(TIERS[tier].color);
  if (tier === 1) {
    m.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar(1.25);
    m.roughness = 0.8;
  } else if (tier === 2) {
    m.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.2).multiplyScalar(1.35);
    m.emissive.copy(c).multiplyScalar(0.06);
    m.roughness = 0.7;
  } else if (tier === 3) {
    m.color.setRGB(2.0, 1.36, 0.42);
    m.metalness = 1;
    m.roughness = 0.45;
    m.envMapIntensity = 1.1;
    m.emissive.setRGB(0.08, 0.05, 0.0);
  }
  m.envMap = envTex;
  m.name = `gun-${key}`;
  tierMats.set(key, m);
  return m;
}

/** Bones that belong to the locomotion (lower body) layer. */
export const LOWER_BONES = new Set(
  ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End'].map((b) => 'mixamorig' + b),
);

function trackBone(t: THREE.KeyframeTrack): string {
  return t.name.slice(0, t.name.lastIndexOf('.'));
}

/** Removes the forward drift of the hips while keeping the bob and sway. */
function stripRootMotion(clip: THREE.AnimationClip): void {
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
  }
}

type TrackCtor = new (name: string, times: ArrayLike<number>, values: ArrayLike<number>) => THREE.KeyframeTrack;

/**
 * Static clip holding the pose of the filtered bones at time `at`. It spans
 * one second: a zero-length clip makes the mixer's loop maths produce NaN.
 */
function poseClip(name: string, clip: THREE.AnimationClip, at: number, filter: (bone: string) => boolean): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    if (!filter(trackBone(t))) continue;
    // Quaternion tracks override this factory with a slerping interpolant.
    const out = Array.from(t.InterpolantFactoryMethodLinear().evaluate(at) as ArrayLike<number>);
    tracks.push(new (t.constructor as TrackCtor)(t.name, [0, 1], [...out, ...out]));
  }
  return new THREE.AnimationClip(name, 1, tracks);
}

function filtered(name: string, clip: THREE.AnimationClip, filter: (bone: string) => boolean): THREE.AnimationClip {
  return new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((t) => filter(trackBone(t))));
}

/** Left/right mirror of a clip (the Mixamo rig is symmetric about x = 0). */
function mirrorClip(name: string, clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const bone = trackBone(t);
    const prop = t.name.slice(bone.length);
    const other = bone.includes('Left') ? bone.replace('Left', 'Right') : bone.includes('Right') ? bone.replace('Right', 'Left') : bone;
    const v = Array.from(t.values);
    if (prop === '.quaternion') {
      for (let i = 0; i < v.length; i += 4) {
        v[i + 1] = -v[i + 1];
        v[i + 2] = -v[i + 2];
      }
    } else if (prop === '.position') {
      for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
    }
    return new (t.constructor as TrackCtor)(other + prop, Array.from(t.times), v);
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
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

  // Locomotion only drives the legs; the upper body holds a rifle pose that
  // is aimed procedurally, so every gait keeps the gun on target.
  clips.set('run', filtered('run', get('Running'), lower));
  clips.set('back', filtered('back', get('Walk_Backward_with_Gun_inplace'), lower));
  const strafe = get('Walk_Left_with_Gun_inplace').clone();
  stripRootMotion(strafe);
  const left = filtered('strafeL', strafe, lower);
  clips.set('strafeL', left);
  clips.set('strafeR', mirrorClip('strafeR', left));
  clips.set('idle', poseClip('idle', get('Walking'), 0, lower));
  const leap = get('Run_and_Leap').clone();
  stripRootMotion(leap);
  const air = poseClip('air', leap, 1.3, lower);
  // Centre the hips over the feet like the other poses.
  const airHips = air.tracks.find((t) => t.name === 'mixamorigHips.position');
  if (airHips) for (let i = 0; i < airHips.values.length; i += 3) airHips.values[i] = airHips.values[i + 2] = 0;
  clips.set('air', air);
  // The most upright rifle hold among the clips; held for every gait.
  const aimSrc = get('Run_and_Shoot');
  clips.set('aim', poseClip('aim', aimSrc, 0, upper));
  // Full-body frame the aim pose comes from (rig calibration).
  clips.set('ref', poseClip('ref', aimSrc, 0, () => true));
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
      const x0 = v[0];
      const z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0 + (v[i] - x0) * 0.6;
        v[i + 2] = z0 + (v[i + 2] - z0) * 0.6;
      }
    }
    c.name = key;
    clips.set(key, c);
  }

  const mesh = firstMesh(g.scene) as THREE.SkinnedMesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  return { scene: g.scene, material, clips, arms: armsGeometry(mesh) };
}

/** Triangles mostly skinned to the arm and hand bones. */
function armsGeometry(mesh: THREE.SkinnedMesh): THREE.BufferGeometry {
  const geo = mesh.geometry;
  const armBone = mesh.skeleton.bones.map((b) => /(Left|Right)(Arm|ForeArm|Hand)/.test(b.name));
  const idx = geo.getAttribute('skinIndex');
  const wgt = geo.getAttribute('skinWeight');
  const onArm = (v: number) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (armBone[idx.getComponent(v, k)]) w += wgt.getComponent(v, k);
    return w > 0.6;
  };
  const index = geo.getIndex()!;
  const keep: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if (onArm(a) && onArm(b) && onArm(c)) keep.push(a, b, c);
  }
  const arms = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) arms.setAttribute(name, attr);
  arms.setIndex(keep);
  return arms;
}

// ---------------------------------------------------------------------------
// Environment lighting for PBR materials (guns, characters). Assigned per
// material instead of scene.environment so the Lambert world keeps its look.

export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (envTex) return envTex;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  envTex = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  applyEnvironment();
  return envTex;
}

export function modelEnvironment(): THREE.Texture | null {
  return envTex;
}

function applyEnvironment(): void {
  for (const m of tierMats.values()) m.envMap = envTex;
  if (models) models.player.material.envMap = envTex;
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
      g.body.dispose();
      g.mag?.dispose();
      freeMat(g.material);
    }
    firstMesh(models.player.scene).geometry.dispose();
    models.player.arms.dispose();
    freeMat(models.player.material);
  }
  for (const m of tierMats.values()) m.dispose();
  tierMats.clear();
  envTex?.dispose();
  envTex = null;
  models = null;
  failed = false;
}
