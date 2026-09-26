// A cutscene panel's clock (pure, so the Node tests can run it): its lines are read one after another,
// never on top of each other. A line starts 0.3 s into the panel or GAP after the previous line's
// length has run; that length is the clip narrate() started (the buffer length it returns), else the
// decoded buffer's, or, with no clip at all, a reading time that fits its text. The panel then holds
// until its `dur` (the clip lengths + ~1 s in the JSON), and never less than HOLD after its last line.
// Also here: which captions are on screen right after a page turn, and the panel's slow push-in.

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

/**
 * The captions on screen. `shown` counts the lines started on the panel it was set for, so on the
 * first render after a page turn (before the new panel's clock has run) the new panel shows none of
 * its lines: a caption never appears before its voice.
 */
export type Shown<P> = { panel: P | null; n: number };
export const onScreen = <P>(s: Shown<P>, panel: P): number => (s.panel === panel ? s.n : 0);

/**
 * The slow push-in: the art and its caption box scale together from 1 to PUSH over PUSH_S seconds
 * (ease-out) about ORIGIN (fractions of the frame). A panel's `push` (its end scale) weakens it where
 * a long hold would carry the caption box's corner out of the frame.
 */
export const PUSH = 1.07;
export const PUSH_S = 14;
export const ORIGIN = [0.6, 0.45] as const;

/** Where a point of the panel (a fraction of the frame on one axis) sits at push scale `s`. */
export const pushed = (x: number, origin: number, s: number): number => origin + (x - origin) * s;
