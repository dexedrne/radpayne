// Title (Radbro pick, difficulty, effects, controls, credits), loading, pause + settings and results
// screens: React DOM over the canvas in the noir-comic style (ink plates, cream captions, keycaps).
// The canvas behind them is dimmed / blurred by PlayPage (canvasFx). Keyboard and gamepad work
// everywhere (menu.ts); settings apply at once and persist.
import "./hud/tokens.css";
import { useEffect, useMemo, useState } from "react";
import { RADBROS, setSetting, setVolume, store, useUi, type DmgColour, type HudSize, type Quality, type RadbroId, type Results, type ThreatMode } from "./store.ts";
import { DIFFICULTY, type Difficulty } from "../sim/tuning.ts";
import { setEffects, useFx, type Effects } from "../app/look/fx.ts";
import type { Session } from "../app/session.ts";
import { Keycap } from "./hud/Keycap.tsx";
import { Caption } from "./hud/Caption.tsx";
import { Seg, stepOption } from "./hud/Seg.tsx";
import { Slider } from "./hud/Slider.tsx";
import { fmtTime, recordBest } from "./hud/logic.ts";
import { useMenuInput, usePadConnected, type MenuAction } from "./menu.ts";
import { RUGGED_LINE, roomText } from "./rooms.ts";
import { hudSession } from "./hud/HudFrame.tsx";
import { TopLeft } from "./Hud.tsx";

const INK = "#f3ead8";

/** Full-screen layer (kept for callers of the old screens). */
export const layer: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", color: INK, font: "700 17px/1.4 'Courier Prime', 'Courier New', monospace" };
/** A plate-style button (primary = pink). */
export const btn = (primary = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer",
  font: "400 30px/1 'Bebas Neue', Impact, sans-serif", letterSpacing: 3, padding: "12px 18px 9px", outline: "2px solid #0b0a0d", boxShadow: "5px 5px 0 rgba(0,0,0,0.7)",
  border: primary ? "3px solid #fff" : "3px solid rgba(243,234,216,0.55)", background: primary ? "#ff3fa8" : "rgba(11,10,13,0.84)", color: primary ? "#fff" : INK, zoom: "var(--s)",
});

const DIFFS: ReadonlyArray<readonly [Difficulty, string]> = (Object.keys(DIFFICULTY) as Difficulty[]).map(d => [d, DIFFICULTY[d].label.toUpperCase()] as const);
const EFFECTS: ReadonlyArray<readonly [Effects, string]> = [["full", "FULL"], ["clean", "CLEAN"]];
const QUALITY: ReadonlyArray<readonly [Quality, string]> = [["high", "HIGH"], ["low", "LOW"]];
const SIZES: ReadonlyArray<readonly [HudSize, string]> = [["s", "S"], ["m", "M"], ["l", "L"]];
const THREATS: ReadonlyArray<readonly [ThreatMode, string]> = [["all", "ALL"], ["shooting", "SHOOTING"], ["off", "OFF"]];
const DMG: ReadonlyArray<readonly [DmgColour, string]> = [["red", "RED"], ["yellow", "YELLOW"], ["white", "WHITE"]];
const DMG_SW: Record<DmgColour, string> = { red: "#ff3148", yellow: "#ffd23f", white: "#ffffff" };
const ONOFF: ReadonlyArray<readonly ["on" | "off", string]> = [["on", "ON"], ["off", "OFF"]];
const EFFECTS_NOTE = "Clean: no bloom, no rain in front of the lens, a plain wet road instead of mirror puddles. You see who's shooting.";

export const CONTROLS: Array<[string[], string]> = [
  [["W", "A", "S", "D"], "move"], [["MOUSE"], "aim"], [["LMB"], "fire"], [["RMB", "Q"], "bullet time"], [["SHIFT"], "shootdodge"],
  [["SPACE"], "jump low cover"], [["R"], "reload"], [["H"], "copium"], [["1", "2", "3"], "weapon (or wheel)"], [["ESC"], "pause"], [["M"], "mute"],
];

function KeyList({ className }: { className: string }) {
  return (
    <div className={className}>
      {CONTROLS.map(([ks, v]) => (
        <div key={v}><span className="ks">{ks.map(k => <Keycap key={k} k={k} />)}</span>{v}</div>
      ))}
    </div>
  );
}

/** The faces the HUD and menus use (loaded explicitly: fonts.ready alone can resolve before any load starts). */
const FACES = ["400 20px 'Bebas Neue'", "400 20px 'Courier Prime'", "700 20px 'Courier Prime'", "italic 700 20px 'Courier Prime'"];
let fontsLoaded = false;

/** Fonts in before the first PLAY (display=block: nothing flashes in a fallback). */
function useFontsReady(): boolean {
  const [ok, setOk] = useState(() => fontsLoaded || typeof document === "undefined" || !document.fonts);
  useEffect(() => {
    if (ok) return;
    let live = true;
    const done = () => { fontsLoaded = true; if (live) setOk(true); };
    const t = setTimeout(done, 4000); // never block on a font CDN
    void Promise.all(FACES.map(f => document.fonts.load(f).catch(() => []))).then(() => document.fonts.ready).then(done, done);
    return () => { live = false; clearTimeout(t); };
  }, [ok]);
  return ok;
}

// ---- title ---------------------------------------------------------------------------------------

/** The title's focus rows, top to bottom (↑↓ / Tab / D-pad move, ←→ change, Enter / A plays from any). */
const TITLE_ROWS = ["radbro", "difficulty", "effects", "play"] as const;
type TitleRow = (typeof TITLE_ROWS)[number];

export function Title({ onPlay, ready }: { onPlay: () => void; ready: boolean }) {
  const radbro = useUi(s => s.radbro);
  const diff = useUi(s => s.difficulty);
  const effects = useFx(s => s.effects);
  const fonts = useFontsReady();
  const go = ready && fonts;
  const [row, setRow] = useState<TitleRow>("radbro");
  const pick = (id: RadbroId) => { useUi.setState({ radbro: id }); store("radbro", id); };
  const move = (d: number) => setRow(r => TITLE_ROWS[(TITLE_ROWS.indexOf(r) + d + TITLE_ROWS.length) % TITLE_ROWS.length]);
  useMenuInput(a => {
    if (a === "enter") { if (go) onPlay(); return; }
    if (a === "up" || a === "tabPrev") return move(-1);
    if (a === "down" || a === "tabNext") return move(1);
    if (a === "left" || a === "right") {
      const d = a === "right" ? 1 : -1;
      if (row === "radbro") {
        const i = RADBROS.findIndex(r => r.id === radbro);
        pick(RADBROS[(i + d + RADBROS.length) % RADBROS.length].id);
      } else if (row === "difficulty") setSetting("difficulty", stepOption(DIFFS, diff, d));
      else if (row === "effects") setEffects(stepOption(EFFECTS, effects, d));
      return;
    }
    return false;
  });
  const focus = (r: TitleRow) => ({ onMouseEnter: () => setRow(r), onFocus: () => setRow(r) });
  return (
    <div className="rp-layer" style={{ background: "linear-gradient(180deg, rgba(5,6,12,0.55), rgba(5,6,12,0.9) 70%)", overflowY: "auto" }}>
      <div className="rp-title rp-z" style={{ visibility: fonts ? "visible" : "hidden" }}>
        <div className="rp-wordmark">RAD<span>PAYNE</span></div>
        <div className="rp-chapter">CHAPTER 1: RUGGED</div>
        <div className={`rp-cards rp-focusrow${row === "radbro" ? " focus" : ""}`} {...focus("radbro")}>
          {RADBROS.map(r => (
            <button key={r.id} type="button" onClick={() => pick(r.id)} data-testid={`pick-${r.id}`} className={`rp-panel rp-card${radbro === r.id ? " on" : ""}`} style={radbro === r.id ? { borderColor: r.color } : undefined}>
              <img src={`/ui/radbro${r.id}.webp`} alt="" style={radbro === r.id ? { borderBottomColor: r.color } : undefined} />
              <div className="who">
                <div className="id" style={{ color: r.color }}>RADBRO {r.name}</div>
                <div className="d">{r.blurb}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="rp-row">
          <div className={`grp rp-focusrow${row === "difficulty" ? " focus" : ""}`} {...focus("difficulty")} data-testid="title-difficulty"><span className="h">DIFFICULTY</span><Seg value={diff} options={DIFFS} onChange={d => setSetting("difficulty", d)} /></div>
          <div className={`grp rp-focusrow${row === "effects" ? " focus" : ""}`} {...focus("effects")} data-testid="title-effects"><span className="h">EFFECTS</span><Seg value={effects} options={EFFECTS} onChange={setEffects} /></div>
          <div className="grp" style={{ maxWidth: 330, font: "700 17px/1.3 var(--type)", opacity: 0.7, alignSelf: "flex-end" }}>
            {effects === "clean" ? "clean: no bloom, no rain on the lens. you see who's shooting." : "full: the rain, the bloom, the mirror puddles."}
          </div>
          <button type="button" className={`rp-mbtn primary rp-play${row === "play" ? " sel" : ""}`} onClick={onPlay} disabled={!go} data-testid="play" {...focus("play")}>
            {go ? "PLAY" : "LOADING…"}{go && <span className="k">ENTER</span>}
          </button>
        </div>
        <div className="rp-foot-hint rp-title-hint">
          <span><Keycap k="↑↓" /> choose</span><span><Keycap k="←→" /> change</span><span><Keycap k="ENTER" /> play</span>
        </div>
        <KeyList className="rp-controls" />
        <div className="rp-credits">
          desktop, keyboard + mouse (a gamepad works too). built on{" "}
          <a href="https://prnth.com/react-three-game/" target="_blank" rel="noreferrer">react-three-game</a> and the Pockit Miladys by prnth,
          used with permission · Radbros by dexedrne, used with the Radbro Webring dev's permission
        </div>
      </div>
    </div>
  );
}

export function Loading() {
  const load = useUi(s => s.load);
  return (
    <div className="rp-layer" style={{ background: "#05060c" }}>
      <div className="rp-loading rp-z">
        <div className="t">LOADING</div>
        <div className="bar"><i style={{ width: `${Math.round(load.progress * 100)}%` }} /></div>
        <div className="l">{load.error ? `failed: ${load.error}` : load.label}</div>
      </div>
    </div>
  );
}

// ---- click to fight ------------------------------------------------------------------------------

/**
 * The prompt over the room before the fight (and after the pointer lock is lost): a click, Enter or
 * Space takes the lock (`onLock`, from the user's gesture); gamepad A / Start are the page's (the
 * session's pad poll), so they are only named here when a pad is plugged in.
 */
export function FightPrompt({ onLock }: { onLock: () => void }) {
  const pad = usePadConnected();
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || !["Enter", "NumpadEnter", "Space"].includes(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onLock();
    };
    addEventListener("keydown", kd, true);
    return () => removeEventListener("keydown", kd, true);
  }, [onLock]);
  return (
    <div className="rp-layer" style={{ background: "rgba(5,6,12,0.35)", cursor: "pointer" }} onClick={onLock} data-testid="click-to-fight">
      <div className="rp-z" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div className="rp-mbtn primary rp-click">CLICK TO FIGHT</div>
        <div className="rp-hint">
          <Keycap k="CLICK" /> / <Keycap k="ENTER" /> / <Keycap k="SPACE" />
          {pad && <><span className="sep">·</span><Keycap k="A" /> / <Keycap k="START" /></>}
        </div>
      </div>
    </div>
  );
}

// ---- pause + settings ----------------------------------------------------------------------------

type Tab = "display" | "controls" | "sound";
const TABS: Tab[] = ["display", "controls", "sound"];
type Row = { id: string; section?: string; name: string; control: React.ReactNode; note?: string; step?: (dir: number) => void; activate?: () => void };

function useSettingRows(tab: Tab): Row[] {
  const ui = useUi();
  const effects = useFx(s => s.effects);
  return useMemo((): Row[] => {
    const seg = <T extends string>(id: string, section: string | undefined, name: string, value: T, options: ReadonlyArray<readonly [T, string]>, set: (v: T) => void, extra?: Partial<Row>, swatch?: Partial<Record<T, string>>): Row => ({
      id, section, name, control: <Seg value={value} options={options} onChange={set} swatch={swatch} />,
      step: dir => set(stepOption(options, value, dir)),
      activate: () => set(options[(options.findIndex(([v]) => v === value) + 1) % options.length][0]),
      ...extra,
    });
    const vol = (k: "master" | "music" | "fx", name: string, section?: string): Row => ({
      id: `vol.${k}`, section, name,
      control: <Slider value={ui.vol[k]} min={0} max={100} step={1} onChange={v => setVolume(k, v)} format={v => String(Math.round(v))} />,
      step: dir => setVolume(k, ui.vol[k] + dir * 5),
    });
    if (tab === "display") return [
      seg("fx", "PICTURE", "Effects", effects, EFFECTS, setEffects, { note: EFFECTS_NOTE }),
      seg("quality", undefined, "Quality", ui.quality, QUALITY, v => setSetting("quality", v)),
      seg("hudSize", "HUD", "HUD size", ui.hudSize, SIZES, v => setSetting("hudSize", v)),
      seg("threats", undefined, "Threat markers", ui.threats, THREATS, v => setSetting("threats", v)),
      seg("dmgColour", undefined, "Damage colour", ui.dmgColour, DMG, v => setSetting("dmgColour", v), undefined, DMG_SW),
      seg("subs", undefined, "Subtitles", ui.subs ? "on" : "off", ONOFF, v => setSetting("subs", v === "on")),
    ];
    if (tab === "controls") return [
      {
        id: "sensitivity", section: "MOUSE", name: "Mouse sensitivity",
        control: <Slider value={ui.sensitivity} min={0.3} max={2.5} step={0.05} onChange={v => setSetting("sensitivity", v)} format={v => v.toFixed(2)} />,
        step: dir => setSetting("sensitivity", Number(Math.max(0.3, Math.min(2.5, ui.sensitivity + dir * 0.05)).toFixed(2))),
      },
      {
        id: "invertY", name: "Invert Y",
        control: <button type="button" tabIndex={-1} className={`rp-check${ui.invertY ? " on" : ""}`} onClick={e => { e.stopPropagation(); setSetting("invertY", !ui.invertY); }}>{ui.invertY ? "✓" : ""}</button>,
        step: () => setSetting("invertY", !ui.invertY), activate: () => setSetting("invertY", !ui.invertY),
      },
    ];
    return [
      vol("master", "Master", "VOLUME"),
      vol("music", "Music"),
      vol("fx", "Voices + SFX"),
      {
        id: "muted", name: "Mute",
        control: <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><button type="button" tabIndex={-1} className={`rp-check${ui.muted ? " on" : ""}`} onClick={e => { e.stopPropagation(); setSetting("muted", !ui.muted); }}>{ui.muted ? "✓" : ""}</button><Keycap k="M" /></span>,
        step: () => setSetting("muted", !ui.muted), activate: () => setSetting("muted", !ui.muted),
      },
    ];
  }, [tab, ui, effects]);
}

function Settings({ tab, setTab, focus, setFocus, active }: { tab: Tab; setTab: (t: Tab) => void; focus: number; setFocus: (i: number) => void; active: boolean }) {
  const rows = useSettingRows(tab);
  return (
    <div className="rp-panel rp-settings" data-testid="settings">
      <div className="rp-tabs">
        {TABS.map(t => <button key={t} type="button" className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: "contents" }}>
          {r.section && <h3>{r.section}</h3>}
          <div className={`rp-set${active && i === focus ? " focus" : ""}`} onMouseEnter={() => setFocus(i)} onClick={() => setFocus(i)}>
            <div className="name">{r.name}</div>
            <div>{r.control}</div>
          </div>
          {r.note && <div className="rp-set" style={{ minHeight: 0 }}><div /><div className="rp-note">{r.note}</div></div>}
        </div>
      ))}
      {tab === "controls" && <><h3>KEYS</h3><KeyList className="rp-keys" /></>}
      <div className="rp-foot-hint">
        <span><Keycap k="ESC" /> back</span><span><Keycap k="↑↓" /> choose</span><span><Keycap k="←→" /> change</span><span><Keycap k="TAB" /> page</span>
      </div>
    </div>
  );
}

export function Pause({ s: sProp, onResume, onRestart, onQuit }: { s?: Session | null; onResume: () => void; onRestart: () => void; onQuit: () => void }) {
  const s = sProp ?? hudSession.current;
  const h = useUi(st => st.hud);
  const diff = useUi(st => st.difficulty);
  const radbro = useUi(st => st.radbro);
  const [wide, setWide] = useState(() => innerWidth >= 1280);
  const [open, setOpen] = useState(wide);
  const [tab, setTab] = useState<Tab>("display");
  const [col, setCol] = useState<"menu" | "set">("menu");
  const [mi, setMi] = useState(0);
  const [si, setSi] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const rows = useSettingRows(tab);
  useEffect(() => { const r = () => setWide(innerWidth >= 1280); addEventListener("resize", r); return () => removeEventListener("resize", r); }, []);
  const showPanel = open || wide;
  const openSettings = (t: Tab) => { setOpen(true); setTab(t); setCol("set"); setSi(0); };
  const buttons: Array<{ id: string; label: string; k?: string; primary?: boolean; act: () => void }> = [
    { id: "resume", label: "RESUME", k: "ESC", primary: true, act: onResume },
    { id: "restart", label: "RESTART ROOM", act: onRestart },
    { id: "settings", label: "SETTINGS", k: "▶", act: () => openSettings(tab === "controls" ? "display" : tab) },
    { id: "controls", label: "CONTROLS", act: () => openSettings("controls") },
    { id: "quit", label: "QUIT TO TITLE", act: () => (confirm ? onQuit() : setConfirm(true)) },
  ];
  const nextTab = (d: number) => { const t = TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length]; setTab(t); setSi(0); if (showPanel) setCol("set"); setOpen(true); };
  useMenuInput((a: MenuAction) => {
    if (confirm) {
      if (a === "enter") onQuit();
      else if (a === "back") setConfirm(false);
      return;
    }
    if (a === "tabNext" || a === "tabPrev") return nextTab(a === "tabNext" ? 1 : -1);
    if (col === "menu") {
      if (a === "up") setMi(i => (i + buttons.length - 1) % buttons.length);
      else if (a === "down") setMi(i => (i + 1) % buttons.length);
      else if (a === "enter") buttons[mi].act();
      else if (a === "right" && showPanel) { setCol("set"); setOpen(true); }
      else if (a === "back") onResume();
      return;
    }
    const row = rows[si];
    if (a === "up") setSi(i => Math.max(0, i - 1));
    else if (a === "down") setSi(i => Math.min(rows.length - 1, i + 1));
    else if (a === "left" || a === "right") row?.step?.(a === "right" ? 1 : -1);
    else if (a === "enter") row?.activate?.();
    else if (a === "back") { setCol("menu"); setMi(tab === "controls" ? 3 : 2); if (!wide) setOpen(false); }
  });
  const g = s?.game;
  return (
    <div className="rp-layer" data-testid="pause">
      <div className="rp-dim" />
      <TopLeft style={{ opacity: 0.9 }} />
      <div className="rp-menu-page rp-z">
        <div className="rp-menu-col">
          <div className="rp-title-cap">
            <div className="big">PAUSED</div>
            <div className="small">{s ? roomText(s.roomId, s.level.room).pauseLine : "the rain didn't stop for me either."}</div>
          </div>
          <div className="rp-ctx">
            <span>MILADYS <b>{h.total - h.alive}/{h.total}</b> · TIME <b>{fmtTime(g?.stats.time ?? 0)}</b></span>
            <span><b>{DIFFICULTY[diff].label.toUpperCase()}</b> · RADBRO <b className="p">#{radbro}</b></span>
          </div>
          {buttons.map((b, i) => (
            <button
              key={b.id}
              type="button"
              data-testid={b.id === "resume" ? "resume" : `pause-${b.id}`}
              className={`rp-mbtn${b.primary ? " primary" : ""}${(col === "menu" ? i === mi : b.id === (tab === "controls" ? "controls" : "settings")) ? " sel" : ""}`}
              onMouseEnter={() => { setCol("menu"); setMi(i); }}
              onClick={b.act}
            >
              {b.label}{b.k && <span className="k">{b.k}</span>}
            </button>
          ))}
          {confirm && <Caption className="rp-confirm" text="quit? this room starts over. [ENTER] yes [ESC] no" />}
        </div>
        {showPanel && <Settings tab={tab} setTab={t => { setTab(t); setSi(0); }} focus={si} setFocus={i => { setCol("set"); setSi(i); }} active={col === "set"} />}
      </div>
    </div>
  );
}

// ---- results -------------------------------------------------------------------------------------

const bests = new WeakMap<Results, { prev: number | null; isBest: boolean }>();
/** A cleared run's personal best check (once per results; localStorage radpayne.best.<room>.<difficulty>). */
function bestFor(r: Results): { prev: number | null; isBest: boolean } {
  let b = bests.get(r);
  if (!b) {
    let st: Storage | null = null;
    try { st = localStorage; } catch { /* blocked */ }
    b = r.cleared ? recordBest(st, r.room, r.difficulty, r.stats.time) : { prev: null, isBest: false };
    bests.set(r, b);
  }
  return b;
}

export function ResultsScreen({ onRetry, onTitle }: { onRetry: () => void; onTitle: () => void }) {
  const r = useUi(s => s.results);
  const photo = useUi(s => s.lastKillPhoto);
  const [photoOk, setPhotoOk] = useState(true);
  useMenuInput(a => {
    if (a === "enter") onRetry();
    else if (a === "back") onTitle();
    else return false;
  }, !!r);
  if (!r) return null;
  const s = r.stats;
  const best = bestFor(r);
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const bro = RADBROS.find(b => b.id === r.radbro) ?? RADBROS[1];
  const text = roomText(r.room);
  const where = `room ${text.number} of ${text.of}`;
  const stats: Array<[string, string, boolean?]> = [
    [fmtTime(s.time), "time", r.cleared && best.isBest], [String(s.kills), "kills"], [String(s.headshots), "headshots"], [`${acc}%`, "accuracy"],
    [String(Math.round(s.damageTaken)), "damage taken"], [String(s.copiumUsed), "copium used"], [`${s.btTime.toFixed(1)} s`, "bullet time"], [String(s.dodges), "shootdodges"],
  ];
  return (
    <div className="rp-layer" data-testid="results">
      <div className="rp-dim" style={{ background: "rgba(5,6,12,0.45)" }} />
      <div className="rp-page rp-z">
        <div className="rp-panel rp-portrait" style={{ borderColor: bro.color }}>
          <img src={`/ui/radbro${bro.id}.webp`} alt="" />
          <div className="who">
            <div className="id" style={{ color: bro.color }}>RADBRO {bro.name}</div>
            <div className="d">{bro.blurb}</div>
            <div className="d" style={{ marginTop: 10, opacity: 0.7 }}>{DIFFICULTY[r.difficulty].label.toUpperCase()} · {where}</div>
          </div>
        </div>
        <div className="rp-head">
          <div className={`rp-splash${r.cleared ? "" : " rugged"}`}>
            {r.cleared ? <div className="big">ROOM<br />CLEAR</div> : <div className="big">RUGGED</div>}
            {r.cleared && <div className="rp-tbc">TO BE CONTINUED: THE RAVE</div>}
            {r.cleared && photo && photoOk && (
              <div className="rp-photo" data-testid="evidence">
                <div className="clip" />
                <img src={photo} alt="the final kill" onError={() => setPhotoOk(false)} />
                <div className="cap">the last one.</div>
                <div className="ex">EXHIBIT {s.kills}</div>
              </div>
            )}
          </div>
          <Caption text={r.cleared ? text.clearLine : RUGGED_LINE} style={{ fontSize: 22 }} />
          <div className="rp-stats">
            {stats.map(([v, k, b]) => (
              <div key={k} className={`rp-panel rp-stat${b ? " best" : ""}`}>
                {b && <span className="stamp">PERSONAL BEST</span>}
                <div className="v">{v}</div>
                <div className="k">{k}</div>
              </div>
            ))}
          </div>
          <div className="rp-rbtns">
            <button type="button" className="rp-mbtn primary" onClick={onRetry} data-testid="retry">{r.cleared ? "PLAY AGAIN" : "RETRY"}<span className="k">ENTER</span></button>
            <button type="button" className="rp-mbtn" onClick={onTitle} data-testid="to-title">TITLE<span className="k">ESC</span></button>
            <div className="rp-meta">{text.chapter} · {where}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
