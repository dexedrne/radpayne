// The kill cam's X-ray (cine.ts): a noir comic panel, PG-13. The frame goes dark and grey (the canvas
// filter) under a halftone screen; each victim is a dark halftone ghost with a clean, glowing skeleton
// inside (skull, spine, ribs, pelvis, the long bones), and the bone the round hit turns gold with a
// crack line across it where it went in, the round's track leading to it. No organs, no gore.
// The skeleton follows the drawn body: the views register a joint reader per enemy (the Milady's VRM
// bones, the heavy's rig); a stand-in gets one from the sim's hit skeleton. CineView projects the joints
// every frame of the freeze; XrayOverlay draws them with drawXray().
import { Vector3, type Camera, type Object3D } from "three";
import { HB_HEAD } from "../combat/hitboxes.ts";

/** The joints, in order (world space): the body's centre line, then the arms and the legs. */
export const J = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, top: 5, lArm: 6, lFore: 7, lHand: 8, rArm: 9, rFore: 10, rHand: 11, lLeg: 12, lKnee: 13, lFoot: 14, rLeg: 15, rKnee: 16, rFoot: 17 } as const;
export const JN = 18;
/** The long bones (a -> b), for the hit bone's pick; the skull is its own. */
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [J.hips, J.spine], [J.spine, J.chest], [J.chest, J.neck],
  [J.lArm, J.lFore], [J.lFore, J.lHand], [J.rArm, J.rFore], [J.rFore, J.rHand],
  [J.lLeg, J.lKnee], [J.lKnee, J.lFoot], [J.rLeg, J.rKnee], [J.rKnee, J.rFoot],
];
/** The skull's index in the hit-bone pick (after the long bones). */
export const SKULL = BONES.length;

/** Per enemy: fills the joints from the drawn body (false: nothing drawn to read, use the fallback). */
export const xrayRigs: Array<((out: Vector3[]) => boolean) | undefined> = [];

/** A reader over named bones (VRM humanoid names or a rig's own); `top` = the skull's top, if the rig has one. */
export function boneReader(get: (name: string) => Object3D | null | undefined, names: readonly string[]): (out: Vector3[]) => boolean {
  return out => {
    for (let i = 0; i < JN; i++) {
      if (i === J.top) continue;
      const b = names[i].split("|").map(get).find(o => !!o);
      if (!b) return false;
      b.getWorldPosition(out[i]);
    }
    const top = names[J.top] ? get(names[J.top]) : null;
    if (top) top.getWorldPosition(out[J.top]);
    else { // a Milady's big head: its top ~0.32 m over the head bone, along the neck
      out[J.top].copy(out[J.head]).sub(out[J.neck]);
      const l = out[J.top].length();
      if (l > 1e-4) out[J.top].multiplyScalar(0.32 / l).add(out[J.head]); else out[J.top].copy(out[J.head]).setY(out[J.head].y + 0.32);
    }
    return true;
  };
}
/** VRM humanoid bone names in joint order ("" = derived). */
export const VRM_JOINTS = ["hips", "spine", "chest|upperChest|spine", "neck|head", "head", "", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"] as const;
/** The Radbro rig (the heavies). */
export const RADBRO_JOINTS = ["Hips", "Spine01", "Spine", "neck", "Head", "head_end", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"] as const;

/** A stand-in's skeleton from the hit skeleton's proportions (local: x side, y up, z forward). */
const FALLBACK: Record<"milady" | "radbro", number[][]> = {
  milady: [[0, 1.0, 0], [0, 1.2, 0], [0, 1.38, 0], [0, 1.5, 0], [0, 1.6, 0.01], [0, 1.9, 0.02], [0.17, 1.42, 0], [0.22, 1.18, 0.02], [0.24, 0.95, 0.04], [-0.17, 1.42, 0], [-0.22, 1.18, 0.02], [-0.24, 0.95, 0.04], [0.1, 0.95, 0], [0.1, 0.52, 0.02], [0.1, 0.08, 0], [-0.1, 0.95, 0], [-0.1, 0.52, 0.02], [-0.1, 0.08, 0]],
  radbro: [[0, 0.75, 0], [0, 0.9, 0], [0, 1.03, 0], [0, 1.1, 0], [0, 1.15, 0.02], [0, 1.68, 0.03], [0.2, 1.0, 0], [0.26, 0.78, 0.03], [0.28, 0.58, 0.05], [-0.2, 1.0, 0], [-0.26, 0.78, 0.03], [-0.28, 0.58, 0.05], [0.1, 0.68, 0], [0.1, 0.38, 0.02], [0.1, 0.06, 0], [-0.1, 0.68, 0], [-0.1, 0.38, 0.02], [-0.1, 0.06, 0]],
};
export function fallbackJoints(body: "milady" | "radbro", x: number, y: number, z: number, yaw: number, scale: number, out: Vector3[]): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  FALLBACK[body].forEach((p, i) => {
    const lx = p[0] * scale, ly = p[1] * scale, lz = p[2] * scale;
    out[i].set(x + lx * c + lz * s, y + ly, z - lx * s + lz * c);
  });
}

/** One victim on screen: joints in CSS px (NaN = behind the lens), pixels per metre at her, the hit. */
export type XrayVictim = { pts: Float32Array; ppm: number; hitBone: number; hx: number; hy: number; dx: number; dy: number; ok: boolean; front: number };
export const xray = {
  /** Frames of projected victims (CineView fills them while the freeze is on). */
  victims: [] as XrayVictim[],
  /** Real seconds into the freeze (-1 = off), and the CSS size it was projected for. */
  t: -1,
  w: 0,
  h: 0,
};

const v = new Vector3(), w = new Vector3(), up = new Vector3(), right = new Vector3();
/** The world joints of one victim -> an XrayVictim (the hit bone: the skull for a headshot, else the
 *  long bone nearest the hit point). `hit` / `from`: the round's hit point and where it came from. */
export function project(joints: Vector3[], cam: Camera, width: number, height: number, part: number, hit: Vector3, from: Vector3, out: XrayVictim): void {
  let ok = true;
  for (let i = 0; i < JN; i++) {
    v.copy(joints[i]).project(cam);
    const behind = v.z > 1 || v.z < -1;
    if (behind) ok = false;
    out.pts[i * 2] = behind ? NaN : (v.x * 0.5 + 0.5) * width;
    out.pts[i * 2 + 1] = behind ? NaN : (-v.y * 0.5 + 0.5) * height;
  }
  // pixels per metre at her chest: a metre along the lens's right
  w.set(1, 0, 0).applyQuaternion(cam.quaternion).add(joints[J.chest]).project(cam);
  v.copy(joints[J.chest]).project(cam);
  out.ppm = Math.hypot((w.x - v.x) * 0.5 * width, (w.y - v.y) * 0.5 * height);
  let best = SKULL, bd = Infinity;
  if (part !== HB_HEAD) {
    BONES.forEach(([a, b], i) => {
      const d = segDist(hit, joints[a], joints[b]);
      if (d < bd) { bd = d; best = i; }
    });
  }
  out.hitBone = best;
  v.copy(hit).project(cam);
  out.hx = (v.x * 0.5 + 0.5) * width;
  out.hy = (-v.y * 0.5 + 0.5) * height;
  w.copy(from).project(cam);
  const fx = (w.x * 0.5 + 0.5) * width, fy = (-w.y * 0.5 + 0.5) * height;
  const l = Math.hypot(out.hx - fx, out.hy - fy) || 1;
  out.dx = (out.hx - fx) / l;
  out.dy = (out.hy - fy) / l;
  out.ok = ok;
  // does she face the lens (the skull's face shows) or turn her back on it: her forward = up x her right
  up.copy(joints[J.neck]).sub(joints[J.hips]);
  right.copy(joints[J.rArm]).sub(joints[J.lArm]);
  w.crossVectors(up, right).normalize();
  cam.getWorldPosition(v).sub(joints[J.chest]).normalize();
  out.front = w.dot(v);
}

function segDist(p: Vector3, a: Vector3, b: Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}

// ---- drawing (2D canvas, CSS px) -------------------------------------------------------------------

const BONE_INK = "#dff6ff";
const GLOW = "rgba(120, 210, 255, 0.9)";
const HIT_INK = "#ffd23f";
const GHOST = "rgba(10, 12, 24, 0.7)";

let dots: CanvasPattern | null = null;
let ghostDots: CanvasPattern | null = null;
function patterns(ctx: CanvasRenderingContext2D): void {
  if (dots && ghostDots) return;
  const mk = (size: number, r: number, color: string) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d")!;
    x.fillStyle = color;
    for (const [px, py] of [[size / 4, size / 4], [(size * 3) / 4, (size * 3) / 4]]) { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
    return ctx.createPattern(c, "repeat");
  };
  dots = mk(8, 1.5, "rgba(0, 0, 0, 0.55)");
  ghostDots = mk(6, 1.2, "rgba(150, 205, 255, 0.34)");
}

const ease = (x: number) => Math.max(0, Math.min(1, x));

/** One frame of the freeze: `t` real seconds into it, `len` its length. */
export function drawXray(ctx: CanvasRenderingContext2D, width: number, height: number, victims: readonly XrayVictim[], t: number, len: number): void {
  patterns(ctx);
  const inK = ease(t / 0.08), outK = ease((len - t) / 0.16), k = Math.min(inK, outK);
  // the halftone screen over the whole (already dark) frame, and a spot of light on her
  ctx.globalAlpha = k;
  ctx.fillStyle = dots!;
  ctx.fillRect(0, 0, width, height);
  const lead = victims.find(x => x.ok) ?? victims[0];
  if (lead) {
    const cx = lead.pts[J.chest * 2], cy = lead.pts[J.chest * 2 + 1];
    if (Number.isFinite(cx)) {
      const g = ctx.createRadialGradient(cx, cy, lead.ppm * 0.4, cx, cy, Math.max(width, height) * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
  }
  for (const x of victims) drawOne(ctx, x, t, k);
  // the impact's flash
  if (t < 0.07) { ctx.globalAlpha = 0.45 * (1 - t / 0.07); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawOne(ctx: CanvasRenderingContext2D, x: XrayVictim, t: number, k: number): void {
  const P = x.pts, m = x.ppm;
  const px = (i: number) => P[i * 2], py = (i: number) => P[i * 2 + 1];
  const has = (...ids: number[]) => ids.every(i => Number.isFinite(P[i * 2]));
  if (!has(J.hips, J.chest, J.head)) return;
  const line = (a: number, b: number) => { if (!has(a, b)) return; ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke(); };
  // skull: between the head bone and the top
  const sx = px(J.head) + (px(J.top) - px(J.head)) * 0.42, sy = py(J.head) + (py(J.top) - py(J.head)) * 0.42;
  const hl = Math.hypot(px(J.top) - px(J.head), py(J.top) - py(J.head));
  const up = Math.atan2(py(J.top) - py(J.head), px(J.top) - px(J.head)) + Math.PI / 2;
  const skR = Math.max(4, hl * 0.5);
  // the ghost: a dark body in halftone (thick round strokes along the bones)
  ctx.globalAlpha = k;
  ctx.shadowBlur = 0;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const fill of [GHOST, ghostDots!]) {
    ctx.strokeStyle = fill;
    ctx.fillStyle = fill;
    ctx.lineWidth = m * 0.3;
    line(J.hips, J.chest); line(J.chest, J.neck);
    ctx.lineWidth = m * 0.12;
    line(J.lArm, J.lFore); line(J.lFore, J.lHand); line(J.rArm, J.rFore); line(J.rFore, J.rHand); line(J.chest, J.lArm); line(J.chest, J.rArm);
    ctx.lineWidth = m * 0.15;
    line(J.lLeg, J.lKnee); line(J.lKnee, J.lFoot); line(J.rLeg, J.rKnee); line(J.rKnee, J.rFoot); line(J.hips, J.lLeg); line(J.hips, J.rLeg);
    ctx.beginPath(); ctx.ellipse(sx, sy, skR * 1.35, skR * 1.5, up, 0, Math.PI * 2); ctx.fill();
  }
  // the skeleton: clean pale lines with a cold glow
  ctx.strokeStyle = BONE_INK;
  ctx.shadowColor = GLOW;
  ctx.shadowBlur = 10;
  const bw = Math.max(1.4, m * 0.022);
  ctx.lineWidth = bw;
  // spine with its vertebrae
  line(J.hips, J.spine); line(J.spine, J.chest); line(J.chest, J.neck);
  for (let i = 0; i <= 8; i++) {
    const f = i / 8, a = f < 0.5 ? J.hips : J.spine, b = f < 0.5 ? J.spine : J.neck, ff = f < 0.5 ? f * 2 : (f - 0.5) * 2;
    if (!has(a, b)) continue;
    const vx = px(a) + (px(b) - px(a)) * ff, vy = py(a) + (py(b) - py(a)) * ff;
    const ang = Math.atan2(py(b) - py(a), px(b) - px(a)) + Math.PI / 2, r = m * 0.022;
    ctx.beginPath(); ctx.moveTo(vx - Math.cos(ang) * r, vy - Math.sin(ang) * r); ctx.lineTo(vx + Math.cos(ang) * r, vy + Math.sin(ang) * r); ctx.stroke();
  }
  // ribs: four pairs curving out from the spine between the chest and the middle of the back
  if (has(J.spine, J.chest, J.lArm, J.rArm)) {
    const ax = (px(J.rArm) - px(J.lArm)) / 2, ay = (py(J.rArm) - py(J.lArm)) / 2; // half the shoulders' span
    for (let i = 0; i < 4; i++) {
      const f = 0.12 + i * 0.24;
      const cx = px(J.chest) + (px(J.spine) - px(J.chest)) * f, cy = py(J.chest) + (py(J.spine) - py(J.chest)) * f;
      const dn = (py(J.spine) - py(J.chest)) * 0.35, dnx = (px(J.spine) - px(J.chest)) * 0.35;
      const wk = 0.95 - i * 0.12;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + ax * sd * wk * 1.05, cy + ay * sd * wk * 1.05 - dn * 0.1, cx + ax * sd * wk * 0.85 + dnx, cy + ay * sd * wk * 0.85 + dn);
        ctx.stroke();
      }
    }
    // collar bones
    line(J.neck, J.lArm); line(J.neck, J.rArm);
  }
  // pelvis: a wide bowl on the hips, out to the hip joints
  if (has(J.hips, J.lLeg, J.rLeg)) {
    ctx.beginPath();
    ctx.moveTo(px(J.lLeg), py(J.lLeg));
    ctx.quadraticCurveTo(px(J.hips) + (px(J.lLeg) - px(J.hips)) * 2.1, py(J.hips) + (py(J.lLeg) - py(J.hips)) * 0.2 - m * 0.08, px(J.hips), py(J.hips) - m * 0.02);
    ctx.quadraticCurveTo(px(J.hips) + (px(J.rLeg) - px(J.hips)) * 2.1, py(J.hips) + (py(J.rLeg) - py(J.hips)) * 0.2 - m * 0.08, px(J.rLeg), py(J.rLeg));
    ctx.stroke();
  }
  // the long bones (the forearm and shin as two), joints as knobs
  const pair = (a: number, b: number) => {
    if (!has(a, b)) return;
    const dx = px(b) - px(a), dy = py(b) - py(a), l = Math.hypot(dx, dy) || 1, ox = (-dy / l) * m * 0.018, oy = (dx / l) * m * 0.018;
    ctx.beginPath(); ctx.moveTo(px(a) + ox, py(a) + oy); ctx.lineTo(px(b) + ox, py(b) + oy); ctx.moveTo(px(a) - ox, py(a) - oy); ctx.lineTo(px(b) - ox, py(b) - oy); ctx.stroke();
  };
  line(J.lArm, J.lFore); pair(J.lFore, J.lHand); line(J.rArm, J.rFore); pair(J.rFore, J.rHand);
  line(J.lLeg, J.lKnee); pair(J.lKnee, J.lFoot); line(J.rLeg, J.rKnee); pair(J.rKnee, J.rFoot);
  ctx.fillStyle = BONE_INK;
  for (const j of [J.lFore, J.rFore, J.lKnee, J.rKnee, J.lHand, J.rHand, J.lArm, J.rArm]) if (has(j)) { ctx.beginPath(); ctx.arc(px(j), py(j), bw * 1.3, 0, Math.PI * 2); ctx.fill(); }
  // skull: the cranium; facing the lens, two sockets, the nose and the jaw (from behind: the cranium
  // and the base of the skull on the spine)
  const skull = (ink: string) => {
    ctx.strokeStyle = ink;
    ctx.beginPath(); ctx.ellipse(sx, sy, skR * 0.9, skR * 1.02, up, 0, Math.PI * 2); ctx.stroke();
    const c = Math.cos(up), s = Math.sin(up);
    const at = (lx: number, ly: number): [number, number] => [sx + lx * c - ly * s, sy + lx * s + ly * c];
    if (x.front > 0.2) {
      ctx.fillStyle = "rgba(4,6,14,0.95)";
      for (const e of [-1, 1]) { const [ex, ey] = at(e * skR * 0.36, skR * 0.08); ctx.beginPath(); ctx.ellipse(ex, ey, skR * 0.22, skR * 0.2, up, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      const [n0x, n0y] = at(-skR * 0.08, skR * 0.42), [n1x, n1y] = at(skR * 0.08, skR * 0.42), [ntx, nty] = at(0, skR * 0.28);
      ctx.beginPath(); ctx.moveTo(n0x, n0y); ctx.lineTo(ntx, nty); ctx.lineTo(n1x, n1y); ctx.stroke();
      // the jaw: a squared mandible under the cheekbones, a line of teeth across it
      const pts = [at(-skR * 0.62, skR * 0.5), at(-skR * 0.42, skR * 1.02), at(skR * 0.42, skR * 1.02), at(skR * 0.62, skR * 0.5)];
      ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
      const [t0x, t0y] = at(-skR * 0.4, skR * 0.68), [t1x, t1y] = at(skR * 0.4, skR * 0.68);
      ctx.beginPath(); ctx.moveTo(t0x, t0y); ctx.lineTo(t1x, t1y); ctx.stroke();
    } else {
      const [bx, by] = at(0, skR * 0.95);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px(J.neck), py(J.neck)); ctx.stroke();
    }
  };
  skull(BONE_INK);
  // the hit: that bone in gold, the round's track in to it, the crack across it
  const crackK = ease((t - 0.05) / 0.14);
  ctx.shadowColor = "rgba(255, 190, 60, 0.95)";
  ctx.shadowBlur = 14;
  ctx.lineWidth = bw * 1.6;
  ctx.strokeStyle = HIT_INK;
  let cx = x.hx, cy = x.hy, ang = Math.atan2(x.dy, x.dx) + Math.PI / 2, span = m * 0.14;
  if (x.hitBone === SKULL) { skull(HIT_INK); span = skR * 1.4; }
  else {
    const [a, b] = BONES[x.hitBone];
    if (has(a, b)) {
      line(a, b);
      // the crack sits where the round crossed the bone: the hit point's projection onto it
      const bx = px(b) - px(a), by = py(b) - py(a), l2 = bx * bx + by * by || 1;
      const f = Math.max(0.15, Math.min(0.85, ((x.hx - px(a)) * bx + (x.hy - py(a)) * by) / l2));
      cx = px(a) + bx * f; cy = py(a) + by * f;
      ang = Math.atan2(by, bx) + Math.PI / 2;
    }
  }
  // the track: a thin gold line in along the shot, ending at the crack
  ctx.lineWidth = Math.max(1, bw * 0.7);
  ctx.globalAlpha = k * 0.85;
  ctx.beginPath(); ctx.moveTo(cx - x.dx * m * 0.9, cy - x.dy * m * 0.9); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.globalAlpha = k;
  // the crack: a zigzag across the bone, drawn in
  ctx.strokeStyle = "#fff6d8";
  ctx.lineWidth = Math.max(1.6, bw * 1.1);
  const n = 5, c0 = Math.cos(ang), s0 = Math.sin(ang), along = Math.cos(ang - Math.PI / 2), alongS = Math.sin(ang - Math.PI / 2);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const f = (i / n - 0.5) * 2 * crackK;
    const z = (i % 2 ? 1 : -1) * span * 0.18;
    const qx = cx + c0 * f * span + along * z, qy = cy + s0 * f * span + alongS * z;
    if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
  }
  ctx.stroke();
  // chips flying on along the shot, and a ring going out
  if (crackK > 0) {
    ctx.fillStyle = "#fff0c0";
    for (let i = 0; i < 4; i++) {
      const sp = (i - 1.5) * 0.35, d = m * (0.08 + 0.14 * crackK) * (1 + i * 0.2);
      const dx = x.dx * Math.cos(sp) - x.dy * Math.sin(sp), dy = x.dx * Math.sin(sp) + x.dy * Math.cos(sp);
      ctx.beginPath(); ctx.arc(cx + dx * d, cy + dy * d, Math.max(1.2, bw * 0.8), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = k * (1 - crackK) * 0.8;
    ctx.strokeStyle = HIT_INK;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, span * (0.5 + 1.6 * crackK), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = k;
  }
}
