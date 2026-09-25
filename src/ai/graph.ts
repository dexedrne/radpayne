// Waypoint graph and cover points from the level markers (spec section 5: no navmesh). Waypoints link
// explicitly (Data {links: [ids]}) or, with no links given, to every waypoint in line of sight within
// AUTO_LINK m. Paths are A* over the graph with straight-line shortcuts when the way is clear.
import type { Marker } from "../world/level.ts";
import type { World } from "../sim/world.ts";

export const AUTO_LINK = 14;
/** Height the walk-clear checks sample at (knee height: low cover blocks walking). */
const WALK_Y = 0.45;

export type Waypoint = { id: string; x: number; y: number; z: number; links: number[] };

export type Cover = {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Unit direction the cover protects toward (the marker's facing). */
  fx: number;
  fz: number;
  high: boolean;
  /** High cover: which side to lean out (+1 = the actor's local +x). */
  side: number;
  /** Enemy index holding it, or -1. */
  claimed: number;
};

export class Graph {
  readonly nodes: Waypoint[] = [];
  readonly covers: Cover[] = [];
  private readonly world: World;

  constructor(markers: Marker[], world: World) {
    this.world = world;
    const wps = markers.filter(m => m.kind === "waypoint");
    const byId = new Map<string, number>();
    for (const m of wps) {
      byId.set(m.id, this.nodes.length);
      this.nodes.push({ id: m.id, x: m.x, y: m.y, z: m.z, links: [] });
    }
    const link = (a: number, b: number) => {
      if (a === b) return;
      if (!this.nodes[a].links.includes(b)) this.nodes[a].links.push(b);
      if (!this.nodes[b].links.includes(a)) this.nodes[b].links.push(a);
    };
    wps.forEach((m, i) => {
      const links = m.data.links;
      if (Array.isArray(links)) for (const l of links) { const j = byId.get(String(l)); if (j !== undefined) link(i, j); }
    });
    wps.forEach((m, i) => {
      if (Array.isArray(m.data.links)) return;
      for (let j = 0; j < this.nodes.length; j++) {
        if (j === i) continue;
        const a = this.nodes[i], b = this.nodes[j];
        const d = Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
        if (d <= AUTO_LINK && this.walkClear(a.x, a.y, a.z, b.x, b.y, b.z)) link(i, j);
      }
    });
    for (const m of markers) {
      if (m.kind !== "cover") continue;
      const high = m.data.height === "high";
      const side = m.data.side === "left" ? 1 : m.data.side === "right" ? -1 : 1;
      this.covers.push({ id: m.id, x: m.x, y: m.y, z: m.z, fx: Math.sin(m.yaw), fz: Math.cos(m.yaw), high, side, claimed: -1 });
    }
  }

  walkClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return this.world.clear(ax, ay + WALK_Y, az, bx, by + WALK_Y, bz, false);
  }

  nearest(x: number, y: number, z: number, needClear = true): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d >= bd) continue;
      if (needClear && !this.walkClear(x, y, z, n.x, n.y, n.z)) continue;
      best = i;
      bd = d;
    }
    return best;
  }

  /**
   * Path from (x, z) to (tx, tz) as a list of points (excluding the start). Straight when clear, else
   * via A* on the waypoints. Returns null when there is no way.
   */
  path(x: number, y: number, z: number, tx: number, ty: number, tz: number): Array<{ x: number; z: number }> | null {
    if (this.walkClear(x, y, z, tx, ty, tz)) return [{ x: tx, z: tz }];
    const s = this.nearest(x, y, z), g = this.nearest(tx, ty, tz);
    if (s < 0 || g < 0) return null;
    const n = this.nodes.length;
    const gScore = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const open = new Set<number>([s]);
    const closed = new Uint8Array(n);
    gScore[s] = 0;
    const h = (i: number) => Math.sqrt((this.nodes[i].x - this.nodes[g].x) ** 2 + (this.nodes[i].z - this.nodes[g].z) ** 2);
    while (open.size) {
      let cur = -1, cf = Infinity;
      for (const i of open) { const f = gScore[i] + h(i); if (f < cf || (f === cf && i < cur)) { cf = f; cur = i; } }
      if (cur === g) break;
      open.delete(cur);
      closed[cur] = 1;
      const a = this.nodes[cur];
      for (const j of a.links) {
        if (closed[j]) continue;
        const b = this.nodes[j];
        const t = gScore[cur] + Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
        if (t < gScore[j]) { gScore[j] = t; came[j] = cur; open.add(j); }
      }
    }
    if (s !== g && came[g] < 0) return null;
    const out: Array<{ x: number; z: number }> = [{ x: tx, z: tz }];
    for (let i = g; i >= 0; i = came[i]) out.unshift({ x: this.nodes[i].x, z: this.nodes[i].z });
    // shortcut: drop leading waypoints the start can already walk past
    while (out.length > 1 && this.walkClear(x, y, z, out[1].x, y, out[1].z)) out.shift();
    return out;
  }
}
