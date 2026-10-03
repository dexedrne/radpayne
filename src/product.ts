// Which game this page is (brands.ts): RadPayne, or RetardioPayne, the harder cut with only the two
// Retardios. Decided once, at load: the build's VITE_GAME, or in a dev / test build ?game= over it.
// Outside a page (the node tests, the tools) it is RadPayne.
import { BRANDS, otherGameHref, resolveGame, type GameId } from "./brands.ts";

const MODE: string | undefined = import.meta.env?.MODE;
export const GAME: GameId = resolveGame(import.meta.env?.VITE_GAME, MODE, typeof location === "undefined" ? "" : location.search);
export const BRAND = BRANDS[GAME];
/** RetardioPayne: the Retardios only, its one harder difficulty, its own palette and grade. */
export const IS_CUT = GAME === "retardiopayne";
/** The title's small link to the other game. */
export const OTHER = { href: otherGameHref(GAME, MODE), brand: BRANDS[BRAND.other], blurb: BRAND.otherBlurb };

/** The page: <html data-game> picks the palette (tokens.css); a dev page switched by ?game= also gets
 *  that game's title and icon (a build's index.html already has its own). */
export function applyBrand(doc: Document = document): void {
  doc.documentElement.dataset.game = GAME;
  if (doc.title === BRAND.name) return;
  doc.title = BRAND.name;
  const icon = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = `/brand/${GAME}/favicon.svg`;
}
