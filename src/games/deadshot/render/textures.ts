import * as THREE from 'three';
import type { MatId } from '../world';

// Procedural, grayscale-ish tiling textures. Box colors tint them through
// vertex colors, so one texture serves every color of a material.

type Draw = (ctx: CanvasRenderingContext2D, s: number, rand: () => number) => void;

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(ctx: CanvasRenderingContext2D, s: number, rand: () => number, amount: number, size = 1): void {
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let y = 0; y < s; y += size)
    for (let x = 0; x < s; x += size) {
      const n = (rand() - 0.5) * amount;
      for (let yy = 0; yy < size; yy++)
        for (let xx = 0; xx < size; xx++) {
          const i = ((y + yy) * s + (x + xx)) * 4;
          d[i] = clampByte(d[i] + n);
          d[i + 1] = clampByte(d[i + 1] + n);
          d[i + 2] = clampByte(d[i + 2] + n);
        }
    }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, s: number, rand: () => number, count: number, alpha: number, dark = true, rMax = 0.18): void {
  for (let i = 0; i < count; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const r = (0.03 + rand() * rMax) * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = dark ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${c},${alpha * rand()})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    // draw wrapped for tiling
    for (const ox of [-s, 0, s])
      for (const oy of [-s, 0, s]) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

const DRAW: Partial<Record<MatId, [number, Draw]>> = {
  concrete: [
    2.5,
    (c, s, r) => {
      c.fillStyle = '#d8d8d8';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 30, 0.12);
      blotches(c, s, r, 10, 0.1, false);
      noise(c, s, r, 26);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, 0, s, 2);
      c.fillRect(0, 0, 2, s);
    },
  ],
  metal: [
    2,
    (c, s, r) => {
      c.fillStyle = '#cfcfcf';
      c.fillRect(0, 0, s, s);
      const ribs = 8;
      for (let i = 0; i < ribs; i++) {
        const x = (i / ribs) * s;
        const g = c.createLinearGradient(x, 0, x + s / ribs, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.10)');
        g.addColorStop(0.5, 'rgba(0,0,0,0.10)');
        g.addColorStop(1, 'rgba(255,255,255,0.10)');
        c.fillStyle = g;
        c.fillRect(x, 0, s / ribs, s);
      }
      blotches(c, s, r, 14, 0.1);
      noise(c, s, r, 14);
    },
  ],
  wood: [
    2,
    (c, s, r) => {
      c.fillStyle = '#c9c9c9';
      c.fillRect(0, 0, s, s);
      const planks = 6;
      for (let i = 0; i < planks; i++) {
        const y = (i / planks) * s;
        c.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`;
        c.fillRect(0, y, s, s / planks);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(0, y, s, 2);
        for (let k = 0; k < 6; k++) {
          c.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
          c.beginPath();
          const yy = y + r() * (s / planks);
          c.moveTo(0, yy);
          c.bezierCurveTo(s * 0.3, yy + (r() - 0.5) * 6, s * 0.6, yy + (r() - 0.5) * 6, s, yy);
          c.stroke();
        }
      }
      noise(c, s, r, 16);
    },
  ],
  crate: [
    1.1,
    (c, s, r) => {
      c.fillStyle = '#c4c4c4';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 5; i++) {
        c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
        c.fillRect(0, (i / 5) * s, s, s / 5);
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(0, (i / 5) * s, s, 2);
      }
      const b = s * 0.11;
      c.fillStyle = '#a2a2a2';
      c.fillRect(0, 0, s, b);
      c.fillRect(0, s - b, s, b);
      c.fillRect(0, 0, b, s);
      c.fillRect(s - b, 0, b, s);
      c.save();
      c.translate(s / 2, s / 2);
      c.rotate(Math.PI / 4);
      c.fillRect(-s * 0.7, -b / 2, s * 1.4, b);
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = 2;
      c.strokeRect(b, b, s - 2 * b, s - 2 * b);
      noise(c, s, r, 18);
    },
  ],
  brick: [
    1.6,
    (c, s, r) => {
      c.fillStyle = '#8c8c8c';
      c.fillRect(0, 0, s, s);
      const rows = 8;
      const cols = 4;
      const bh = s / rows;
      const bw = s / cols;
      for (let y = 0; y < rows; y++)
        for (let x = -1; x < cols; x++) {
          const off = y % 2 ? bw / 2 : 0;
          const v = 170 + r() * 50;
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.fillRect(x * bw + off + 2, y * bh + 2, bw - 4, bh - 4);
        }
      noise(c, s, r, 22);
    },
  ],
  grass: [
    3,
    (c, s, r) => {
      c.fillStyle = '#c8c8c8';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 40, 0.18);
      blotches(c, s, r, 20, 0.12, false);
      for (let i = 0; i < 1400; i++) {
        const v = 120 + r() * 135;
        c.fillStyle = `rgba(${v},${v},${v},0.5)`;
        c.fillRect(r() * s, r() * s, 1, 2 + r() * 3);
      }
      noise(c, s, r, 20);
    },
  ],
  snow: [
    4,
    (c, s, r) => {
      c.fillStyle = '#f2f2f2';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 26, 0.06);
      noise(c, s, r, 10);
    },
  ],
  dirt: [
    3,
    (c, s, r) => {
      c.fillStyle = '#c0c0c0';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 50, 0.16);
      for (let i = 0; i < 300; i++) {
        const v = 90 + r() * 120;
        c.fillStyle = `rgba(${v},${v},${v},0.6)`;
        const z = 1 + r() * 3;
        c.fillRect(r() * s, r() * s, z, z);
      }
      noise(c, s, r, 26);
    },
  ],
  asphalt: [
    4,
    (c, s, r) => {
      c.fillStyle = '#bdbdbd';
      c.fillRect(0, 0, s, s);
      noise(c, s, r, 40);
      blotches(c, s, r, 24, 0.14);
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        let x = r() * s;
        let y = r() * s;
        c.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          x += (r() - 0.5) * 30;
          y += (r() - 0.5) * 30;
          c.lineTo(x, y);
        }
        c.stroke();
      }
    },
  ],
  plaster: [
    2,
    (c, s, r) => {
      c.fillStyle = '#e0e0e0';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 20, 0.07);
      noise(c, s, r, 12);
    },
  ],
  rock: [
    2.5,
    (c, s, r) => {
      c.fillStyle = '#c6c6c6';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 40, 0.22, true, 0.25);
      blotches(c, s, r, 20, 0.15, false, 0.2);
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        let x = r() * s;
        let y = r() * s;
        c.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 40;
          y += r() * 30;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      noise(c, s, r, 24);
    },
  ],
  bark: [
    1.5,
    (c, s, r) => {
      c.fillStyle = '#b8b8b8';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.2})`;
        c.fillRect(r() * s, 0, 1 + r() * 4, s);
      }
      noise(c, s, r, 22);
    },
  ],
  leaves: [
    2,
    (c, s, r) => {
      c.fillStyle = '#c8c8c8';
      c.fillRect(0, 0, s, s);
      blotches(c, s, r, 60, 0.25, true, 0.1);
      blotches(c, s, r, 30, 0.18, false, 0.08);
      noise(c, s, r, 30);
    },
  ],
  stripe: [
    1,
    (c, s) => {
      c.fillStyle = '#ffd23c';
      c.fillRect(0, 0, s, s);
      c.fillStyle = '#222';
      for (let i = -2; i < 4; i++) {
        c.beginPath();
        c.moveTo(i * s * 0.5, 0);
        c.lineTo(i * s * 0.5 + s * 0.25, 0);
        c.lineTo(i * s * 0.5 + s * 0.25 + s, s);
        c.lineTo(i * s * 0.5 + s, s);
        c.fill();
      }
    },
  ],
};

const cache = new Map<string, { tex: THREE.Texture | null; scale: number }>();

export function materialTexture(mat: MatId, anisotropy: number): { tex: THREE.Texture | null; scale: number } {
  const key = `${mat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = DRAW[mat];
  if (!def) {
    const r = { tex: null, scale: 1 };
    cache.set(key, r);
    return r;
  }
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  def[1](ctx, s, seeded(mat.length * 977 + mat.charCodeAt(0)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const r = { tex, scale: def[0] };
  cache.set(key, r);
  return r;
}

export function disposeTextures(): void {
  for (const { tex } of cache.values()) tex?.dispose();
  cache.clear();
}

/** Soft round sprite used for particles, flashes and glows. */
export function glowTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Star-shaped muzzle flash. */
export function flashTexture(): THREE.Texture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const c = canvas.getContext('2d')!;
  c.translate(s / 2, s / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.2, 'rgba(255,220,120,0.95)');
  g.addColorStop(0.6, 'rgba(255,140,40,0.35)');
  g.addColorStop(1, 'rgba(255,100,0,0)');
  c.fillStyle = g;
  for (let i = 0; i < 7; i++) {
    c.rotate((Math.PI * 2) / 7);
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(s * 0.48, 0);
    c.lineTo(0, 6);
    c.fill();
  }
  c.beginPath();
  c.arc(0, 0, s * 0.2, 0, Math.PI * 2);
  c.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bullet hole decal. */
export function decalTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(10,10,10,0.95)');
  g.addColorStop(0.25, 'rgba(25,22,20,0.85)');
  g.addColorStop(0.5, 'rgba(40,36,32,0.35)');
  g.addColorStop(1, 'rgba(40,36,32,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
