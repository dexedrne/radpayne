// The final-kill cam and the kill cam (app/cine.ts): letterbox bars (a paper rule under the top one, a
// sand progress line over the bottom one), its tag (FINAL KILL, SNIPER · 41 M, ...), the live time-scale
// chip, Radbro's line on the last kill, ANY KEY TO SKIP. The rest of the HUD is faded out.
import { Tag } from "./Tag.tsx";
import { Caption } from "./Caption.tsx";

export function KillcamOverlay({ on, progress, timeScale, line, tag = "FINAL KILL" }: { on: boolean; progress: number; timeScale: number; line: string; tag?: string }) {
  return (
    <>
      <div className={`rp-lb top${on ? " on" : ""}`} style={{ height: on ? "11vh" : 0 }} />
      <div className="rp-lb bot" style={{ height: on ? "11vh" : 0 }} />
      {on && (
        <div className="rp-kc">
          <div style={{ position: "absolute", left: 0, top: "11vh" }}>
            <div className="rp-z" style={{ position: "absolute", left: "var(--m)", bottom: 0, transform: "translateY(50%)" }}><Tag>{tag}</Tag></div>
          </div>
          <div style={{ position: "absolute", right: 0, top: "11vh" }}>
            <div className="rp-z" style={{ position: "absolute", right: "var(--m)", bottom: 0, transform: "translateY(50%)" }}>
              <div className="chip">×{timeScale < 0.095 ? Math.max(0.01, timeScale).toFixed(2) : timeScale.toFixed(1)}</div>
            </div>
          </div>
          <div style={{ position: "absolute", left: "50%", bottom: "calc(11vh + 22px)" }}>
            {line && <div className="rp-z" style={{ transform: "translateX(-50%)" }}><Caption text={line} className="line" /></div>}
          </div>
          <div className="prog-bg" />
          <div className="prog" style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: "5.5vh", display: "flex", justifyContent: "center", transform: "translateY(50%)" }}>
            <div className="rp-z skip">ANY KEY TO SKIP</div>
          </div>
        </div>
      )}
    </>
  );
}
