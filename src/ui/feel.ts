// Hit feedback (Pause > Display > Hit feedback: Full / Subtle / Off, persisted as radpayne.hitFeel) and
// the hitmarker's current mark. Its own small store: a hit re-renders the marker only, never the HUD.
import { create } from "zustand";
import { store } from "./store.ts";
import { parseHitFeel, type HitFeelMode, type HitKind, type MarkSpec } from "../app/hitfeel.ts";

/** The mark on screen: `id` restarts its animation; `level` the stack after this hit (0..1). */
export type Mark = { id: number; kind: HitKind; headshot: boolean; level: number; spec: MarkSpec; at: number; k: number };

const stored = (): string | null => {
  try {
    return localStorage.getItem("radpayne.hitFeel");
  } catch {
    return null;
  }
};

export const useFeel = create<{ mode: HitFeelMode; mark: Mark | null }>(() => ({ mode: parseHitFeel(stored()), mark: null }));

export function setHitFeel(m: HitFeelMode): void {
  useFeel.setState({ mode: m });
  store("hitFeel", m);
}

export const hitFeelMode = (): HitFeelMode => useFeel.getState().mode;
