// ?editor[=<room>] (dev / test builds only): prnth's PrefabEditor on public/levels/<room>.json
// (default greybox). Save writes the file back through the dev server and prints the level check.
// Markers (Data {marker: ...}) are drawn as gizmos so they can be seen and moved: cones for facing
// (spawn / enemy / cover / exit), spheres for waypoints and pickups, wire boxes for triggers.
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PrefabEditor, type PrefabEditorRef } from "react-three-game/editor";
import type { Prefab } from "react-three-game";
import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { readLevel } from "../../world/level.ts";

const COLORS: Record<string, string> = { spawn: "#ffffff", enemy: "#ff3fa8", cover: "#39ff88", waypoint: "#3fa8ff", pickup: "#ff8a1f", trigger: "#ffe23f", checkpoint: "#ffffff", exit: "#3ff0ff", light: "#ffae52", camera: "#aaaaaa" };

/** Redraws the marker gizmos from the editor's live document twice a second. */
function MarkerGizmos({ get }: { get: () => Prefab | null }) {
  const group = useRef(new Group());
  const last = useRef("");
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current < 0.5) return;
    t.current = 0;
    const doc = get();
    if (!doc) return;
    const lv = readLevel(doc as unknown as Parameters<typeof readLevel>[0]);
    const sig = JSON.stringify(lv.markers.map(m => [m.kind, m.x, m.y, m.z, m.yaw, m.hx, m.hz]));
    if (sig === last.current) return;
    last.current = sig;
    const g = group.current;
    for (const c of [...g.children]) g.remove(c);
    for (const m of lv.markers) {
      const mat = new MeshBasicMaterial({ color: COLORS[m.kind] ?? "#fff", wireframe: m.kind === "trigger", transparent: true, opacity: 0.8 });
      if (m.kind === "trigger") {
        const b = new Mesh(new BoxGeometry(m.hx * 2, m.hy * 2, m.hz * 2), mat);
        b.position.set(m.x, m.y, m.z);
        b.rotation.y = m.yaw;
        g.add(b);
      } else if (["spawn", "enemy", "cover", "exit", "checkpoint"].includes(m.kind)) {
        const holder = new Group();
        holder.position.set(m.x, m.y + (m.kind === "cover" ? 0.35 : 1), m.z);
        holder.rotation.y = m.yaw;
        const cone = new Mesh(new ConeGeometry(0.2, 0.55, 8), mat);
        cone.rotation.x = Math.PI / 2;
        holder.add(cone);
        g.add(holder);
      } else {
        const sph = new Mesh(new SphereGeometry(0.18, 10, 8), mat);
        sph.position.set(m.x, m.y + 0.2, m.z);
        g.add(sph);
      }
    }
  });
  return <primitive object={group.current} />;
}

function FrameLevel() {
  const controls = useThree(s => s.controls) as unknown as { target?: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null;
  const camera = useThree(s => s.camera);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !controls?.target) return;
    done.current = true;
    controls.target.set(0, 0, 0);
    camera.position.set(-28, 26, 30);
    camera.far = 1000;
    camera.updateProjectionMatrix();
    controls.update?.();
  }, [controls, camera]);
  return null;
}

async function save(room: string, data: unknown): Promise<string> {
  const body = JSON.stringify(data, null, 1) + "\n";
  if (import.meta.env.DEV) {
    try {
      const r = await fetch(`/__radpayne/save?room=${encodeURIComponent(room)}`, { method: "POST", headers: { "content-type": "application/json" }, body });
      return ((await r.json()) as { message: string }).message;
    } catch (e) {
      return `save failed: ${String(e)}`;
    }
  }
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${room}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `downloaded ${room}.json - copy it into public/levels/`;
}

export default function EditorPage() {
  const room = new URLSearchParams(location.search).get("editor") || "greybox";
  const [prefab, setPrefab] = useState<Prefab | null>(null);
  const [status, setStatus] = useState("");
  const ref = useRef<PrefabEditorRef>(null);
  useEffect(() => {
    fetch(`/levels/${room}.json?v=${Date.now()}`).then(r => r.json()).then(setPrefab, e => setStatus(`load failed: ${String(e)}`));
  }, [room]);
  const bar: React.CSSProperties = { position: "fixed", left: "50%", bottom: 10, transform: "translateX(-50%)", zIndex: 50, display: "flex", gap: 8, alignItems: "center", background: "rgba(12,12,20,0.92)", color: "#fff", padding: "6px 10px", borderRadius: 6, font: "12px ui-monospace, monospace", maxWidth: "92vw" };
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {prefab && (
        <PrefabEditor ref={ref} prefab={prefab} canvasProps={{ flat: true, camera: { position: [-28, 26, 30], far: 1000 } }}>
          <color attach="background" args={["#10131f"]} />
          <hemisphereLight args={["#c8d4ff", "#3a3040", 1.4]} />
          <directionalLight position={[-30, 40, 20]} intensity={1.2} />
          <FrameLevel />
          <MarkerGizmos get={() => ref.current?.save() ?? null} />
        </PrefabEditor>
      )}
      <div style={bar}>
        <b>editor: {room}.json</b>
        <button onClick={async () => { const d = ref.current?.save(); if (!d) return; setStatus("saving…"); setStatus(await save(room, d)); }}>save</button>
        <a href={`/?room=${room}&skip`} style={{ color: "#93c5fd" }}>play</a>
        <span style={{ opacity: 0.85, whiteSpace: "pre-wrap", maxWidth: 560 }}>{status || "boxes = colliders; Data {marker} nodes = spawn / enemy / cover / waypoint / pickup / trigger / exit"}</span>
      </div>
    </div>
  );
}
