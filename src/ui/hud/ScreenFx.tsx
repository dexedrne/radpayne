// Canvas-layer overlays (z 5, under the HUD, never over it): bullet time = warm edge grain + a ray
// burst outside the middle 60% (Clean: no rays, half grain); low health (35 -> 25 HP ramps in) = a
// red vignette with a heartbeat and a ben-day halftone at the edges (Clean: no halftone). The canvas
// filter itself (grade, desaturation, pause blur, death greyout) is canvasFx() in logic.ts.
import type { Hud } from "../store.ts";
import { btGrade, lowHp } from "./logic.ts";

export { canvasFx } from "./logic.ts";

export function ScreenFx({ h, dead }: { h: Hud; dead: boolean }) {
  const bt = h.killcam ? 0 : btGrade(h.timeScale);
  const lo = dead || h.killcam ? 0 : lowHp(h.health);
  return (
    <>
      <div className="rp-fxl rp-bt-grain" style={{ zIndex: 5, opacity: bt }} />
      <div className="rp-fxl rp-speed" style={{ zIndex: 5, opacity: bt > 0.5 ? 1 : 0 }} />
      {lo > 0 && <div className="rp-fxl" style={{ zIndex: 5, opacity: lo }}><div className="rp-fxl rp-vig-red" /><div className="rp-fxl rp-halftone" /></div>}
    </>
  );
}
