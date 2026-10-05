import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Actor } from '../actor';
import type { ClassId } from '../config';
import { buildGun, type GunModel } from './guns';
import { getModels, modelEnvironment, type PlayerAsset } from './models';

/** What game.ts needs from a third-person player model. */
export interface CharacterView {
  root: THREE.Group;
  setColors(friendly: boolean, ffa: boolean): void;
  flash(): void;
  showName(v: boolean): void;
  /** Direction the killing shot came from (picks the death animation). */
  onKilled(fromX: number, fromZ: number): void;
  update(dt: number, time: number): void;
  /** World position of the muzzle (for tracers / flashes). */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/** Skinned GLB soldier when the models are loaded, blocky soldier otherwise. */
export function createCharacter(actor: Actor): CharacterView {
  const models = getModels();
  return models ? new SkinnedSoldier(actor, models.player) : new BlockySoldier(actor);
}

const FFA_TINTS = [0xff5a4e, 0xff8a3d, 0xd65cff, 0xff5c9d, 0xffc13d];

function teamTint(friendly: boolean, ffa: boolean, id: number): number {
  return friendly ? 0x3ff0d0 : ffa ? FFA_TINTS[id % FFA_TINTS.length] : 0xff4d4d;
}

/** Floating name above a player; enemies only show it while aimed at. */
class NameTag {
  sprite: THREE.Sprite;
  private tex: THREE.CanvasTexture;

  constructor(parent: THREE.Object3D) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    this.sprite.scale.set(0.15, 0.0375, 1);
    this.sprite.position.set(0, 2.25, 0);
    this.sprite.renderOrder = 10;
    parent.add(this.sprite);
  }

  draw(name: string, friendly: boolean): void {
    const c = this.tex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '600 30px Rajdhani, Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(name, 128, 32);
    ctx.fillStyle = friendly ? '#5fffe0' : '#ff6b6b';
    ctx.fillText(name, 128, 32);
    this.tex.needsUpdate = true;
    (this.sprite.material as THREE.SpriteMaterial).depthTest = !friendly;
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------
// Skinned GLB soldier

/** Scale of the 1.7 m model; its aiming crouch then stands ~1.8 m tall. */
export const MODEL_SCALE = 1.1;
/** Hip drop (model units) for crouching and sliding. */
const CROUCH_DROP = 0.47;
const SLIDE_DROP = 0.55;
/** Natural ground speed of each gait at timeScale 1 (m/s). */
const GAIT_SPEED: Record<string, number> = { run: 4.6, back: 1.6, strafeL: 1.7, strafeR: 1.7 };
const LOCO = ['idle', 'run', 'back', 'strafeL', 'strafeR', 'air'] as const;
type Loco = (typeof LOCO)[number];
const DEATHS = ['dieFwd', 'dieBack', 'dieShotBack'] as const;
/** Where each death clip's hit reaction starts (s) and its playback speed. */
const DEATH_PLAY: Record<(typeof DEATHS)[number], [number, number]> = { dieFwd: [0, 1.2], dieBack: [0.9, 1.5], dieShotBack: [0.6, 1.5] };

/** Rig measurements taken once from the reference aim frame. */
export interface Rig {
  /** Spine world rotation (model space) in the aim frame. */
  spineRef: THREE.Quaternion;
  /** Right hand world matrix (model space) in the aim frame. */
  hand: THREE.Matrix4;
  /** How far the head sits ahead of the feet when aiming (model units). */
  headZ: number;
  /** Hip height of the idle stance (model units). */
  idleHipsY: number;
  /**
   * Forearm and hand rotations relative to a gun held level and straight
   * ahead, plus forearm lengths (model units); the view model reuses them.
   */
  arms: { rFore: THREE.Quaternion; rHand: THREE.Quaternion; lFore: THREE.Quaternion; lHand: THREE.Quaternion; rLen: number; lLen: number };
  gunOffsets: Map<ClassId, { pos: THREE.Vector3; quat: THREE.Quaternion }>;
}

let rig: { asset: PlayerAsset; rig: Rig } | null = null;

/** Palm centres in hand bone space (hand bones point along +Y to the fingers). */
export const PALM = new THREE.Vector3(0.0, 0.075, 0.02);
export const PALM_L = new THREE.Vector3(0.0, 0.075, 0.02);
/** Model-space rotation of a gun pointing along the model's forward (+Z). */
const GUN_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export function playerRig(asset: PlayerAsset): Rig {
  if (rig && rig.asset === asset) return rig.rig;
  const model = cloneSkinned(asset.scene);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(asset.clips.get('ref')!).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  const spineRef = model.getObjectByName('mixamorigSpine')!.getWorldQuaternion(new THREE.Quaternion());
  const hand = model.getObjectByName('mixamorigRightHand')!.matrixWorld.clone();
  const head = model.getObjectByName('mixamorigHead')!.getWorldPosition(new THREE.Vector3());
  const hips = model.getObjectByName('mixamorigHips')!.getWorldPosition(new THREE.Vector3());
  const inGun = (n: string) => GUN_FORWARD.clone().invert().multiply(model.getObjectByName('mixamorig' + n)!.getWorldQuaternion(new THREE.Quaternion()));
  const len = (n: string) => model.getObjectByName('mixamorig' + n)!.position.length();
  const arms = { rFore: inGun('RightForeArm'), rHand: inGun('RightHand'), lFore: inGun('LeftForeArm'), lHand: inGun('LeftHand'), rLen: len('RightHand'), lLen: len('LeftHand') };
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  const idleHips = asset.clips.get('idle')!.tracks.find((t) => t.name === 'mixamorigHips.position');
  const r: Rig = { spineRef, hand, headZ: head.z - hips.z, idleHipsY: idleHips ? idleHips.values[1] : 0.93, arms, gunOffsets: new Map() };
  rig = { asset, rig: r };
  return r;
}

/** Gun transform in RightHand space: grip on the palm, barrel along the model's forward (+Z). */
function gunOffset(r: Rig, cls: ClassId): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  let o = r.gunOffsets.get(cls);
  if (o) return o;
  const palm = PALM.clone().applyMatrix4(r.hand);
  const want = new THREE.Matrix4().compose(palm, GUN_FORWARD, new THREE.Vector3(1, 1, 1));
  const local = r.hand.clone().invert().multiply(want);
  o = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  local.decompose(o.pos, o.quat, new THREE.Vector3());
  r.gunOffsets.set(cls, o);
  return o;
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Rotates `bone` by `angle` about a world-space axis. */
function turnBone(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  const parentQ = bone.parent!.getWorldQuaternion(_q2);
  const worldQ = _q1.copy(parentQ).multiply(bone.quaternion);
  worldQ.premultiply(_q0.setFromAxisAngle(axis, angle));
  bone.quaternion.copy(parentQ.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}

/** Rotates `bone` (in world space) so its child at `from` moves toward `to`. */
export function aimBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  const o = bone.getWorldPosition(_v0);
  _v1.copy(from).sub(o).normalize();
  _v2.copy(to).sub(o).normalize();
  _q0.setFromUnitVectors(_v1, _v2);
  bone.getWorldQuaternion(_q1).premultiply(_q0);
  bone.parent!.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}

/** Analytic two-bone IK: places `end` at `target` with the middle joint bending toward `pole`. */
function solveTwoBone(upper: THREE.Bone, mid: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3): void {
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = mid.getWorldPosition(_v3);
  const c = end.getWorldPosition(_v4);
  const lab = a.distanceTo(b);
  const lbc = b.distanceTo(c);
  const dir = target.clone().sub(a);
  const lat = THREE.MathUtils.clamp(dir.length(), Math.abs(lab - lbc) + 1e-3, lab + lbc - 1e-3);
  dir.normalize();
  const side = pole.clone().sub(a);
  side.addScaledVector(dir, -side.dot(dir));
  if (side.lengthSq() < 1e-8) side.set(0, 1, 0);
  side.normalize();
  const x = (lab * lab - lbc * lbc + lat * lat) / (2 * lat);
  const h = Math.sqrt(Math.max(0, lab * lab - x * x));
  const elbow = a.clone().addScaledVector(dir, x).addScaledVector(side, h);
  aimBone(upper, b.clone(), elbow);
  const reach = a.addScaledVector(dir, lat);
  aimBone(mid, end.getWorldPosition(new THREE.Vector3()), reach);
}

class SkinnedSoldier implements CharacterView {
  root = new THREE.Group();
  gun: GunModel;
  private pivot = new THREE.Group();
  private model: THREE.Object3D;
  private mat: THREE.MeshStandardMaterial;
  private mixer: THREE.AnimationMixer;
  private loco = {} as Record<Loco, THREE.AnimationAction>;
  private w = {} as Record<Loco, number>;
  private aim: THREE.AnimationAction;
  private death: THREE.AnimationAction | null = null;
  private deathKey: (typeof DEATHS)[number] = 'dieBack';
  private bone: Record<string, THREE.Bone> = {};
  private bones: THREE.Bone[] = [];
  /** Bone transforms as the mixer left them (see restorePose). */
  private mixed: Float32Array;
  private rig: Rig;
  private tag: NameTag;
  private gunKey = '';
  private colorKey = -1;
  private tint = new THREE.Color();
  private hitFlash = 0;
  private deathT = 0;
  private dead = false;
  private crouchK = 0;
  private slideK = 0;

  constructor(
    private actor: Actor,
    asset: PlayerAsset,
  ) {
    this.rig = playerRig(asset);
    this.model = cloneSkinned(asset.scene);
    this.mat = asset.material.clone();
    this.mat.envMap = modelEnvironment();
    this.mat.envMapIntensity = 0.35;
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        this.bone[o.name.replace('mixamorig', '')] = o as THREE.Bone;
        this.bones.push(o as THREE.Bone);
      }
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        mesh.material = this.mat;
        mesh.castShadow = true;
        // Skinned bounds follow the bind pose; use a sphere that covers any pose.
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.7);
      }
    });

    // The model faces +Z; actors look down -Z at yaw 0. Shift it back so the
    // forward-leaning head sits over the hitboxes.
    this.pivot.rotation.y = Math.PI;
    this.pivot.scale.setScalar(MODEL_SCALE);
    this.pivot.position.z = this.rig.headZ * MODEL_SCALE * 0.75;
    this.pivot.add(this.model);
    this.root.add(this.pivot);

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const k of LOCO) {
      const act = this.mixer.clipAction(asset.clips.get(k)!);
      act.play();
      act.setEffectiveWeight(k === 'idle' ? 1 : 0);
      this.loco[k] = act;
      this.w[k] = k === 'idle' ? 1 : 0;
    }
    this.aim = this.mixer.clipAction(asset.clips.get('aim')!);
    this.aim.play();
    this.mixed = new Float32Array(this.bones.length * 7);
    this.mixer.update(0);
    this.savePose();

    this.gun = buildGun(actor.classId, actor.tier);
    this.mountGun();
    this.tag = new NameTag(this.root);
  }

  private mountGun(): void {
    this.gunKey = `${this.actor.classId}:${this.actor.tier}`;
    const o = gunOffset(this.rig, this.actor.classId);
    this.gun.group.position.copy(o.pos);
    this.gun.group.quaternion.copy(o.quat);
    this.gun.group.scale.setScalar(1 / MODEL_SCALE);
    this.bone.RightHand.add(this.gun.group);
  }

  setColors(friendly: boolean, ffa: boolean): void {
    const key = friendly ? 1 : ffa ? 2 + (this.actor.id % FFA_TINTS.length) : 0;
    if (key === this.colorKey) return;
    this.colorKey = key;
    // Multiply the camo with the team colour (boosted so the dark camo keeps
    // its pattern but clearly reads as teal / red), plus a faint glow.
    this.tint.setHex(teamTint(friendly, ffa, this.actor.id));
    this.mat.color.copy(this.tint).lerp(new THREE.Color(1, 1, 1), 0.12).multiplyScalar(1.9);
    this.tag.draw(this.actor.name, friendly);
  }

  flash(): void {
    this.hitFlash = 0.12;
  }

  showName(v: boolean): void {
    this.tag.sprite.visible = v;
  }

  onKilled(fromX: number, fromZ: number): void {
    const a = this.actor;
    // Angle between where the victim faced and where the shot came from.
    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    const dx = fromX - a.body.x;
    const dz = fromZ - a.body.z;
    const cos = (fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1);
    this.deathKey = cos < -0.35 ? 'dieShotBack' : cos > 0.6 && a.id % 3 !== 0 ? 'dieBack' : 'dieFwd';
  }

  update(dt: number, time: number): void {
    const a = this.actor;
    if (`${a.classId}:${a.tier}` !== this.gunKey) {
      this.gun.group.removeFromParent();
      this.gun = buildGun(a.classId, a.tier);
      this.mountGun();
    }
    const b = a.body;
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.y = a.yaw;

    if (!a.alive) {
      this.updateDeath(dt);
      return;
    }
    if (this.dead) this.revive();

    // ---- Locomotion weights from the velocity in the actor's frame.
    const sy = Math.sin(a.yaw);
    const cy = Math.cos(a.yaw);
    const fwd = -b.vx * sy - b.vz * cy;
    const right = b.vx * cy - b.vz * sy;
    const speed = Math.hypot(fwd, right);
    const target = { idle: 0, run: 0, back: 0, strafeL: 0, strafeR: 0, air: 0 } as Record<Loco, number>;
    const sliding = a.stance === 'slide';
    if (!b.onGround && a.airTime > 0.08) target.air = 1;
    else if (sliding) target.idle = 1;
    else {
      const move = THREE.MathUtils.clamp((speed - 0.3) / 2.2, 0, 1);
      const cf = speed > 1e-3 ? fwd / speed : 1;
      const cr = speed > 1e-3 ? right / speed : 0;
      // Sharpened direction weights keep diagonal blends from crossing legs.
      const wf = Math.max(0, cf) ** 2;
      const wb = Math.max(0, -cf) ** 2;
      const wr = Math.max(0, cr) ** 2;
      const wl = Math.max(0, -cr) ** 2;
      const sum = wf + wb + wr + wl || 1;
      target.run = (move * wf) / sum;
      target.back = (move * wb) / sum;
      target.strafeR = (move * wr) / sum;
      target.strafeL = (move * wl) / sum;
      target.idle = 1 - move;
    }
    const k = Math.min(1, dt * 9);
    for (const key of LOCO) {
      this.w[key] += (target[key] - this.w[key]) * k;
      this.loco[key].setEffectiveWeight(this.w[key]);
      const gait = GAIT_SPEED[key];
      if (gait) this.loco[key].timeScale = THREE.MathUtils.clamp(speed / gait, 0.55, key === 'run' ? 1.45 : 1.9);
    }
    this.aim.setEffectiveWeight(1);
    this.restorePose();
    this.mixer.update(dt);
    this.savePose();

    // ---- Procedural layer on top of the clips.
    this.crouchK += ((a.stance === 'crouch' ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    this.slideK += ((sliding ? 1 : 0) - this.slideK) * Math.min(1, dt * 12);
    this.root.updateMatrixWorld(true);
    this.poseLegs(speed);
    this.poseSpine(time, speed);
    this.animateGun();
    this.poseLeftArm();

    // Hit flash / spawn shimmer
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const shimmer = a.spawnProtect > 0 ? 0.3 + Math.sin(time * 18) * 0.25 : 0;
    const e = this.hitFlash > 0 ? 0.55 : shimmer;
    this.mat.emissive.copy(this.tint).multiplyScalar(0.05).addScalar(e);
  }

  // The mixer only writes a bone when its blended value changed since the
  // last frame, so the procedural edits below would otherwise pile up on
  // static poses. Undo them before every mixer update.
  private savePose(): void {
    const m = this.mixed;
    this.bones.forEach((b, i) => {
      b.position.toArray(m, i * 7);
      b.quaternion.toArray(m, i * 7 + 3);
    });
  }

  private restorePose(): void {
    const m = this.mixed;
    this.bones.forEach((b, i) => {
      b.position.fromArray(m, i * 7);
      b.quaternion.fromArray(m, i * 7 + 3);
    });
  }

  /**
   * Stance, crouch and slide: move the hips, then solve the legs back onto
   * the feet. Low tactical gaits are lifted part of the way to the idle
   * height so the head stays inside the head hitbox while moving.
   */
  private poseLegs(speed: number): void {
    const c = this.crouchK;
    const s = this.slideK;
    const B = this.bone;
    const upright = Math.max(0, 1 - c - s);
    const feet = [B.LeftFoot, B.RightFoot];
    const footPos = feet.map((f) => f.getWorldPosition(new THREE.Vector3()));
    const footRot = feet.map((f) => f.getWorldQuaternion(new THREE.Quaternion()));
    // Model-space directions in world space.
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(this.pivot.matrixWorld);
    const left = new THREE.Vector3(1, 0, 0).transformDirection(this.pivot.matrixWorld);
    const ground = this.root.position.y;
    const still = 1 - Math.min(1, speed / 2);

    const lift = Math.max(0, this.rig.idleHipsY - B.Hips.position.y) * 0.6 * upright;
    B.Hips.position.y += lift - c * CROUCH_DROP - s * SLIDE_DROP;
    // Lean back into the slide (hips tilt; the spine keeps the gun level).
    B.Hips.quaternion.premultiply(_q0.setFromAxisAngle(X_AXIS, -0.75 * s));
    B.Hips.updateMatrixWorld(true);
    const hip = B.Hips.getWorldPosition(new THREE.Vector3());

    // Standing still: shoulder-width stance. Crouched: stagger the feet.
    const idle = this.w.idle * upright;
    footPos[0].addScaledVector(left, 0.07 * idle + 0.04 * c).addScaledVector(fwd, 0.16 * c * still);
    footPos[1].addScaledVector(left, -0.07 * idle - 0.04 * c).addScaledVector(fwd, -0.14 * c * still);
    // Sliding: lead leg stretched out front, rear leg tucked under.
    if (s > 0) {
      const lead = hip.clone().addScaledVector(fwd, 0.78).addScaledVector(left, 0.1);
      lead.y = ground + 0.12;
      const tuck = hip.clone().addScaledVector(fwd, -0.05).addScaledVector(left, -0.2);
      tuck.y = ground + 0.06;
      footPos[0].lerp(lead, s);
      footPos[1].lerp(tuck, s);
    }
    const legs: [THREE.Bone, THREE.Bone, THREE.Bone][] = [
      [B.LeftUpLeg, B.LeftLeg, B.LeftFoot],
      [B.RightUpLeg, B.RightLeg, B.RightFoot],
    ];
    legs.forEach(([up, mid, foot], i) => {
      const knee = mid.getWorldPosition(new THREE.Vector3());
      const pole = knee.addScaledVector(fwd, 0.6).addScaledVector(left, i === 0 ? 0.15 : -0.15);
      if (s > 0 && i === 1) pole.addScaledVector(fwd, -0.3 * s).y -= 0.4 * s;
      solveTwoBone(up, mid, foot, footPos[i], pole);
      foot.parent!.getWorldQuaternion(_q2).invert();
      foot.quaternion.copy(_q2.multiply(footRot[i]));
    });
  }

  /** Locks the upper body to the aim frame and bends the spine to the aim pitch. */
  private poseSpine(time: number, speed: number): void {
    const a = this.actor;
    const B = this.bone;
    // Spine world = pivot * reference, whatever the hips are doing.
    const pivotQ = this.pivot.getWorldQuaternion(new THREE.Quaternion());
    const want = pivotQ.clone().multiply(this.rig.spineRef);
    B.Hips.getWorldQuaternion(_q1).invert();
    B.Spine.quaternion.copy(_q1.multiply(want));

    const breathe = Math.sin(time * 1.9 + a.id) * 0.012 * (1 - Math.min(1, speed / 3));
    // Pitch is shared by the spine and the shoulder (the gun turns the full
    // amount), so looking down doesn't fold the body below its hitboxes.
    const pitch = -a.pitch;
    const kick = -a.kick * 0.09;
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(pivotQ);
    turnBone(B.Spine, axis, pitch * 0.2);
    turnBone(B.Spine1, axis, pitch * 0.175 + breathe);
    turnBone(B.Spine2, axis, pitch * 0.175);
    turnBone(B.RightArm, axis, pitch * 0.45 + kick);
    turnBone(B.LeftArm, axis, pitch * 0.45);
    turnBone(B.Neck, axis, pitch * 0.25);
    turnBone(B.Head, axis, pitch * 0.2);
  }

  /** Left hand onto the fore-grip. */
  private poseLeftArm(): void {
    const B = this.bone;
    const g = this.gun;
    g.group.updateWorldMatrix(true, false);
    // Wrist sits a hand-length behind and below the palm point.
    const wrist = g.group.localToWorld(g.fore.clone().add(new THREE.Vector3(-0.02, -0.035, 0.07)));
    const elbow = B.LeftForeArm.getWorldPosition(new THREE.Vector3());
    const down = new THREE.Vector3(0, -1, 0);
    const out = new THREE.Vector3(1, 0, 0).transformDirection(this.pivot.matrixWorld);
    const pole = elbow.addScaledVector(down, 0.3).addScaledVector(out, 0.15);
    solveTwoBone(B.LeftArm, B.LeftForeArm, B.LeftHand, wrist, pole);
  }

  /** Reload: tilt the gun and drop the magazine. */
  private animateGun(): void {
    const a = this.actor;
    const g = this.gun;
    g.group.quaternion.copy(gunOffset(this.rig, a.classId).quat);
    if (g.mag) g.mag.position.copy(g.magRest);
    if (!a.reloading) return;
    const p = 1 - a.reloadLeft / a.weapon.reloadTime;
    const inOut = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
    g.group.rotateZ(0.5 * inOut);
    if (g.mag && p > 0.18 && p < 0.7) g.mag.position.y -= Math.sin(((p - 0.18) / 0.52) * Math.PI) * 0.2;
  }

  private updateDeath(dt: number): void {
    if (!this.dead) {
      this.dead = true;
      this.deathT = 0;
      const clip = getModels()?.player.clips.get(this.deathKey);
      if (clip) {
        const [start, speed] = DEATH_PLAY[this.deathKey];
        this.death = this.mixer.clipAction(clip);
        this.death.reset();
        this.death.setLoop(THREE.LoopOnce, 1);
        this.death.clampWhenFinished = true;
        this.death.time = start;
        this.death.timeScale = speed;
        this.death.setEffectiveWeight(0);
        this.death.play();
      }
      this.tag.sprite.visible = false;
    }
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 0.15);
    for (const key of LOCO) this.loco[key].setEffectiveWeight(this.w[key] * (1 - k));
    this.aim.setEffectiveWeight(1 - k);
    this.death?.setEffectiveWeight(k);
    this.restorePose();
    this.mixer.update(dt);
    this.savePose();
    // Bodies sink into the floor before the respawn.
    this.pivot.position.y = -Math.max(0, this.deathT - 2.2) * 0.6;
    this.root.visible = this.deathT < 3.2;
    this.tag.sprite.visible = false;
    this.mat.emissive.setScalar(0);
  }

  private revive(): void {
    this.dead = false;
    this.death?.stop();
    this.death = null;
    this.deathKey = 'dieBack';
    this.pivot.position.y = 0;
    this.root.visible = true;
    for (const key of LOCO) {
      this.w[key] = key === 'idle' ? 1 : 0;
      this.loco[key].setEffectiveWeight(this.w[key]);
    }
    this.aim.setEffectiveWeight(1);
    this.crouchK = this.slideK = 0;
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.gun.muzzle.getWorldPosition(out);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.mat.dispose();
    this.tag.dispose();
  }
}

// ---------------------------------------------------------------------------
// Blocky fallback soldier (used when the GLB models are unavailable)

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function part(parent: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Box stretched between two points (local space of `parent`). */
function limb(parent: THREE.Object3D, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo, m);
  const len = a.distanceTo(b);
  mesh.scale.set(t, t, len);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(parent.localToWorld(b.clone()));
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

class BlockySoldier implements CharacterView {
  root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private thighL = new THREE.Group();
  private thighR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  gun: GunModel;
  private vestMat: THREE.MeshLambertMaterial;
  private helmetMat: THREE.MeshLambertMaterial;
  private skinMat: THREE.MeshLambertMaterial;
  private pantsMat: THREE.MeshLambertMaterial;
  private bootMat: THREE.MeshLambertMaterial;
  private visorMat: THREE.MeshBasicMaterial;
  private tag: NameTag;
  private deathT = 0;
  private hitFlash = 0;
  private gunKey = '';
  private armsGroup = new THREE.Group();
  private colorKey = -1;

  constructor(private actor: Actor) {
    this.vestMat = new THREE.MeshLambertMaterial({ color: 0xcc3344 });
    this.helmetMat = new THREE.MeshLambertMaterial({ color: 0x33363a });
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a77e });
    this.pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    this.bootMat = new THREE.MeshLambertMaterial({ color: 0x1d1f22 });
    this.visorMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a });

    this.root.add(this.body);
    // Legs (pivot at hip y=0.9)
    for (const [thigh, shin, x] of [
      [this.thighL, this.shinL, -0.12],
      [this.thighR, this.shinR, 0.12],
    ] as const) {
      thigh.position.set(x, 0.9, 0);
      part(thigh, this.pantsMat, 0.2, 0.46, 0.24, 0, -0.23, 0);
      shin.position.set(0, -0.45, 0);
      part(shin, this.pantsMat, 0.18, 0.4, 0.22, 0, -0.2, 0);
      part(shin, this.bootMat, 0.2, 0.1, 0.3, 0, -0.4, -0.03);
      thigh.add(shin);
      this.body.add(thigh);
    }
    part(this.body, this.pantsMat, 0.46, 0.18, 0.28, 0, 0.92, 0);

    // Torso (pivot at y=0.95)
    this.torso.position.set(0, 0.95, 0);
    this.body.add(this.torso);
    part(this.torso, this.pantsMat, 0.5, 0.56, 0.28, 0, 0.29, 0);
    part(this.torso, this.vestMat, 0.54, 0.4, 0.33, 0, 0.32, 0);
    part(this.torso, this.helmetMat, 0.3, 0.12, 0.08, 0.08, 0.36, -0.19);

    // Head
    this.head.position.set(0, 0.56, 0);
    this.torso.add(this.head);
    part(this.head, this.skinMat, 0.27, 0.27, 0.27, 0, 0.15, 0);
    part(this.head, this.helmetMat, 0.33, 0.13, 0.33, 0, 0.3, 0.01);
    part(this.head, this.helmetMat, 0.34, 0.06, 0.36, 0, 0.245, 0.0);
    part(this.head, this.visorMat, 0.24, 0.05, 0.02, 0, 0.17, -0.14);

    // Gun + arms
    this.gun = buildGun(actor.classId, actor.tier);
    this.mountGun();
    this.torso.add(this.armsGroup);
    this.tag = new NameTag(this.root);
  }

  private mountGun(): void {
    this.gunKey = `${this.actor.classId}:${this.actor.tier}`;
    this.torso.remove(this.gun.group);
    this.gun.group.position.set(0.1, 0.42, -0.32);
    this.torso.add(this.gun.group);
    // Arms from shoulders to grip / handguard.
    this.armsGroup.clear();
    const grip = new THREE.Vector3(0.1, 0.38, -0.29);
    const fore = new THREE.Vector3(0.08, 0.43, this.actor.classId === 'smg' ? -0.6 : -0.72);
    const shR = new THREE.Vector3(0.3, 0.5, 0);
    const shL = new THREE.Vector3(-0.3, 0.5, 0);
    const elbowR = new THREE.Vector3(0.28, 0.3, -0.12);
    const elbowL = new THREE.Vector3(-0.18, 0.32, -0.38);
    this.torso.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    limb(this.armsGroup, this.vestMat, shR, elbowR, 0.13);
    limb(this.armsGroup, this.skinMat, elbowR, grip, 0.11);
    limb(this.armsGroup, this.vestMat, shL, elbowL, 0.13);
    limb(this.armsGroup, this.skinMat, elbowL, fore, 0.11);
  }

  setColors(friendly: boolean, ffa: boolean): void {
    const key = friendly ? 1 : ffa ? 2 + (this.actor.id % 5) : 0;
    if (key === this.colorKey) return;
    this.colorKey = key;
    this.vestMat.color.setHex(teamTint(friendly, ffa, this.actor.id));
    this.visorMat.color.setHex(friendly ? 0x6bfff0 : 0xff6a5a);
    this.helmetMat.color.setHex(friendly ? 0x23413c : 0x3a2a2c);
    this.tag.draw(this.actor.name, friendly);
  }

  flash(): void {
    this.hitFlash = 0.12;
  }

  showName(v: boolean): void {
    this.tag.sprite.visible = v;
  }

  onKilled(): void {}

  update(dt: number, time: number): void {
    const a = this.actor;
    if (`${a.classId}:${a.tier}` !== this.gunKey) {
      this.torso.remove(this.gun.group);
      this.gun = buildGun(a.classId, a.tier);
      this.mountGun();
    }
    const b = a.body;
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.y = a.yaw;

    // Death fall
    if (!a.alive) {
      this.deathT += dt;
      const t = Math.min(1, this.deathT / 0.45);
      this.body.rotation.z = t * t * (Math.PI / 2) * (a.id % 2 ? 1 : -1);
      this.body.position.y = -t * 0.55 - Math.max(0, this.deathT - 2.2) * 0.6;
      this.root.visible = this.deathT < 3.2;
      this.tag.sprite.visible = false;
      return;
    }
    this.deathT = 0;
    this.root.visible = true;
    this.body.rotation.z = 0;

    const speed = a.speed;
    const moving = Math.min(1, speed / 6);
    const swing = Math.sin(a.walkPhase * 2.2) * 0.65 * moving;
    let bodyY = 0;
    let bodyTilt = 0;
    let thighL = swing;
    let thighR = -swing;
    let shinL = Math.max(0, -Math.sin(a.walkPhase * 2.2)) * 0.9 * moving;
    let shinR = Math.max(0, Math.sin(a.walkPhase * 2.2)) * 0.9 * moving;

    if (a.stance === 'crouch') {
      bodyY = -0.42;
      thighL = 1.25 + swing * 0.3;
      thighR = 0.6 - swing * 0.3;
      shinL = -1.9;
      shinR = -2.2;
    } else if (a.stance === 'slide') {
      bodyY = -0.62;
      bodyTilt = 0.75;
      thighL = 1.3;
      thighR = 1.0;
      shinL = -0.3;
      shinR = -0.9;
    } else if (!b.onGround) {
      thighL = 0.5;
      thighR = -0.25;
      shinL = -0.9;
      shinR = -0.5;
    }
    const k = Math.min(1, dt * 14);
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.x += (bodyTilt - this.body.rotation.x) * k;
    this.thighL.rotation.x += (thighL - this.thighL.rotation.x) * k;
    this.thighR.rotation.x += (thighR - this.thighR.rotation.x) * k;
    this.shinL.rotation.x += (shinL - this.shinL.rotation.x) * k;
    this.shinR.rotation.x += (shinR - this.shinR.rotation.x) * k;

    // Aim pitch split between torso and head.
    const pitch = a.pitch - bodyTilt;
    this.torso.rotation.x = pitch * 0.75;
    this.head.rotation.x = pitch * 0.25;
    // Recoil nudge
    this.gun.group.position.z = -0.32 + a.kick * 0.05;

    // Hit flash / spawn shimmer
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const shimmer = a.spawnProtect > 0 ? 0.25 + Math.sin(time * 18) * 0.2 : 0;
    const e = this.hitFlash > 0 ? 0.6 : shimmer;
    this.vestMat.emissive.setScalar(e);
    this.skinMat.emissive.setScalar(e * 0.6);
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.gun.muzzle.getWorldPosition(out);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.vestMat.dispose();
    this.helmetMat.dispose();
    this.skinMat.dispose();
    this.pantsMat.dispose();
    this.bootMat.dispose();
    this.visorMat.dispose();
    this.tag.dispose();
  }
}
