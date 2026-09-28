// The chapters: where each starts (its first room and the cutscene before it), its name, and which ones
// this viewer has cleared (localStorage `radpayne.chapters`, read and written inside try/catch: the game
// plays the same without it; a blocked storage only remembers this page load). Clearing chapter 1 opens
// the title's chapter select.
export type ChapterId = 1 | 2;
export const CHAPTERS: Record<ChapterId, { name: string; first: string; intro: string; word: string }> = {
  1: { name: "CHAPTER 1: RUGGED", first: "room1", intro: "c1", word: "ONE" },
  2: { name: "CHAPTER 2: KEEPING SCORE", first: "room6", intro: "ch2a", word: "TWO" },
};

/** The chapter a room belongs to (its level's `chapter` setting; rooms 1-5 are chapter 1). */
export const chapterOf = (settings: { [k: string]: unknown } | undefined): ChapterId => (settings?.chapter === 2 ? 2 : 1);

const KEY = "radpayne.chapters";
let mem: number[] | null = null;

export function clearedChapters(): number[] {
  if (mem) return mem;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    mem = Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    mem = [];
  }
  return mem;
}

export function markCleared(n: ChapterId): void {
  const have = clearedChapters();
  if (have.includes(n)) return;
  mem = [...have, n];
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* blocked: this page load keeps it */ }
}
