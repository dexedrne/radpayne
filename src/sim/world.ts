// Static collision world: boxes from the level prefab, each an oriented box that may only turn about
// the Y axis (yaw). Provides the capsule (vertical cylinder) push-out, ground probes and ray casts the
// player, enemies, camera and bullets use. Pure TS, no three.js (the Node tests run it).
//
// Yaw convention = three.js rotation.y: world = R * local with
//   wx = lx * cos + lz * sin,  wz = -lx * sin + lz * cos.

export type Box = {
  id: number;
  /** Prefab node id (for messages and the editor). */
  node: string;
  cx: number;
  cy: number;
  cz: number;
  /** Half extents in the box's local frame. */
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  cos: number;
  sin: number;
  /** World-space AABB (broad phase). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  bottom: number;
  /** Bullets pass (e.g. a chain-link fence); the player still collides. */
  shootThrough: boolean;
  /** Surface tag for impacts (concrete, metal, glass, wood). */
  surface: string;
};

export function makeBox(id: number, node: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, surface = "concrete", shootThrough = false): Box {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const hx = Math.abs(sx) / 2, hy = Math.abs(sy) / 2, hz = Math.abs(sz) / 2;
  const ex = Math.abs(hx * cos) + Math.abs(hz * sin);
  const ez = Math.abs(hx * sin) + Math.abs(hz * cos);
  return {
    id, node, cx, cy, cz, hx, hy, hz, yaw, cos, sin,
    x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, top: cy + hy, bottom: cy - hy,
    shootThrough, surface,
  };
}

export type RayHit = { t: number; box: Box | null; nx: number; ny: number; nz: number };

/** Grid cell size for the broad phase. */
const CELL = 4;

export class World {
  readonly boxes: Box[];
  /** Floor height used where no box is underneath (a level without a floor box still works). */
  readonly floorY: number;
  private readonly grid = new Map<number, number[]>();
  private stamp = 0;
  private readonly seen: Int32Array;

  constructor(boxes: Box[], floorY = 0) {
    this.boxes = boxes;
    this.floorY = floorY;
    this.seen = new Int32Array(boxes.length);
    for (const b of boxes) {
      for (let gx = Math.floor(b.x0 / CELL); gx <= Math.floor(b.x1 / CELL); gx++)
        for (let gz = Math.floor(b.z0 / CELL); gz <= Math.floor(b.z1 / CELL); gz++) {
          const k = key(gx, gz);
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(b.id);
        }
    }
  }

  /** Node ids of boxes taken out of the world (the breached office door): no collision, no rays. */
  readonly off = new Set<string>();

  /** Take a box (by its prefab node id) out of the world or put it back; true when something changed. */
  setEnabled(node: string, on: boolean): boolean {
    if (on ? !this.off.has(node) : this.off.has(node)) return false;
    if (on) this.off.delete(node); else this.off.add(node);
    return true;
  }

  /** Boxes whose AABB overlaps the xz rectangle (each once). */
  near(x0: number, z0: number, x1: number, z1: number, out: Box[]): Box[] {
    out.length = 0;
    const s = ++this.stamp;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const list = this.grid.get(key(gx, gz));
        if (!list) continue;
        for (const id of list) {
          if (this.seen[id] === s) continue;
          this.seen[id] = s;
          const b = this.boxes[id];
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          if (this.off.size && this.off.has(b.node)) continue;
          out.push(b);
        }
      }
    return out;
  }

  private readonly tmp: Box[] = [];

  /**
   * Highest walkable top under a circle at (x, z) that is at or below `maxY` (feet + step-up), or the
   * floor height when none is.
   */
  groundBelow(x: number, z: number, r: number, maxY: number): number {
    let best = this.floorY > maxY ? -Infinity : this.floorY;
    for (const b of this.near(x - r, z - r, x + r, z + r, this.tmp)) {
      if (b.top > maxY + 1e-6 || b.top <= best) continue;
      if (circleRectOverlap(b, x, z, r * 0.7)) best = b.top;
    }
    return best;
  }

  /** Lowest box bottom above `y` over the circle (a ceiling), or +Infinity. */
  ceilingAbove(x: number, z: number, r: number, y: number): number {
    let best = Infinity;
    for (const b of this.near(x - r, z - r, x + r, z + r, this.tmp)) {
      if (b.bottom < y - 1e-6 || b.bottom >= best) continue;
      if (circleRectOverlap(b, x, z, r * 0.7)) best = b.bottom;
    }
    return best;
  }

  /**
   * Push a vertical cylinder (feet y0, head y1) out of every box it overlaps horizontally, ignoring
   * boxes whose top is at or below `stepTop` (those are floors / step-ups). Writes the corrected xz into
   * `out` and returns true on any contact.
   */
  pushOut(x: number, z: number, r: number, y0: number, y1: number, stepTop: number, out: { x: number; z: number }): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.near(x - r, z - r, x + r, z + r, this.tmp)) {
        if (b.top <= stepTop + 1e-6 || b.bottom >= y1 || b.top <= y0) continue;
        // local frame
        const dx = x - b.cx, dz = z - b.cz;
        const lx = dx * b.cos - dz * b.sin;
        const lz = dx * b.sin + dz * b.cos;
        const qx = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
        const qz = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
        let ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        let nlx: number, nlz: number;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const push = r - d;
          nlx = lx + (ex / d) * push;
          nlz = lz + (ez / d) * push;
        } else {
          // centre inside the rectangle: leave by the nearest side
          const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
          if (px < pz) { ex = lx >= 0 ? 1 : -1; nlx = ex * (b.hx + r); nlz = lz; }
          else { ez = lz >= 0 ? 1 : -1; nlz = ez * (b.hz + r); nlx = lx; }
        }
        // back to world
        x = b.cx + nlx * b.cos + nlz * b.sin;
        z = b.cz - nlx * b.sin + nlz * b.cos;
        hit = moved = true;
      }
      if (!moved) break;
    }
    out.x = x;
    out.z = z;
    return hit;
  }

  /**
   * Ray cast against the boxes (and the floor plane) from o along unit d up to maxT. `bullets` skips
   * shoot-through boxes. Returns the nearest hit or null.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, bullets = false, out?: RayHit): RayHit | null {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    let best = maxT;
    let bestBox: Box | null = null;
    let nx = 0, ny = 0, nz = 0;
    let found = false;
    // floor plane
    if (dy < -1e-9 && oy > this.floorY) {
      const t = (this.floorY - oy) / dy;
      if (t < best) { best = t; nx = 0; ny = 1; nz = 0; found = true; }
    }
    // Walk the broad phase along the segment's bounding rectangle (rays here are short: <= 120 m).
    for (const b of this.near(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this.tmp)) {
      if (bullets && b.shootThrough) continue;
      const rx = ox - b.cx, rz = oz - b.cz;
      const lox = rx * b.cos - rz * b.sin, loz = rx * b.sin + rz * b.cos, loy = oy - b.cy;
      const ldx = dx * b.cos - dz * b.sin, ldz = dx * b.sin + dz * b.cos, ldy = dy;
      let tmin = 0, tmax = best, axis = -1, sign = 0;
      // slabs x, y, z
      const o3 = [lox, loy, loz], d3 = [ldx, ldy, ldz], h3 = [b.hx, b.hy, b.hz];
      let miss = false;
      for (let a = 0; a < 3; a++) {
        const o = o3[a], d = d3[a], h = h3[a];
        if (Math.abs(d) < 1e-12) {
          if (o < -h || o > h) { miss = true; break; }
          continue;
        }
        let t1 = (-h - o) / d, t2 = (h - o) / d, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || axis < 0 || tmin >= best) continue; // axis < 0: the origin is inside the box
      best = tmin;
      bestBox = b;
      found = true;
      // local normal -> world
      const lnx = axis === 0 ? sign : 0, lny = axis === 1 ? sign : 0, lnz = axis === 2 ? sign : 0;
      nx = lnx * b.cos + lnz * b.sin;
      ny = lny;
      nz = -lnx * b.sin + lnz * b.cos;
    }
    if (!found) return null;
    const o = out ?? { t: 0, box: null, nx: 0, ny: 0, nz: 0 };
    o.t = best; o.box = bestBox; o.nx = nx; o.ny = ny; o.nz = nz;
    return o;
  }

  /** True when nothing blocks the segment a -> b (bullets: shoot-through boxes do not block). */
  clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number, bullets = true): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, bullets, this.scratchHit) === null;
  }
  private readonly scratchHit: RayHit = { t: 0, box: null, nx: 0, ny: 0, nz: 0 };
}

const key = (gx: number, gz: number) => (gx + 4096) * 8192 + (gz + 4096);

export function circleRectOverlap(b: Box, x: number, z: number, r: number): boolean {
  const dx = x - b.cx, dz = z - b.cz;
  const lx = dx * b.cos - dz * b.sin;
  const lz = dx * b.sin + dz * b.cos;
  const qx = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
  const qz = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
  const ex = lx - qx, ez = lz - qz;
  return ex * ex + ez * ez <= r * r;
}
