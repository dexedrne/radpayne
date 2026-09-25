// In-canvas bridge for the world-anchored HUD layers (threat markers, damage slashes): once per
// rendered frame, after the camera moved (FRAME.fx), it hands the camera to the DOM layers, which
// write transforms straight to their refs (React never re-renders per frame). After the frame is
// drawn it also grabs the final kill's frame once for the results screen's evidence photo.
import { useEffect } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import type { Camera } from "three";
import type { Session } from "../../app/session.ts";
import { FRAME } from "../../app/frame.ts";
import { useUi } from "../store.ts";

export type HudFrameFn = (camera: Camera, s: Session, now: number) => void;
/** Subscribers (ThreatLayer, DamageLayer). */
export const hudFrame = new Set<HudFrameFn>();
/** The running session, for the DOM HUD and menus (set while the canvas is mounted). */
export const hudSession: { current: Session | null } = { current: null };

/** Copy the canvas into a small 16:10 JPEG, or null when it is blank (black / one colour). */
function snapshot(src: HTMLCanvasElement): string | null {
  const W = src.width, H = src.height;
  if (!W || !H) return null;
  // centre crop to 16:10
  let cw = W, ch = Math.round((W * 10) / 16);
  if (ch > H) { ch = H; cw = Math.round((H * 16) / 10); }
  const sx = Math.round((W - cw) / 2), sy = Math.round((H - ch) / 2);
  const probe = document.createElement("canvas");
  probe.width = 32; probe.height = 20;
  const pc = probe.getContext("2d", { willReadFrequently: true });
  if (!pc) return null;
  pc.drawImage(src, sx, sy, cw, ch, 0, 0, 32, 20);
  const px = pc.getImageData(0, 0, 32, 20).data;
  let sum = 0, sum2 = 0;
  for (let i = 0; i < px.length; i += 4) { const l = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; sum += l; sum2 += l * l; }
  const n = px.length / 4, mean = sum / n, varc = sum2 / n - mean * mean;
  if (mean < 4 || varc < 6) return null;
  const out = document.createElement("canvas");
  out.width = 640; out.height = 400;
  const oc = out.getContext("2d");
  if (!oc) return null;
  oc.drawImage(src, sx, sy, cw, ch, 0, 0, 640, 400);
  return out.toDataURL("image/jpeg", 0.8);
}

export function HudFrame({ s }: { s: Session }) {
  const gl = useThree(st => st.gl) as unknown as { domElement: HTMLCanvasElement };
  useEffect(() => {
    hudSession.current = s;
    return () => { if (hudSession.current === s) hudSession.current = null; };
  }, [s]);
  useFrame(({ camera }) => {
    if (!hudFrame.size) return;
    camera.updateWorldMatrix(true, false);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const now = performance.now();
    for (const f of hudFrame) f(camera, s, now);
  }, FRAME.fx);
  // the evidence photo: the frame where the final bullet lands, straight after it is drawn (the
  // drawing buffer is only readable inside the task that rendered it)
  useEffect(() => {
    let done = -1;
    return addAfterEffect(() => {
      const k = s.game.killcam;
      if (!k || done === s.run || k.t < k.flight) return;
      done = s.run;
      try {
        const photo = snapshot(gl.domElement);
        if (photo) useUi.setState({ lastKillPhoto: photo });
      } catch {
        /* tainted / lost context: no photo, the results page works without it */
      }
    });
  }, [s, gl]);
  return null;
}
