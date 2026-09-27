// Chapter 2's level helpers on top of tools/levelKit.ts: a room builder that remembers its solid boxes,
// so it can put cover points around the ones meant as cover (low: a point behind each face; high: a
// point at each face's two corners, leaning out) and lay a waypoint grid over the walkable floor that
// skips anything inside a box. Used by tools/room6.ts .. room10.ts.
import { boxMM, marker, type Node, type V3 } from "../levelKit.ts";

type Solid = { id: string; a: V3; b: V3 };
export type CoverOpts = { faces?: Array<"n" | "s" | "e" | "w">; tag?: string };

export class RoomKit {
  readonly solid: Node[] = [];
  readonly decor: Node[] = [];
  readonly markers: Node[] = [];
  readonly boxes: Solid[] = [];
  private coverN = 0;

  /** A solid box by two corners (a collider unless its data says otherwise). */
  box(id: string, a: V3, b: V3, mat: string, o: Parameters<typeof boxMM>[4] = {}): this {
    this.solid.push(boxMM(id, a, b, mat, o));
    const lo: V3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const hi: V3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    if (!(o.data && (o.data as { collider?: boolean }).collider === false)) this.boxes.push({ id, a: lo, b: hi });
    return this;
  }

  /** A box that is cover: the box, and cover points around it (facing = through the box). */
  cover(id: string, a: V3, b: V3, mat: string, o: Parameters<typeof boxMM>[4] = {}, c: CoverOpts = {}): this {
    this.box(id, a, b, mat, o);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
    const y0 = Math.min(a[1], b[1]), h = Math.abs(b[1] - a[1]);
    const high = h >= 1.5;
    const off = 0.62;
    const faces = c.faces ?? ["n", "s", "e", "w"];
    const push = (x: number, z: number, yaw: number, side?: "left" | "right") => {
      this.markers.push(marker(`cv-${id}-${this.coverN++}`, "cover", [x, y0, z], high ? { height: "high", side } : { height: "low" }, yaw));
    };
    // yaw: the direction it protects toward (+Z = 0, +X = pi/2)
    for (const f of faces) {
      if (!high) {
        if (f === "n") { const n = Math.max(1, Math.round((x1 - x0) / 2.4)); for (let i = 0; i < n; i++) push(x0 + ((i + 0.5) * (x1 - x0)) / n, z0 - off, 0); }
        if (f === "s") { const n = Math.max(1, Math.round((x1 - x0) / 2.4)); for (let i = 0; i < n; i++) push(x0 + ((i + 0.5) * (x1 - x0)) / n, z1 + off, Math.PI); }
        if (f === "w") { const n = Math.max(1, Math.round((z1 - z0) / 2.4)); for (let i = 0; i < n; i++) push(x0 - off, z0 + ((i + 0.5) * (z1 - z0)) / n, Math.PI / 2); }
        if (f === "e") { const n = Math.max(1, Math.round((z1 - z0) / 2.4)); for (let i = 0; i < n; i++) push(x1 + off, z0 + ((i + 0.5) * (z1 - z0)) / n, -Math.PI / 2); }
      } else {
        // at the corners of the face, leaning out past the edge (side: the lean, in her own frame)
        if (f === "n") { push(x0 + 0.25, z0 - off, 0, "right"); push(x1 - 0.25, z0 - off, 0, "left"); }
        if (f === "s") { push(x1 - 0.25, z1 + off, Math.PI, "right"); push(x0 + 0.25, z1 + off, Math.PI, "left"); }
        if (f === "w") { push(x0 - off, z1 - 0.25, Math.PI / 2, "right"); push(x0 - off, z0 + 0.25, Math.PI / 2, "left"); }
        if (f === "e") { push(x1 + off, z0 + 0.25, -Math.PI / 2, "right"); push(x1 + off, z1 - 0.25, -Math.PI / 2, "left"); }
      }
    }
    return this;
  }

  /** Whether a standing body at (x, y, z) (radius r) would be inside a solid box. */
  blocked(x: number, y: number, z: number, r = 0.55): boolean {
    return this.boxes.some(s => x > s.a[0] - r && x < s.b[0] + r && z > s.a[2] - r && z < s.b[2] + r && s.b[1] > y + 0.3 && s.a[1] < y + 1.8);
  }

  /** A waypoint grid over [x0, x1] x [z0, z1] at floor height y, every `step` m, skipping blocked spots. */
  grid(prefix: string, x0: number, x1: number, z0: number, z1: number, step: number, y = 0, skip?: (x: number, z: number) => boolean): this {
    let k = 0;
    for (let x = x0; x <= x1 + 1e-6; x += step) for (let z = z0; z <= z1 + 1e-6; z += step) {
      if (this.blocked(x, y, z) || skip?.(x, z)) continue;
      this.markers.push(marker(`wp-${prefix}-${k++}`, "waypoint", [x, y, z]));
    }
    return this;
  }

  /** One waypoint (explicit links: stairs, doorways). */
  wp(id: string, pos: V3, links?: string[], data: Record<string, unknown> = {}): this {
    // a node off the floor (a stair, a platform) is linked by its explicit links only
    const solo = pos[1] > 0.4 && !!links ? { solo: true } : {};
    this.markers.push(marker(`wp-${id}`, "waypoint", pos, { ...(links ? { links: links.map(l => `wp-${l}`) } : {}), ...solo, ...data }));
    return this;
  }

  /** A flight of steps from (x, z) going `dir` ("n"|"s"|"e"|"w": the way DOWN), `n` steps of rise / run,
   *  `w` wide, topping out at `top` (the first step's top = top - rise). Returns the bottom's far edge. */
  stairs(id: string, x: number, z: number, dir: "n" | "s" | "e" | "w", n: number, rise: number, run: number, w: number, top: number, mat: string): this {
    for (let i = 0; i < n; i++) {
      const h = top - rise * (i + 1);
      if (h <= 0.01) break;
      const d0 = run * i, d1 = run * (i + 1);
      const a: V3 = dir === "e" ? [x + d0, 0, z - w / 2] : dir === "w" ? [x - d1, 0, z - w / 2] : dir === "s" ? [x - w / 2, 0, z + d0] : [x - w / 2, 0, z - d1];
      const b: V3 = dir === "e" ? [x + d1, h, z + w / 2] : dir === "w" ? [x - d0, h, z + w / 2] : dir === "s" ? [x + w / 2, h, z + d1] : [x + w / 2, h, z - d0];
      this.box(`${id}-${i}`, a, b, mat);
    }
    return this;
  }

  /** A volume marker from two corners. */
  volume(id: string, kind: string, a: V3, b: V3, data: Record<string, unknown>): this {
    this.markers.push(marker(id, kind, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], data, 0, [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]));
    return this;
  }

  m(...ns: Node[]): this {
    this.markers.push(...ns);
    return this;
  }
}
