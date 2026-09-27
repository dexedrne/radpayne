// Prefab-building helpers shared by the round-3 level tools (tools/room4.ts, tools/room5.ts): boxes by
// centre + size or by two corners, primitives, markers, the textured / glowing material specs, and the
// writer (the compact JSON the editor reads back). Rooms 1-3 keep their own copies.
import fs from "node:fs";
import path from "node:path";

export type Node = { id: string; components?: Record<string, unknown>; children?: Node[] };
export type V3 = [number, number, number];

export const PI = Math.PI;
export const R90 = PI / 2;
/** Marker yaws: the direction they face. */
export const FACE_W = -R90; // toward -X
export const FACE_E = R90; // toward +X
export const FACE_N = PI; // toward -Z
export const FACE_S = 0; // toward +Z

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rv = (v: number[]) => v.map(r3);
export const xf = (position: number[], rotation?: number[], scale?: number[]) => ({
  type: "Transform",
  properties: { position: rv(position), ...(rotation && rotation.some(a => a) ? { rotation: rv(rotation) } : {}), ...(scale ? { scale: rv(scale) } : {}) },
});

export type BoxOpts = { rot?: number[]; data?: Record<string, unknown>; hidden?: boolean };
export function box(id: string, pos: number[], size: number[], mat: string, o: BoxOpts = {}): Node {
  const comps: Record<string, unknown> = {
    transform: xf(pos, o.rot, size),
    geometry: { type: "Geometry", properties: { geometryType: "box", args: [1, 1, 1] } },
    material: { type: "Material", properties: { materialId: mat } },
    mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false, ...(o.hidden ? { visible: false } : {}) } },
  };
  if (o.data) comps.data = { type: "Data", properties: { data: o.data } };
  return { id, components: comps };
}
export function boxMM(id: string, a: V3, b: V3, mat: string, o: BoxOpts = {}): Node {
  return box(id, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])], mat, o);
}
export function prim(id: string, type: "cylinder" | "sphere", pos: number[], args: number[], mat: string, rot?: number[]): Node {
  return {
    id,
    components: {
      transform: xf(pos, rot),
      geometry: { type: "Geometry", properties: { geometryType: type, args: args.map(r3) } },
      material: { type: "Material", properties: { materialId: mat } },
      mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false } },
    },
  };
}
export function marker(id: string, kind: string, pos: number[], data: Record<string, unknown> = {}, yaw = 0, scale?: number[]): Node {
  return {
    id,
    components: {
      transform: xf(pos, yaw ? [0, yaw, 0] : undefined, scale),
      data: { type: "Data", properties: { data: { marker: kind, ...data } } },
    },
  };
}

/** A repeating texture (metres per tile) under the look's world-space UVs. */
export const tex = (file: string, metres: number | [number, number], extra: Record<string, unknown> = {}) => {
  const [mx, my] = Array.isArray(metres) ? metres : [metres, metres];
  return { color: "#ffffff", texture: file, repeat: true, repeatCount: [1 / mx, 1 / my], roughness: 0.8, ...extra };
};
/** An unlit emitter the look scales by its gain (the "glow <g>" token, + "flicker" etc.). */
export const glow = (color: string, g: number, extra = "", texture?: string) => ({ materialType: "basic", color, toneMapped: false, name: `glow ${g}${extra ? ` ${extra}` : ""}`, ...(texture ? { texture } : {}) });

/** Write public/levels/<id>.json (throws on duplicate node ids) and print a one-line summary. */
export function writeLevel(id: string, name: string, room: Record<string, unknown>, materials: Record<string, Record<string, unknown>>, solid: Node[], decor: Node[], markers: Node[]): void {
  const prefab = {
    id,
    name,
    materials,
    root: {
      id: "room",
      components: { data: { type: "Data", properties: { data: { room } } } },
      children: [
        { id: "geometry", children: solid },
        { id: "decor", components: { data: { type: "Data", properties: { data: { collider: false } } } }, children: decor },
        { id: "markers", children: markers },
      ],
    },
  };
  const seen = new Set<string>();
  const dupes: string[] = [];
  const visit = (n: { id: string; children?: Array<{ id: string }> }) => { if (seen.has(n.id)) dupes.push(n.id); seen.add(n.id); for (const c of n.children ?? []) visit(c); };
  visit(prefab.root);
  if (dupes.length) throw new Error(`duplicate node ids: ${dupes.slice(0, 10).join(", ")}`);
  for (const [k, m] of Object.entries(materials)) if (typeof m.texture === "string" && !fs.existsSync(path.resolve(import.meta.dirname, "..", "public", (m.texture as string).replace(/^\//, "")))) throw new Error(`material ${k}: no file ${m.texture as string}`);
  const outFile = path.resolve(import.meta.dirname, "..", "public", "levels", `${id}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const json = JSON.stringify(prefab, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.split(/,\s*/).join(", ")}]`);
  fs.writeFileSync(outFile, json + "\n");
  const count = (ns: Node[]): number => ns.reduce((s, n) => s + 1 + count(n.children ?? []), 0);
  console.log(`wrote ${path.relative(process.cwd(), outFile)}: ${count(solid)} solid nodes, ${count(decor)} decor nodes, ${markers.length} markers, ${Object.keys(materials).length} materials, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
}
