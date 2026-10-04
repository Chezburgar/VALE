import * as THREE from 'three';
import type { Actor } from '../actor';
import type { ClassId, Tier } from '../config';
import { buildGun, type GunModel } from './guns';
import { flashTexture } from './textures';

// First-person weapon and arms, rendered in their own pass on top of the
// world so they never clip into walls.

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class ViewModel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.02, 20);
  private holder = new THREE.Group();
  private sway = new THREE.Group();
  gun: GunModel | null = null;
  private sleeveMat = new THREE.MeshLambertMaterial({ color: 0x25c9a7 });
  private gloveMat = new THREE.MeshLambertMaterial({ color: 0x1e2124 });
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
  private landDip = 0;
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
  }

  setLighting(sky: number, ground: number, sun: number, sunIntensity: number): void {
    this.hemi.color.setHex(sky);
    this.hemi.groundColor.setHex(ground);
    this.sun.color.setHex(sun);
    this.sun.intensity = sunIntensity * 0.8;
  }

  setTeamColor(color: number): void {
    this.sleeveMat.color.setHex(color);
  }

  private setGun(cls: ClassId, tier: Tier): void {
    const key = `${cls}:${tier}`;
    if (key === this.key) return;
    this.key = key;
    if (this.gun) this.holder.remove(this.gun.group);
    this.gun = buildGun(cls, tier);
    this.gun.group.traverse((o) => (o.castShadow = false));
    // Arms in gun-local space
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
    this.gun.muzzle.add(this.flash);
    this.holder.add(this.gun.group);
    this.equipT = 0;
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

    // Hip vs ADS pose
    const hip = new THREE.Vector3(0.24, -0.25 - gun.sightY * 0.6, -0.72);
    const adsPos = new THREE.Vector3(0, -gun.sightY, -(def.scope ? 0.32 : 0.42) - gun.sightZ);
    const e = ads * ads * (3 - 2 * ads);
    const pos = hip.lerp(adsPos, e);

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

    // Reload choreography
    let tilt = 0;
    let dip = 0;
    let pitch = 0;
    if (a.reloading) {
      const p = 1 - a.reloadLeft / def.reloadTime;
      const inOut = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
      tilt = 0.55 * inOut;
      pitch = -0.35 * inOut;
      dip = 0.06 * inOut;
      if (gun.mag) {
        const magOut = p > 0.18 && p < 0.7 ? Math.sin(((p - 0.18) / 0.52) * Math.PI) : 0;
        gun.mag.position.y = (def.id === 'smg' ? -0.11 : def.id === 'sniper' ? -0.035 : -0.07) - magOut * 0.22;
      }
    } else if (gun.mag) {
      gun.mag.position.y = def.id === 'smg' ? -0.11 : def.id === 'sniper' ? -0.035 : -0.07;
    }
    // Bolt cycling
    this.boltT = Math.min(1, this.boltT + dt / 0.7);
    if (gun.bolt) {
      const bp = this.boltT < 1 ? Math.sin(this.boltT * Math.PI) : 0;
      gun.bolt.rotation.z = bp * 1.2;
      gun.bolt.position.z = 0.06 + bp * 0.07;
      if (this.boltT < 1 && this.boltT > 0.1) {
        tilt += bp * 0.15;
        dip += bp * 0.02;
      }
    }

    // Equip raise
    const eq = 1 - this.equipT;
    pos.y -= eq * eq * 0.3;
    pitch -= eq * 0.6;

    // Slide roll
    const roll = a.stance === 'slide' ? 0.22 : 0;

    this.holder.position.copy(pos);
    this.holder.position.y -= dip;
    // At the hip the gun is canted inward so its side is visible.
    this.holder.rotation.set(this.kickRot + pitch + 0.03 * (1 - e), 0.09 * (1 - e), tilt * (1 - e) + roll * (1 - e) - 0.04 * (1 - e));

    // Muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;

    // Hide when scoped in
    this.holder.visible = !(def.scope && ads > 0.92);
  }

  render(renderer: THREE.WebGLRenderer, aspect: number): void {
    if (!this.visible) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.sleeveMat.dispose();
    this.gloveMat.dispose();
    this.flash.material.dispose();
  }
}

function clamp(v: number, m: number): number {
  return v < -m ? -m : v > m ? m : v;
}
