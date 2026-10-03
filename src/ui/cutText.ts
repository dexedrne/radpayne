// RetardioPayne's on-screen words where RadPayne's say he is a Radbro himself (the panels' captions, the
// narrator's subtitles). The recorded voices stay as they are; only the text on screen changes. The
// rival heavies are still Radbros, so a line about them keeps the word.
import { IS_CUT } from "../product.ts";

/** RadPayne's words -> RetardioPayne's (a part of a line; every one is found in RadPayne's lines: the
 *  products test checks). */
export const CUT_TEXT: ReadonlyArray<readonly [string, string]> = [
  // cutscene 2 (c2.json): the back of the house
  ["back here they kept the other radbros.", "back here they kept the radbros."],
  // room 3, the first heavy (director.ts NARRATION.r3_heavy)
  ["radbros. my own kind, in black, with shotguns.", "radbros. in black, with shotguns."],
];

/** A line as this game shows it. */
export function textFor(s: string, cut: boolean = IS_CUT): string {
  if (!cut || !s) return s;
  for (const [from, to] of CUT_TEXT) if (s.includes(from)) s = s.replace(from, to);
  return s;
}
