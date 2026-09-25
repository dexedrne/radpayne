// In-game HUD (spec section 6 / 7 "src/ui"): health, the bullet-time hourglass, ammo per hand,
// copium, the crosshair with hit / kill markers, the hurt vignette, the kill-cam letterbox and the
// bullet-time grade (applied as a CSS filter on the canvas layer by PlayPage).
import { useEffect, useState } from "react";
import { useUi } from "./store.ts";
import { METER, PLAYER } from "../sim/tuning.ts";

const INK = "#f3ead8";
const font = "ui-monospace, SFMono-Regular, Menlo, monospace";

function useNow(ms = 50): number {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setT(performance.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

function Hourglass({ f, on }: { f: number; on: boolean }) {
  // sand: top bulb holds what is left, the bottom what is spent
  const top = Math.max(0, Math.min(1, f));
  const glow = on ? "#ffcf6a" : INK;
  return (
    <svg width="34" height="56" viewBox="0 0 34 56" style={{ filter: on ? "drop-shadow(0 0 6px #ffae52)" : undefined }}>
      <defs>
        <clipPath id="rp-top"><path d="M5 6 H29 L17 27 Z" /></clipPath>
        <clipPath id="rp-bot"><path d="M17 29 L29 50 H5 Z" /></clipPath>
      </defs>
      <rect x="3" y="2" width="28" height="4" rx="1" fill={glow} />
      <rect x="3" y="50" width="28" height="4" rx="1" fill={glow} />
      <path d="M5 6 H29 L17 27 Z M17 29 L29 50 H5 Z" fill="none" stroke={glow} strokeWidth="1.6" strokeLinejoin="round" />
      <rect clipPath="url(#rp-top)" x="0" y={6 + 21 * (1 - top)} width="34" height={21 * top} fill="#e2a64a" />
      <rect clipPath="url(#rp-bot)" x="0" y={50 - 21 * (1 - top)} width="34" height={21 * (1 - top)} fill="#e2a64a" opacity="0.8" />
      {on && top > 0 && <rect x="16.3" y="27" width="1.4" height="23" fill="#e2a64a" />}
    </svg>
  );
}

function HealthFigure({ hp, healing }: { hp: number; healing: boolean }) {
  const f = Math.max(0, Math.min(1, hp / PLAYER.maxHealth));
  const col = f > 0.5 ? "#e8e2d4" : f > 0.25 ? "#ffb34a" : "#ff4a4a";
  // a Radbro-ish silhouette (big head, small body) filled from the bottom
  return (
    <svg width="40" height="58" viewBox="0 0 40 58">
      <defs>
        <clipPath id="rp-fig"><path d="M20 2 C9 2 5 9 5 17 C5 25 10 30 20 30 C30 30 35 25 35 17 C35 9 31 2 20 2 Z M11 32 H29 L31 46 H26 L25 56 H15 L14 46 H9 Z" /></clipPath>
      </defs>
      <rect clipPath="url(#rp-fig)" x="0" y="0" width="40" height="58" fill="rgba(255,255,255,0.12)" />
      <rect clipPath="url(#rp-fig)" x="0" y={58 * (1 - f)} width="40" height={58 * f} fill={col} opacity={healing ? 0.75 + 0.25 * Math.sin(performance.now() / 90) : 1} />
    </svg>
  );
}

function Mag({ n, size, dim }: { n: number; size: number; dim: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 7px)", gap: 2, opacity: dim ? 0.35 : 1 }}>
      {Array.from({ length: size }, (_, i) => (
        <div key={i} style={{ width: 7, height: 4, borderRadius: 1, background: size - 1 - i < n ? "#e2a64a" : "rgba(255,255,255,0.14)" }} />
      ))}
    </div>
  );
}

export function Crosshair() {
  const on = useUi(s => s.hud.onTarget);
  const hitAt = useUi(s => s.hitAt), killAt = useUi(s => s.killAt), hsAt = useUi(s => s.headshotAt);
  const now = useNow(40);
  const hit = now - hitAt < 160, kill = now - killAt < 350, hs = now - hsAt < 600;
  const c = on ? "#ff4a6a" : "rgba(255,255,255,0.9)";
  const tick = (r: number): React.CSSProperties => ({ position: "absolute", left: "50%", top: "50%", width: 2, height: 7, background: c, transform: `translate(-50%, -50%) rotate(${r}deg) translateY(-9px)` });
  return (
    <div style={{ position: "fixed", left: "50%", top: "50%", width: 0, height: 0, pointerEvents: "none", zIndex: 12 }}>
      <div style={{ position: "absolute", left: -2, top: -2, width: 4, height: 4, borderRadius: 2, background: c }} />
      {[0, 90, 180, 270].map(r => <div key={r} style={tick(r)} />)}
      {(hit || kill) && [45, 135, 225, 315].map(r => (
        <div key={`x${r}`} style={{ position: "absolute", left: "50%", top: "50%", width: 2, height: kill ? 11 : 8, background: kill ? "#ff3f5a" : "#fff", transform: `translate(-50%, -50%) rotate(${r}deg) translateY(-13px)` }} />
      ))}
      {hs && <div style={{ position: "absolute", left: 18, top: -30, font: `800 12px ${font}`, color: "#ffcf6a", letterSpacing: 2, whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>HEADSHOT</div>}
    </div>
  );
}

export function Hud() {
  const h = useUi(s => s.hud);
  const now = useNow(60);
  const hurt = Math.max(0, 1 - h.hurtAgo / 0.5);
  const low = h.health < 30 ? 0.35 + 0.15 * Math.sin(now / 180) : 0;
  const panel: React.CSSProperties = { position: "fixed", bottom: 18, display: "flex", alignItems: "flex-end", gap: 12, color: INK, font: `600 12px ${font}`, textShadow: "0 1px 3px #000", pointerEvents: "none", zIndex: 11 };
  return (
    <>
      {/* hurt + low health vignette */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 10, boxShadow: `inset 0 0 ${140 + 60 * hurt}px rgba(170,0,20,${Math.min(0.85, hurt * 0.7 + low)})` }} />
      {/* kill cam letterbox */}
      <div style={{ position: "fixed", left: 0, right: 0, top: 0, height: h.killcam ? "11vh" : 0, background: "#000", transition: "height 0.25s", zIndex: 13, pointerEvents: "none" }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: h.killcam ? "11vh" : 0, background: "#000", transition: "height 0.25s", zIndex: 13, pointerEvents: "none" }} />
      {h.killcam && <div style={{ position: "fixed", left: 0, right: 0, bottom: "3.5vh", textAlign: "center", color: "#aaa", font: `600 11px ${font}`, letterSpacing: 3, zIndex: 14, pointerEvents: "none" }}>ANY KEY TO SKIP</div>}
      {!h.killcam && (
        <>
          <Crosshair />
          <div style={{ ...panel, left: 20 }}>
            <HealthFigure hp={h.health} healing={h.healing} />
            <Hourglass f={h.meter / METER.max} on={h.bt || h.timeScale < 0.99} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 2 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: PLAYER.maxCopium }, (_, i) => (
                  <div key={i} style={{ width: 8, height: 14, borderRadius: 3, background: i < h.copium ? "#ff8a1f" : "rgba(255,255,255,0.12)", borderTop: `3px solid ${i < h.copium ? "#f4f4f4" : "rgba(255,255,255,0.18)"}` }} />
                ))}
              </div>
              <div style={{ opacity: 0.8 }}>COPIUM [H]</div>
            </div>
          </div>
          <div style={{ ...panel, right: 20, flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <Mag n={h.mags[1]} size={h.magSize} dim={h.reloading > 0} />
              <Mag n={h.mags[0]} size={h.magSize} dim={h.reloading > 0} />
            </div>
            <div style={{ fontSize: 13, letterSpacing: 1 }}>{h.reloading > 0 ? `RELOADING ${Math.round(h.reloading * 100)}%` : `${h.mags[0] + h.mags[1]} / ∞`}</div>
            <div style={{ opacity: 0.7 }}>{h.weapon.toUpperCase()}</div>
          </div>
          <div style={{ position: "fixed", top: 14, right: 20, color: INK, font: `600 12px ${font}`, opacity: 0.8, textShadow: "0 1px 3px #000", pointerEvents: "none", zIndex: 11 }}>
            MILADYS {h.total - h.alive}/{h.total}
          </div>
          {h.prompt && (
            <div style={{ position: "fixed", top: "18vh", left: 0, right: 0, textAlign: "center", color: "#3ff0ff", font: `700 16px ${font}`, letterSpacing: 2, textShadow: "0 0 12px rgba(63,240,255,0.6), 0 1px 3px #000", pointerEvents: "none", zIndex: 11 }}>
              {h.prompt.toUpperCase()}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Warm, desaturated grade while the world is slowed (bullet time, shootdodge, kill cam). */
export function gradeFilter(timeScale: number): string {
  const k = Math.max(0, Math.min(1, (1 - timeScale) / 0.7));
  if (k < 0.01) return "none";
  return `sepia(${(0.45 * k).toFixed(3)}) saturate(${(1 - 0.35 * k).toFixed(3)}) contrast(${(1 + 0.08 * k).toFixed(3)}) brightness(${(1 + 0.04 * k).toFixed(3)})`;
}
