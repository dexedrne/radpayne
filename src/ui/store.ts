// Small zustand UI store. The sim driver pushes HUD numbers at ~15 Hz, so the canvas tree never
// re-renders for gameplay.
import { create } from "zustand";
import type { Difficulty } from "../sim/tuning.ts";
import type { Stats } from "../sim/game.ts";

export type RadbroId = "652" | "4764" | "2564" | "723";
export const RADBROS: Array<{ id: RadbroId; name: string; blurb: string; color: string }> = [
  { id: "652", name: "#652", blurb: "the original. still coping.", color: "#ff3d7f" },
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
  prompt: string;
};

export type Results = { cleared: boolean; stats: Stats; room: string; difficulty: Difficulty; radbro: RadbroId };

export type Quality = "high" | "low";

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
  muted: boolean;
  backend: string;
  /** Bumped whenever character models finish loading (the views rebuild their rigs). */
  assetsVersion: number;
  /** Narrator subtitle + key hint on the HUD (until = performance.now()). */
  subtitle: { text: string; hint: string; until: number };
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

export const useUi = create<Ui>(() => ({
  screen: "title",
  radbro: (stored("radbro", "652") as RadbroId),
  difficulty: (stored("difficulty", "normal") as Difficulty),
  quality: (stored("quality", "high") as Quality),
  sensitivity: Number(stored("sensitivity", "1")) || 1,
  invertY: stored("invertY", "0") === "1",
  hud: {
    health: 100, copium: 0, healing: false, meter: 10, bt: false, timeScale: 1, mags: [12, 12], magSize: 12, reloading: 0, weapon: "Dual pistols",
    alive: 0, total: 0, phase: "play", onTarget: false, mode: "normal", fps: 60, hurtAgo: 99, killcam: false, prompt: "",
  },
  results: null,
  load: { progress: 0, label: "", error: null },
  locked: false,
  hitAt: 0,
  killAt: 0,
  headshotAt: 0,
  muted: stored("muted", "0") === "1",
  backend: "",
  assetsVersion: 0,
  subtitle: { text: "", hint: "", until: 0 },
}));
