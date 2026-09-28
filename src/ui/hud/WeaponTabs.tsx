// Weapon tabs, one per key (arsenal spec 3.3): 1 PISTOLS (or #250's AK) · 2 SHOTGUN / SAWED-OFF · 3 SMGS ·
// 4 CANNON · 5 RIFLE / SNIPER. A category tab shows the gun in hand, else the one used last there; a small
// "+" pip when both of its guns are owned. Current = paper fill, owned = ink plate, not owned = a dashed
// "4 ———". The new current tab pops on a switch; a dry gun (no ammo, no reserve) gets a red underline.
// On a pad the key numbers mean nothing: the tabs lose them, and the tab the d-pad's left / right reaches
// next carries that arm's glyph (both arms on one tab: the whole left-right glyph).
import { SLOT_ORDER, slotOf, type WeaponId } from "../../combat/weapons.ts";
import type { PadKind } from "../../input/pad.ts";
import { padTabGlyphs } from "./logic.ts";
import { PadGlyph } from "./PadGlyph.tsx";

const SHORT: Record<WeaponId, string> = {
  pistols: "PISTOLS", ak: "AK", shotgun: "SHOTGUN", sawedoff: "SAWED-OFF", smgs: "SMGS", handcannon: "CANNON", rifle: "RIFLE", sniper: "SNIPER",
};

export function WeaponTabs({ current, owned, dry, ammo, last, pad }: { current: WeaponId; owned: WeaponId[]; dry: boolean; ammo?: Partial<Record<WeaponId, number>>; last?: Partial<Record<number, WeaponId>>; pad?: PadKind | null }) {
  const arms = pad ? padTabGlyphs(current, owned) : {};
  return (
    <div className="rp-slots" data-testid="weapon-tabs">
      {[1, 2, 3, 4, 5].map(slot => {
        const mine = SLOT_ORDER.filter(w => slotOf(w) === slot && owned.includes(w));
        const id: WeaponId | undefined = mine.includes(current) ? current : last?.[slot] && mine.includes(last[slot]!) ? last[slot] : mine[0];
        const has = !!id;
        const cur = has && id === current;
        const out = cur ? dry : has && (ammo?.[id!] ?? 1) <= 0;
        const arm = arms[slot];
        return (
          <div key={cur ? `${id}-cur` : `${slot}-${id ?? ""}`} className={`rp-slot${cur ? " cur" : ""}${!has ? " none" : ""}${out ? " dry" : ""}${pad ? " pad" : ""}`}>
            {pad ? (arm && <span className="rp-slot-g"><PadGlyph g={arm} kind={pad} /></span>) : `${slot} `}{has ? SHORT[id!] : "———"}{mine.length > 1 && <i className="rp-pip">+</i>}
          </div>
        );
      })}
    </div>
  );
}
