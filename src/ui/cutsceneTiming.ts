// A cutscene panel's clock (pure, so the Node tests can run it): its lines are read one after another,
// never on top of each other. A line starts 0.3 s into the panel or GAP after the previous line ends;
// a line lasts its clip (the length narrate() reports, else the decoded buffer's) or, with no clip at
// all, a reading time that fits its text. The panel then holds until its `dur` (the clip lengths +
// ~1 s in the JSON), and never less than HOLD after its last line.

export type TimedLine = { audio?: string; text: string; speaker?: string };

/** The first line's start, the silence between two lines, the least hold after the last one (seconds). */
export const FIRST = 0.3;
export const GAP = 0.35;
export const HOLD = 0.4;

/** Real seconds a line is shown when its audio does not play (muted / not loaded). */
export const readTime = (t: string) => Math.max(2.8, t.length * 0.055);

/** How long a line takes: the clip that played, else the clip's known length, else a reading time. */
export function lineLen(ln: TimedLine, played: number, known: number): number {
  if (played > 0) return played;
  if (ln.audio && known > 0) return known;
  return readTime(ln.text);
}

/** Seconds from the moment the panel's last line ends until the page turns (`t` = that end, from the panel's start). */
export function holdAfter(dur: number | undefined, t: number): number {
  const at = t + GAP;
  return Math.max(at + HOLD, dur ?? at + 1.1) - t;
}

/** The whole panel at known lengths: each line's start and end, and when the page turns. */
export function planPanel(lines: readonly TimedLine[], dur: number | undefined, len: (ln: TimedLine) => number): { start: number[]; end: number[]; turn: number } {
  const start: number[] = [], end: number[] = [];
  let t = FIRST;
  for (const ln of lines) {
    start.push(t);
    t += len(ln);
    end.push(t);
    t += GAP;
  }
  const last = end.length ? end[end.length - 1] : FIRST - GAP;
  return { start, end, turn: last + holdAfter(dur, last) };
}
