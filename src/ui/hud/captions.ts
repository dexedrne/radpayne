// The transient-text budget in one hook: the TL objective, the BC narrator subtitle and the BL nudge
// are the only cream captions; at most two show at once, one while the gang is awake, priority
// nudge > subtitle > objective (a lower one fades out). Nudges fire once per episode for up to 4 s:
// the low-health heal prompt, out of copium, a dry gun, a weapon pickup. A prompt goes at once when
// its reason does (the can is drunk, the health is back, the gun is switched).
import { useUi, type Hud } from "../store.ts";
import { SLOT_ORDER, type WeaponId } from "../../combat/weapons.ts";
import { NUDGE_HOLD, OBJECTIVE_HOLD, captionBudget } from "./logic.ts";

const NAMES: Record<WeaponId, string> = { pistols: "the pistols", shotgun: "the shotgun", smgs: "the smgs" };

type Nudge = { text: string; at: number };
/** Why a nudge is up: heal / dry / empty last only while their condition holds; a pickup runs its 4 s. */
type Why = "heal" | "dry" | "empty" | "pickup";

// module state, not component state: the HUD unmounts while paused and an episode must not replay
const s = { run: -1, heal: false, dry: false, empty: false, owned: [] as WeaponId[], nudge: null as (Nudge & { why: Why }) | null };

/** Nudge episodes (edge-triggered): returns the latest nudge while it is fresh and still true. */
export function useNudge(h: Hud, now: number): Nudge | null {
  if (s.run !== h.run) { s.run = h.run; s.heal = s.dry = s.empty = false; s.owned = h.owned; s.nudge = null; }
  const fire = (why: Why, text: string) => { s.nudge = { text, at: now, why }; };
  const alive = h.health > 0 && !h.killcam;
  const low = alive && h.health <= 25;
  // a can being drunk answers both prompts (another can't be drunk until it is done)
  const heal = low && h.copium > 0 && !h.healing;
  if (heal && !s.heal) fire("heal", h.copium === 1 ? "one can left. drink it. [H]" : `${h.copium} cans left. drink one. [H]`);
  s.heal = heal;
  const dry = low && h.copium === 0 && !h.healing;
  if (dry && !s.dry) fire("dry", "out of copium. don't get hit.");
  s.dry = dry;
  const total = h.mags[0] + (h.hands === 2 ? h.mags[1] : 0);
  const empty = alive && total === 0 && h.reserve <= 0;
  if (empty && !s.empty) {
    const other = h.owned.find(w => w !== h.weaponId);
    fire("empty", other ? `dry. switch to ${NAMES[other]}. [${SLOT_ORDER.indexOf(other) + 1}]` : "dry. nothing left to shoot.");
  }
  s.empty = empty;
  const got = h.owned.find(w => !s.owned.includes(w));
  if (got) fire("pickup", `picked up ${NAMES[got]}. [${SLOT_ORDER.indexOf(got) + 1}]`);
  s.owned = h.owned;
  const n = s.nudge;
  if (n && (now - n.at >= NUDGE_HOLD || n.why !== "pickup" && !s[n.why])) s.nudge = null;
  return s.nudge ? { text: s.nudge.text, at: s.nudge.at } : null;
}

export type Captions = {
  objective: { text: string; at: number; show: boolean } | null;
  subtitle: { text: string; hint: string; until: number; show: boolean } | null;
  nudge: (Nudge & { show: boolean }) | null;
};

export function useCaptions(h: Hud, now: number): Captions {
  const sub = useUi(s => s.subtitle);
  const subs = useUi(s => s.subs);
  const nudge = useNudge(h, now);
  const objActive = !!h.objective && h.objectiveAt > 0 && now - h.objectiveAt < OBJECTIVE_HOLD + 300;
  const subLive = !!sub.text && now < sub.until;
  const subActive = subLive && subs;
  const b = captionBudget({ nudge: !!nudge, subtitle: subActive, objective: objActive }, h.awake);
  return {
    objective: objActive ? { text: h.objective, at: h.objectiveAt, show: b.objective } : null,
    // the hint row stays with Subtitles OFF (only the narrator's words go)
    subtitle: subLive ? { text: sub.text, hint: sub.hint, until: sub.until, show: b.subtitle } : null,
    nudge: nudge ? { ...nudge, show: b.nudge } : null,
  };
}
