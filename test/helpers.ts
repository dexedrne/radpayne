// Shared test fixtures: small hand-built levels and the greybox room.
import fs from "node:fs";
import path from "node:path";
import { readLevel, type LevelData } from "../src/world/level.ts";

type N = { id: string; components?: Record<string, unknown>; children?: N[] };

export function boxNode(id: string, pos: number[], size: number[], data?: Record<string, unknown>, yaw = 0): N {
  const c: Record<string, unknown> = {
    transform: { type: "Transform", properties: { position: pos, rotation: [0, yaw, 0], scale: size } },
    geometry: { type: "Geometry", properties: { geometryType: "box", args: [1, 1, 1] } },
    mesh: { type: "Mesh", properties: {} },
  };
  if (data) c.data = { type: "Data", properties: { data } };
  return { id, components: c };
}

export function markerNode(id: string, kind: string, pos: number[], data: Record<string, unknown> = {}, yaw = 0, scale?: number[]): N {
  return {
    id,
    components: {
      transform: { type: "Transform", properties: { position: pos, rotation: [0, yaw, 0], ...(scale ? { scale } : {}) } },
      data: { type: "Data", properties: { data: { marker: kind, ...data } } },
    },
  };
}

export function level(children: N[]): LevelData {
  return readLevel({ root: { id: "root", children: [boxNode("floor", [0, -0.5, 0], [200, 1, 200]), ...children] } });
}

export function greybox(): LevelData {
  const file = path.resolve(import.meta.dirname, "..", "public", "levels", "greybox.json");
  return readLevel(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function room1(): LevelData {
  const file = path.resolve(import.meta.dirname, "..", "public", "levels", "room1.json");
  return readLevel(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function room2(): LevelData {
  const file = path.resolve(import.meta.dirname, "..", "public", "levels", "room2.json");
  return readLevel(JSON.parse(fs.readFileSync(file, "utf8")));
}
