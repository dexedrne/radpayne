// Weapon tabs: 1 PISTOLS · 2 SHOTGUN · 3 SMGS. Current = paper fill, owned = ink plate, not owned =
// a dashed "3 ———". The new current tab pops on a switch; a dry gun (no ammo, no reserve) gets a
// red underline.
import { SLOT_ORDER, type WeaponId } from "../../combat/weapons.ts";

const SHORT: Record<WeaponId, string> = { pistols: "PISTOLS", shotgun: "SHOTGUN", smgs: "SMGS" };

export function WeaponTabs({ current, owned, dry }: { current: WeaponId; owned: WeaponId[]; dry: boolean }) {
  return (
    <div className="rp-slots">
      {SLOT_ORDER.map((id, i) => {
        const has = owned.includes(id);
        const cur = id === current;
        return (
          <div key={cur ? `${id}-cur` : id} className={`rp-slot${cur ? " cur" : ""}${!has ? " none" : ""}${cur && dry ? " dry" : ""}`}>
            {i + 1} {has ? SHORT[id] : "———"}
          </div>
        );
      })}
    </div>
  );
}
