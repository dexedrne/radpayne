// In-game HUD (noir comic): every element sits on a solid ink plate so it reads over the
// bloom, the rain and the black; the centre 60% holds only the crosshair cluster, threat markers,
// damage slashes and stamps. Top-left: room tag, Milady tally, objective. Bottom-left: copium tank,
// hourglass, copium stock. Bottom-right: weapon tabs + ammo. Bottom centre: subtitles. World-anchored
// layers (threat markers, damage slashes) are ref-driven from the canvas frame (HudFrame). The canvas
// filter (bullet-time grade, low-health desaturation, pause blur, death greyout) is canvasFx().
import "./hud/tokens.css";
import { useUi } from "./store.ts";
import type { Session } from "../app/session.ts";
import { useFx } from "../app/look/fx.ts";
import { roomText } from "./rooms.ts";
import { BottomLeft } from "./hud/BottomLeft.tsx";
import { AmmoPanel } from "./hud/AmmoPanel.tsx";
import { WeaponTabs } from "./hud/WeaponTabs.tsx";
import { RoomTag, Tally } from "./hud/Tally.tsx";
import { Objective } from "./hud/Objective.tsx";
import { Crosshair } from "./hud/Crosshair.tsx";
import { Subtitle } from "./hud/Subtitle.tsx";
import { Nudge } from "./hud/Nudge.tsx";
import { useCaptions } from "./hud/captions.ts";
import { ThreatLayer } from "./hud/ThreatLayer.tsx";
import { DamageLayer } from "./hud/DamageLayer.tsx";
import { ScreenFx } from "./hud/ScreenFx.tsx";
import { KillcamOverlay } from "./hud/KillcamOverlay.tsx";
import { btGrade } from "./hud/logic.ts";
import { hudSession } from "./hud/HudFrame.tsx";

export { canvasFx } from "./hud/logic.ts";
export { Crosshair } from "./hud/Crosshair.tsx";

/** Top-left group: the room tag and the tally (also shown, at 90%, on the pause screen). */
export function TopLeft({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  const h = useUi(s => s.hud);
  const short = h.health <= 25 || h.bt || h.timeScale < 0.99;
  return (
    <div className="rp-tl rp-z" style={style}>
      <RoomTag label={h.roomLabel} short={short} />
      <Tally alive={h.alive} total={h.total} run={h.run} />
      {children}
    </div>
  );
}

export function Hud({ s: sProp, paused = false }: { s?: Session | null; paused?: boolean } = {}) {
  const s = sProp ?? hudSession.current;
  const h = useUi(st => st.hud);
  const deadAt = useUi(st => st.deadAt);
  const clean = useFx(st => st.effects) === "clean";
  const now = performance.now();
  const cap = useCaptions(h, now);
  if (paused) return <div className="rp-hud" style={{ zIndex: 31 }}><TopLeft style={{ opacity: 0.9 }} /></div>;
  const dead = deadAt > 0;
  const kc = h.killcam;
  const total = h.mags[0] + (h.hands === 2 ? h.mags[1] : 0);
  const line = s ? roomText(s.roomId, s.level.room).killcamLine : "last one.";
  return (
    <>
      <div className={clean ? "rp-clean" : ""}>
        <ScreenFx h={h} dead={dead} />
        {s && <DamageLayer s={s} />}
      </div>
      <div className={`rp-hud${kc ? " kc" : ""}${dead ? " dead" : ""}${clean ? " rp-clean" : ""}`} data-testid="hud">
        {s && <ThreatLayer s={s} />}
        <TopLeft>{cap.objective && <Objective {...cap.objective} now={now} />}</TopLeft>
        <BottomLeft h={h} now={now} />
        {cap.nudge && <Nudge {...cap.nudge} />}
        {cap.subtitle && <Subtitle {...cap.subtitle} now={now} />}
        <div className="rp-br rp-z">
          <WeaponTabs current={h.weaponId} owned={h.owned} dry={total === 0 && h.reserve <= 0} />
          <AmmoPanel mags={h.mags} magSize={h.magSize} hands={h.hands} reloading={h.reloading} weapon={h.weapon} weaponId={h.weaponId} reserve={h.reserve} />
        </div>
        {!kc && !dead && <Crosshair now={now} />}
      </div>
      <KillcamOverlay on={kc} progress={h.killcamProgress} timeScale={h.timeScale} line={line} />
    </>
  );
}

/** Warm, desaturated grade while the world is slowed (kept for callers of the old HUD). */
export function gradeFilter(timeScale: number): string {
  const k = btGrade(timeScale);
  if (k < 0.01) return "none";
  return `sepia(${(0.22 * k).toFixed(3)}) saturate(${(1 - 0.15 * k).toFixed(3)}) contrast(${(1 + 0.05 * k).toFixed(3)})`;
}
