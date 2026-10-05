import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Actor } from '../actor';
import type { ClassId, Tier } from '../config';
import { aimBone, MODEL_SCALE, PALM, PALM_L, playerRig, type Rig } from './character';
import { buildGun, type GunModel } from './guns';
import { getModels, GUN_SPECS, modelEnvironment, type PlayerAsset } from './models';
import { flashTexture } from './textures';

// First-person weapon and arms, rendered in their own pass on top of the
// world so they never clip into walls.

/**
 * Per GLB gun: hip position of the grip (view space), ADS eye relief, and
 * the radius (fraction of half the screen height) of the see-through hole
 * cut into an optic while aiming (0 = open sights).
 */
const POSE: Record<ClassId, { hip: [number, number, number]; eye: number; optic: number }> = {
  ar: { hip: [0.19, -0.21, -0.56], eye: 0.2, optic: 0.225 },
  smg: { hip: [0.18, -0.21, -0.5], eye: 0.17, optic: 0.14 },
  shotgun: { hip: [0.19, -0.2, -0.56], eye: 0.42, optic: 0 },
  sniper: { hip: [0.19, -0.2, -0.58], eye: 0.14, optic: 0 },
};

/** Forearm directions (gun space, wrist toward elbow) so both elbows drop out of view. */
const R_FORE = new THREE.Vector3(0.32, -0.62, 0.72).normalize();
const L_FORE = new THREE.Vector3(-0.42, -0.82, 0.4).normalize();
/** Right-hand finger direction (gun space): wrapped forward around the pistol grip. */
const R_FINGERS = new THREE.Vector3(-0.45, -0.3, -0.85).normalize();
/**
 * Left-hand finger direction: along the handguard. The mitten hand has no
 * finger bones, so fingers wrapped across it would stick out the far side
 * as a flat paddle in the sight picture.
 */
const L_FINGERS = new THREE.Vector3(0.3, 0.2, -0.93).normalize();

/** Sniper bolt handle (file space) and the shotgun's loading port, for the right / left hand. */
const BOLT: [number, number] = [0.205, 0.03];
const PORT: [number, number] = [0.02, 0.01];

const _q = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _w = new THREE.Vector3();
const _e = new THREE.Vector3();
const _p = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * The player model's own arms (camo sleeves and gloves) cut out of the
 * skinned mesh. Hands and forearms are placed on the gun with the same
 * grip they have in the third-person aim pose; the stretched upper arms
 * stay below the screen.
 */
class SkinnedArms {
  root = new THREE.Group();
  private model: THREE.Object3D;
  private mat: THREE.MeshStandardMaterial;
  private b: Record<string, THREE.Bone> = {};
  private grip: { rFore: THREE.Quaternion; rHand: THREE.Quaternion; lFore: THREE.Quaternion; lHand: THREE.Quaternion; rLen: number; lLen: number };

  constructor(asset: PlayerAsset, rig: Rig) {
    // Swing the third-person forearms down and out; the hands follow halfway.
    const swing = (fore: THREE.Quaternion, hand: THREE.Quaternion, dir: THREE.Vector3) => {
      const d0 = new THREE.Vector3(0, -1, 0).applyQuaternion(fore);
      const r = new THREE.Quaternion().setFromUnitVectors(d0, dir);
      return [r.clone().multiply(fore), new THREE.Quaternion().slerp(r, 0.5).multiply(hand)];
    };
    const A = rig.arms;
    const [rFore, rHand0] = swing(A.rFore, A.rHand, R_FORE);
    const [lFore, lHand0] = swing(A.lFore, A.lHand, L_FORE);
    const point = (hand: THREE.Quaternion, dir: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0).applyQuaternion(hand), dir).multiply(hand);
    const rHand = point(rHand0, R_FINGERS);
    const lHand = point(lHand0, L_FINGERS);
    this.grip = { rFore, rHand, lFore, lHand, rLen: A.rLen, lLen: A.lLen };
    this.model = cloneSkinned(asset.scene);
    this.mat = asset.material.clone();
    this.mat.envMap = modelEnvironment();
    this.mat.envMapIntensity = 0.5;
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.b[o.name.replace('mixamorig', '')] = o as THREE.Bone;
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.geometry = asset.arms;
        m.material = this.mat;
        m.frustumCulled = false;
      }
    });
    // Hold the reference aim pose; only the arm bones move afterwards.
    const mixer = new THREE.AnimationMixer(this.model);
    mixer.clipAction(asset.clips.get('ref')!).play();
    mixer.update(0);
    mixer.stopAllAction();
    mixer.uncacheRoot(this.model);
    this.model.updateMatrixWorld(true);
    const shoulderY = this.b.RightArm.getWorldPosition(new THREE.Vector3()).y;
    // Facing into the screen with the shoulders just below and behind the camera.
    this.root.rotation.y = Math.PI;
    this.root.scale.setScalar(MODEL_SCALE);
    this.root.position.set(0, -shoulderY * MODEL_SCALE - 0.3, 0.12);
    this.root.add(this.model);
  }

  setColor(tint: THREE.Color): void {
    this.mat.color.copy(tint).lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(1.15);
  }

  /** Puts the palms on `right` / `left` (gun space). */
  place(gun: THREE.Object3D, right: THREE.Vector3, left: THREE.Vector3): void {
    this.root.updateMatrixWorld(true);
    gun.updateWorldMatrix(true, false);
    const g = gun.getWorldQuaternion(new THREE.Quaternion());
    const A = this.grip;
    this.solve(gun, g, right, A.rHand, A.rFore, A.rLen, PALM, this.b.RightArm, this.b.RightForeArm, this.b.RightHand);
    this.solve(gun, g, left, A.lHand, A.lFore, A.lLen, PALM_L, this.b.LeftArm, this.b.LeftForeArm, this.b.LeftHand);
  }

  private solve(gun: THREE.Object3D, g: THREE.Quaternion, palmLocal: THREE.Vector3, handInGun: THREE.Quaternion, foreInGun: THREE.Quaternion, len: number, palm: THREE.Vector3, upper: THREE.Bone, fore: THREE.Bone, hand: THREE.Bone): void {
    const s = MODEL_SCALE;
    _qh.copy(g).multiply(handInGun);
    _qf.copy(g).multiply(foreInGun);
    const wrist = gun.localToWorld(_w.copy(palmLocal)).sub(_p.copy(palm).multiplyScalar(s).applyQuaternion(_qh));
    const elbow = _e.copy(Y).applyQuaternion(_qf).multiplyScalar(-len * s).add(wrist);
    // Upper arm swings toward the elbow and stretches to reach it.
    aimBone(upper, fore.getWorldPosition(new THREE.Vector3()), elbow);
    fore.position.copy(upper.worldToLocal(elbow.clone()));
    upper.getWorldQuaternion(_q).invert();
    fore.quaternion.copy(_q.multiply(_qf));
    fore.updateMatrixWorld(true);
    hand.quaternion.copy(_qf.invert().multiply(_qh));
    hand.updateMatrixWorld(true);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.model.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
    this.mat.dispose();
  }
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class ViewModel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.02, 20);
  private holder = new THREE.Group();
  private sway = new THREE.Group();
  gun: GunModel | null = null;
  private sleeveMat = new THREE.MeshLambertMaterial({ color: 0x25c9a7 });
  private gloveMat = new THREE.MeshLambertMaterial({ color: 0x1e2124 });
  private arms: SkinnedArms | null = null;
  private armsAsset: PlayerAsset | null = null;
  private tint = new THREE.Color(0x25c9a7);
  private flash: THREE.Sprite;
  private flashT = 0;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private key = '';
  private equipT = 1;
  private kickZ = 0;
  private kickRot = 0;
  private swayX = 0;
  private swayY = 0;
  private bobAmt = 0;
  private boltT = 1;
  private pumpT = 1;
  private landDip = 0;
  private rightPalm = new THREE.Vector3();
  private leftPalm = new THREE.Vector3();
  /** View-model copy of the gun material with the optic hole shader. */
  private gunMat: THREE.MeshStandardMaterial | null = null;
  private hole = { value: new THREE.Vector3() };
  private holeK = 0;
  private reticle: THREE.Sprite;
  visible = true;

  constructor() {
    this.scene.add(this.sway);
    this.sway.add(this.holder);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 2.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sun.position.set(0.4, 1, 0.6);
    this.scene.add(this.hemi, this.sun, this.camera);
    const fm = new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(fm);
    this.flash.visible = false;
    this.reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), depthTest: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.reticle.renderOrder = 5;
    this.reticle.visible = false;
  }

  setLighting(sky: number, ground: number, sun: number, sunIntensity: number): void {
    this.hemi.color.setHex(sky);
    this.hemi.groundColor.setHex(ground);
    this.sun.color.setHex(sun);
    this.sun.intensity = sunIntensity * 0.8;
  }

  setTeamColor(color: number): void {
    this.tint.setHex(color);
    this.sleeveMat.color.setHex(color);
    this.arms?.setColor(this.tint);
  }

  /** Rebuilds the gun (and arms) on the next update, e.g. once the GLB models load. */
  resetGun(): void {
    this.key = '';
  }

  private setGun(cls: ClassId, tier: Tier): void {
    const key = `${cls}:${tier}`;
    if (key === this.key) return;
    this.key = key;
    if (this.gun) this.holder.remove(this.gun.group);
    this.gunMat?.dispose();
    this.gunMat = null;
    this.gun = buildGun(cls, tier);
    this.gun.group.traverse((o) => (o.castShadow = false));
    const models = getModels();
    if (this.gun.glb && models) {
      this.gunMat = this.holeMaterial(this.gun);
      const p = POSE[cls];
      if (p.optic > 0) {
        // Red dot far down the sight line: it sits on the crosshair when aiming.
        this.reticle.position.set(0, this.gun.sightY, this.gun.sightZ - 3);
        this.reticle.scale.setScalar(0.035);
        this.gun.group.add(this.reticle);
      }
      if (this.armsAsset !== models.player) {
        this.arms?.dispose();
        this.arms = new SkinnedArms(models.player, playerRig(models.player));
        this.arms.setColor(this.tint);
        this.armsAsset = models.player;
        this.scene.add(this.arms.root);
      }
    } else {
      this.arms?.dispose();
      this.arms = null;
      this.armsAsset = null;
      this.addBoxArms(cls);
    }
    this.gun.muzzle.add(this.flash);
    this.holder.add(this.gun.group);
    this.equipT = 0;
  }

  /** Clone of the gun material that discards a circle around the screen centre (see-through optics). */
  private holeMaterial(gun: GunModel): THREE.MeshStandardMaterial | null {
    let src: THREE.MeshStandardMaterial | null = null;
    gun.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) src ??= (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
    });
    if (!src) return null;
    const m = (src as THREE.MeshStandardMaterial).clone();
    const hole = this.hole;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uHole = hole;
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        'uniform vec3 uHole;\nvoid main() {\n\tif (uHole.z > 0.0 && distance(gl_FragCoord.xy, uHole.xy) < uHole.z) discard;',
      );
    };
    m.customProgramCacheKey = () => 'vm-hole';
    gun.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = m;
    });
    return m;
  }

  /** Fallback arms for the primitive guns, in gun-local space. */
  private addBoxArms(cls: ClassId): void {
    const arm = (from: THREE.Vector3, to: THREE.Vector3, sleeveFrac: number) => {
      const dir = to.clone().sub(from);
      const len = dir.length();
      const mid = from.clone().addScaledVector(dir, sleeveFrac / 2);
      const sleeve = new THREE.Mesh(boxGeo, this.sleeveMat);
      sleeve.scale.set(0.1, 0.1, len * sleeveFrac);
      sleeve.position.copy(mid);
      sleeve.lookAt(to);
      const handPos = from.clone().addScaledVector(dir, sleeveFrac + (1 - sleeveFrac) / 2);
      const hand = new THREE.Mesh(boxGeo, this.gloveMat);
      hand.scale.set(0.085, 0.085, len * (1 - sleeveFrac) + 0.03);
      hand.position.copy(handPos);
      hand.lookAt(to);
      this.gun!.group.add(sleeve, hand);
    };
    const foreZ = cls === 'smg' ? -0.3 : cls === 'sniper' ? -0.42 : -0.44;
    arm(new THREE.Vector3(0.22, -0.42, 0.34), new THREE.Vector3(0.012, -0.05, 0.05), 0.7);
    arm(new THREE.Vector3(-0.26, -0.44, 0.12), new THREE.Vector3(-0.01, 0.01, foreZ), 0.7);
  }

  onShot(cls: ClassId): void {
    const heavy = cls === 'shotgun' || cls === 'sniper';
    this.kickZ += heavy ? 0.075 : 0.022;
    this.kickRot += heavy ? 0.16 : 0.035;
    this.flashT = 0.045;
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = heavy ? 0.42 : 0.26;
    this.flash.scale.set(s, s, s);
    if (cls === 'sniper') this.boltT = 0;
    if (cls === 'shotgun') this.pumpT = 0;
  }

  onLand(): void {
    this.landDip = 0.05;
  }

  update(dt: number, a: Actor, mouseDX: number, mouseDY: number): void {
    this.setGun(a.classId, a.tier);
    const gun = this.gun!;
    this.equipT = Math.min(1, this.equipT + dt / 0.35);
    const ads = a.ads;
    const def = a.weapon;
    const e = ads * ads * (3 - 2 * ads);

    // Hip vs ADS pose: ADS puts the sight line on the camera axis.
    let pos: THREE.Vector3;
    if (gun.glb) {
      const p = POSE[a.classId];
      const hip = new THREE.Vector3(...p.hip);
      const adsPos = new THREE.Vector3(0, -gun.sightY, -p.eye - gun.sightZ);
      pos = hip.lerp(adsPos, e);
    } else {
      const hip = new THREE.Vector3(0.24, -0.25 - gun.sightY * 0.6, -0.72);
      const adsPos = new THREE.Vector3(0, -gun.sightY, -(def.scope ? 0.32 : 0.42) - gun.sightZ);
      pos = hip.lerp(adsPos, e);
    }

    // Bob
    const moving = a.body.onGround ? Math.min(1, a.speed / 6) : 0;
    this.bobAmt += (moving - this.bobAmt) * Math.min(1, dt * 8);
    const ph = a.walkPhase * 2.2;
    const bobK = this.bobAmt * (1 - e * 0.85);
    pos.x += Math.sin(ph) * 0.012 * bobK;
    pos.y += -Math.abs(Math.cos(ph)) * 0.014 * bobK;

    // Sway from mouse movement
    this.swayX += (-mouseDX * 0.00035 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (mouseDY * 0.00035 - this.swayY) * Math.min(1, dt * 10);
    const swayK = 1 - e * 0.8;
    this.sway.position.set(clamp(this.swayX, 0.03) * swayK, clamp(this.swayY, 0.03) * swayK, 0);
    this.sway.rotation.set(clamp(this.swayY, 0.03) * 2 * swayK, clamp(this.swayX, 0.03) * 2 * swayK, 0);

    // Recoil recovery
    this.kickZ *= Math.exp(-dt * 14);
    this.kickRot *= Math.exp(-dt * 11);
    pos.z += this.kickZ;
    this.landDip *= Math.exp(-dt * 10);
    pos.y -= this.landDip;

    // Hands rest on the grip and fore-grip; animations below move them.
    this.rightPalm.copy(gun.grip);
    this.leftPalm.copy(gun.fore);

    // Reload choreography
    let tilt = 0;
    let dip = 0;
    let pitch = 0;
    if (gun.mag) gun.mag.position.copy(gun.magRest);
    if (a.reloading) {
      const p = 1 - a.reloadLeft / def.reloadTime;
      const inOut = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
      if (gun.glb) {
        // Rolled toward the camera and lifted so the magazine well and the
        // left hand working it stay in view.
        tilt = -0.5 * inOut;
        pitch = 0.2 * inOut;
        dip = -0.03 * inOut;
        pos.x -= 0.06 * inOut;
      } else {
        tilt = 0.55 * inOut;
        pitch = -0.35 * inOut;
        dip = 0.06 * inOut;
      }
      const magOut = p > 0.18 && p < 0.7 ? Math.sin(((p - 0.18) / 0.52) * Math.PI) : 0;
      if (gun.mag) gun.mag.position.y -= magOut * 0.22;
      if (gun.glb) {
        // Left hand leaves the fore-grip for the magazine (or loads shells).
        const reach = smooth(p < 0.5 ? (p - 0.12) / 0.12 : (0.82 - p) / 0.12);
        const s = GUN_SPECS[a.classId];
        const L = s.length;
        if (s.mag) {
          const target = new THREE.Vector3(0, ((s.mag[1] + s.mag[3]) / 2 - s.grip[1]) * L, ((s.mag[0] + s.mag[2]) / 2 - s.grip[0]) * L);
          target.y -= magOut * 0.22;
          this.leftPalm.lerp(target, reach);
        } else {
          const port = new THREE.Vector3(0, (PORT[1] - s.grip[1]) * L, (PORT[0] - s.grip[0]) * L);
          port.y -= Math.abs(Math.sin(p * Math.PI * 4)) * 0.05;
          this.leftPalm.lerp(port, reach);
        }
      }
    }
    // Bolt cycling (sniper) and pump (shotgun)
    this.boltT = Math.min(1, this.boltT + dt / 0.7);
    if (this.boltT < 1) {
      const bp = Math.sin(this.boltT * Math.PI);
      if (gun.bolt) {
        gun.bolt.rotation.z = bp * 1.2;
        gun.bolt.position.z = 0.06 + bp * 0.07;
      } else if (gun.glb) {
        const s = GUN_SPECS.sniper;
        const handle = new THREE.Vector3(0.04, (BOLT[1] - s.grip[1]) * s.length, (BOLT[0] - s.grip[0]) * s.length);
        handle.z += smooth((this.boltT - 0.35) / 0.3) * 0.08 * (this.boltT < 0.75 ? 1 : 1 - (this.boltT - 0.75) / 0.25);
        this.rightPalm.lerp(handle, bp);
      }
      if (this.boltT > 0.1) {
        tilt += bp * 0.15;
        dip += bp * 0.02;
      }
    } else if (gun.bolt) {
      gun.bolt.rotation.z = 0;
      gun.bolt.position.z = 0.06;
    }
    this.pumpT = Math.min(1, this.pumpT + dt / 0.5);
    if (this.pumpT < 1 && gun.glb) this.leftPalm.z += Math.sin(smooth((this.pumpT - 0.25) / 0.75) * Math.PI) * 0.09;

    // Equip raise
    const eq = 1 - this.equipT;
    pos.y -= eq * eq * 0.3;
    pitch -= eq * 0.6;

    // Slide roll
    const roll = a.stance === 'slide' ? 0.22 : 0;

    this.holder.position.copy(pos);
    this.holder.position.y -= dip;
    // At the hip the gun is canted inward so its side is visible.
    const yaw = gun.glb ? 0.045 : 0.09;
    this.holder.rotation.set(this.kickRot + pitch + 0.03 * (1 - e), yaw * (1 - e), tilt * (1 - e) + roll * (1 - e) - 0.04 * (1 - e));

    // Muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;

    // Optics: see through the sight and show the red dot while aiming.
    const optic = gun.glb ? POSE[a.classId].optic : 0;
    this.holeK = optic * smooth((ads - 0.55) / 0.4);
    this.reticle.visible = this.holeK > 0.01 && ads > 0.8;
    this.reticle.material.opacity = smooth((ads - 0.8) / 0.2);

    // Hide when scoped in
    const shown = !(def.scope && ads > 0.92);
    this.holder.visible = shown;
    if (this.arms) {
      this.arms.root.visible = shown;
      if (shown) this.arms.place(gun.group, this.rightPalm, this.leftPalm);
    }
  }

  render(renderer: THREE.WebGLRenderer, aspect: number): void {
    if (!this.visible) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // Current viewport is in device pixels, like gl_FragCoord.
    const vp = renderer.getCurrentViewport(new THREE.Vector4());
    this.hole.value.set(vp.x + vp.z / 2, vp.y + vp.w / 2, (this.holeK * vp.w) / 2);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.sleeveMat.dispose();
    this.gloveMat.dispose();
    this.arms?.dispose();
    this.gunMat?.dispose();
    this.flash.material.dispose();
    this.reticle.material.map?.dispose();
    this.reticle.material.dispose();
  }
}

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,90,70,1)');
  grad.addColorStop(0.18, 'rgba(255,60,40,1)');
  grad.addColorStop(0.32, 'rgba(255,40,30,0.35)');
  grad.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function clamp(v: number, m: number): number {
  return v < -m ? -m : v > m ? m : v;
}

function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
