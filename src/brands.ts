// The two games this code ships: RadPayne, and RetardioPayne (the same game with only the two Retardios
// to play, one fixed harder difficulty, its own look). Pure data and string helpers: vite.config.ts
// (the page head, the share image), the page (product.ts) and the tests read it.
//   build: VITE_GAME=retardiopayne (npm run build:retardiopayne / dev:retardiopayne); anything else is
//   RadPayne. Dev and test builds also take ?game=retardiopayne (or ?game=radpayne) for one page load;
//   a production build ignores the parameter.

export type GameId = "radpayne" | "retardiopayne";
export const GAME_IDS: readonly GameId[] = ["radpayne", "retardiopayne"];

export type Brand = {
  id: GameId;
  /** The name as written in text, and the title's wordmark (the second part in the accent colour). */
  name: string;
  wordmark: readonly [string, string];
  /** The live site (no trailing slash). */
  url: string;
  description: string;
  /** The share image's file at the site root, and its alt text. */
  ogImage: string;
  ogAlt: string;
  /** The title's accent (the wordmark's second part; the other game's link names this one in it). */
  accent: string;
  /** The other game: the title's small link to it. */
  other: GameId;
  /** That link's words on this game's title ("<name>: <blurb>"). */
  otherBlurb: string;
};

export const BRANDS: Record<GameId, Brand> = {
  radpayne: {
    id: "radpayne",
    name: "RadPayne",
    wordmark: ["RAD", "PAYNE"],
    url: "https://radpayne.vyvanse.beer",
    description: "They took the bag. He came back for it, one frozen second at a time. A noir bullet-time shooter in the browser with the Radbros.",
    ogImage: "og3.jpg",
    accent: "#ff3fa8",
    ogAlt: "RadPayne, bullet-time noir: Radbros #4764, #652, #723 and #2564 with the Retardio boys Cousin #555 and Classic #85 dive through the rain with pistols blazing on a neon-lit street",
    other: "retardiopayne",
    otherBlurb: "the harder cut, with the Retardios",
  },
  retardiopayne: {
    id: "retardiopayne",
    name: "RetardioPayne",
    wordmark: ["RETARDIO", "PAYNE"],
    url: "https://retardiopayne.vyvanse.beer",
    description: "The harder cut of RadPayne. Retardio #555 and Retardio #85 go back for the bag through the rain, one frozen second at a time. A noir bullet-time shooter in the browser.",
    ogImage: "og.jpg",
    accent: "#f2899a",
    ogAlt: "RetardioPayne, the harder cut: Retardio Cousin #555 and Retardio Classic #85 in the rain on a neon-lit street, guns drawn",
    other: "radpayne",
    otherBlurb: "the original, with the Radbros",
  },
};

const isGame = (v: unknown): v is GameId => typeof v === "string" && (GAME_IDS as readonly string[]).includes(v);

/** Which game a page is: the build's VITE_GAME, or in a dev / test build (any mode but production) a
 *  ?game= parameter over it. */
export function resolveGame(built: string | undefined, mode: string | undefined, search: string): GameId {
  const base: GameId = isGame(built) ? built : "radpayne";
  if (mode === "production") return base;
  const q = new URLSearchParams(search).get("game");
  return isGame(q) ? q : base;
}

/** The title's link to the other game: its site, or in a dev / test build this page with ?game=. */
export function otherGameHref(game: GameId, mode: string | undefined): string {
  const other = BRANDS[game].other;
  return mode === "production" ? `${BRANDS[other].url}/` : `?game=${other}`;
}

/** The page head for a game: index.html is written for RadPayne; RetardioPayne's build swaps in its own
 *  title, description, canonical URL and share tags (every tag must be there: a missing one throws, so a
 *  changed index.html cannot silently ship RadPayne's tags). RadPayne's head comes back unchanged. */
export function brandHtml(html: string, game: GameId): string {
  if (game === "radpayne") return html;
  const b = BRANDS[game];
  const img = `${b.url}/${b.ogImage}`;
  let out = html;
  const swap = (re: RegExp, to: string, what: string) => {
    if (!re.test(out)) throw new Error(`brandHtml: no ${what} in index.html`);
    out = out.replace(re, to);
  };
  const meta = (attr: "name" | "property", key: string, value: string) =>
    swap(new RegExp(`(<meta ${attr}="${key.replace(/[:.]/g, m => `\\${m}`)}" content=")[^"]*(")`), `$1${escapeAttr(value)}$2`, `${attr}=${key}`);
  swap(/<title>[^<]*<\/title>/, `<title>${b.name}</title>`, "<title>");
  meta("name", "description", b.description);
  swap(/(<link rel="canonical" href=")[^"]*(")/, `$1${b.url}/$2`, "canonical");
  meta("property", "og:site_name", b.name);
  meta("property", "og:url", `${b.url}/`);
  meta("property", "og:title", b.name);
  meta("property", "og:description", b.description);
  meta("property", "og:image", img);
  meta("property", "og:image:secure_url", img);
  meta("property", "og:image:alt", b.ogAlt);
  meta("name", "twitter:title", b.name);
  meta("name", "twitter:description", b.description);
  meta("name", "twitter:image", img);
  meta("name", "twitter:image:alt", b.ogAlt);
  return out;
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
