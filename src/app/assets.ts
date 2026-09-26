// Versioned URLs for the files in public/ (models, audio, textures, cutscenes, UI cards, levels): the build
// hashes each file (vite.config.ts, __ASSET_V__) and the game asks for `<path>?v=<hash>`, which Vercel
// serves as immutable for a year (vercel.json). A changed file gets a new URL, so a repeat visit loads
// nothing it already has and never an old copy. A path the build did not see is left as it is (served
// the default way: revalidated on every visit).
declare const __ASSET_V__: Record<string, string> | undefined;

const V: Record<string, string> | null = typeof __ASSET_V__ !== "undefined" ? __ASSET_V__ : null;

/** `path` with its content hash (`/models/x.glb` -> `/models/x.glb?v=1a2b3c4d5e`). */
export function assetUrl(path: string): string {
  const h = V?.[path];
  return h ? `${path}?v=${h}` : path;
}

/** Whether the build saw this file (null: no build list, e.g. the node tests). */
export function assetExists(path: string): boolean | null {
  return V ? Object.prototype.hasOwnProperty.call(V, path) : null;
}
