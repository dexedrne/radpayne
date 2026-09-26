// Which Pockit girls make up a room's gang (pure: vrm/pockit.ts keeps their files in the browser's
// cache, PlayPage asks for the picks when a level is read).

/** New faces per room per visit (the rest of the gang comes from the cache when it has enough). */
export const FRESH_MIN = 2;

/**
 * The gang's model numbers for one room: `slots` in marker order (`later` = brought in by a spawn
 * trigger). Girls already in the cache (and not used in another room this visit) go to the goons that
 * are there from the start; at least FRESH_MIN new numbers per room, and those go to the later goons
 * first (their downloads are off the room's critical path). Deterministic for a seed and inputs.
 */
export function pickPockits(slots: ReadonlyArray<{ id: string; later: boolean }>, seed: number, cached: readonly number[], used: ReadonlySet<number>, count = 3333): Record<string, number> {
  let s = (seed >>> 0) || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pool = [...new Set(cached)].filter(n => !used.has(n) && n >= 1 && n <= count);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const fresh = Math.min(slots.length, Math.max(FRESH_MIN, slots.length - pool.length));
  const reuse = pool.slice(0, slots.length - fresh);
  const taken = new Set<number>([...used, ...cached]);
  const news: number[] = [];
  while (news.length < fresh) {
    const n = 1 + Math.floor(rnd() * count);
    if (!taken.has(n)) { taken.add(n); news.push(n); }
    if (taken.size >= count) break;
  }
  // the start goons take the cached girls, the later ones the new faces (then whatever is left)
  const order = slots.map((sl, i) => ({ sl, i })).sort((a, b) => Number(a.sl.later) - Number(b.sl.later) || a.i - b.i);
  const out: Record<string, number> = {};
  const nums = [...reuse, ...news];
  order.forEach((o, k) => { const n = nums[k]; if (n) out[o.sl.id] = n; });
  return out;
}
