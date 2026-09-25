// Settings side effects, mounted once by the page: the HUD scale (--s, from the window height and
// HUD size), the damage colour (--dmg), the volume sliders (master / music / voices + SFX), and the
// M key (mute).
import { useEffect } from "react";
import { store, useUi } from "../store.ts";
import { hudScale } from "./logic.ts";
import { setHudScaleNow } from "./scale.ts";
import { engine, setAudioVolumes, whenCreated } from "../../audio/engine.ts";

const DMG = { red: "#ff3148", yellow: "#ffd23f", white: "#ffffff" } as const;

function applyVolumes(): void {
  const v = useUi.getState().vol;
  // the engine's defaults (music .6, sfx .8, voices .9, master .9) are the sliders' defaults (60 / 90 / 80)
  setAudioVolumes(v.music / 100, (v.fx / 100) * (0.8 / 0.9), v.fx / 100);
  const e = engine();
  if (e) e.master.gain.setTargetAtTime(0.9 * (v.master / 80), e.ac.currentTime, 0.05);
}

export function UiEffects() {
  const hudSize = useUi(s => s.hudSize);
  const dmg = useUi(s => s.dmgColour);
  const vol = useUi(s => s.vol);

  useEffect(() => {
    const set = () => {
      const s = hudScale(innerHeight, hudSize);
      setHudScaleNow(s);
      document.documentElement.style.setProperty("--s", s.toFixed(4));
    };
    set();
    addEventListener("resize", set);
    return () => removeEventListener("resize", set);
  }, [hudSize]);

  useEffect(() => { document.documentElement.style.setProperty("--dmg", DMG[dmg] ?? DMG.red); }, [dmg]);

  useEffect(() => { whenCreated(applyVolumes); }, []);
  useEffect(() => { applyVolumes(); }, [vol]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const m = !useUi.getState().muted;
      useUi.setState({ muted: m });
      store("muted", m ? "1" : "0");
    };
    addEventListener("keydown", kd);
    return () => removeEventListener("keydown", kd);
  }, []);
  return null;
}
