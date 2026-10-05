import * as THREE from 'three';
import type { DecalId, PanelId, RibbonId } from '../maps/builder';
import type { MatId } from '../world';

// Procedural, mostly grayscale tiling textures. Box colors tint them through
// vertex colors, so one texture serves every color of a material. Atlases hold
// the colored decals, ribbons (paths/lines), panels (windows, doors) and signs.

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

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Per-pixel (or per-block) gray noise. */
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

/** Tileable smooth value noise multiplied into the canvas (cells per side, ±amount). */
function cloudy(ctx: CanvasRenderingContext2D, s: number, rand: () => number, cells: number, amount: number): void {
  const g = new Float32Array(cells * cells).map(() => rand() * 2 - 1);
  const at = (x: number, y: number) => g[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  const k = cells / s;
  for (let y = 0; y < s; y++) {
    const fy = y * k;
    const iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < s; x++) {
      const fx = x * k;
      const ix = Math.floor(fx);
      let tx = fx - ix;
      tx = tx * tx * (3 - 2 * tx);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      const m = 1 + (a + (b - a) * ty) * amount;
      const i = (y * s + x) * 4;
      d[i] = clampByte(d[i] * m);
      d[i + 1] = clampByte(d[i + 1] * m);
      d[i + 2] = clampByte(d[i + 2] * m);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Draws `fn` at the 9 wrap offsets so features tile seamlessly. */
function wrap(s: number, fn: (ox: number, oy: number) => void): void {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) fn(ox, oy);
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
    wrap(s, (ox, oy) => ctx.fillRect(x - r + ox, y - r + oy, r * 2, r * 2));
  }
}

/** Small dots (pits, grains, pebbles). */
function speckle(ctx: CanvasRenderingContext2D, s: number, rand: () => number, count: number, v0: number, v1: number, r0: number, r1: number, alpha = 1): void {
  for (let i = 0; i < count; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const r = r0 + rand() * (r1 - r0);
    const v = Math.round(v0 + rand() * (v1 - v0));
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Random-walk cracks. */
function cracks(ctx: CanvasRenderingContext2D, s: number, rand: () => number, count: number, steps: number, stepLen: number, alpha: number, width = 1): void {
  ctx.lineWidth = width;
  for (let i = 0; i < count; i++) {
    let x = rand() * s;
    let y = rand() * s;
    let a = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * stepLen;
      y += Math.sin(a) * stepLen;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const DRAW: Partial<Record<MatId, [number, Draw, number?]>> = {
  concrete: [
    3,
    (c, s, r) => {
      c.fillStyle = '#d2d2d0';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 4, 0.1);
      cloudy(c, s, r, 12, 0.06);
      blotches(c, s, r, 26, 0.1);
      blotches(c, s, r, 12, 0.1, false);
      speckle(c, s, r, 900, 90, 150, 0.4, 1.3, 0.35);
      speckle(c, s, r, 300, 230, 255, 0.4, 1.0, 0.4);
      noise(c, s, r, 18);
      cracks(c, s, r, 3, 14, 7, 0.16);
      // formwork seams + tie holes
      c.fillStyle = 'rgba(0,0,0,0.16)';
      c.fillRect(0, 0, s, 2);
      c.fillRect(0, 0, 2, s);
      c.fillStyle = 'rgba(0,0,0,0.07)';
      c.fillRect(0, s / 2, s, 1);
      for (const [x, y] of [[s / 4, s / 4], [(s * 3) / 4, s / 4], [s / 4, (s * 3) / 4], [(s * 3) / 4, (s * 3) / 4]]) {
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.beginPath();
        c.arc(x, y, 3.5, 0, Math.PI * 2);
        c.fill();
      }
    },
  ],
  asphalt: [
    5,
    (c, s, r) => {
      c.fillStyle = '#b4b4b4';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 3, 0.1);
      cloudy(c, s, r, 9, 0.07);
      speckle(c, s, r, 5200, 60, 120, 0.5, 1.4, 0.55);
      speckle(c, s, r, 2600, 190, 240, 0.4, 1.1, 0.5);
      noise(c, s, r, 30);
      blotches(c, s, r, 14, 0.1);
      blotches(c, s, r, 8, 0.06, false);
      cracks(c, s, r, 4, 16, 8, 0.22);
      // tar-sealed crack lines
      cracks(c, s, r, 2, 30, 9, 0.12, 3);
    },
  ],
  metal: [
    2.5,
    (c, s, r) => {
      // corrugated siding: smooth vertical ribs
      const img = c.createImageData(s, s);
      const ribs = 10;
      for (let x = 0; x < s; x++) {
        const t = (x / s) * ribs * Math.PI * 2;
        const v = 196 + Math.sin(t) * 26 + Math.sin(t * 2) * 6;
        for (let y = 0; y < s; y++) {
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      cloudy(c, s, r, 3, 0.08);
      blotches(c, s, r, 16, 0.1);
      // drip streaks
      for (let i = 0; i < 26; i++) {
        const x = r() * s;
        const y = r() * s;
        const h = 30 + r() * 140;
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, `rgba(60,40,25,${0.08 + r() * 0.12})`);
        g.addColorStop(1, 'rgba(60,40,25,0)');
        c.fillStyle = g;
        wrap(s, (ox, oy) => c.fillRect(x + ox, y + oy, 1 + r() * 3, h));
      }
      noise(c, s, r, 10);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, 0, s, 2);
      for (let x = s / 20; x < s; x += s / 5) {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(x - 1.5, 5, 3, 3);
        c.fillRect(x - 1.5, s / 2, 3, 3);
      }
    },
  ],
  steel: [
    2,
    (c, s, r) => {
      c.fillStyle = '#c8c8c8';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 4, 0.07);
      // plates with seams and bolts
      const n = 2;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const x = (i * s) / n;
          const y = (j * s) / n;
          c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.05})`;
          c.fillRect(x, y, s / n, s / n);
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(x, y, s / n, 2);
          c.fillRect(x, y, 2, s / n);
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fillRect(x, y + 2, s / n, 1);
          for (let k = 0; k < 4; k++) {
            const bx = x + 10 + (k * (s / n - 20)) / 3;
            for (const by of [y + 9, y + s / n - 9]) {
              c.fillStyle = 'rgba(0,0,0,0.3)';
              c.beginPath();
              c.arc(bx + 1, by + 1, 3.2, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = 'rgba(255,255,255,0.35)';
              c.beginPath();
              c.arc(bx, by, 2.6, 0, Math.PI * 2);
              c.fill();
            }
          }
        }
      // scuffs and scratches
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 60; i++) {
        const x = r() * s;
        const y = r() * s;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 12);
        c.stroke();
      }
      blotches(c, s, r, 12, 0.12);
      noise(c, s, r, 10);
    },
  ],
  wood: [
    2.4,
    (c, s, r) => {
      c.fillStyle = '#c4c4c4';
      c.fillRect(0, 0, s, s);
      const planks = 8;
      const ph = s / planks;
      for (let i = 0; i < planks; i++) {
        const y = i * ph;
        const v = 150 + r() * 70;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(0, y, s, ph);
        // grain
        for (let k = 0; k < 9; k++) {
          c.strokeStyle = `rgba(0,0,0,${0.04 + r() * 0.09})`;
          c.lineWidth = 0.6 + r() * 1.2;
          const yy = y + 2 + r() * (ph - 4);
          const amp = 1 + r() * 2.5;
          const f = 2 + r() * 4;
          const ph0 = r() * 6;
          c.beginPath();
          for (let x = 0; x <= s; x += 8) {
            const py = yy + Math.sin((x / s) * Math.PI * 2 * Math.round(f) + ph0) * amp;
            if (x === 0) c.moveTo(x, py);
            else c.lineTo(x, py);
          }
          c.stroke();
        }
        // knot
        if (r() < 0.5) {
          const kx = r() * s;
          const ky = y + ph / 2;
          c.fillStyle = 'rgba(40,25,10,0.35)';
          c.beginPath();
          c.ellipse(kx, ky, 4 + r() * 4, 2.5 + r() * 2, 0, 0, Math.PI * 2);
          c.fill();
        }
        // butt joint + nails
        const jx = r() * s;
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.fillRect(jx, y, 2, ph);
        c.fillStyle = 'rgba(0,0,0,0.45)';
        for (const nx of [jx - 6, jx + 8]) for (const ny of [y + ph * 0.3, y + ph * 0.7]) c.fillRect(nx, ny, 2.5, 2.5);
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.fillRect(0, y, s, 2);
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(0, y + 2, s, 1);
      }
      noise(c, s, r, 14);
    },
  ],
  crate: [
    1.1,
    (c, s, r) => {
      c.fillStyle = '#c4c4c4';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 6; i++) {
        const v = 160 + r() * 60;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(0, (i / 6) * s, s, s / 6);
        for (let k = 0; k < 5; k++) {
          c.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`;
          const yy = (i / 6) * s + r() * (s / 6);
          c.beginPath();
          c.moveTo(0, yy);
          c.bezierCurveTo(s * 0.3, yy + (r() - 0.5) * 6, s * 0.6, yy + (r() - 0.5) * 6, s, yy);
          c.stroke();
        }
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(0, (i / 6) * s, s, 2);
      }
      const b = s * 0.1;
      c.fillStyle = '#a8a8a8';
      c.fillRect(0, 0, s, b);
      c.fillRect(0, s - b, s, b);
      c.fillRect(0, 0, b, s);
      c.fillRect(s - b, 0, b, s);
      c.save();
      c.translate(s / 2, s / 2);
      c.rotate(Math.PI / 4);
      c.fillRect(-s * 0.68, -b / 2, s * 1.36, b);
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 2;
      c.strokeRect(-s * 0.68, -b / 2, s * 1.36, b);
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 3;
      c.strokeRect(b, b, s - 2 * b, s - 2 * b);
      c.strokeStyle = 'rgba(0,0,0,0.5)';
      c.strokeRect(1, 1, s - 2, s - 2);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      for (const [x, y] of [[b / 2, b / 2], [s - b / 2, b / 2], [b / 2, s - b / 2], [s - b / 2, s - b / 2]]) c.fillRect(x - 3, y - 3, 6, 6);
      noise(c, s, r, 16);
    },
  ],
  brick: [
    2.2,
    (c, s, r) => {
      c.fillStyle = '#a9a7a2';
      c.fillRect(0, 0, s, s);
      noise(c, s, r, 30);
      const rows = 16;
      const cols = 6;
      const bh = s / rows;
      const bw = s / cols;
      for (let y = 0; y < rows; y++)
        for (let x = -1; x < cols; x++) {
          const off = y % 2 ? bw / 2 : 0;
          const v = 140 + r() * 70;
          const bx = x * bw + off + 2;
          const by = y * bh + 2;
          c.fillStyle = `rgb(${v},${v * 0.98},${v * 0.96})`;
          c.fillRect(bx, by, bw - 4, bh - 4);
          c.fillStyle = 'rgba(255,255,255,0.12)';
          c.fillRect(bx, by, bw - 4, 1.5);
          c.fillStyle = 'rgba(0,0,0,0.18)';
          c.fillRect(bx, by + bh - 5.5, bw - 4, 1.5);
          if (r() < 0.3) {
            c.fillStyle = 'rgba(0,0,0,0.12)';
            c.fillRect(bx + r() * bw * 0.6, by + r() * bh * 0.5, 4 + r() * 6, 2 + r() * 3);
          }
        }
      cloudy(c, s, r, 5, 0.08);
      blotches(c, s, r, 10, 0.12);
      noise(c, s, r, 16);
    },
  ],
  roof: [
    2,
    (c, s, r) => {
      c.fillStyle = '#8a8a8a';
      c.fillRect(0, 0, s, s);
      const rows = 10;
      const rh = s / rows;
      for (let y = 0; y < rows; y++) {
        let x = y % 2 ? -rh * 0.6 : 0;
        while (x < s) {
          const w = rh * (1.1 + r() * 0.7);
          const v = 140 + r() * 70;
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.fillRect(x + 1.5, y * rh, w - 3, rh - 2);
          const g = c.createLinearGradient(0, y * rh, 0, (y + 1) * rh);
          g.addColorStop(0, 'rgba(0,0,0,0.25)');
          g.addColorStop(0.25, 'rgba(0,0,0,0)');
          g.addColorStop(0.85, 'rgba(255,255,255,0.06)');
          g.addColorStop(1, 'rgba(0,0,0,0.35)');
          c.fillStyle = g;
          c.fillRect(x + 1.5, y * rh, w - 3, rh - 2);
          x += w;
        }
      }
      blotches(c, s, r, 16, 0.12);
      noise(c, s, r, 20);
    },
  ],
  tile: [
    2,
    (c, s, r) => {
      c.fillStyle = '#8f8f8f';
      c.fillRect(0, 0, s, s);
      const n = 4;
      const t = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = 190 + r() * 35;
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
          c.fillStyle = 'rgba(255,255,255,0.15)';
          c.fillRect(i * t + 3, j * t + 3, t - 6, 2);
        }
      blotches(c, s, r, 16, 0.1);
      noise(c, s, r, 12);
    },
  ],
  grass: [
    3.5,
    (c, s, r) => {
      c.fillStyle = '#b8b8b8';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 4, 0.14);
      blotches(c, s, r, 40, 0.16);
      blotches(c, s, r, 20, 0.1, false);
      for (let i = 0; i < 9000; i++) {
        const v = 100 + r() * 155;
        c.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`;
        c.lineWidth = 1 + r();
        const x = r() * s;
        const y = r() * s;
        const len = 3 + r() * 7;
        const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        c.stroke();
      }
      noise(c, s, r, 16);
    },
  ],
  snow: [
    5,
    (c, s, r) => {
      c.fillStyle = '#ececec';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 4, 0.05);
      cloudy(c, s, r, 11, 0.03);
      // wind ripples
      for (let i = 0; i < 26; i++) {
        const y = r() * s;
        c.strokeStyle = `rgba(0,0,0,${0.025 + r() * 0.03})`;
        c.lineWidth = 2 + r() * 3;
        c.beginPath();
        for (let x = -20; x <= s + 20; x += 16) {
          const py = y + Math.sin(x * 0.03 + i) * 6;
          if (x === -20) c.moveTo(x, py);
          else c.lineTo(x, py);
        }
        c.stroke();
      }
      speckle(c, s, r, 600, 255, 255, 0.4, 1.0, 0.8);
      noise(c, s, r, 6);
    },
  ],
  dirt: [
    3,
    (c, s, r) => {
      c.fillStyle = '#bcbcbc';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 4, 0.14);
      cloudy(c, s, r, 12, 0.08);
      blotches(c, s, r, 40, 0.14);
      speckle(c, s, r, 1400, 80, 140, 0.6, 1.8, 0.5);
      for (let i = 0; i < 160; i++) {
        const x = r() * s;
        const y = r() * s;
        const rr = 1.5 + r() * 3.5;
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.beginPath();
        c.ellipse(x + 1, y + 1, rr, rr * 0.8, 0, 0, Math.PI * 2);
        c.fill();
        const v = 170 + r() * 70;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.beginPath();
        c.ellipse(x, y, rr, rr * 0.8, 0, 0, Math.PI * 2);
        c.fill();
      }
      noise(c, s, r, 22);
    },
  ],
  gravel: [
    2.5,
    (c, s, r) => {
      c.fillStyle = '#6e6e6e';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const x = r() * s;
        const y = r() * s;
        const rr = 2 + r() * 5;
        const v = 120 + r() * 120;
        const rot = r() * 3;
        wrap(s, (ox, oy) => {
          if (x + ox < -8 || x + ox > s + 8 || y + oy < -8 || y + oy > s + 8) return;
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.beginPath();
          c.ellipse(x + ox + 1, y + oy + 1.5, rr, rr * 0.7, rot, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.beginPath();
          c.ellipse(x + ox, y + oy, rr, rr * 0.7, rot, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.beginPath();
          c.ellipse(x + ox - rr * 0.25, y + oy - rr * 0.25, rr * 0.4, rr * 0.28, rot, 0, Math.PI * 2);
          c.fill();
        });
      }
      noise(c, s, r, 14);
    },
  ],
  sand: [
    4,
    (c, s, r) => {
      c.fillStyle = '#d0d0d0';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 3, 0.08);
      for (let i = 0; i < 30; i++) {
        const y = r() * s;
        c.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
        c.lineWidth = 2 + r() * 2;
        c.beginPath();
        for (let x = -20; x <= s + 20; x += 12) {
          const py = y + Math.sin(x * 0.04 + i * 1.7) * 5;
          if (x === -20) c.moveTo(x, py);
          else c.lineTo(x, py);
        }
        c.stroke();
      }
      speckle(c, s, r, 3000, 120, 250, 0.3, 0.9, 0.5);
      noise(c, s, r, 16);
    },
  ],
  plaster: [
    2,
    (c, s, r) => {
      c.fillStyle = '#dedede';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 5, 0.06);
      blotches(c, s, r, 20, 0.07);
      speckle(c, s, r, 600, 150, 200, 0.4, 1.0, 0.3);
      noise(c, s, r, 10);
    },
  ],
  rock: [
    3,
    (c, s, r) => {
      c.fillStyle = '#c0c0c0';
      c.fillRect(0, 0, s, s);
      cloudy(c, s, r, 3, 0.14);
      cloudy(c, s, r, 9, 0.1);
      // strata
      for (let i = 0; i < 14; i++) {
        const y = r() * s;
        c.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
        c.lineWidth = 1 + r() * 3;
        c.beginPath();
        for (let x = -20; x <= s + 20; x += 20) {
          const py = y + Math.sin(x * 0.02 + i) * 8 + (r() - 0.5) * 4;
          if (x === -20) c.moveTo(x, py);
          else c.lineTo(x, py);
        }
        c.stroke();
      }
      blotches(c, s, r, 30, 0.18, true, 0.2);
      blotches(c, s, r, 16, 0.12, false, 0.15);
      cracks(c, s, r, 10, 8, 12, 0.3, 1.2);
      speckle(c, s, r, 1200, 60, 230, 0.4, 1.2, 0.35);
      noise(c, s, r, 18);
    },
  ],
  bark: [
    1.6,
    (c, s, r) => {
      c.fillStyle = '#b4b4b4';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) {
        const x0 = r() * s;
        c.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.25})`;
        c.lineWidth = 1.5 + r() * 4;
        c.beginPath();
        let x = x0;
        for (let y = -10; y <= s + 10; y += 16) {
          x += (r() - 0.5) * 6;
          if (y === -10) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`;
        c.fillRect(r() * s, r() * s, 2 + r() * 5, 10 + r() * 30);
      }
      cloudy(c, s, r, 4, 0.1);
      noise(c, s, r, 18);
    },
  ],
  leaves: [
    2,
    (c, s, r) => {
      c.fillStyle = '#a8a8a8';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 2200; i++) {
        const v = 90 + r() * 165;
        c.fillStyle = `rgba(${v},${v},${v},0.85)`;
        const x = r() * s;
        const y = r() * s;
        const a = r() * Math.PI;
        wrap(s, (ox, oy) => {
          if (x + ox < -8 || x + ox > s + 8 || y + oy < -8 || y + oy > s + 8) return;
          c.beginPath();
          c.ellipse(x + ox, y + oy, 5 + r() * 3, 2 + r() * 1.5, a, 0, Math.PI * 2);
          c.fill();
        });
      }
      cloudy(c, s, r, 4, 0.12);
      noise(c, s, r, 16);
    },
  ],
  stripe: [
    1,
    (c, s, r) => {
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
      blotches(c, s, r, 14, 0.18);
      noise(c, s, r, 16);
    },
    256,
  ],
};

export interface MatTexture {
  tex: THREE.Texture | null;
  /** World meters covered by one texture repeat. */
  scale: number;
  /** Mean linear luminance (used to normalise the macro-variation sample). */
  avg: number;
}

const cache = new Map<string, MatTexture>();

function finishTexture(canvas: HTMLCanvasElement, anisotropy: number, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function materialTexture(mat: MatId, anisotropy: number): MatTexture {
  const hit = cache.get(mat);
  if (hit) return hit;
  const def = DRAW[mat];
  if (!def) {
    const r = { tex: null, scale: 1, avg: 1 };
    cache.set(mat, r);
    return r;
  }
  const s = def[2] ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  def[1](ctx, s, seeded(mat.length * 977 + mat.charCodeAt(0) * 13 + mat.charCodeAt(1)));
  const px = ctx.getImageData(0, 0, s, s).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4 * 97) {
    sum += Math.pow(px[i + 1] / 255, 2.2);
    n++;
  }
  const r = { tex: finishTexture(canvas, anisotropy), scale: def[0], avg: Math.max(0.05, sum / n) };
  cache.set(mat, r);
  return r;
}

// ---------------------------------------------------------------------------
// Atlases

/** Decal atlas: 4x4 cells. */
export const DECAL_CELL: Record<DecalId, number> = {
  puddle: 0,
  oil: 1,
  crack: 2,
  dirt: 3,
  leaves: 4,
  sand: 5,
  manhole: 6,
  grate: 7,
  arrow: 8,
  hazard: 9,
  scorch: 10,
  moss: 11,
  gravel: 12,
  snowdrift: 13,
  stain: 14,
  light: 15,
};
/** Panel atlas: 4x2 cells. */
export const PANEL_CELL: Record<PanelId, number> = { chain: 0, window: 1, windowLit: 2, vent: 3, door: 4, shutter: 5, fan: 6, poster: 7 };
/** Ribbon atlas: 8 columns tiling vertically. */
export const RIBBON_COL: Record<RibbonId, number> = { path: 0, snowpath: 1, line: 2, dashed: 3, tracks: 4, gravel: 5, road: 6, curb: 7 };

function blob(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number, lobes = 7): void {
  c.beginPath();
  const n = 28;
  const ph = Array.from({ length: lobes }, () => rand() * 6.28);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    let k = 1;
    for (let l = 0; l < lobes; l++) k += Math.sin(a * (l + 2) + ph[l]) * (0.18 / (l + 1));
    const x = cx + Math.cos(a) * r * k;
    const y = cy + Math.sin(a) * r * k;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** Erases random specks so painted marks look worn. */
function wear(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number, count: number, size = 4): void {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < count; i++) {
    c.fillStyle = `rgba(0,0,0,${0.3 + rand() * 0.7})`;
    c.beginPath();
    c.ellipse(x + rand() * w, y + rand() * h, 0.5 + rand() * size, 0.5 + rand() * size * 0.6, rand() * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

const DECAL_DRAW: ((c: CanvasRenderingContext2D, s: number, r: () => number) => void)[] = [
  // puddle
  (c, s, r) => {
    c.filter = 'blur(3px)';
    c.fillStyle = 'rgba(70,80,90,0.55)';
    blob(c, s / 2, s / 2, s * 0.36, r);
    c.fill();
    c.filter = 'none';
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, 'rgba(180,200,215,0.35)');
    g.addColorStop(0.5, 'rgba(60,70,80,0.1)');
    g.addColorStop(1, 'rgba(160,180,200,0.3)');
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.globalCompositeOperation = 'source-over';
  },
  // oil
  (c, s, r) => {
    c.filter = 'blur(5px)';
    for (let i = 0; i < 4; i++) {
      c.fillStyle = `rgba(15,12,10,${0.35 + r() * 0.2})`;
      blob(c, s / 2 + (r() - 0.5) * s * 0.3, s / 2 + (r() - 0.5) * s * 0.3, s * (0.12 + r() * 0.16), r);
      c.fill();
    }
    c.filter = 'none';
  },
  // crack
  (c, s, r) => {
    c.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      c.strokeStyle = `rgba(20,20,20,${0.75})`;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x, y);
      for (let i = 0; i < len; i++) {
        a += (r() - 0.5) * 0.8;
        x += Math.cos(a) * 6;
        y += Math.sin(a) * 6;
        c.lineTo(x, y);
        if (depth < 2 && r() < 0.08) {
          c.stroke();
          branch(x, y, a + (r() < 0.5 ? 0.9 : -0.9), len * 0.4, w * 0.6, depth + 1);
          c.strokeStyle = 'rgba(20,20,20,0.75)';
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(x, y);
        }
      }
      c.stroke();
    };
    branch(s * 0.1, s * 0.5, 0, 36, 2.2, 0);
  },
  // dirt
  (c, s, r) => {
    c.filter = 'blur(8px)';
    c.fillStyle = 'rgba(92,72,50,0.6)';
    blob(c, s / 2, s / 2, s * 0.34, r);
    c.fill();
    c.filter = 'none';
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 300; i++) {
      c.fillStyle = `rgba(${40 + r() * 80},${30 + r() * 60},${20 + r() * 40},0.6)`;
      c.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
    }
    c.globalCompositeOperation = 'source-over';
  },
  // leaves
  (c, s, r) => {
    const cols = ['176,98,38', '196,140,48', '140,70,30', '120,110,40', '90,60,30'];
    for (let i = 0; i < 160; i++) {
      const a = r() * 6.28;
      const d = Math.sqrt(r()) * s * 0.42;
      c.fillStyle = `rgba(${cols[Math.floor(r() * cols.length)]},${0.75 + r() * 0.25})`;
      c.beginPath();
      c.ellipse(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 5 + r() * 4, 2.5 + r() * 2, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  },
  // sand
  (c, s, r) => {
    c.filter = 'blur(10px)';
    c.fillStyle = 'rgba(214,192,150,0.7)';
    blob(c, s / 2, s / 2, s * 0.34, r);
    c.fill();
    c.filter = 'none';
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 12; i++) {
      c.strokeStyle = 'rgba(150,120,80,0.25)';
      c.lineWidth = 2;
      c.beginPath();
      const y = r() * s;
      for (let x = 0; x <= s; x += 10) c.lineTo(x, y + Math.sin(x * 0.05 + i) * 5);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  },
  // manhole
  (c, s, r) => {
    c.fillStyle = 'rgba(40,40,40,1)';
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(92,90,86,1)';
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(50,50,50,0.9)';
    c.lineWidth = 3;
    for (let k = 1; k <= 3; k++) {
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.1 * k, 0, Math.PI * 2);
      c.stroke();
    }
    for (let a = 0; a < 8; a++) {
      c.beginPath();
      c.moveTo(s / 2, s / 2);
      c.lineTo(s / 2 + Math.cos((a * Math.PI) / 4) * s * 0.4, s / 2 + Math.sin((a * Math.PI) / 4) * s * 0.4);
      c.stroke();
    }
    noiseAlphaSafe(c, s, r, 20);
  },
  // grate
  (c, s) => {
    c.fillStyle = 'rgba(55,55,55,1)';
    c.fillRect(s * 0.12, s * 0.12, s * 0.76, s * 0.76);
    c.fillStyle = 'rgba(10,10,10,1)';
    for (let i = 0; i < 8; i++) c.fillRect(s * 0.17 + i * s * 0.085, s * 0.17, s * 0.05, s * 0.66);
  },
  // arrow
  (c, s, r) => {
    c.fillStyle = 'rgba(240,240,236,0.95)';
    c.beginPath();
    c.moveTo(s / 2, s * 0.06);
    c.lineTo(s * 0.8, s * 0.4);
    c.lineTo(s * 0.6, s * 0.4);
    c.lineTo(s * 0.6, s * 0.94);
    c.lineTo(s * 0.4, s * 0.94);
    c.lineTo(s * 0.4, s * 0.4);
    c.lineTo(s * 0.2, s * 0.4);
    c.closePath();
    c.fill();
    wear(c, 0, 0, s, s, r, 260, 5);
  },
  // hazard
  (c, s, r) => {
    c.fillStyle = 'rgba(232,186,40,0.95)';
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(25,25,25,0.95)';
    for (let i = -4; i < 6; i++) {
      c.beginPath();
      c.moveTo(i * s * 0.25, 0);
      c.lineTo(i * s * 0.25 + s * 0.125, 0);
      c.lineTo(i * s * 0.25 + s * 0.125 + s, s);
      c.lineTo(i * s * 0.25 + s, s);
      c.fill();
    }
    wear(c, 0, 0, s, s, r, 420, 6);
  },
  // scorch
  (c, s, r) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45);
    g.addColorStop(0, 'rgba(10,8,6,0.85)');
    g.addColorStop(0.5, 'rgba(25,20,15,0.5)');
    g.addColorStop(1, 'rgba(25,20,15,0)');
    c.fillStyle = g;
    blob(c, s / 2, s / 2, s * 0.46, r, 9);
    c.fill();
  },
  // moss
  (c, s, r) => {
    c.filter = 'blur(6px)';
    c.fillStyle = 'rgba(70,110,40,0.65)';
    blob(c, s / 2, s / 2, s * 0.32, r);
    c.fill();
    c.filter = 'none';
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(${60 + r() * 60},${100 + r() * 60},${30 + r() * 30},0.7)`;
      c.fillRect(r() * s, r() * s, 2, 2);
    }
    c.globalCompositeOperation = 'source-over';
  },
  // gravel
  (c, s, r) => {
    c.filter = 'blur(6px)';
    c.fillStyle = 'rgba(110,108,104,0.55)';
    blob(c, s / 2, s / 2, s * 0.36, r);
    c.fill();
    c.filter = 'none';
    for (let i = 0; i < 500; i++) {
      const a = r() * 6.28;
      const d = Math.sqrt(r()) * s * 0.38;
      const v = 90 + r() * 120;
      c.fillStyle = `rgba(${v},${v},${v * 0.97},0.9)`;
      c.beginPath();
      c.ellipse(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  },
  // snowdrift
  (c, s, r) => {
    c.filter = 'blur(10px)';
    c.fillStyle = 'rgba(245,248,252,0.85)';
    blob(c, s / 2, s / 2, s * 0.34, r);
    c.fill();
    c.filter = 'none';
  },
  // stain
  (c, s, r) => {
    c.filter = 'blur(10px)';
    c.fillStyle = 'rgba(30,28,24,0.35)';
    blob(c, s / 2, s / 2, s * 0.33, r);
    c.fill();
    c.filter = 'none';
  },
  // light pool
  (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  },
];

function noiseAlphaSafe(c: CanvasRenderingContext2D, s: number, r: () => number, amount: number): void {
  const img = c.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = (r() - 0.5) * amount;
    d[i] = clampByte(d[i] + n);
    d[i + 1] = clampByte(d[i + 1] + n);
    d[i + 2] = clampByte(d[i + 2] + n);
  }
  c.putImageData(img, 0, 0);
}

const RIBBON_DRAW: ((c: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void)[] = [
  // path: dirt with soft edges
  (c, w, h, r) => {
    for (let x = 0; x < w; x++) {
      const t = Math.abs(x / w - 0.5) * 2;
      const a = 0.85 * (1 - smooth(0.45, 1, t));
      c.fillStyle = `rgba(112,88,60,${a})`;
      c.fillRect(x, 0, 1, h);
    }
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 900; i++) {
      const v = r();
      c.fillStyle = v < 0.5 ? `rgba(60,45,30,0.5)` : `rgba(170,150,120,0.5)`;
      const y = r() * h;
      const x = w * (0.15 + r() * 0.7);
      c.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
    }
    c.globalCompositeOperation = 'source-over';
  },
  // snowpath: trodden snow
  (c, w, h, r) => {
    for (let x = 0; x < w; x++) {
      const t = Math.abs(x / w - 0.5) * 2;
      c.fillStyle = `rgba(150,165,185,${0.5 * (1 - smooth(0.35, 1, t))})`;
      c.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < 28; i++) {
      const y = (i / 28) * h + r() * 6;
      const x = w * (i % 2 ? 0.36 : 0.62) + (r() - 0.5) * 10;
      c.fillStyle = 'rgba(110,125,150,0.28)';
      c.beginPath();
      c.ellipse(x, y, 7, 11, 0, 0, Math.PI * 2);
      c.fill();
    }
  },
  // line
  (c, w, h, r) => {
    c.fillStyle = 'rgba(245,245,240,0.92)';
    c.fillRect(w * 0.12, 0, w * 0.76, h);
    wear(c, 0, 0, w, h, r, 500, 4);
  },
  // dashed
  (c, w, h, r) => {
    c.fillStyle = 'rgba(245,245,240,0.92)';
    c.fillRect(w * 0.12, 0, w * 0.76, h * 0.55);
    wear(c, 0, 0, w, h, r, 300, 4);
  },
  // tracks
  (c, w, h, r) => {
    for (const cx of [0.24, 0.76]) {
      for (let x = -14; x <= 14; x++) {
        const t = Math.abs(x) / 14;
        c.fillStyle = `rgba(40,32,24,${0.45 * (1 - t * t)})`;
        c.fillRect(w * cx + x, 0, 1, h);
      }
      for (let y = 0; y < h; y += 10) {
        c.fillStyle = 'rgba(20,16,12,0.25)';
        c.fillRect(w * cx - 10, y + r() * 2, 20, 3);
      }
    }
  },
  // gravel strip
  (c, w, h, r) => {
    for (let x = 0; x < w; x++) {
      const t = Math.abs(x / w - 0.5) * 2;
      c.fillStyle = `rgba(118,116,110,${0.8 * (1 - smooth(0.55, 1, t))})`;
      c.fillRect(x, 0, 1, h);
    }
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 2400; i++) {
      const v = 80 + r() * 140;
      c.fillStyle = `rgba(${v},${v},${v},0.9)`;
      c.beginPath();
      c.ellipse(r() * w, r() * h, 1.2 + r() * 2.4, 1 + r() * 1.6, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  },
  // road: asphalt strip with worn edges
  (c, w, h, r) => {
    for (let x = 0; x < w; x++) {
      const t = Math.abs(x / w - 0.5) * 2;
      c.fillStyle = `rgba(70,70,72,${0.97 * (1 - smooth(0.82, 1, t))})`;
      c.fillRect(x, 0, 1, h);
    }
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 2500; i++) {
      const v = 40 + r() * 90;
      c.fillStyle = `rgba(${v},${v},${v},0.6)`;
      c.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    c.globalCompositeOperation = 'source-over';
    wear(c, 0, 0, w * 0.1, h, r, 120, 6);
    wear(c, w * 0.9, 0, w * 0.1, h, r, 120, 6);
  },
  // curb
  (c, w, h, r) => {
    c.fillStyle = 'rgba(190,188,182,1)';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += h / 4) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, y, w, 2);
    }
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(0, 0, w * 0.1, h);
    speckle(c, Math.max(w, h), r, 300, 120, 200, 0.5, 1.2, 0.5);
  },
];

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const PANEL_DRAW: ((c: CanvasRenderingContext2D, s: number, r: () => number) => void)[] = [
  // chain-link
  (c, s) => {
    c.strokeStyle = 'rgba(200,204,206,1)';
    c.lineWidth = 2.2;
    const step = s / 10;
    for (let i = -10; i <= 20; i++) {
      c.beginPath();
      c.moveTo(i * step, 0);
      c.lineTo(i * step + s, s);
      c.stroke();
      c.beginPath();
      c.moveTo(i * step, s);
      c.lineTo(i * step + s, 0);
      c.stroke();
    }
  },
  // window (dark glass reflecting sky)
  (c, s, r) => windowCell(c, s, r, false),
  // lit window
  (c, s, r) => windowCell(c, s, r, true),
  // vent louvres
  (c, s) => {
    c.fillStyle = 'rgb(120,122,124)';
    c.fillRect(0, 0, s, s);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const y = (i / n) * s;
      const g = c.createLinearGradient(0, y, 0, y + s / n);
      g.addColorStop(0, 'rgb(40,42,44)');
      g.addColorStop(0.4, 'rgb(70,72,74)');
      g.addColorStop(0.75, 'rgb(205,207,208)');
      g.addColorStop(1, 'rgb(150,152,154)');
      c.fillStyle = g;
      c.fillRect(8, y + 2, s - 16, s / n - 2);
    }
    c.strokeStyle = 'rgb(90,92,94)';
    c.lineWidth = 8;
    c.strokeRect(4, 4, s - 8, s - 8);
  },
  // door
  (c, s, r) => {
    c.fillStyle = 'rgb(150,154,156)';
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgb(70,72,74)';
    c.fillRect(0, 0, s, 8);
    c.fillRect(0, 0, 8, s);
    c.fillRect(s - 8, 0, 8, s);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 3;
    c.strokeRect(s * 0.18, s * 0.5, s * 0.64, s * 0.38);
    c.fillStyle = 'rgb(60,70,80)';
    c.fillRect(s * 0.3, s * 0.12, s * 0.4, s * 0.22);
    c.fillStyle = 'rgba(200,220,235,0.4)';
    c.fillRect(s * 0.3, s * 0.12, s * 0.15, s * 0.22);
    c.fillStyle = 'rgb(50,50,50)';
    c.fillRect(s * 0.74, s * 0.42, s * 0.12, s * 0.04);
    noise(c, s, r, 12);
  },
  // roll-up shutter
  (c, s, r) => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const y = (i / n) * s;
      const g = c.createLinearGradient(0, y, 0, y + s / n);
      g.addColorStop(0, 'rgb(205,207,209)');
      g.addColorStop(0.7, 'rgb(160,162,164)');
      g.addColorStop(1, 'rgb(90,92,94)');
      c.fillStyle = g;
      c.fillRect(0, y, s, s / n);
    }
    c.fillStyle = 'rgb(60,62,64)';
    c.fillRect(0, s - 10, s, 10);
    c.fillRect(s * 0.45, s - 22, s * 0.1, 8);
    blotches(c, s, r, 10, 0.18);
    noise(c, s, r, 10);
  },
  // fan grille (top view)
  (c, s) => {
    c.fillStyle = 'rgb(35,36,38)';
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgb(80,82,84)';
    for (let a = 0; a < 5; a++) {
      c.save();
      c.translate(s / 2, s / 2);
      c.rotate((a * Math.PI * 2) / 5);
      c.beginPath();
      c.ellipse(s * 0.2, 0, s * 0.2, s * 0.07, 0.4, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.strokeStyle = 'rgb(185,188,190)';
    c.lineWidth = 3;
    for (let k = 1; k <= 6; k++) {
      c.beginPath();
      c.arc(s / 2, s / 2, s * 0.08 * k, 0, Math.PI * 2);
      c.stroke();
    }
    for (let a = 0; a < 4; a++) {
      c.beginPath();
      c.moveTo(s / 2 + Math.cos((a * Math.PI) / 2) * s * 0.48, s / 2 + Math.sin((a * Math.PI) / 2) * s * 0.48);
      c.lineTo(s / 2 - Math.cos((a * Math.PI) / 2) * s * 0.48, s / 2 - Math.sin((a * Math.PI) / 2) * s * 0.48);
      c.stroke();
    }
  },
  // poster
  (c, s, r) => {
    c.fillStyle = 'rgb(226,220,204)';
    c.fillRect(s * 0.1, s * 0.05, s * 0.8, s * 0.9);
    c.fillStyle = 'rgb(200,64,48)';
    c.fillRect(s * 0.16, s * 0.1, s * 0.68, s * 0.14);
    c.fillStyle = 'rgb(40,40,44)';
    c.font = `bold ${Math.round(s * 0.1)}px Arial, sans-serif`;
    c.textAlign = 'center';
    c.fillText('DANGER', s / 2, s * 0.21);
    c.fillStyle = 'rgb(60,60,64)';
    for (let i = 0; i < 6; i++) c.fillRect(s * 0.18, s * (0.34 + i * 0.08), s * (0.45 + r() * 0.2), s * 0.025);
    c.fillStyle = 'rgb(230,190,40)';
    c.beginPath();
    c.moveTo(s * 0.7, s * 0.8);
    c.lineTo(s * 0.82, s * 0.8);
    c.lineTo(s * 0.76, s * 0.68);
    c.fill();
    noise(c, s, r, 14);
  },
];

function windowCell(c: CanvasRenderingContext2D, s: number, r: () => number, lit: boolean): void {
  c.fillStyle = 'rgb(214,214,210)';
  c.fillRect(0, 0, s, s);
  const g = c.createLinearGradient(0, 0, 0, s);
  if (lit) {
    g.addColorStop(0, 'rgb(255,214,140)');
    g.addColorStop(1, 'rgb(240,150,70)');
  } else {
    g.addColorStop(0, 'rgb(150,175,195)');
    g.addColorStop(0.45, 'rgb(62,78,92)');
    g.addColorStop(1, 'rgb(34,42,50)');
  }
  const m = s * 0.07;
  const half = (s - m * 3) / 2;
  for (const px of [m, m * 2 + half])
    for (const py of [m, m * 2 + half]) {
      c.fillStyle = g;
      c.fillRect(px, py, half, half);
      if (!lit) {
        c.fillStyle = 'rgba(255,255,255,0.14)';
        c.beginPath();
        c.moveTo(px + half * 0.15, py + half);
        c.lineTo(px + half * 0.45, py + half);
        c.lineTo(px + half, py + half * 0.3);
        c.lineTo(px + half, py);
        c.lineTo(px + half * 0.85, py);
        c.closePath();
        c.fill();
      } else if (r() < 0.6) {
        c.fillStyle = 'rgba(120,60,20,0.25)';
        c.fillRect(px, py + half * (0.4 + r() * 0.4), half, half * 0.6);
      }
    }
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, s - 3, s - 3);
}

const atlasCache = new Map<string, THREE.Texture>();

function atlas(key: string, w: number, h: number, cols: number, cell: number, draws: ((c: CanvasRenderingContext2D, s: number, r: () => number) => void)[], anisotropy: number): THREE.Texture {
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  draws.forEach((fn, i) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = cell;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    fn(c, cell, seeded(i * 7919 + 17));
    ctx.drawImage(cv, (i % cols) * cell, Math.floor(i / cols) * cell);
  });
  const tex = finishTexture(canvas, anisotropy, false);
  atlasCache.set(key, tex);
  return tex;
}

/** 4x4 decal atlas (1024²). UV rect of cell i: see `cellRect`. */
export function decalAtlas(anisotropy: number): THREE.Texture {
  return atlas('decal', 1024, 1024, 4, 256, DECAL_DRAW, anisotropy);
}

/** 4x2 panel atlas (1024x512). */
export function panelAtlas(anisotropy: number): THREE.Texture {
  return atlas('panel', 1024, 512, 4, 256, PANEL_DRAW, anisotropy);
}

/** 8 ribbon columns, 128 px wide, tiling vertically (wrapT = repeat). */
export function ribbonAtlas(anisotropy: number): THREE.Texture {
  const hit = atlasCache.get('ribbon');
  if (hit) return hit;
  const W = 128;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W * 8;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  RIBBON_DRAW.forEach((fn, i) => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    fn(c, W, H, seeded(i * 104729 + 3));
    ctx.drawImage(cv, i * W, 0);
  });
  const tex = finishTexture(canvas, anisotropy, false);
  tex.wrapT = THREE.RepeatWrapping;
  atlasCache.set('ribbon', tex);
  return tex;
}

/** UV rectangle [u0, v0, u1, v1] of an atlas cell (v measured from the bottom). */
export function cellRect(index: number, cols: number, rows: number, inset = 0.004): [number, number, number, number] {
  const cx = index % cols;
  const cy = Math.floor(index / cols);
  const u0 = cx / cols + inset;
  const u1 = (cx + 1) / cols - inset;
  const v1 = 1 - cy / rows - inset;
  const v0 = 1 - (cy + 1) / rows + inset;
  return [u0, v0, u1, v1];
}

export interface SignSpec {
  text: string;
  bg: number;
  fg: number;
  w: number;
  h: number;
}

/** Packs every sign of a map into one canvas; returns the texture and per-sign UV rects. */
export function signAtlas(signs: SignSpec[], anisotropy: number): { tex: THREE.Texture; rects: [number, number, number, number][] } {
  const W = 1024;
  const rowH = 128;
  const sizes = signs.map((sg) => Math.min(W, Math.max(rowH, Math.round((rowH * sg.w) / Math.max(0.1, sg.h)))));
  const pos: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const w of sizes) {
    if (x + w > W) {
      x = 0;
      y += rowH;
    }
    pos.push([x, y]);
    x += w;
  }
  const H = Math.max(rowH, 1 << Math.ceil(Math.log2(y + rowH)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const rand = seeded(99);
  signs.forEach((sg, i) => {
    const [px, py] = pos[i];
    const w = sizes[i];
    c.fillStyle = hex(sg.bg);
    c.fillRect(px, py, w, rowH);
    c.strokeStyle = hex(sg.fg);
    c.globalAlpha = 0.85;
    c.lineWidth = 5;
    c.strokeRect(px + 9, py + 9, w - 18, rowH - 18);
    c.globalAlpha = 1;
    c.fillStyle = hex(sg.fg);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let size = 76;
    const font = (sz: number) => `bold ${sz}px Rajdhani, 'Arial Narrow', Arial, sans-serif`;
    c.font = font(size);
    while (size > 18 && c.measureText(sg.text).width > w - 40) c.font = font((size -= 4));
    c.fillText(sg.text, px + w / 2, py + rowH / 2 + 3);
    // grime
    for (let k = 0; k < 40; k++) {
      c.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
      c.fillRect(px + rand() * w, py + rand() * rowH, 4 + rand() * 30, 2 + rand() * 10);
    }
  });
  const tex = finishTexture(canvas, anisotropy, false);
  const rects = signs.map((_, i): [number, number, number, number] => {
    const [px, py] = pos[i];
    return [(px + 1) / W, 1 - (py + rowH - 1) / H, (px + sizes[i] - 1) / W, 1 - (py + 1) / H];
  });
  return { tex, rects };
}

/**
 * Tileable fbm value noise (256², linear data). R: broad blobs, G: medium,
 * B: fine. Drives macro color variation, ground patches, clouds and water ripples.
 */
export function noiseTexture(): THREE.Texture {
  const hit = atlasCache.get('noise');
  if (hit) return hit;
  const s = 256;
  const rand = seeded(4242);
  const fbm = (base: number, octaves: number): Float32Array => {
    const out = new Float32Array(s * s);
    let amp = 1;
    for (let o = 0, cells = base; o < octaves; o++, cells *= 2, amp *= 0.5) {
      const g = new Float32Array(cells * cells).map(() => rand());
      const at = (x: number, y: number) => g[(y % cells) * cells + (x % cells)];
      const k = cells / s;
      for (let y = 0; y < s; y++) {
        const fy = y * k;
        const iy = Math.floor(fy);
        const ty = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        for (let x = 0; x < s; x++) {
          const fx = x * k;
          const ix = Math.floor(fx);
          const tx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
          const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
          const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
          out[y * s + x] += (a + (b - a) * ty) * amp;
        }
      }
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of out) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
    return out;
  };
  const r = fbm(4, 5);
  const g = fbm(8, 4);
  const b = fbm(16, 3);
  const data = new Uint8Array(s * s * 4);
  for (let i = 0; i < s * s; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.round(b[i] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  atlasCache.set('noise', tex);
  return tex;
}

export function disposeTextures(): void {
  for (const { tex } of cache.values()) tex?.dispose();
  cache.clear();
  for (const t of atlasCache.values()) t.dispose();
  atlasCache.clear();
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
