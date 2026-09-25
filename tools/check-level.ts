// Level check: parses public/levels/<room>.json like the game does and prints colliders, markers,
// the waypoint graph and anything suspicious (unlinked waypoints, covers with no waypoint in reach,
// enemies/pickups inside boxes, no spawn / exit).
//   node tools/check-level.ts [room]   (default: every file in public/levels)
import fs from "node:fs";
import path from "node:path";
import { readLevel } from "../src/world/level.ts";
import { World } from "../src/sim/world.ts";
import { Graph } from "../src/ai/graph.ts";

const dir = path.resolve(import.meta.dirname, "..", "public", "levels");
const arg = process.argv[2];
const files = arg ? [`${arg.replace(/\.json$/, "")}.json`] : fs.readdirSync(dir).filter(f => f.endsWith(".json"));
let bad = 0;
for (const f of files) {
  const level = readLevel(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const world = new World(level.boxes);
  const graph = new Graph(level.markers, world);
  const count = (k: string) => level.markers.filter(m => m.kind === k).length;
  const issues = [...level.warnings];
  graph.nodes.forEach(n => { if (!n.links.length) issues.push(`waypoint ${n.id} has no links`); });
  for (const c of graph.covers) if (graph.nearest(c.x, c.y, c.z) < 0) issues.push(`cover ${c.id}: no waypoint in walkable line of sight`);
  for (const m of level.markers) {
    if (m.kind !== "enemy" && m.kind !== "pickup" && m.kind !== "spawn" && m.kind !== "cover") continue;
    for (const b of level.boxes) {
      const dx = m.x - b.cx, dz = m.z - b.cz;
      const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
      if (Math.abs(lx) < b.hx && Math.abs(lz) < b.hz && m.y + 0.5 > b.bottom && m.y + 0.5 < b.top) issues.push(`${m.kind} ${m.id} is inside box ${b.node}`);
    }
  }
  if (!count("exit") && !level.markers.some(m => m.kind === "trigger" && m.data.action === "exit")) issues.push("no exit: the room ends 2.5 s after it is cleared");
  console.log(`${f}: "${level.room.name}" ${level.boxes.length} colliders, spawn ${count("spawn")}, enemies ${count("enemy")}, covers ${count("cover")}, waypoints ${count("waypoint")} (${graph.nodes.reduce((s, n) => s + n.links.length, 0) / 2} links), pickups ${count("pickup")}, triggers ${count("trigger")}`);
  for (const i of issues) console.log(`  ! ${i}`);
  bad += issues.length;
}
process.exitCode = 0;
if (bad) console.log(`${bad} note(s)`);
