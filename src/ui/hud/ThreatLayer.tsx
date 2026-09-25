// Threat markers (the main readability aid): a pink chevron over each awake Milady's head; a
// sand-hot "!" starburst when she is lining you up (peeking / engaging with a line of sight); 55%
// when she can't see you; a flash on the frame she fires; an edge arrow for the ones lining you up
// off screen. Once the room is clear, a paper chevron + DOOR tag marks the exit. A pool of divs whose
// transforms are written every frame (HudFrame); React never re-renders per frame.
import { memo, useEffect, useMemo, useRef } from "react";
import { Vector3, type Camera } from "three";
import type { Session } from "../../app/session.ts";
import { useUi } from "../store.ts";
import { HB_HEAD, aimPoint, makeCapsules } from "../../combat/hitboxes.ts";
import { edgePin, starPath, threatScale } from "./logic.ts";
import { hudFrame } from "./HudFrame.tsx";
import { hudScaleNow } from "./scale.ts";

const INK = "#0b0a0d";
const BURST = starPath(0, 0, 21, 13, 9, -Math.PI / 2);
const ARROW = "M-12 -4 L0 12 L12 -4 L4 -4 L4 -13 L-4 -13 L-4 -4 Z";

/** performance.now() of each Milady's last shot (the marker flashes for 120 ms). */
export const enemyShotAt: number[] = [];

/** Where each marker ended up last frame (smoke tests / screenshots read it). */
export const threatProbe: Array<{ i: number; x: number; y: number; on: boolean; engaged: boolean; arrow: boolean }> = [];

function Marker({ exit }: { exit?: boolean }) {
  if (exit) return (
    <>
      <svg className="chev" width="36" height="30" viewBox="0 0 32 27"><path className="o" d="M3 3 H29 L16 23 Z" fill="#f3ead8" strokeWidth="3" strokeLinejoin="round" /></svg>
      <div className="rp-tag door">DOOR</div>
    </>
  );
  return (
    <>
      <svg className="chev" width="32" height="27" viewBox="0 0 32 27">
        <path className="o" d="M3 3 H29 L16 23 Z" fill="#ff3fa8" strokeWidth="3" strokeLinejoin="round" />
        <path d="M9 6 H23" stroke="#fff" strokeWidth="2" opacity=".55" />
      </svg>
      <svg className="burst" width="46" height="46" viewBox="-23 -23 46 46" style={{ display: "none" }}>
        <path className="o" d={BURST} fill="#ffcf6a" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="-2.6" y="-11" width="5.2" height="13" fill={INK} /><rect x="-2.6" y="5" width="5.2" height="5" fill={INK} />
      </svg>
    </>
  );
}

function Arrow() {
  return (
    <svg width="40" height="40" viewBox="-15 -15 30 30">
      <path className="body" d={ARROW} transform="rotate(180)" fill="#ff3fa8" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path className="notch" d="M-3 -1 L3 -1 L0 4 Z" transform="rotate(180)" fill={INK} style={{ display: "none" }} />
    </svg>
  );
}

export const ThreatLayer = memo(function ThreatLayer({ s }: { s: Session }) {
  const n = s.game.enemies.length;
  const marks = useRef<Array<HTMLDivElement | null>>([]);
  const arrows = useRef<Array<HTMLDivElement | null>>([]);
  const tmp = useMemo(() => ({ v: new Vector3(), head: { x: 0, y: 0, z: 0 }, caps: makeCapsules() }), []);

  useEffect(() => s.on(e => {
    if (e.type === "shot" && e.shooter >= 0) enemyShotAt[e.shooter] = performance.now();
  }), [s]);

  useEffect(() => {
    const hideAll = () => {
      for (const el of marks.current) if (el) el.style.display = "none";
      for (const el of arrows.current) if (el) el.style.display = "none";
      threatProbe.length = 0;
    };
    const place = (i: number, wx: number, wy: number, wz: number, camera: Camera, W: number, H: number, k: number, opts: { kind: "idle" | "engaged" | "exit"; showMark: boolean; showArrow: boolean; alpha: number; fire: boolean }) => {
      const mark = marks.current[i], arrow = arrows.current[i];
      if (!mark || !arrow) return;
      const v = tmp.v.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
      const front = v.z < -0.05;
      const cx = v.x, cy = v.y; // camera space (x right, y up): the bearing, even behind the lens
      v.applyMatrix4(camera.projectionMatrix);
      const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
      const onScreen = front && x >= 0 && x <= W && y >= 0 && y <= H;
      if (onScreen && opts.showMark) {
        mark.style.display = "block";
        mark.style.opacity = String(opts.alpha);
        mark.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${(k * (opts.fire ? 1.25 : 1)).toFixed(3)})`;
        mark.style.transformOrigin = "50% 100%";
        mark.classList.toggle("fire", opts.fire);
        if (opts.kind !== "exit") {
          (mark.children[0] as SVGElement).style.display = opts.kind === "engaged" ? "none" : "block";
          (mark.children[1] as SVGElement).style.display = opts.kind === "engaged" ? "block" : "none";
        }
      } else mark.style.display = "none";
      const showArrow = !onScreen && opts.showArrow;
      if (showArrow) {
        const dx = front ? x - W / 2 : cx, dy = front ? y - H / 2 : -cy;
        const p = edgePin(Math.abs(dx) + Math.abs(dy) < 1e-4 ? 0 : dx, Math.abs(dx) + Math.abs(dy) < 1e-4 ? 1 : dy, W, H, 22 + 20 * hudScaleNow());
        arrow.style.display = "block";
        arrow.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${hudScaleNow().toFixed(3)}) rotate(${p.rot.toFixed(1)}deg)`;
        const body = arrow.querySelector(".body") as SVGElement, notch = arrow.querySelector(".notch") as SVGElement;
        body.setAttribute("fill", opts.kind === "exit" ? "#f3ead8" : opts.kind === "engaged" ? "#ffcf6a" : "#ff3fa8");
        notch.style.display = opts.kind === "engaged" ? "block" : "none";
      } else arrow.style.display = "none";
      threatProbe.push({ i, x, y, on: onScreen && opts.showMark, engaged: opts.kind === "engaged", arrow: showArrow });
    };

    const f = (camera: Camera, ss: Session, now: number) => {
      const ui = useUi.getState();
      const g = ss.game;
      const mode = ui.threats;
      threatProbe.length = 0;
      if (ui.screen !== "play" || g.phase === "killcam" || ui.deadAt || mode === "off" && g.phase !== "clear") { hideAll(); return; }
      const W = innerWidth, H = innerHeight, S = hudScaleNow();
      const p = ss.renderP;
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        const awake = e.state !== "inactive" && e.state !== "dead";
        const engaged = awake && (e.state === "peek" || e.state === "engage") && e.sees;
        const showMark = awake && mode !== "off" && (mode === "all" || engaged);
        const showArrow = engaged && mode !== "off";
        if (!showMark && !showArrow) { const m = marks.current[i], a = arrows.current[i]; if (m) m.style.display = "none"; if (a) a.style.display = "none"; continue; }
        // the hit skeleton's head, moved to where the body is drawn this frame
        if (!aimPoint("milady", e.hit.pose, HB_HEAD, tmp.head, tmp.caps)) continue;
        const r = ss.renderE[i] ?? e;
        const hx = tmp.head.x + (r.x - e.x), hy = tmp.head.y + (r.y - e.y) + 0.25, hz = tmp.head.z + (r.z - e.z);
        const dist = Math.hypot(r.x - p.x, r.z - p.z);
        place(i, hx, hy, hz, camera, W, H, threatScale(dist) * S, { kind: engaged ? "engaged" : "idle", showMark, showArrow, alpha: e.sees ? 1 : 0.55, fire: now - (enemyShotAt[i] ?? -1e9) < 120 });
      }
      // the exit, once the room is clear
      const exit = g.phase === "clear" ? g.triggers.find(t => t.data.action === "exit") : undefined;
      if (exit) place(n, exit.x, exit.y + exit.hy + 0.4, exit.z, camera, W, H, S, { kind: "exit", showMark: true, showArrow: true, alpha: 1, fire: false });
      else { const m = marks.current[n], a = arrows.current[n]; if (m) m.style.display = "none"; if (a) a.style.display = "none"; }
    };
    hudFrame.add(f);
    return () => { hudFrame.delete(f); };
  }, [s, n, tmp]);

  return (
    <div className="rp-threats">
      {Array.from({ length: n + 1 }, (_, i) => (
        <div key={`m${i}`} ref={el => { marks.current[i] = el; }} className="m"><Marker exit={i === n} /></div>
      ))}
      {Array.from({ length: n + 1 }, (_, i) => (
        <div key={`a${i}`} ref={el => { arrows.current[i] = el; }} className="m"><Arrow /></div>
      ))}
    </div>
  );
});
