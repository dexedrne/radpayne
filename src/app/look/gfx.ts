// Graphics settings (pause menu > Display, and the title's GRAPHICS row): a preset (Low / Medium /
// High / Cinematic) plus the individual controls it sets. Changing a control by hand makes the preset
// "custom". Everything applies live; persisted as localStorage radpayne.gfx (JSON).
//   bloom        off | subtle (the readable default) | original (the first preview's strong glow)
//   reflections  off (a plain wet sheen) | soft (quarter-res, blurred, dimmed) | sharp (the original
//                half-res mirror puddles)
//   rain         off | thin (the default: 2,600 thin streaks) | light (a drizzle: fewer, clear further
//                out from the lens). Never the first preview's 7,000 heavy streaks.
//   res          render resolution, % of the screen's pixels (capped at 1.75 device pixels). 75 % never
//                goes under one pixel per screen pixel (on a standard 1x screen it is the full picture:
//                below that the thin neon letters break up); only 50 % does, for the slowest machines.
//   msaa         4x MSAA on the scene pass (a preset thing, not a live control: it rebuilds the pass). On
//                in every preset: without it the thin neon letters break up into dashes at any resolution
//   lite         Low's lighter scene: every other crowd girl, fewer lasers and moving lights (a preset
//                thing too)
// The goon outlines, the gold (his) vs red (theirs) gunfire and the rest of the readability layer are
// on in every preset.
// Compatibility: ?q=low picks Low for one page load, ?fx=full High, ?gfx=<preset> any preset; an old
// saved Quality: Low becomes Low. The old Effects: Clean (?fx=clean, or saved) was a choice for a clear
// view, not for speed: it becomes CLEAN (no bloom, no mirror, the drizzle that clears further out) at
// full resolution, with the full crowd and lasers.
// Default (nothing saved): High on WebGPU; Medium on the WebGL2 fallback (no puddle mirror: on WebGL2
// every shader is linked through the GPU process one at a time and the mirror is ~a third of them, the
// load audit's slowest path). Either can pick any preset; a choice is saved.
import { create } from "zustand";

export type Preset = "low" | "medium" | "high" | "cinematic";
export type Bloom = "off" | "subtle" | "original";
export type Reflections = "off" | "soft" | "sharp";
export type Rain = "off" | "thin" | "light";
export type Res = 50 | 75 | 100;
export type Gfx = { preset: Preset | "custom"; bloom: Bloom; reflections: Reflections; rain: Rain; res: Res; msaa: boolean; lite: boolean };

export const PRESETS: Record<Preset, Omit<Gfx, "preset">> = {
  low: { bloom: "off", reflections: "off", rain: "light", res: 75, msaa: true, lite: true },
  medium: { bloom: "subtle", reflections: "off", rain: "thin", res: 100, msaa: true, lite: false },
  high: { bloom: "subtle", reflections: "soft", rain: "thin", res: 100, msaa: true, lite: false },
  cinematic: { bloom: "original", reflections: "sharp", rain: "thin", res: 100, msaa: true, lite: false },
};
export const PRESET_ORDER: readonly Preset[] = ["low", "medium", "high", "cinematic"];
/** The old Effects: Clean (readability, not speed): a custom mix, not the Low preset. */
export const CLEAN: Omit<Gfx, "preset"> = { bloom: "off", reflections: "off", rain: "light", res: 100, msaa: true, lite: false };
export const DEFAULT_PRESET: Preset = "high";
/** The default on the WebGL2 fallback (no WebGPU, or ?webgl2). */
export const DEFAULT_WEBGL2: Preset = "medium";

/** Rain streaks drawn per setting (the mesh holds RAIN.max; thin is the default). */
export const RAIN = { max: 2600, thin: 2600, light: 1100 } as const;

const BLOOMS: readonly Bloom[] = ["off", "subtle", "original"];
const REFLS: readonly Reflections[] = ["off", "soft", "sharp"];
const RAINS: readonly Rain[] = ["off", "thin", "light"];
const RESES: readonly Res[] = [50, 75, 100];

export function fromPreset(p: Preset): Gfx {
  return { preset: p, ...PRESETS[p] };
}

function clean(): Gfx {
  return { preset: presetOf(CLEAN), ...CLEAN };
}

/** The preset these settings match exactly, else "custom". */
export function presetOf(g: Omit<Gfx, "preset">): Preset | "custom" {
  for (const p of PRESET_ORDER) {
    const q = PRESETS[p];
    if (q.bloom === g.bloom && q.reflections === g.reflections && q.rain === g.rain && q.res === g.res && q.msaa === g.msaa && q.lite === g.lite) return p;
  }
  return "custom";
}

/** A stored value back to settings (anything unknown falls back to the default preset's value). */
export function parseGfx(raw: string | null): Gfx | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Gfx>;
    const d = PRESETS[DEFAULT_PRESET];
    const g = {
      bloom: BLOOMS.includes(o.bloom as Bloom) ? (o.bloom as Bloom) : d.bloom,
      reflections: REFLS.includes(o.reflections as Reflections) ? (o.reflections as Reflections) : d.reflections,
      rain: RAINS.includes(o.rain as Rain) ? (o.rain as Rain) : d.rain,
      res: RESES.includes(o.res as Res) ? (o.res as Res) : d.res,
      msaa: typeof o.msaa === "boolean" ? o.msaa : d.msaa,
      lite: typeof o.lite === "boolean" ? o.lite : d.lite,
    };
    return { preset: presetOf(g), ...g };
  } catch {
    return null;
  }
}

type Store = { getItem(k: string): string | null };

/** The settings for this page load: URL overrides first (not saved), then the saved ones, then the
 *  old Effects / Quality settings, then the default for the backend. */
export function initialGfx(search: string, st: Store | null, webgl2 = false): Gfx {
  const q = new URLSearchParams(search);
  const gp = q.get("gfx");
  if (gp && (PRESET_ORDER as readonly string[]).includes(gp)) return fromPreset(gp as Preset);
  if (q.get("q") === "low") return fromPreset("low");
  if (q.get("fx") === "clean") return clean();
  if (q.get("fx") === "full") return fromPreset("high");
  const get = (k: string) => { try { return st?.getItem(k) ?? null; } catch { return null; } };
  const saved = parseGfx(get("radpayne.gfx"));
  if (saved) return saved;
  if (get("radpayne.quality") === "low") return fromPreset("low"); // Low has everything Clean had, too
  if (get("radpayne.fx") === "clean") return clean();
  return fromPreset(webgl2 ? DEFAULT_WEBGL2 : DEFAULT_PRESET);
}

/** Whether this browser will run the WebGL2 fallback (no WebGPU, or ?webgl2). */
export function webgl2Likely(): boolean {
  try {
    return typeof navigator === "undefined" || !("gpu" in navigator) || new URLSearchParams(location.search).has("webgl2");
  } catch {
    return false;
  }
}

let chosen = false;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const useGfx = create<Gfx>(() => initialGfx(typeof location === "undefined" ? "" : location.search, storage(), typeof location !== "undefined" && webgl2Likely()));

/** The renderer came up (Scene): a WebGPU browser that fell back to WebGL2 gets the WebGL2 default,
 *  unless the settings were saved or picked in the URL or on this page. */
export function backendIs(webgl2: boolean): void {
  if (chosen || typeof location === "undefined") return;
  const q = new URLSearchParams(location.search);
  if (["gfx", "q", "fx"].some(k => q.has(k))) return;
  try { if (storage()?.getItem("radpayne.gfx")) return; } catch { /* none */ }
  const want = webgl2 ? DEFAULT_WEBGL2 : DEFAULT_PRESET;
  if (useGfx.getState().preset !== want && presetOf(useGfx.getState()) === (webgl2 ? DEFAULT_PRESET : DEFAULT_WEBGL2)) useGfx.setState(fromPreset(want));
}

function save(g: Gfx): void {
  try {
    storage()?.setItem("radpayne.gfx", JSON.stringify({ bloom: g.bloom, reflections: g.reflections, rain: g.rain, res: g.res, msaa: g.msaa, lite: g.lite }));
  } catch {
    /* private mode */
  }
}

/** Whether going from `a` to `b` builds the room's shaders again (PlayPage holds the room's render while
 *  they compile): MSAA (every look's scene pass), or the puddle mirror going on or off where there is one
 *  (`mirror`: room 1's street; no other look has a reflector). Bloom, rain, the resolution and Low's
 *  lighter scene apply without it. */
export function rebuildsShaders(a: Omit<Gfx, "preset">, b: Omit<Gfx, "preset">, mirror: boolean): boolean {
  return a.msaa !== b.msaa || (mirror && (a.reflections !== "off") !== (b.reflections !== "off"));
}

export function setPreset(p: Preset): void {
  chosen = true;
  const g = fromPreset(p);
  useGfx.setState(g);
  save(g);
}

/** One control by hand (the preset becomes whatever it now matches, usually "custom"). */
export function setGfx<K extends "bloom" | "reflections" | "rain" | "res">(k: K, v: Gfx[K]): void {
  chosen = true;
  const cur = useGfx.getState();
  const next = { ...cur, [k]: v };
  const g: Gfx = { ...next, preset: presetOf(next) };
  useGfx.setState(g);
  save(g);
}

/** Canvas pixel ratio for a resolution setting (100 % = the screen's own, capped at 1.75; 75 % never
 *  under one pixel per screen pixel, so the thin neon stays whole; 50 % the only one that goes under). */
export function dprFor(res: Res, deviceRatio: number): number {
  const dr = deviceRatio || 1;
  const full = Math.min(1.75, dr);
  const r = full * (res / 100);
  return Math.max(0.5, res >= 75 ? Math.max(Math.min(1, dr), r) : r);
}
