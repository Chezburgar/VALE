// Static collision world made of axis-aligned boxes, plus the character
// controller (axis-separated move-and-slide with step-up / step-down) and
// ray casting used by bullets and bot line-of-sight checks.

export type MatId =
  | 'concrete'
  | 'metal'
  | 'wood'
  | 'crate'
  | 'brick'
  | 'grass'
  | 'snow'
  | 'dirt'
  | 'asphalt'
  | 'plaster'
  | 'rock'
  | 'bark'
  | 'leaves'
  | 'water'
  | 'glass'
  | 'stripe'
  | 'plain';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  mat: MatId;
  color: number;
  collide: boolean;
  visible: boolean;
  /** Bullets pass through (e.g. foliage, fences). */
  soft?: boolean;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  box: Box | null;
}

const CELL = 4;

export class World {
  readonly colliders: Box[];
  private grid = new Map<number, Box[]>();
  minX = Infinity;
  maxX = -Infinity;
  minZ = Infinity;
  maxZ = -Infinity;
  private stamp = 0;
  private stamps = new Map<Box, number>();

  constructor(boxes: Box[]) {
    this.colliders = boxes.filter((b) => b.collide || b.soft);
    for (const b of this.colliders) {
      this.minX = Math.min(this.minX, b.minX);
      this.maxX = Math.max(this.maxX, b.maxX);
      this.minZ = Math.min(this.minZ, b.minZ);
      this.maxZ = Math.max(this.maxZ, b.maxZ);
      const x0 = Math.floor(b.minX / CELL);
      const x1 = Math.floor(b.maxX / CELL);
      const z0 = Math.floor(b.minZ / CELL);
      const z1 = Math.floor(b.maxZ / CELL);
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const key = cellKey(x, z);
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(b);
        }
    }
  }

  /** Visit boxes whose cells overlap the XZ rectangle (each box at most once). */
  forEachNear(minX: number, minZ: number, maxX: number, maxZ: number, fn: (b: Box) => boolean | void): void {
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const list = this.grid.get(cellKey(x, z));
        if (!list) continue;
        for (const b of list) {
          if (this.stamps.get(b) === s) continue;
          this.stamps.set(b, s);
          if (fn(b) === true) return;
        }
      }
  }

  overlaps(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    let hit = false;
    this.forEachNear(minX, minZ, maxX, maxZ, (b) => {
      if (!b.collide) return;
      if (b.maxX > minX && b.minX < maxX && b.maxY > minY && b.minY < maxY && b.maxZ > minZ && b.minZ < maxZ) {
        hit = true;
        return true;
      }
    });
    return hit;
  }

  /** Highest walkable surface at (x, z) at or below `fromY`. */
  groundAt(x: number, z: number, fromY: number, half = 0): number {
    let best = -50;
    this.forEachNear(x - half, z - half, x + half, z + half, (b) => {
      if (!b.collide) return;
      if (b.maxX > x - half && b.minX < x + half && b.maxZ > z - half && b.minZ < z + half && b.maxY <= fromY + 0.01 && b.maxY > best) {
        best = b.maxY;
      }
    });
    return best;
  }

  /** The box a body standing at (x, y, z) rests on, if any. */
  boxBelow(x: number, z: number, y: number): Box | null {
    let best: Box | null = null;
    this.forEachNear(x, z, x, z, (b) => {
      if (!b.collide || !b.visible) return;
      if (b.minX <= x && b.maxX >= x && b.minZ <= z && b.maxZ >= z && b.maxY <= y + 0.05 && b.maxY >= y - 0.2) {
        if (!best || b.maxY > best.maxY) best = b;
      }
    });
    return best;
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, includeSoft = false): RayHit | null {
    let bestT = maxDist;
    let best: RayHit | null = null;
    const ix = 1 / (dx === 0 ? 1e-9 : dx);
    const iy = 1 / (dy === 0 ? 1e-9 : dy);
    const iz = 1 / (dz === 0 ? 1e-9 : dz);
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    this.forEachNear(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
      if (!b.collide && !(b.soft && includeSoft)) return;
      let t1 = (b.minX - ox) * ix;
      let t2 = (b.maxX - ox) * ix;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      let axis = 0;
      let enter = tmin;
      t1 = (b.minY - oy) * iy;
      t2 = (b.maxY - oy) * iy;
      let a = Math.min(t1, t2);
      if (a > enter) {
        enter = a;
        axis = 1;
      }
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (b.minZ - oz) * iz;
      t2 = (b.maxZ - oz) * iz;
      a = Math.min(t1, t2);
      if (a > enter) {
        enter = a;
        axis = 2;
      }
      tmax = Math.min(tmax, Math.max(t1, t2));
      tmin = enter;
      if (tmax < Math.max(tmin, 0) || tmin > bestT) return;
      if (tmin < 0) return; // origin inside box: ignore (prevents self-blocking at spawn)
      bestT = tmin;
      best = {
        t: tmin,
        nx: axis === 0 ? -Math.sign(dx) : 0,
        ny: axis === 1 ? -Math.sign(dy) : 0,
        nz: axis === 2 ? -Math.sign(dz) : 0,
        box: b,
      };
    });
    return best;
  }

  /** True if nothing solid (or foliage, when `soft`) lies between the two points. */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, soft = true): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, soft) === null;
  }
}

function cellKey(x: number, z: number): number {
  return (x + 512) * 4096 + (z + 512);
}

// ---------------------------------------------------------------------------
// Character controller

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  half: number;
  height: number;
  onGround: boolean;
}

const EPS = 0.001;

function sweep(world: World, b: Body, axis: 0 | 1 | 2, delta: number): boolean {
  if (delta === 0) return false;
  if (axis === 0) b.x += delta;
  else if (axis === 1) b.y += delta;
  else b.z += delta;
  const minX = b.x - b.half + EPS;
  const maxX = b.x + b.half - EPS;
  const minZ = b.z - b.half + EPS;
  const maxZ = b.z + b.half - EPS;
  const minY = b.y + EPS;
  const maxY = b.y + b.height - EPS;
  let hit = false;
  world.forEachNear(minX, minZ, maxX, maxZ, (box) => {
    if (!box.collide) return;
    if (!(box.maxX > minX && box.minX < maxX && box.maxY > minY && box.minY < maxY && box.maxZ > minZ && box.minZ < maxZ)) return;
    hit = true;
    if (axis === 0) {
      if (delta > 0) b.x = Math.min(b.x, box.minX - b.half);
      else b.x = Math.max(b.x, box.maxX + b.half);
    } else if (axis === 1) {
      if (delta > 0) b.y = Math.min(b.y, box.minY - b.height);
      else b.y = Math.max(b.y, box.maxY);
    } else {
      if (delta > 0) b.z = Math.min(b.z, box.minZ - b.half);
      else b.z = Math.max(b.z, box.maxZ + b.half);
    }
  });
  return hit;
}

function fits(world: World, b: Body, y = b.y): boolean {
  return !world.overlaps(b.x - b.half + EPS, y + EPS, b.z - b.half + EPS, b.x + b.half - EPS, y + b.height - EPS, b.z + b.half - EPS);
}

export interface MoveResult {
  hitWall: boolean;
  landed: boolean;
  hitCeiling: boolean;
  stepped: boolean;
}

/**
 * Moves a body by its velocity over dt with collisions.
 * Handles stair step-up while grounded and snapping down small ledges.
 */
export function moveBody(world: World, b: Body, dt: number, stepHeight: number): MoveResult {
  const res: MoveResult = { hitWall: false, landed: false, hitCeiling: false, stepped: false };
  const dx = b.vx * dt;
  const dz = b.vz * dt;
  const wasGrounded = b.onGround;
  const sx = b.x;
  const sy = b.y;
  const sz = b.z;

  // Horizontal move without stepping.
  const hx = sweep(world, b, 0, dx);
  const hz = sweep(world, b, 2, dz);
  if ((hx || hz) && wasGrounded && stepHeight > 0) {
    const flatX = b.x;
    const flatZ = b.z;
    const flatDist = (flatX - sx) ** 2 + (flatZ - sz) ** 2;
    // Try again from a raised position.
    b.x = sx;
    b.z = sz;
    if (fits(world, b, sy + stepHeight)) {
      b.y = sy + stepHeight;
      const sxHit = sweep(world, b, 0, dx);
      const szHit = sweep(world, b, 2, dz);
      sweep(world, b, 1, -stepHeight - 0.02);
      const stepDist = (b.x - sx) ** 2 + (b.z - sz) ** 2;
      const groundedAfter = b.y > sy - 0.01 && !fits(world, b, b.y - 0.03);
      if (stepDist > flatDist + 1e-6 && groundedAfter) {
        res.stepped = b.y > sy + 0.01;
        res.hitWall = sxHit || szHit;
        if (sxHit) b.vx = 0;
        if (szHit) b.vz = 0;
      } else {
        b.x = flatX;
        b.y = sy;
        b.z = flatZ;
        res.hitWall = true;
        if (hx) b.vx = 0;
        if (hz) b.vz = 0;
      }
    } else {
      b.x = flatX;
      b.z = flatZ;
      res.hitWall = true;
      if (hx) b.vx = 0;
      if (hz) b.vz = 0;
    }
  } else {
    if (hx) b.vx = 0;
    if (hz) b.vz = 0;
    res.hitWall = hx || hz;
  }

  // Vertical move.
  const dy = b.vy * dt;
  const hy = sweep(world, b, 1, dy);
  if (hy) {
    if (dy < 0) {
      if (!b.onGround) res.landed = true;
      b.onGround = true;
    } else {
      res.hitCeiling = true;
    }
    b.vy = 0;
  } else {
    b.onGround = false;
    // Stick to the ground when walking down stairs / small drops.
    if (wasGrounded && b.vy <= 0 && stepHeight > 0) {
      const before = b.y;
      if (sweep(world, b, 1, -stepHeight)) {
        b.onGround = true;
        b.vy = 0;
      } else b.y = before;
    }
  }
  if (b.onGround && !hy && fits(world, b, b.y - 0.02)) b.onGround = false;
  return res;
}

export function bodyFits(world: World, b: Body, height: number): boolean {
  return !world.overlaps(b.x - b.half + EPS, b.y + EPS, b.z - b.half + EPS, b.x + b.half - EPS, b.y + height - EPS, b.z + b.half - EPS);
}
