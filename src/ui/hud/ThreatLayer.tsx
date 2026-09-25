// Threat markers (the main readability aid): a pink chevron over each awake Milady's head; a
// sand-hot "!" starburst when she is lining you up (peeking / engaging with a line of sight); 55%
// when she can't see you; a flash on the frame she fires. A marker fades right down when her head
// sits inside the Radbro's silhouette or next to the reticle (it would cover him or your aim). An
// edge arrow (40 px authored, an ink keyline, never under 36 px on screen) points at each one lining
// you up off screen; the arrows ride a ring round the top and the side edges, never the bottom edge
// (the Radbro and the crosswalk under him), stopping above the corner plates and round the top-left
// group. Once the room is clear, a paper chevron + DOOR tag marks the exit. A pool of divs whose
// transforms are written every frame (HudFrame); React never re-renders per frame.
import { memo, useEffect, useMemo, useRef } from "react";
import { Vector3, type Camera } from "three";
import type { Session } from "../../app/session.ts";
import { useUi } from "../store.ts";
import { HB_HEAD, aimPoint, makeCapsules, poseHitboxes } from "../../combat/hitboxes.ts";
import { MARK_FADED, arrowDir, arrowPx, arrowRing, damageAngle, markerFades, markerScale, reticleFadePx, ringPin, starPath, type Ring, type ScreenCapsule } from "./logic.ts";
import { hudFrame } from "./HudFrame.tsx";
import { hudScaleNow } from "./scale.ts";

const INK = "#0b0a0d";
const BURST = starPath(0, 0, 21, 13, 9, -Math.PI / 2);
/** A block arrow pointing up (0 deg), 34 x 37 in a 44-unit box; its 6-unit ink keyline is painted under the fill. */
const ARROW = "M0 -19 L17 -1 L7.5 -1 L7.5 18 L-7.5 18 L-7.5 -1 L-17 -1 Z";
/** The arrow box's size for an arrow `a` px across (the body with its keyline is 40 of the 44 units). */
const arrowBox = (a: number): number => (a * 44) / 40;
/** The Radbro's drawn size over his hit capsules (m): the hair round the head, the arms and guns. */
const PAD_HEAD = 0.14, PAD_BODY = 0.1;

/** performance.now() of each Milady's last shot (the marker flashes for 120 ms). */
export const enemyShotAt: number[] = [];

/** Where each marker ended up last frame (smoke tests / screenshots read it). */
export const threatProbe: Array<{ i: number; x: number; y: number; on: boolean; engaged: boolean; faded: boolean; arrow: boolean; ax: number; ay: number; size: number }> = [];

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
  const b = arrowBox(40);
  return (
    <svg width={b} height={b} viewBox="-22 -22 44 44">
      <path className="body" d={ARROW} fill="#ff3fa8" stroke={INK} strokeWidth="6" strokeLinejoin="round" paintOrder="stroke" />
      {/* engaged (she has you in her sights): an ink "!" in the stem */}
      <g className="notch" fill={INK} style={{ display: "none" }}><rect x="-2.3" y="0.5" width="4.6" height="10" /><rect x="-2.3" y="12.5" width="4.6" height="3.8" /></g>
    </svg>
  );
}

export const ThreatLayer = memo(function ThreatLayer({ s }: { s: Session }) {
  const n = s.game.enemies.length;
  const marks = useRef<Array<HTMLDivElement | null>>([]);
  const arrows = useRef<Array<HTMLDivElement | null>>([]);
  const tmp = useMemo(() => ({
    v: new Vector3(), fwd: new Vector3(), px: 0, pz: 0, head: { x: 0, y: 0, z: 0 }, caps: makeCapsules(), pcaps: makeCapsules(),
    sil: [] as ScreenCapsule[], sides: [] as Array<-1 | 0 | 1>, box: 0,
    /** The top-left group and a nudge, measured a few times a second (the arrows step round them). */
    tl: null as { right: number; bottom: number } | null, nudgeTop: null as number | null, measuredAt: -1e9,
  }), []);

  useEffect(() => s.on(e => {
    if (e.type === "shot" && e.shooter >= 0) enemyShotAt[e.shooter] = performance.now();
  }), [s]);

  useEffect(() => {
    const hideAll = () => {
      for (const el of marks.current) if (el) el.style.display = "none";
      for (const el of arrows.current) if (el) el.style.display = "none";
      threatProbe.length = 0;
    };
    /** Screen x, y and the depth (m in front of the lens, <= 0 behind it) of a world point. */
    const project = (wx: number, wy: number, wz: number, camera: Camera, W: number, H: number): [number, number, number] => {
      const v = tmp.v.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
      const depth = -v.z;
      v.applyMatrix4(camera.projectionMatrix);
      return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H, depth];
    };
    /** The Radbro's hit capsules on screen, padded to his drawn size. */
    const silhouette = (ss: Session, camera: Camera, W: number, H: number) => {
      const sil = tmp.sil;
      sil.length = 0;
      const pl = ss.game.player;
      if (!poseHitboxes("radbro", pl.hit.pose, tmp.pcaps)) return;
      const r = ss.renderP, ox = r.x - pl.x, oy = r.y - pl.y, oz = r.z - pl.z;
      const focal = (camera.projectionMatrix.elements[5] * H) / 2;
      for (let c = 0; c < tmp.pcaps.length; c++) {
        const k = tmp.pcaps[c];
        const [ax, ay, ad] = project(k.ax + ox, k.ay + oy, k.az + oz, camera, W, H);
        const [bx, by, bd] = project(k.bx + ox, k.by + oy, k.bz + oz, camera, W, H);
        const d = Math.min(ad, bd);
        if (d < 0.05) continue;
        sil.push({ ax, ay, bx, by, r: ((k.r + (c === HB_HEAD ? PAD_HEAD : PAD_BODY)) * focal) / d });
      }
    };
    const measure = (now: number) => {
      if (now - tmp.measuredAt < 200) return;
      tmp.measuredAt = now;
      const tl = document.querySelector(".rp-hud .rp-tl")?.getBoundingClientRect();
      tmp.tl = tl && tl.width > 0 ? { right: tl.right, bottom: tl.bottom } : null;
      const nudge = document.querySelector(".rp-hud .rp-nudge:not(.hide)")?.getBoundingClientRect();
      tmp.nudgeTop = nudge && nudge.height > 0 ? nudge.top : null;
    };
    const place = (i: number, wx: number, wy: number, wz: number, head: [number, number] | null, camera: Camera, W: number, H: number, k: number, ring: Ring, opts: { kind: "idle" | "engaged" | "exit"; showMark: boolean; showArrow: boolean; alpha: number; fire: boolean; near: number }) => {
      const mark = marks.current[i], arrow = arrows.current[i];
      if (!mark || !arrow) return;
      const v = tmp.v.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
      const front = v.z < -0.05;
      const off = (Math.atan2(Math.hypot(v.x, v.y), -v.z) * 180) / Math.PI; // degrees off the view axis
      v.applyMatrix4(camera.projectionMatrix);
      const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
      const onScreen = front && x >= 0 && x <= W && y >= 0 && y <= H;
      let faded = false;
      if (onScreen && opts.showMark) {
        // her head on the Radbro or on the reticle: the marker would cover what you are looking at
        faded = !!head && markerFades(head[0], head[1], W, H, tmp.sil, opts.near);
        mark.style.display = "block";
        mark.style.opacity = String(opts.alpha * (faded ? MARK_FADED : 1));
        mark.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${(k * (opts.fire ? 1.25 : 1)).toFixed(3)})`;
        mark.style.transformOrigin = "50% 100%";
        mark.classList.toggle("fire", opts.fire);
        if (opts.kind !== "exit") {
          (mark.children[0] as SVGElement).style.display = opts.kind === "engaged" ? "none" : "block";
          (mark.children[1] as SVGElement).style.display = opts.kind === "engaged" ? "block" : "none";
        }
      } else mark.style.display = "none";
      const showArrow = !onScreen && opts.showArrow;
      let ax = NaN, ay = NaN;
      if (showArrow) {
        // behind the lens: the ground-plane bearing from the player, as the damage slash has it
        const [dx, dy] = arrowDir(front, x, y, W, H, damageAngle(tmp.px, tmp.pz, wx, wz, tmp.fwd.x, tmp.fwd.z), off);
        const p = ringPin(dx, dy, W, H, ring, tmp.sides[i] ?? 0);
        tmp.sides[i] = p.side;
        ax = p.x; ay = p.y;
        arrow.style.display = "block";
        arrow.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${p.rot.toFixed(1)}deg)`;
        const body = arrow.querySelector(".body") as SVGElement, notch = arrow.querySelector(".notch") as SVGElement;
        body.setAttribute("fill", opts.kind === "exit" ? "#f3ead8" : opts.kind === "engaged" ? "#ffcf6a" : "#ff3fa8");
        notch.style.display = opts.kind === "engaged" ? "block" : "none";
      } else { arrow.style.display = "none"; tmp.sides[i] = 0; }
      threatProbe.push({ i, x, y, on: onScreen && opts.showMark, engaged: opts.kind === "engaged", faded, arrow: showArrow, ax, ay, size: tmp.box });
    };

    const f = (camera: Camera, ss: Session, now: number) => {
      const ui = useUi.getState();
      const g = ss.game;
      const mode = ui.threats;
      threatProbe.length = 0;
      if (ui.screen !== "play" || g.phase === "killcam" || ui.deadAt || mode === "off" && g.phase !== "clear") { hideAll(); return; }
      const W = innerWidth, H = innerHeight, S = hudScaleNow();
      const p = ss.renderP;
      camera.getWorldDirection(tmp.fwd);
      tmp.px = p.x; tmp.pz = p.z;
      // the arrows: full size at every resolution, on the ring round the HUD groups
      const a = arrowPx(S), box = arrowBox(a);
      if (Math.abs(box - tmp.box) > 0.05) {
        tmp.box = box;
        for (const el of arrows.current) { const svg = el?.firstElementChild; if (svg) { svg.setAttribute("width", box.toFixed(1)); svg.setAttribute("height", box.toFixed(1)); } }
      }
      measure(now);
      const ring = arrowRing(W, H, S, { a, tl: tmp.tl, nudgeTop: tmp.nudgeTop });
      silhouette(ss, camera, W, H);
      const near = reticleFadePx(S);
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        const awake = e.state !== "inactive" && e.state !== "dead";
        const engaged = awake && (e.state === "peek" || e.state === "engage") && e.sees;
        const showMark = awake && mode !== "off" && (mode === "all" || engaged);
        const showArrow = engaged && mode !== "off";
        if (!showMark && !showArrow) { const m = marks.current[i], ar = arrows.current[i]; if (m) m.style.display = "none"; if (ar) ar.style.display = "none"; tmp.sides[i] = 0; continue; }
        // the hit skeleton's head, moved to where the body is drawn this frame
        if (!aimPoint("milady", e.hit.pose, HB_HEAD, tmp.head, tmp.caps)) continue;
        const r = ss.renderE[i] ?? e;
        const hx = tmp.head.x + (r.x - e.x), hy = tmp.head.y + (r.y - e.y), hz = tmp.head.z + (r.z - e.z);
        const [sx, sy, sd] = project(hx, hy, hz, camera, W, H);
        const dist = Math.hypot(r.x - p.x, r.z - p.z);
        place(i, hx, hy + 0.25, hz, sd > 0.05 ? [sx, sy] : null, camera, W, H, markerScale(dist, S), ring, { kind: engaged ? "engaged" : "idle", showMark, showArrow, alpha: e.sees ? 1 : 0.55, fire: now - (enemyShotAt[i] ?? -1e9) < 120, near });
      }
      // the exit, once the room is clear
      const exit = g.phase === "clear" ? g.triggers.find(t => t.data.action === "exit") : undefined;
      if (exit) place(n, exit.x, exit.y + exit.hy + 0.4, exit.z, null, camera, W, H, S, ring, { kind: "exit", showMark: true, showArrow: true, alpha: 1, fire: false, near });
      else { const m = marks.current[n], ar = arrows.current[n]; if (m) m.style.display = "none"; if (ar) ar.style.display = "none"; tmp.sides[n] = 0; }
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
        <div key={`a${i}`} ref={el => { arrows.current[i] = el; }} className="m arrow"><Arrow /></div>
      ))}
    </div>
  );
});
