// Title (Radbro pick, difficulty, controls, credits), loading, pause and results screens: plain React
// DOM over the canvas.
import { RADBROS, store, useUi, type RadbroId } from "./store.ts";
import { DIFFICULTY, type Difficulty } from "../sim/tuning.ts";
import { setEffects, useFx } from "../app/look/fx.ts";

const font = "ui-monospace, SFMono-Regular, Menlo, monospace";
const display = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif";
const INK = "#f3ead8";

export const layer: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", color: INK, font: `13px/1.45 ${font}` };
export const btn = (primary = false): React.CSSProperties => ({
  font: `700 14px ${font}`, padding: "10px 20px", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
  border: primary ? "none" : "1px solid rgba(243,234,216,0.35)", background: primary ? "#ff3fa8" : "rgba(243,234,216,0.06)", color: primary ? "#fff" : INK,
  boxShadow: primary ? "0 0 22px rgba(255,63,168,0.45)" : undefined,
});

const CONTROLS: Array<[string, string]> = [
  ["WASD", "move"], ["mouse / LMB", "aim / fire"], ["RMB or Q", "bullet time"], ["Shift", "shootdodge"], ["Space", "jump low cover"],
  ["R", "reload"], ["H", "copium"], ["1-3 / wheel", "weapon"], ["Esc", "pause"],
];

export function Title({ onPlay, ready }: { onPlay: () => void; ready: boolean }) {
  const radbro = useUi(s => s.radbro);
  const diff = useUi(s => s.difficulty);
  const pick = (id: RadbroId) => { useUi.setState({ radbro: id }); store("radbro", id); };
  const setDiff = (d: Difficulty) => { useUi.setState({ difficulty: d }); store("difficulty", d); };
  return (
    <div style={{ ...layer, background: "linear-gradient(180deg, rgba(5,6,12,0.55), rgba(5,6,12,0.9) 70%)" }}>
      <div style={{ width: "min(880px, 94vw)", padding: "24px 0" }}>
        <div style={{ font: `400 clamp(56px, 11vw, 120px)/0.9 ${display}`, letterSpacing: 4, color: INK, textShadow: "0 0 30px rgba(255,63,168,0.35)" }}>
          RAD<span style={{ color: "#ff3fa8" }}>PAYNE</span>
        </div>
        <div style={{ letterSpacing: 4, opacity: 0.8, marginBottom: 22 }}>CHAPTER 1: RUGGED</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {RADBROS.map(r => (
            <button key={r.id} onClick={() => pick(r.id)} data-testid={`pick-${r.id}`} style={{
              width: 150, padding: 0, cursor: "pointer", background: "rgba(10,10,18,0.8)", color: INK, font: `12px ${font}`, textAlign: "left",
              border: radbro === r.id ? `2px solid ${r.color}` : "2px solid rgba(243,234,216,0.15)", boxShadow: radbro === r.id ? `0 0 18px ${r.color}66` : undefined,
            }}>
              <img src={`/ui/radbro${r.id}.webp`} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block", filter: radbro === r.id ? undefined : "grayscale(0.7) brightness(0.7)" }} />
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: r.color }}>{r.name}</div>
                <div style={{ opacity: 0.75, minHeight: 34 }}>{r.blurb}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
          {(Object.keys(DIFFICULTY) as Difficulty[]).map(d => (
            <button key={d} onClick={() => setDiff(d)} style={{ ...btn(false), borderColor: diff === d ? "#ff3fa8" : undefined, color: diff === d ? "#ff9fd2" : INK }}>{DIFFICULTY[d].label}</button>
          ))}
          <button onClick={onPlay} disabled={!ready} data-testid="play" style={{ ...btn(true), marginLeft: 12, opacity: ready ? 1 : 0.5, fontSize: 16, padding: "12px 32px" }}>{ready ? "PLAY" : "LOADING…"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "2px 16px", opacity: 0.75, marginBottom: 18 }}>
          {CONTROLS.map(([k, v]) => <div key={k}><b style={{ color: "#ffcf6a" }}>{k}</b> {v}</div>)}
        </div>
        <div style={{ opacity: 0.5, fontSize: 11 }}>
          desktop, keyboard + mouse (a gamepad works too). built on{" "}
          <a href="https://prnth.com/react-three-game/" target="_blank" rel="noreferrer" style={{ color: "#9fd8ff" }}>react-three-game</a> by prnth · Pockit Miladys by prnth
        </div>
      </div>
    </div>
  );
}

export function Loading() {
  const load = useUi(s => s.load);
  return (
    <div style={{ ...layer, background: "#05060c" }}>
      <div style={{ width: 320, textAlign: "center" }}>
        <div style={{ font: `400 42px ${display}`, letterSpacing: 3 }}>LOADING</div>
        <div style={{ height: 3, background: "rgba(243,234,216,0.15)", margin: "10px 0" }}>
          <div style={{ height: 3, width: `${Math.round(load.progress * 100)}%`, background: "#ff3fa8", transition: "width 0.2s" }} />
        </div>
        <div style={{ opacity: 0.7 }}>{load.error ? `failed: ${load.error}` : load.label}</div>
      </div>
    </div>
  );
}

export function Pause({ onResume, onRestart, onQuit }: { onResume: () => void; onRestart: () => void; onQuit: () => void }) {
  const sens = useUi(s => s.sensitivity);
  const inv = useUi(s => s.invertY);
  const quality = useUi(s => s.quality);
  const muted = useUi(s => s.muted);
  const effects = useFx(s => s.effects);
  return (
    <div style={{ ...layer, background: "rgba(5,6,12,0.72)" }}>
      <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ font: `400 48px ${display}`, letterSpacing: 3 }}>PAUSED</div>
        <button style={btn(true)} onClick={onResume} data-testid="resume">Resume</button>
        <button style={btn()} onClick={onRestart}>Restart room</button>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          mouse sensitivity {sens.toFixed(2)}
          <input type="range" min={0.3} max={2.5} step={0.05} value={sens} onChange={e => { const v = Number(e.target.value); useUi.setState({ sensitivity: v }); store("sensitivity", String(v)); }} />
        </label>
        <label><input type="checkbox" checked={inv} onChange={e => { useUi.setState({ invertY: e.target.checked }); store("invertY", e.target.checked ? "1" : "0"); }} /> invert Y</label>
        <label><input type="checkbox" checked={muted} onChange={e => { useUi.setState({ muted: e.target.checked }); store("muted", e.target.checked ? "1" : "0"); }} /> mute</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          quality
          {(["high", "low"] as const).map(q => (
            <button key={q} style={{ ...btn(), padding: "4px 10px", borderColor: quality === q ? "#ff3fa8" : undefined }} onClick={() => { useUi.setState({ quality: q }); store("quality", q); }}>{q}</button>
          ))}
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }} title="clean: no rain near the camera, no bloom, no puddle reflections">
          effects
          {(["full", "clean"] as const).map(e => (
            <button key={e} style={{ ...btn(), padding: "4px 10px", borderColor: effects === e ? "#ff3fa8" : undefined }} onClick={() => setEffects(e)}>{e}</button>
          ))}
        </label>
        <button style={btn()} onClick={onQuit}>Quit to title</button>
      </div>
    </div>
  );
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function ResultsScreen({ onRetry, onTitle }: { onRetry: () => void; onTitle: () => void }) {
  const r = useUi(s => s.results);
  if (!r) return null;
  const s = r.stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const rows: Array<[string, string]> = [
    ["time", fmt(s.time)], ["kills", String(s.kills)], ["headshots", String(s.headshots)], ["accuracy", `${acc}%`],
    ["damage taken", String(Math.round(s.damageTaken))], ["copium used", String(s.copiumUsed)], ["bullet time", `${s.btTime.toFixed(1)} s`], ["shootdodges", String(s.dodges)],
  ];
  return (
    <div style={{ ...layer, background: "rgba(5,6,12,0.85)" }} data-testid="results">
      <div style={{ width: "min(460px, 92vw)" }}>
        <div style={{ font: `400 56px/1 ${display}`, letterSpacing: 3, color: r.cleared ? INK : "#ff4a5a" }}>{r.cleared ? "ROOM CLEAR" : "RUGGED"}</div>
        {r.cleared && <div style={{ font: `400 26px/1.1 ${display}`, letterSpacing: 3, color: "#ff3fa8", textShadow: "0 0 14px rgba(255,63,168,0.55)", margin: "4px 0 8px" }}>TO BE CONTINUED: THE RAVE</div>}
        <div style={{ opacity: 0.75, marginBottom: 16, fontStyle: "italic", fontFamily: "Georgia, serif", fontSize: 15 }}>
          {r.cleared ? "the door was open. the bass was louder. my bag was in there somewhere." : "they said wagmi. they lied. get up and try again."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 20px", marginBottom: 20 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ opacity: 0.7 }}>{k}</div>
              <div style={{ fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btn(true)} onClick={onRetry} data-testid="retry">{r.cleared ? "Play again" : "Retry"}</button>
          <button style={btn()} onClick={onTitle}>Title</button>
        </div>
        <div style={{ opacity: 0.5, marginTop: 12 }}>{DIFFICULTY[r.difficulty].label} · Radbro #{r.radbro}</div>
      </div>
    </div>
  );
}
