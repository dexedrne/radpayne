// Level prefab (public/levels/<room>.json, hand-editable in the engine's editor) -> the sim's level.
//
//  - Every node with a box Geometry and a Mesh becomes a collider (its world transform: position,
//    yaw and scale composed down the tree; X/Z tilt is ignored with a warning). Opt out per node with
//    Data {"collider": false}; on a group node it opts out the whole subtree (decor: signs, awnings,
//    fire-escape stairs). Data {"shootThrough": true} lets bullets pass; Data {"surface": "metal"}
//    tags impacts.
//  - A node whose Data has a "marker" field (or a top-level "marker" field) is a gameplay marker and
//    never a collider. Kinds and their fields are listed in MarkerKind below; the node's position is
//    the marker's point, its Y rotation its facing (+Z forward) and, for triggers, its scale the volume.
//  - Data {"room": {...}} anywhere (usually the root) holds room settings (name, next room, music).
import { makeBox, type Box } from "../sim/world.ts";

export type MarkerKind =
  | "spawn" // player start (facing = yaw)
  | "enemy" // an enemy: { kind?: "goon", group?: string (spawned by a trigger), patrol?: string[] waypoint ids, milady?: number }
  | "cover" // a cover point: { height?: "low" | "high" (default low), side?: "left" | "right" (high cover lean side) }; facing = the direction it protects toward
  | "waypoint" // an AI path node: { links?: string[] } (else auto-linked to waypoints in line of sight within 14 m)
  | "pickup" // { item: "copium", amount?: number }
  | "trigger" // volume = the node's scale: { action: "alert" | "spawn" | "exit" | "checkpoint" | "cutscene", group?: string, once?: boolean }
  | "checkpoint" // respawn point (facing = yaw)
  | "exit" // room exit point (the door the player walks through after the room is clear)
  | "light" // a light the look pass can use (the sim ignores it)
  | "fx" // a look effect: { fx: "steam" | "drip", ... } (the sim ignores it; see src/app/look/street.tsx)
  | "camera"; // a scripted camera point (cutscenes / intro; the sim ignores it)

export type Marker = {
  kind: MarkerKind;
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Half extents (triggers). */
  hx: number;
  hy: number;
  hz: number;
  data: Record<string, unknown>;
};

export type RoomSettings = { name: string; next?: string; music?: string; [k: string]: unknown };

export type LevelData = {
  boxes: Box[];
  markers: Marker[];
  room: RoomSettings;
  warnings: string[];
};

type Node = {
  id: string;
  disabled?: boolean;
  marker?: string;
  children?: Node[];
  components?: Record<string, { type?: string; properties?: Record<string, unknown> } | undefined>;
};
type Prefabish = { root: unknown };

type Xf = { x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number };

function comp(node: Node, type: string): Record<string, unknown> | null {
  for (const c of Object.values(node.components ?? {})) if (c && c.type === type) return c.properties ?? {};
  return null;
}

const MARKERS = new Set<string>(["spawn", "enemy", "cover", "waypoint", "pickup", "trigger", "checkpoint", "exit", "light", "fx", "camera"]);

export function readLevel(prefab: Prefabish): LevelData {
  const boxes: Box[] = [];
  const markers: Marker[] = [];
  const warnings: string[] = [];
  let room: RoomSettings = { name: "room" };

  const walk = (node: Node, parent: Xf, decor: boolean) => {
    if (node.disabled) return;
    const t = comp(node, "Transform");
    const pos = (t?.position as number[] | undefined) ?? [0, 0, 0];
    const rot = (t?.rotation as number[] | undefined) ?? [0, 0, 0];
    const scl = (t?.scale as number[] | undefined) ?? [1, 1, 1];
    // child position in the parent's frame: scale, then the parent's yaw
    const lx = pos[0] * parent.sx, ly = pos[1] * parent.sy, lz = pos[2] * parent.sz;
    const c = Math.cos(parent.yaw), s = Math.sin(parent.yaw);
    const xf: Xf = {
      x: parent.x + lx * c + lz * s,
      y: parent.y + ly,
      z: parent.z - lx * s + lz * c,
      yaw: parent.yaw + (rot[1] ?? 0),
      sx: parent.sx * (scl[0] ?? 1), sy: parent.sy * (scl[1] ?? 1), sz: parent.sz * (scl[2] ?? 1),
    };
    const data = (comp(node, "Data")?.data as Record<string, unknown> | undefined) ?? {};
    if (data.room && typeof data.room === "object") room = { ...room, ...(data.room as RoomSettings) };
    const markerKind = (typeof data.marker === "string" ? data.marker : node.marker) as string | undefined;
    if (markerKind) {
      if (!MARKERS.has(markerKind)) warnings.push(`${node.id}: unknown marker "${markerKind}"`);
      else markers.push({
        kind: markerKind as MarkerKind, id: node.id, x: xf.x, y: xf.y, z: xf.z, yaw: xf.yaw,
        hx: Math.abs(xf.sx) / 2, hy: Math.abs(xf.sy) / 2, hz: Math.abs(xf.sz) / 2, data,
      });
    } else {
      const g = comp(node, "Geometry");
      const mesh = comp(node, "Mesh");
      if (g && mesh && (g.geometryType ?? "box") === "box" && data.collider !== false && !decor) {
        if (Math.abs(rot[0] ?? 0) > 1e-4 || Math.abs(rot[2] ?? 0) > 1e-4) warnings.push(`${node.id}: X/Z rotation ignored by the collider (yaw only)`);
        const args = (g.args as number[] | undefined) ?? [1, 1, 1];
        boxes.push(makeBox(
          boxes.length, node.id, xf.x, xf.y, xf.z,
          xf.sx * (args[0] ?? 1), xf.sy * (args[1] ?? 1), xf.sz * (args[2] ?? 1), xf.yaw,
          typeof data.surface === "string" ? data.surface : "concrete", data.shootThrough === true,
        ));
      }
    }
    for (const ch of node.children ?? []) walk(ch, xf, decor || data.collider === false);
  };
  walk(prefab.root as Node, { x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 }, false);
  if (!markers.some(m => m.kind === "spawn")) warnings.push("no spawn marker: the player starts at the origin");
  return { boxes, markers, room, warnings };
}
