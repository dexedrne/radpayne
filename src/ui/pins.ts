// The Radbro Webring pins (arsenal spec 4.3): six enamel pins, two per room, hidden in the secrets. The
// collection lives in this viewer's localStorage (`radpayne.pins`), read and written inside try/catch:
// the game plays the same without it (a private window collects nothing across page loads).
import type { RadbroId } from "./store.ts";

const KEY = "radpayne.pins";
/** This page load's copy (so a blocked storage still shows this session's pins). */
let mem: string[] | null = null;

export function loadPins(): string[] {
  if (mem) return mem;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    mem = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    mem = [];
  }
  return mem;
}

/** Add a pin to the collection; true when it is new. */
export function addPin(id: RadbroId | string): boolean {
  const have = loadPins();
  if (have.includes(id)) return false;
  mem = [...have, id];
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage blocked: this page load keeps it */ }
  return true;
}
