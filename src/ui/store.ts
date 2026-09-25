// Small zustand UI store. The sim driver pushes HUD numbers at ~15 Hz, so the canvas tree never
// re-renders for gameplay. Event stamps (hits, kills, refills, refused bullet time, hurts) are set
// from the event handler the moment they happen. Settings persist as localStorage `radpayne.<key>`.
import { create } from "zustand";
import type { Difficulty } from "../sim/tuning.ts";
import type { Stats } from "../sim/game.ts";
import type { WeaponId } from "../combat/weapons.ts";

export type RadbroId = "652" | "4764" | "2564" | "723";
export const RADBROS: Array<{ id: RadbroId; name: string; blurb: string; color: string }> = [
  { id: "652", name: "#652", blurb: "the original. he has been here before.", color: "#ff3d7f" },
  { id: "4764", name: "#4764", blurb: "brought a katana to a gunfight. also guns.", color: "#3ff0ff" },
  { id: "2564", name: "#2564", blurb: "GHOST. you won't see him. they won't either.", color: "#b8c4ff" },
  { id: "723", name: "#723", blurb: "cowboy. this street ain't big enough.", color: "#ffb03f" },
];

export type Screen = "title" | "loading" | "cutscene" | "play" | "paused" | "results";

export type Hud = {
  health: number;
  copium: number;
  healing: boolean;
  meter: number;
  bt: boolean;
  timeScale: number;
  mags: [number, number];
  magSize: number;
  reloading: number;
  weapon: string;
  alive: number;
  total: number;
  phase: string;
  onTarget: boolean;
  mode: string;
  fps: number;
  /** Real seconds since the last hurt. */
  hurtAgo: number;
  killcam: boolean;
  /** "ROOM 1 · OUTSIDE CLUB MILADY" (the part before " · " when space is short). */
  roomLabel: string;
  /** Radbro's current objective (top-left caption) and when it last changed (performance.now()). */
  objective: string;
  objectiveAt: number;
  weaponId: WeaponId;
  /** Owned weapons in slot order. */
  owned: WeaponId[];
  /** Rounds in reserve (Infinity for the pistols). */
  reserve: number;
  hands: 1 | 2;
  /** Rounds left (magazines + reserve) in each owned gun; 0 = dry (Infinity for the pistols). */
  ammo: Partial<Record<WeaponId, number>>;
  /** Last bullet-time refill from a kill (+1.5 / +2.5), stamped at performance.now(). */
  refill: { amount: number; at: number } | null;
  /** Bullet time asked for with too little meter (performance.now()). */
  btRefusedAt: number;
  /** 0..1 through the final-kill cam. */
  killcamProgress: number;
  /** Any Milady awake (the caption budget allows one cream caption while they are). */
  awake: boolean;
  /** Session attempt counter (per-attempt HUD state resets when it changes). */
  run: number;
};

/** One hit on the player: where the shooter stood (NaN = no shooter: a fall), when, how hard. */
export type Hurt = { sx: number; sz: number; at: number; amount: number; shooter: number };

export type Results = { cleared: boolean; stats: Stats; room: string; difficulty: Difficulty; radbro: RadbroId };

export type Quality = "high" | "low";
export type HudSize = "s" | "m" | "l";
export type ThreatMode = "all" | "shooting" | "off";
export type DmgColour = "red" | "yellow" | "white";
export type Volumes = { master: number; music: number; fx: number };

type Ui = {
  screen: Screen;
  radbro: RadbroId;
  difficulty: Difficulty;
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  hud: Hud;
  results: Results | null;
  load: { progress: number; label: string; error: string | null };
  locked: boolean;
  /** Hit marker / kill flash stamps (performance.now()). */
  hitAt: number;
  killAt: number;
  headshotAt: number;
  /** The player died (performance.now()): the HUD fades, the canvas greys out. 0 = alive. */
  deadAt: number;
  /** Ring buffer (max 4) of recent hits on the player: the damage-direction slashes. */
  hurts: Hurt[];
  /** The final kill's frame (JPEG data URL) for the results screen's evidence photo. */
  lastKillPhoto: string | null;
  muted: boolean;
  backend: string;
  /** Bumped whenever character models finish loading (the views rebuild their rigs). */
  assetsVersion: number;
  /** Narrator subtitle + key hint on the HUD (until = performance.now()). */
  subtitle: { text: string; hint: string; until: number };
  // settings (pause menu): persisted
  hudSize: HudSize;
  threats: ThreatMode;
  dmgColour: DmgColour;
  subs: boolean;
  vol: Volumes;
};

const stored = (k: string, d: string): string => {
  try {
    return localStorage.getItem(`radpayne.${k}`) ?? d;
  } catch {
    return d;
  }
};
export const store = (k: string, v: string): void => {
  try {
    localStorage.setItem(`radpayne.${k}`, v);
  } catch {
    /* private mode */
  }
};
const pick = <T extends string>(k: string, d: T, ok: readonly T[]): T => {
  const v = stored(k, d) as T;
  return ok.includes(v) ? v : d;
};
const pct = (k: string, d: number): number => {
  const v = Number(stored(k, String(d)));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d;
};

export const HUD_INITIAL: Hud = {
  health: 100, copium: 0, healing: false, meter: 10, bt: false, timeScale: 1, mags: [12, 12], magSize: 12, reloading: 0, weapon: "Dual pistols",
  alive: 0, total: 0, phase: "play", onTarget: false, mode: "normal", fps: 60, hurtAgo: 99, killcam: false,
  roomLabel: "", objective: "", objectiveAt: 0, weaponId: "pistols", owned: ["pistols"], reserve: Infinity, hands: 2, ammo: { pistols: Infinity },
  refill: null, btRefusedAt: 0, killcamProgress: 0, awake: false, run: 0,
};

export const useUi = create<Ui>(() => ({
  screen: "title",
  // #4764 is the hero of the comic panels, so he is the default pick
  radbro: (stored("radbro", "4764") as RadbroId),
  difficulty: (stored("difficulty", "normal") as Difficulty),
  quality: (stored("quality", "high") as Quality),
  sensitivity: Number(stored("sensitivity", "1")) || 1,
  invertY: stored("invertY", "0") === "1",
  hud: HUD_INITIAL,
  results: null,
  load: { progress: 0, label: "", error: null },
  locked: false,
  hitAt: 0,
  killAt: 0,
  headshotAt: 0,
  deadAt: 0,
  hurts: [],
  lastKillPhoto: null,
  muted: stored("muted", "0") === "1",
  backend: "",
  assetsVersion: 0,
  subtitle: { text: "", hint: "", until: 0 },
  hudSize: pick<HudSize>("hudSize", "m", ["s", "m", "l"]),
  threats: pick<ThreatMode>("threats", "all", ["all", "shooting", "off"]),
  dmgColour: pick<DmgColour>("dmgColour", "red", ["red", "yellow", "white"]),
  subs: stored("subs", "1") !== "0",
  vol: { master: pct("vol.master", 80), music: pct("vol.music", 60), fx: pct("vol.fx", 90) },
}));

/** Change a persisted setting (applies at once). */
export function setSetting<K extends "hudSize" | "threats" | "dmgColour" | "subs" | "quality" | "sensitivity" | "invertY" | "muted" | "difficulty">(k: K, v: Ui[K]): void {
  useUi.setState({ [k]: v } as Pick<Ui, K>);
  store(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
}

export function setVolume(k: keyof Volumes, v: number): void {
  const n = Math.max(0, Math.min(100, Math.round(v)));
  useUi.setState(s => ({ vol: { ...s.vol, [k]: n } }));
  store(`vol.${k}`, String(n));
}

/** Record a hit on the player (a repeat from the same shooter refreshes its slash). */
export function pushHurt(h: Hurt): void {
  useUi.setState(s => {
    const rest = h.shooter >= 0 ? s.hurts.filter(o => o.shooter !== h.shooter) : s.hurts;
    return { hurts: [...rest, h].slice(-4) };
  });
}
