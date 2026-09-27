// The kill cam's X-ray freeze and the snap back's flash (app/cine.ts, app/xray.ts): a full-screen 2D
// canvas over the room and under the letterbox (z 12 < 13), drawn every animation frame from what
// CineView projected. Clear and idle when no cam is on.
import { useEffect, useRef } from "react";
import { CINE, cine } from "../../app/cine.ts";
import { drawXray, xray } from "../../app/xray.ts";

export function XrayOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0, drawn = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      const c = cine.cur;
      const on = xray.t >= 0 && xray.victims.length > 0;
      const flash = c?.phase === "out" ? 1 - (c.t - c.flight - CINE.xray) / CINE.out : 0;
      if (!on && flash <= 0) {
        if (drawn) { ctx.clearRect(0, 0, el.width, el.height); drawn = false; }
        return;
      }
      const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      // the projection was made for the room canvas's size: scale it onto this one
      const sx = xray.w > 0 ? (W / xray.w) * dpr : dpr, sy = xray.h > 0 ? (H / xray.h) * dpr : dpr;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      if (on) drawXray(ctx, xray.w || W, xray.h || H, xray.victims, xray.t, CINE.xray);
      if (flash > 0) { ctx.globalAlpha = 0.3 * flash; ctx.fillStyle = "#f3ead8"; ctx.fillRect(0, 0, xray.w || W, xray.h || H); ctx.globalAlpha = 1; }
      drawn = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="rp-xray" data-testid="xray" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 12, pointerEvents: "none" }} />;
}
