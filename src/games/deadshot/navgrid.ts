import type { World } from './world';

// Navigation grid for bots, generated automatically from the collision world.
// Every 1m column can hold several walkable surfaces (ground, catwalk, roof).
// Edges are walk/step, jump-up or drop-down links between neighbouring columns.

const CELL = 1;
const CLEAR_H = 1.75;
const HALF = 0.28;
const STEP = 0.6;
const PHYS_STEP = 0.5;
const JUMP = 1.15;
const MAX_DROP = 6.5;

export const EDGE_WALK = 0;
export const EDGE_JUMP = 1;
export const EDGE_DROP = 2;

export class NavGrid {
  originX: number;
  originZ: number;
  nx: number;
  nz: number;
  nodeX: Float32Array = new Float32Array(0);
  nodeY: Float32Array = new Float32Array(0);
  nodeZ: Float32Array = new Float32Array(0);
  nodeComp: Int32Array = new Int32Array(0);
  colStart: Int32Array;
  colCount: Int32Array;
  edgeStart: Int32Array = new Int32Array(0);
  edgeTo: Int32Array = new Int32Array(0);
  edgeCost: Float32Array = new Float32Array(0);
  edgeKind: Uint8Array = new Uint8Array(0);
  count = 0;
  mainComp = 0;
  mainNodes: number[] = [];

  // A* scratch
  private g: Float32Array = new Float32Array(0);
  private parent: Int32Array = new Int32Array(0);
  private seen: Uint32Array = new Uint32Array(0);
  private closed: Uint32Array = new Uint32Array(0);
  private search = 0;

  constructor(
    private world: World,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  ) {
    this.originX = Math.floor(bounds.minX);
    this.originZ = Math.floor(bounds.minZ);
    this.nx = Math.ceil(bounds.maxX - this.originX);
    this.nz = Math.ceil(bounds.maxZ - this.originZ);
    this.colStart = new Int32Array(this.nx * this.nz);
    this.colCount = new Int32Array(this.nx * this.nz);
    this.build();
  }

  private colCenter(i: number, j: number): [number, number] {
    return [this.originX + (i + 0.5) * CELL, this.originZ + (j + 0.5) * CELL];
  }

  private clear(x: number, y: number, z: number, half = HALF, h = CLEAR_H): boolean {
    return !this.world.overlaps(x - half, y + 0.02, z - half, x + half, y + h, z + half);
  }

  private build(): void {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const [cx, cz] = this.colCenter(i, j);
        const tops: number[] = [];
        this.world.forEachNear(cx - HALF, cz - HALF, cx + HALF, cz + HALF, (b) => {
          if (!b.collide) return;
          if (b.minX < cx + HALF && b.maxX > cx - HALF && b.minZ < cz + HALF && b.maxZ > cz - HALF && b.maxY > -20 && b.maxY < 30) tops.push(b.maxY);
        });
        tops.sort((a, b) => a - b);
        const col = j * this.nx + i;
        this.colStart[col] = xs.length;
        let last = -Infinity;
        for (const y of tops) {
          if (y - last < 0.05) continue;
          if (!this.clear(cx, y, cz)) continue;
          xs.push(cx);
          ys.push(y);
          zs.push(cz);
          last = y;
        }
        this.colCount[col] = xs.length - this.colStart[col];
      }
    this.count = xs.length;
    this.nodeX = Float32Array.from(xs);
    this.nodeY = Float32Array.from(ys);
    this.nodeZ = Float32Array.from(zs);

    const eTo: number[] = [];
    const eCost: number[] = [];
    const eKind: number[] = [];
    this.edgeStart = new Int32Array(this.count + 1);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const col = j * this.nx + i;
        for (let k = 0; k < this.colCount[col]; k++) {
          const n = this.colStart[col] + k;
          this.edgeStart[n] = eTo.length;
          const ny = this.nodeY[n];
          for (const [di, dj] of dirs) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
            const ncol = jj * this.nx + ii;
            const diag = di !== 0 && dj !== 0;
            const dist = diag ? Math.SQRT2 : 1;
            for (let q = 0; q < this.colCount[ncol]; q++) {
              const m = this.colStart[ncol] + q;
              const my = this.nodeY[m];
              const dy = my - ny;
              const mx = (this.nodeX[n] + this.nodeX[m]) / 2;
              const mz = (this.nodeZ[n] + this.nodeZ[m]) / 2;
              if (diag) {
                // No corner cutting: both orthogonal neighbours need a similar-height node.
                if (!this.hasNodeNear(i + di, j, Math.max(ny, my)) || !this.hasNodeNear(i, j + dj, Math.max(ny, my))) continue;
              }
              if (Math.abs(dy) <= 1.2 && this.walkProbe(n, m, diag ? 6 : 4)) {
                eTo.push(m);
                eCost.push(dist + Math.max(0, dy) * 0.3);
                eKind.push(EDGE_WALK);
              } else if (dy > 0.3 && dy <= JUMP && !diag) {
                if (!this.clear(mx, my, mz) || !this.clear(this.nodeX[n], ny, this.nodeZ[n], HALF, CLEAR_H + dy)) continue;
                eTo.push(m);
                eCost.push(dist + 2.5);
                eKind.push(EDGE_JUMP);
              } else if (dy < -0.3 && dy >= -MAX_DROP && !diag) {
                if (!this.clear(mx, ny, mz)) continue;
                eTo.push(m);
                eCost.push(dist + 1 + -dy * 0.3);
                eKind.push(EDGE_DROP);
              }
            }
          }
        }
      }
    this.edgeStart[this.count] = eTo.length;
    this.edgeTo = Int32Array.from(eTo);
    this.edgeCost = Float32Array.from(eCost);
    this.edgeKind = Uint8Array.from(eKind);
    this.g = new Float32Array(this.count);
    this.parent = new Int32Array(this.count);
    this.seen = new Uint32Array(this.count);
    this.closed = new Uint32Array(this.count);
    this.components();
  }

  /** Simulates walking (with physics step-up) from node a to node b. */
  private walkProbe(a: number, b: number, samples: number): boolean {
    const x0 = this.nodeX[a];
    const z0 = this.nodeZ[a];
    const x1 = this.nodeX[b];
    const z1 = this.nodeZ[b];
    let h = this.nodeY[a];
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      const next = this.world.groundAt(px, pz, h + PHYS_STEP, HALF);
      if (next < h - STEP) return false;
      if (!this.clear(px, next, pz)) return false;
      h = next;
    }
    return Math.abs(h - this.nodeY[b]) < 0.06;
  }

  private hasNodeNear(i: number, j: number, y: number): boolean {
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    const col = j * this.nx + i;
    for (let q = 0; q < this.colCount[col]; q++) if (Math.abs(this.nodeY[this.colStart[col] + q] - y) <= 1.25) return true;
    return false;
  }

  /** Strongly-connected-ish grouping: nodes reachable both ways via walk/jump edges. */
  private components(): void {
    this.nodeComp = new Int32Array(this.count).fill(-1);
    // Undirected adjacency from walk edges only, then pick the biggest group.
    let comp = 0;
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let s = 0; s < this.count; s++) {
      if (this.nodeComp[s] !== -1) continue;
      let size = 0;
      stack.push(s);
      this.nodeComp[s] = comp;
      while (stack.length) {
        const n = stack.pop()!;
        size++;
        for (let e = this.edgeStart[n]; e < this.edgeStart[n + 1]; e++) {
          if (this.edgeKind[e] === EDGE_DROP) continue;
          const m = this.edgeTo[e];
          if (this.nodeComp[m] === -1) {
            this.nodeComp[m] = comp;
            stack.push(m);
          }
        }
      }
      sizes.push(size);
      comp++;
    }
    let best = 0;
    for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[best]) best = c;
    this.mainComp = best;
    this.mainNodes = [];
    for (let n = 0; n < this.count; n++) if (this.nodeComp[n] === best) this.mainNodes.push(n);
  }

  /** Closest node to a point, preferring nodes at or just below the given height. */
  nearest(x: number, y: number, z: number, radius = 3): number {
    const ci = Math.floor((x - this.originX) / CELL);
    const cj = Math.floor((z - this.originZ) / CELL);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= radius; r++) {
      for (let j = cj - r; j <= cj + r; j++)
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const col = j * this.nx + i;
          for (let q = 0; q < this.colCount[col]; q++) {
            const n = this.colStart[col] + q;
            const dy = this.nodeY[n] - y;
            const vertical = dy > 0.7 ? dy * 4 : Math.abs(dy) * 0.8;
            const d = (this.nodeX[n] - x) ** 2 + (this.nodeZ[n] - z) ** 2 + vertical * vertical;
            if (d < bestD) {
              bestD = d;
              best = n;
            }
          }
        }
      if (best !== -1 && r >= 1) break;
    }
    return best;
  }

  randomNode(rand: () => number = Math.random): number {
    return this.mainNodes[Math.floor(rand() * this.mainNodes.length)] ?? 0;
  }

  /** A* path from node a to node b (inclusive). Empty if unreachable. */
  findPath(a: number, b: number, maxExpand = 12000): number[] {
    if (a < 0 || b < 0) return [];
    if (a === b) return [a];
    const s = ++this.search;
    const heap = new MinHeap();
    const bx = this.nodeX[b];
    const by = this.nodeY[b];
    const bz = this.nodeZ[b];
    const hfn = (n: number) => Math.hypot(this.nodeX[n] - bx, (this.nodeY[n] - by) * 0.5, this.nodeZ[n] - bz);
    this.g[a] = 0;
    this.seen[a] = s;
    this.parent[a] = -1;
    heap.push(a, hfn(a));
    let expanded = 0;
    while (heap.size) {
      const n = heap.pop();
      if (this.closed[n] === s) continue;
      this.closed[n] = s;
      if (n === b) break;
      if (++expanded > maxExpand) return [];
      for (let e = this.edgeStart[n]; e < this.edgeStart[n + 1]; e++) {
        const m = this.edgeTo[e];
        if (this.closed[m] === s) continue;
        const ng = this.g[n] + this.edgeCost[e];
        if (this.seen[m] !== s || ng < this.g[m]) {
          this.seen[m] = s;
          this.g[m] = ng;
          this.parent[m] = n;
          heap.push(m, ng + hfn(m));
        }
      }
    }
    if (this.closed[b] !== s) return [];
    const path: number[] = [];
    for (let n = b; n !== -1; n = this.parent[n]) path.push(n);
    path.reverse();
    return path;
  }

  edgeKindBetween(a: number, b: number): number {
    for (let e = this.edgeStart[a]; e < this.edgeStart[a + 1]; e++) if (this.edgeTo[e] === b) return this.edgeKind[e];
    return EDGE_WALK;
  }
}

class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length) {
      let i = 0;
      const n = items.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < n && keys[l] < mk) {
          m = l;
          mk = keys[l];
        }
        if (r < n && keys[r] < mk) {
          m = r;
          mk = keys[r];
        }
        if (m === i) break;
        items[i] = items[m];
        keys[i] = keys[m];
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
