// The Effects setting (pause menu, or ?fx=clean|full for one page load): "full" is the rainy look
// tuned for readability; "clean" drops the rain near the camera, the bloom and the puddle reflections
// (a simple wet sheen instead) for players who want the clearest view of the fight.
import { create } from "zustand";

export type Effects = "full" | "clean";

function initial(): Effects {
  try {
    const q = new URLSearchParams(location.search).get("fx");
    if (q === "clean" || q === "full") return q;
    return localStorage.getItem("radpayne.fx") === "clean" ? "clean" : "full";
  } catch {
    return "full";
  }
}

export const useFx = create<{ effects: Effects }>(() => ({ effects: initial() }));

export function setEffects(effects: Effects): void {
  useFx.setState({ effects });
  try {
    localStorage.setItem("radpayne.fx", effects);
  } catch {
    /* private mode */
  }
}
