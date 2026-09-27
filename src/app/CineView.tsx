// The kill cam's X-ray, scene side (cine.ts, xray.ts): while the freeze is on, each victim's skeleton is
// read off her drawn body (or the stand-in fallback) and projected through this frame's lens for the
// overlay to draw. Nothing else: the lens itself is CameraView's.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Session } from "./session.ts";
import { cine } from "./cine.ts";
import { JN, fallbackJoints, project, xray, xrayRigs, type XrayVictim } from "./xray.ts";
import { HEAVY_SCALE } from "../sim/tuning.ts";
import { FRAME } from "./frame.ts";

export function CineView({ s }: { s: Session }) {
  const tmp = useMemo(() => ({ joints: Array.from({ length: JN }, () => new Vector3()), hit: new Vector3(), from: new Vector3() }), []);
  useFrame(state => {
    const c = cine.cur;
    if (!c || c.phase !== "xray") { xray.t = -1; xray.victims.length = 0; return; }
    const cam = state.camera;
    cam.updateWorldMatrix(true, false);
    const W = state.size.width, H = state.size.height;
    xray.w = W; xray.h = H;
    xray.t = c.t - c.flight;
    const g = s.game;
    const kills = c.kills.slice(-3);
    xray.victims.length = kills.length;
    kills.forEach((k, i) => {
      const e = g.enemies[k.enemy];
      if (!e) return;
      const read = xrayRigs[k.enemy];
      if (!read || !read(tmp.joints)) {
        const r = s.renderE[k.enemy] ?? e;
        fallbackJoints(e.kind === "heavy" ? "radbro" : "milady", r.x, r.y, r.z, e.facing, e.kind === "heavy" ? HEAVY_SCALE : 1, tmp.joints);
      }
      const v: XrayVictim = xray.victims[i] ?? { pts: new Float32Array(JN * 2), ppm: 0, hitBone: 0, hx: 0, hy: 0, dx: 0, dy: 1, ok: false, front: 1 };
      tmp.hit.set(k.to.x, k.to.y, k.to.z);
      tmp.from.set(k.from.x, k.from.y, k.from.z);
      // a blast's "shot" runs from its centre: the crack faces away from it all the same
      project(tmp.joints, cam, W, H, k.headshot ? 0 : k.part, tmp.hit, tmp.from, v);
      xray.victims[i] = v;
    });
  }, FRAME.fx);
  return null;
}
