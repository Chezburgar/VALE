import * as THREE from 'three';
import type { DogTag, Flag, Hardpoint } from '../match';
import { decalTexture, flashTexture, glowTexture } from './textures';

// Short-lived combat effects plus objective markers, all pooled.

interface Tracer {
  mesh: THREE.Mesh;
  sx: number;
  sy: number;
  sz: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  t: number;
  active: boolean;
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  grow: number;
  vy: number;
  active: boolean;
}

const TRACER_SPEED = 420;
const SPARKS = 360;

export class Effects {
  group = new THREE.Group();
  private tracers: Tracer[] = [];
  private tracerIdx = 0;
  private puffs: Puff[] = [];
  private puffIdx = 0;
  private flashes: Puff[] = [];
  private flashIdx = 0;
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private sparkPos = new Float32Array(SPARKS * 3);
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkCol = new Float32Array(SPARKS * 3);
  private sparkBase = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private sparkIdx = 0;
  private sparks: THREE.Points;
  private tagMeshes = new Map<number, THREE.Group>();
  private tagGeo = new THREE.BoxGeometry(0.14, 0.2, 0.025);
  private tagMatFriendly = new THREE.MeshBasicMaterial({ color: 0x2ef0c8 });
  private tagMatEnemy = new THREE.MeshBasicMaterial({ color: 0xff4d5e });
  private flagVis: { ring: THREE.Mesh; pole: THREE.Group; cloth: THREE.Mesh; sprite: THREE.Sprite; tex: THREE.CanvasTexture; key: string }[] = [];
  private hpVis: { ring: THREE.Mesh; wall: THREE.Mesh; sprite: THREE.Sprite; tex: THREE.CanvasTexture; key: string } | null = null;
  private glow = glowTexture();
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  /** Objective markers belong to one match; clear() releases them. */
  private matchDisposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    tracerGeo.translate(0, 0, 0.5);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, sx: 0, sy: 0, sz: 0, dx: 0, dy: 0, dz: 0, len: 0, t: 0, active: false });
    }
    for (let i = 0; i < 40; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x9a9184, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, life: 0, max: 1, grow: 1, vy: 0, active: false });
      this.disposables.push(sprite.material);
    }
    const ft = flashTexture();
    for (let i = 0; i < 16; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false;
      this.group.add(sprite);
      this.flashes.push({ sprite, life: 0, max: 0.05, grow: 0, vy: 0, active: false });
      this.disposables.push(sprite.material);
    }
    const decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      m.matrixAutoUpdate = true;
      this.group.add(m);
      this.decals.push(m);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    const sm = new THREE.PointsMaterial({ size: 0.07, map: this.glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.Points(sg, sm);
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.disposables.push(tracerGeo, tracerMat, decalGeo, decalMat, sg, sm, this.tagGeo, this.tagMatEnemy, this.tagMatFriendly, this.glow, ft);
  }

  tracer(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): void {
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.5) return;
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    Object.assign(t, { sx, sy, sz, dx: dx / len, dy: dy / len, dz: dz / len, len, t: 0, active: true });
    t.mesh.visible = true;
  }

  muzzleFlash(p: THREE.Vector3, big: boolean): void {
    const f = this.flashes[this.flashIdx++ % this.flashes.length];
    f.sprite.position.copy(p);
    const s = big ? 0.7 : 0.45;
    f.sprite.scale.set(s, s, s);
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.life = 0;
    f.max = 0.05;
    f.active = true;
    f.sprite.visible = true;
  }

  /** `decal` is false for hits on invisible prop colliders, where a bullet hole would float in the air. */
  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, kind: 'world' | 'flesh', decal = true): void {
    if (kind === 'world') {
      if (decal) {
        const d = this.decals[this.decalIdx++ % this.decals.length];
        d.position.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01);
        d.lookAt(x + nx, y + ny, z + nz);
        d.rotation.z = Math.random() * Math.PI;
        d.visible = true;
      }
      this.spawnSparks(x, y, z, nx, ny, nz, 6, [1, 0.8, 0.45], 5);
      this.puff(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, 0x9a9184, 0.25, 0.9, 0.5);
    } else {
      this.spawnSparks(x, y, z, 0, 0.3, 0, 10, [0.75, 0.05, 0.05], 3);
      this.puff(x, y, z, 0xa01818, 0.25, 0.7, 0.3);
    }
  }

  private puff(x: number, y: number, z: number, color: number, size: number, grow: number, life: number): void {
    const p = this.puffs[this.puffIdx++ % this.puffs.length];
    p.sprite.position.set(x, y, z);
    p.sprite.material.color.setHex(color);
    p.sprite.material.opacity = 0.7;
    p.sprite.scale.setScalar(size);
    p.grow = grow;
    p.life = 0;
    p.max = life;
    p.vy = 0.3;
    p.active = true;
    p.sprite.visible = true;
  }

  private spawnSparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, n: number, col: number[], speed: number): void {
    for (let i = 0; i < n; i++) {
      const k = this.sparkIdx++ % SPARKS;
      this.sparkPos[k * 3] = x;
      this.sparkPos[k * 3 + 1] = y;
      this.sparkPos[k * 3 + 2] = z;
      this.sparkVel[k * 3] = (nx + (Math.random() - 0.5) * 1.4) * speed * Math.random();
      this.sparkVel[k * 3 + 1] = (ny + Math.random() * 0.8) * speed * Math.random();
      this.sparkVel[k * 3 + 2] = (nz + (Math.random() - 0.5) * 1.4) * speed * Math.random();
      this.sparkBase[k * 3] = col[0];
      this.sparkBase[k * 3 + 1] = col[1];
      this.sparkBase[k * 3 + 2] = col[2];
      this.sparkLife[k] = 0.25 + Math.random() * 0.25;
    }
  }

  update(dt: number, cam?: THREE.Vector3): void {
    this.time += dt;
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.t += dt;
      // The tail trails the unclamped front, so it reaches the impact point and
      // the tracer retires once the whole streak has arrived.
      const front = t.t * TRACER_SPEED;
      const head = Math.min(t.len, front);
      const tail = Math.min(t.len, Math.max(0, front - Math.min(7, t.len * 0.5)));
      if (tail >= t.len - 0.01) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      if (cam) {
        // A round flying past the camera would fill the screen; skip that bit.
        const hx = t.sx + t.dx * head - cam.x;
        const hy = t.sy + t.dy * head - cam.y;
        const hz = t.sz + t.dz * head - cam.z;
        if (hx * hx + hy * hy + hz * hz < 9) {
          t.mesh.visible = false;
          continue;
        }
        t.mesh.visible = true;
      }
      const l = Math.max(0.01, head - tail);
      t.mesh.position.set(t.sx + t.dx * head, t.sy + t.dy * head, t.sz + t.dz * head);
      t.mesh.lookAt(t.sx, t.sy, t.sz);
      t.mesh.scale.set(0.018, 0.018, l);
    }
    for (const p of [...this.puffs, ...this.flashes]) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const f = p.life / p.max;
      if (p.grow > 0) {
        p.sprite.scale.multiplyScalar(1 + p.grow * dt * 3);
        p.sprite.material.opacity = 0.7 * (1 - f);
        p.sprite.position.y += p.vy * dt;
      }
    }
    let any = false;
    for (let k = 0; k < SPARKS; k++) {
      if (this.sparkLife[k] <= 0) {
        this.sparkCol[k * 3] = this.sparkCol[k * 3 + 1] = this.sparkCol[k * 3 + 2] = 0;
        continue;
      }
      any = true;
      this.sparkLife[k] -= dt;
      this.sparkVel[k * 3 + 1] -= 12 * dt;
      this.sparkPos[k * 3] += this.sparkVel[k * 3] * dt;
      this.sparkPos[k * 3 + 1] += this.sparkVel[k * 3 + 1] * dt;
      this.sparkPos[k * 3 + 2] += this.sparkVel[k * 3 + 2] * dt;
      const a = Math.max(0, this.sparkLife[k] * 3);
      this.sparkCol[k * 3] = this.sparkBase[k * 3] * a;
      this.sparkCol[k * 3 + 1] = this.sparkBase[k * 3 + 1] * a;
      this.sparkCol[k * 3 + 2] = this.sparkBase[k * 3 + 2] * a;
    }
    // A spark's last live frame already writes black, so idle frames skip the upload.
    if (any) {
      this.sparks.geometry.getAttribute('position').needsUpdate = true;
      this.sparks.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Objectives

  syncTags(tags: DogTag[], localTeam: 0 | 1): void {
    const live = new Set(tags.map((t) => t.id));
    for (const [id, g] of this.tagMeshes) {
      if (!live.has(id)) {
        this.removeTag(g);
        this.tagMeshes.delete(id);
      }
    }
    for (const t of tags) {
      let g = this.tagMeshes.get(t.id);
      if (!g) {
        g = new THREE.Group();
        const friendly = t.team === localTeam;
        const tag = new THREE.Mesh(this.tagGeo, friendly ? this.tagMatFriendly : this.tagMatEnemy);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: friendly ? 0x2ef0c8 : 0xff4d5e, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(0.9);
        g.add(tag, glow);
        g.position.set(t.x, t.y, t.z);
        this.group.add(g);
        this.tagMeshes.set(t.id, g);
      }
      g.rotation.y = this.time * 2.5;
      g.position.y = t.y + Math.sin(this.time * 3 + t.id) * 0.08;
    }
  }

  private removeTag(g: THREE.Group): void {
    g.removeFromParent();
    for (const o of g.children) if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.dispose();
  }

  private markerSprite(): { sprite: THREE.Sprite; tex: THREE.CanvasTexture } {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 20;
    this.matchDisposables.push(tex, sprite.material);
    return { sprite, tex };
  }

  private drawMarker(tex: THREE.CanvasTexture, label: string, color: string, progress: number): void {
    const c = tex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(64, 64, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(64, 64, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, progress)));
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(64, 64, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 52px Rajdhani, Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(label, 64, 68);
    tex.needsUpdate = true;
  }

  syncFlags(flags: Flag[], localTeam: 0 | 1, radius: number): void {
    if (this.flagVis.length === 0 && flags.length) {
      for (const f of flags) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(f.pos.x, f.pos.y + 0.05, f.pos.z);
        const pole = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0xc9ced1 }));
        stick.position.y = 1.6;
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        cloth.position.set(0.47, 2.85, 0);
        pole.add(stick, cloth);
        pole.position.set(f.pos.x, f.pos.y, f.pos.z);
        // Keep the pole off the fountain/obstacles: offset a little.
        const { sprite, tex } = this.markerSprite();
        sprite.scale.setScalar(1.1);
        sprite.position.set(f.pos.x, f.pos.y + 4.2, f.pos.z);
        this.group.add(ring, pole, sprite);
        this.flagVis.push({ ring, pole, cloth, sprite, tex, key: '' });
        this.matchDisposables.push(ring.geometry, ring.material as THREE.Material, stick.geometry, stick.material as THREE.Material, cloth.geometry, cloth.material as THREE.Material);
      }
    }
    flags.forEach((f, i) => {
      const v = this.flagVis[i];
      const owner = f.owner === -1 ? 'n' : f.owner === localTeam ? 'f' : 'e';
      const color = owner === 'n' ? '#ffffff' : owner === 'f' ? '#2ef0c8' : '#ff4d5e';
      (v.ring.material as THREE.MeshBasicMaterial).color.set(f.contested ? '#ffcc33' : color);
      (v.cloth.material as THREE.MeshLambertMaterial).color.set(color);
      v.cloth.rotation.y = Math.sin(this.time * 2 + i) * 0.3;
      const prog = Math.abs(f.progress);
      const key = `${owner}:${prog.toFixed(2)}:${f.contested}`;
      if (key !== v.key) {
        v.key = key;
        const progColor = f.progress === 0 ? color : (f.progress > 0 ? 0 : 1) === localTeam ? '#2ef0c8' : '#ff4d5e';
        this.drawMarker(v.tex, f.label, f.owner === -1 ? progColor : color, f.owner === -1 ? prog : 1);
      }
    });
  }

  syncHardpoint(hp: Hardpoint | null, localTeam: 0 | 1, radius: number): void {
    if (!hp) return;
    if (!this.hpVis) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.2, radius, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 2.2, 56, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const { sprite, tex } = this.markerSprite();
      sprite.scale.setScalar(1.2);
      this.group.add(ring, wall, sprite);
      this.hpVis = { ring, wall, sprite, tex, key: '' };
      this.matchDisposables.push(ring.geometry, ring.material as THREE.Material, wall.geometry, wall.material as THREE.Material);
    }
    const v = this.hpVis;
    v.ring.position.set(hp.pos.x, hp.pos.y + 0.06, hp.pos.z);
    v.wall.position.set(hp.pos.x, hp.pos.y + 1.1, hp.pos.z);
    v.sprite.position.set(hp.pos.x, hp.pos.y + 4.4, hp.pos.z);
    const color = hp.contested ? '#ffcc33' : hp.holder === -1 ? '#ffffff' : hp.holder === localTeam ? '#2ef0c8' : '#ff4d5e';
    (v.ring.material as THREE.MeshBasicMaterial).color.set(color);
    (v.wall.material as THREE.MeshBasicMaterial).color.set(color);
    (v.wall.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(this.time * 3) * 0.03;
    if (v.key !== color) {
      v.key = color;
      this.drawMarker(v.tex, 'HP', color, 1);
    }
  }

  /** Removes everything a match left behind (bullet holes, markers, tags, in-flight effects). */
  clear(): void {
    for (const t of this.tracers) {
      t.active = false;
      t.mesh.visible = false;
    }
    for (const p of [...this.puffs, ...this.flashes]) {
      p.active = false;
      p.sprite.visible = false;
    }
    for (const d of this.decals) d.visible = false;
    this.decalIdx = 0;
    this.sparkLife.fill(0);
    this.sparkCol.fill(0);
    this.sparks.geometry.getAttribute('color').needsUpdate = true;
    for (const g of this.tagMeshes.values()) this.removeTag(g);
    this.tagMeshes.clear();
    for (const v of this.flagVis) {
      v.ring.removeFromParent();
      v.pole.removeFromParent();
      v.sprite.removeFromParent();
    }
    this.flagVis = [];
    if (this.hpVis) {
      this.hpVis.ring.removeFromParent();
      this.hpVis.wall.removeFromParent();
      this.hpVis.sprite.removeFromParent();
      this.hpVis = null;
    }
    for (const d of this.matchDisposables) d.dispose();
    this.matchDisposables = [];
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
