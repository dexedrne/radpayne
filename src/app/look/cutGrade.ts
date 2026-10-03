// RetardioPayne's grade (product.ts IS_CUT): a light split tone over each look's own after its tone map,
// the shadows toward #85's purple freckles and the lights a touch toward #555's blush. The rain, the
// neon and the noir stay; the gold / red gunfire and the goon outlines keep their colours (it moves them
// by a few per cent at most). RadPayne's looks never call into it: cutGrade returns their graph as it is.
import { luminance, mix, smoothstep, vec3 } from "three/tsl";
import { IS_CUT } from "../../product.ts";

type N = any; // TSL node graphs: the three typings are too narrow for chained swizzles / mixes

export const CUT_GRADE = {
  /** x the colour in the shadows / in the lights, with the split between them over this luminance. */
  shadow: [1.05, 0.93, 1.12] as const,
  light: [1.03, 0.985, 1.0] as const,
  split: [0.04, 0.55] as const,
  /** Added after (the blacks lean violet, never grey). */
  lift: [0.003, 0, 0.005] as const,
};

export function cutGrade(c: N): N {
  if (!IS_CUT) return c;
  const G = CUT_GRADE;
  const k = smoothstep(G.split[0], G.split[1], luminance(c));
  return mix(c.mul(vec3(...G.shadow)), c.mul(vec3(...G.light)), k).add(vec3(...G.lift));
}
