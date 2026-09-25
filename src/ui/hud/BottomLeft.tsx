// The bottom-left strip: copium tank (health), hourglass (bullet time), copium stock.
import type { Hud } from "../store.ts";
import { HealthTank } from "./HealthTank.tsx";
import { Hourglass } from "./Hourglass.tsx";
import { CopiumStock } from "./CopiumStock.tsx";

export function BottomLeft({ h, now }: { h: Hud; now: number }) {
  return (
    <div className="rp-strip rp-z">
      <HealthTank hp={h.health} healing={h.healing} copium={h.copium} run={h.run} />
      <Hourglass meter={h.meter} on={h.bt || h.timeScale < 0.99} refusedAt={h.btRefusedAt} refill={h.refill} now={now} />
      <CopiumStock copium={h.copium} hp={h.health} healing={h.healing} now={now} run={h.run} />
    </div>
  );
}
