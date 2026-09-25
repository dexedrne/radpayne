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
  | "enemy" // an enemy: { kind?: "goon" | "rusher" | "heavy", group?: string (spawned by a trigger), patrol?: string[] waypoint ids, milady?: number, perch?: boolean, model?: "rival652" | "rival723" (heavies), drop?: string | false }
  | "cover" // a cover point: { height?: "low" | "high" (default low), side?: "left" | "right" (high cover lean side) }; facing = the direction it protects toward
  | "waypoint" // an AI path node: { links?: string[] } (else auto-linked to waypoints in line of sight within 14 m)
  | "pickup" // { item: "copium" | "shotgun" | "smgs" | "shotgun_ammo" | "smgs_ammo", amount?: number }
  | "trigger" // volume = the node's scale: { action: "alert" | "spawn" | "exit" | "checkpoint" | "cutscene", group?: string, once?: boolean, afterKills?: number (also fires once this many hostiles are down) }
  | "crowd" // non-hostile dancers in an area (the node's scale): { count, clips: string[], milady?: number, role?: string, flee?: crowdExit id }
  | "crowdExit" // where the crowd runs to and vanishes (the entrance, the staff door, the fire exit)
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

/** Room settings (Data {room: {...}}): name, the next room, its music and look, the cutscene played
 *  after it is cleared, the footstep surface, and how the gang wakes (alertOnShot: the first shot
 *  anywhere alerts every idle hostile; alertAll: one alert wakes them all, one after another). */
export type RoomSettings = {
  name: string; next?: string; music?: string; look?: string; cutsceneAfter?: string; footsteps?: string;
  alertOnShot?: boolean; alertAll?: boolean; drops?: Record<string, string>; [k: string]: unknown;
};

export type LevelData = {
  boxes: Box[];
  /** What the camera collides with: every visible box (decor too, except thin trim under 0.2 m). */
  camBoxes: Box[];
  markers: Marker[];
  room: RoomSettings;
  warnings: string[];
  /** Hot emitters (material "glow k", k >= 3: headlights, lamps, neon): the kill cam keeps them out
   *  of the lens. Centre points. */
  glare: Array<{ x: number; y: number; z: number }>;
};

type Node = {
  id: string;
  disabled?: boolean;
  marker?: string;
  children?: Node[];
  components?: Record<string, { type?: string; properties?: Record<string, unknown> } | undefined>;
};
type Prefabish = { root: unknown; materials?: Record<string, { name?: string } | undefined> };

type Xf = { x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number };

function comp(node: Node, type: string): Record<string, unknown> | null {
  for (const c of Object.values(node.components ?? {})) if (c && c.type === type) return c.properties ?? {};
  return null;
}

const MARKERS = new Set<string>(["spawn", "enemy", "cover", "waypoint", "pickup", "trigger", "checkpoint", "exit", "light", "fx", "camera", "crowd", "crowdExit"]);

export function readLevel(prefab: Prefabish): LevelData {
  const boxes: Box[] = [];
  const camBoxes: Box[] = [];
  const markers: Marker[] = [];
  const warnings: string[] = [];
  const glare: LevelData["glare"] = [];
  let room: RoomSettings = { name: "room" };
  const hot = (id: unknown) => {
    const m = /^glow\s+([\d.]+)/.exec((typeof id === "string" && prefab.materials?.[id]?.name) || "");
    return !!m && Number(m[1]) >= 3;
  };

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
      if (g && mesh && (g.geometryType ?? "box") === "box") {
        const args = (g.args as number[] | undefined) ?? [1, 1, 1];
        const sx = xf.sx * (args[0] ?? 1), sy = xf.sy * (args[1] ?? 1), sz = xf.sz * (args[2] ?? 1);
        const collider = data.collider !== false && !decor;
        const surface = typeof data.surface === "string" ? data.surface : "concrete";
        if (collider) {
          if (Math.abs(rot[0] ?? 0) > 1e-4 || Math.abs(rot[2] ?? 0) > 1e-4) warnings.push(`${node.id}: X/Z rotation ignored by the collider (yaw only)`);
          boxes.push(makeBox(boxes.length, node.id, xf.x, xf.y, xf.z, sx, sy, sz, xf.yaw, surface, data.shootThrough === true));
        }
        if (hot(comp(node, "Material")?.materialId)) glare.push({ x: xf.x, y: xf.y, z: xf.z });
        const thick = Math.min(Math.abs(sx), Math.abs(sy), Math.abs(sz)) >= 0.2;
        if (mesh.visible !== false && data.camera !== false && (collider || thick)) {
          camBoxes.push(makeBox(camBoxes.length, node.id, xf.x, xf.y, xf.z, sx, sy, sz, xf.yaw, surface));
        }
      }
    }
    for (const ch of node.children ?? []) walk(ch, xf, decor || data.collider === false);
  };
  walk(prefab.root as Node, { x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 }, false);
  if (!markers.some(m => m.kind === "spawn")) warnings.push("no spawn marker: the player starts at the origin");
  return { boxes, camBoxes, markers, room, warnings, glare };
}
