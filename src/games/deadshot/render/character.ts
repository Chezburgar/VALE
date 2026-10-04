import * as THREE from 'three';
import type { Actor } from '../actor';
import { buildGun, type GunModel } from './guns';

// Blocky soldier with a two-segment leg rig, aim pitch, crouch, slide,
// death fall and a floating name tag.

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

export class CharacterModel {
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
  private nameSprite: THREE.Sprite;
  private nameTex: THREE.CanvasTexture;
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

    // Name tag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    this.nameTex = new THREE.CanvasTexture(canvas);
    this.nameTex.colorSpace = THREE.SRGBColorSpace;
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTex, depthTest: false, transparent: true, sizeAttenuation: false }));
    this.nameSprite.scale.set(0.15, 0.0375, 1);
    this.nameSprite.position.set(0, 2.25, 0);
    this.nameSprite.renderOrder = 10;
    this.root.add(this.nameSprite);
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
    const ffaPalette = [0xd8434f, 0xe0703a, 0xb04ad0, 0xd94e8a, 0xc9a23a];
    const vest = friendly ? 0x25c9a7 : ffa ? ffaPalette[this.actor.id % 5] : 0xd8434f;
    this.vestMat.color.setHex(vest);
    this.visorMat.color.setHex(friendly ? 0x6bfff0 : 0xff6a5a);
    this.helmetMat.color.setHex(friendly ? 0x23413c : 0x3a2a2c);
    this.drawName(friendly);
  }

  private drawName(friendly: boolean): void {
    const c = this.nameTex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '600 30px Rajdhani, Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(this.actor.name, 128, 32);
    ctx.fillStyle = friendly ? '#5fffe0' : '#ff6b6b';
    ctx.fillText(this.actor.name, 128, 32);
    this.nameTex.needsUpdate = true;
    (this.nameSprite.material as THREE.SpriteMaterial).depthTest = !friendly;
  }

  flash(): void {
    this.hitFlash = 0.12;
  }

  showName(v: boolean): void {
    this.nameSprite.visible = v;
  }

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
      this.nameSprite.visible = false;
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

  /** World position of the muzzle (for tracers / flashes). */
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
    this.nameTex.dispose();
    (this.nameSprite.material as THREE.Material).dispose();
  }
}
