// Comic-panel cutscene player (spec section 7 "src/ui"): public/cutscenes/<id>.json lists panels
// { image, box, lines: [{ audio, text }] }. One panel at a time fills the page (a slow push-in), the
// narrator reads its lines and they appear in the caption box drawn over the panel's painted one
// (box = [x, y, w, h] as fractions of the image); the strip below shows where you are. Click / Space /
// Enter / gamepad A goes to the next panel, Esc / gamepad B or Start skips the rest. A panel without an
// image paints a placeholder.
// A panel's `dur` is how long it holds (seconds); a line without audio (or muted) is read for a time
// that fits its length. Used for the cutscenes (c1-c4), the room 1 ending (e1) and room 3's exit panel
// (its last frame, made in the page: PlayPage).
// A panel's lines play in order, each GAP after the length of the clip before it (cutsceneTiming.ts).
// A line with a `speaker` is someone else's (the girls at the door and on the floor, goon_a / goon_b;
// the DJ through the door, pa): voices/<speaker>/<audio>, set upright and in quotes (the narrator's
// captions are italic). `music` names the room music under the panels.
// A caption appears when its line starts (with its voice), never before, not even for the one render
// after a page turn; a panel's `maxW` (fraction of the width) and `size` (font scale) keep a long
// caption off the faces next to the painted box, and its `push` (the push-in's end scale, default
// 1.07) keeps the box's corner in the frame through a long hold.
import { useCallback, useEffect, useRef, useState } from "react";
import { narrate, sampleDuration, samplesFor, stopNarration } from "../audio/sfx.ts";
import { assetUrl } from "../app/assets.ts";
import { FIRST, GAP, holdAfter, lineLen, onScreen, ORIGIN, planPanel, PUSH, PUSH_S, type Shown, type TimedLine } from "./cutsceneTiming.ts";
import { Keycap } from "./hud/Keycap.tsx";
import { usePadConnected, usePadInput, type MenuAction } from "./menu.ts";
import "./hud/tokens.css";

/** Gamepad: A next, B or Start skip (the standard mapping). */
const PAD: ReadonlyArray<readonly [number, MenuAction]> = [[0, "enter"], [1, "back"], [9, "back"]];

export type Line = TimedLine;
export type Panel = { image?: string; tone?: string; box?: [number, number, number, number]; lines: Line[]; dur?: number; maxW?: number; size?: number; push?: number };
/** `wait`: the last panel's own page turn (not a click or a skip) waits for it too: the room getting ready
 *  under a panel made in the page (PlayPage: room 3's open elevator, room 4 behind it). */
export type CutsceneData = { id: string; title?: string; panels: Panel[]; music?: string; wait?: Promise<unknown> };

// the story voice is one font everywhere: Courier Prime italic (the HUD captions use it too)
const serif = "'Courier Prime', 'Courier New', monospace";

const PUSH_ORIGIN = `${ORIGIN[0] * 100}% ${ORIGIN[1] * 100}%`;

const TONES: Record<string, string> = {
  street: "radial-gradient(ellipse at 70% 20%, rgba(255,63,168,0.35), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(255,174,82,0.3), transparent 50%), linear-gradient(180deg, #0c1224 0%, #141a2e 60%, #07080d 100%)",
  phone: "radial-gradient(circle at 50% 45%, rgba(120,200,255,0.45), transparent 30%), linear-gradient(180deg, #06070b, #0f1320)",
  club: "radial-gradient(ellipse at 50% 30%, rgba(255,63,168,0.55), transparent 45%), radial-gradient(ellipse at 50% 38%, rgba(63,240,255,0.3), transparent 60%), linear-gradient(180deg, #120817 0%, #0b0b14 100%)",
  guns: "radial-gradient(ellipse at 40% 50%, rgba(255,200,120,0.35), transparent 50%), linear-gradient(135deg, #0a0a10, #1c1410)",
};

function Art({ p, zoom, load = true }: { p: Panel; zoom: boolean; load?: boolean }) {
  const style: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transformOrigin: PUSH_ORIGIN, animation: zoom ? `rp-push ${PUSH_S}s ease-out forwards` : undefined };
  if (p.image && load) return <img src={p.image} alt="" style={style} draggable={false} />;
  return <div style={{ ...style, background: TONES[p.tone ?? "street"] ?? TONES.street }} />;
}

export function Cutscene({ data, onDone }: { data: CutsceneData; onDone: () => void }) {
  const [i, setI] = useState(0);
  // the lines started so far, and the panel they belong to (a page turn shows none until its clock runs)
  const [shown, setShown] = useState<Shown<Panel>>({ panel: null, n: 0 });
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);
  const done = useRef(false);
  // the page may re-render the parent (and hand a new onDone) mid-panel: the panel's timers and its
  // voice must not restart for that, so the callbacks below never change identity
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const at = useRef(0);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    stopNarration();
    onDoneRef.current();
  }, []);
  const next = useCallback(() => {
    if (at.current + 1 >= data.panels.length) { finish(); return; }
    at.current += 1;
    setI(at.current);
  }, [data, finish]);
  const turn = useCallback(() => {
    if (data.wait && at.current + 1 >= data.panels.length) void data.wait.then(next, next);
    else next();
  }, [data, next]);

  // this cutscene's voice files (decoded after the PLAY gesture); start the panels once they are in
  useEffect(() => {
    let live = true;
    const keys = data.panels.flatMap(p => p.lines.filter(l => l.audio).map(l => `voices/${l.speaker ?? "narrator"}/${l.audio}`));
    void samplesFor(keys, 3500).then(() => { if (live) setReady(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // read the panel's lines one after another, then turn the page. The next line is scheduled GAP after
  // the full length of the clip just started (what narrate() returns), not from lengths guessed when the
  // panel opened, so two voices do not overlap or cut each other off even when a clip decoded late
  useEffect(() => {
    if (!ready) return;
    const clear = () => { for (const t of timers.current) clearTimeout(t); timers.current = []; };
    clear();
    setShown({ panel: null, n: 0 });
    const panel = data.panels[i];
    const lines = panel?.lines ?? [];
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;
    const after = (s: number, f: () => void) => { timers.current.push(window.setTimeout(f, Math.max(0, s * 1000))); };
    const read = (k: number) => {
      const ln = lines[k];
      setShown({ panel: panel ?? null, n: k + 1 });
      const played = ln.audio ? narrate(ln.audio, ln.speaker ?? "narrator") : 0;
      const d = lineLen(ln, played, ln.audio ? audioLen(ln.audio, ln.speaker) : 0);
      // dur = how long the panel holds (its clips + ~1 s); never shorter than its lines
      if (k + 1 < lines.length) after(d + GAP, () => read(k + 1));
      else after(d + holdAfter(panel?.dur, now() + d), turn);
    };
    if (lines.length) after(FIRST, () => read(0));
    else after(planPanel([], panel?.dur, () => 0).turn, turn);
    return clear;
  }, [i, data, next, turn, ready]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Escape") finish();
      else if (["Space", "Enter", "KeyE", "ArrowRight"].includes(e.code)) { e.preventDefault(); stopNarration(); next(); }
    };
    addEventListener("keydown", kd);
    return () => removeEventListener("keydown", kd);
  }, [next, finish]);
  usePadInput(a => {
    if (a === "enter") { stopNarration(); next(); }
    else if (a === "back") finish();
  }, { buttons: PAD, stick: false });
  const pad = usePadConnected();

  const p = data.panels[i];
  const box = p.box ?? [0.02, 0.03, 0.2, 0.1];
  const lines = p.lines.slice(0, onScreen(shown, p));
  return (
    <div onClick={() => { stopNarration(); next(); }} data-testid="cutscene" data-cut={data.id} data-panel={i} style={{ position: "fixed", inset: 0, zIndex: 40, background: "#07070a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
      <style>{`@keyframes rp-push { from { transform: scale(1.0) } to { transform: scale(var(--rp-push, ${PUSH})) } } @keyframes rp-land { from { opacity: 0; transform: translateY(8px) rotate(-0.4deg) } to { opacity: 1; transform: none } } @keyframes rp-line { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div key={i} style={{ position: "relative", width: "min(92vw, 126vh)", aspectRatio: "3 / 2", overflow: "hidden", border: "5px solid #f1e8d4", outline: "2px solid #111", boxShadow: "0 18px 80px rgba(0,0,0,0.8)", animation: "rp-land 0.4s ease-out", background: "#111" }}>
        {/* the art and its caption box push in together, so the box stays over the painted one */}
        <div style={{ position: "absolute", inset: 0, transformOrigin: PUSH_ORIGIN, animation: `rp-push ${PUSH_S}s ease-out forwards`, "--rp-push": p.push ?? PUSH } as React.CSSProperties}>
        <Art p={p} zoom={false} />
        {lines.length > 0 && <div style={{
          position: "absolute", left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, minWidth: `${box[2] * 100}%`, minHeight: `${box[3] * 100}%`, maxWidth: `${(p.maxW ?? 0.46) * 100}%`,
          background: "#f4e7b8", color: "#141210", padding: "0.55em 0.8em", border: "2px solid #141210", boxShadow: "3px 3px 0 rgba(0,0,0,0.55)",
          font: `italic 700 clamp(${Math.round(12 * (p.size ?? 1))}px, ${(1.55 * (p.size ?? 1)).toFixed(2)}vw, ${Math.round(21 * (p.size ?? 1))}px)/1.3 ${serif}`, display: "flex", flexDirection: "column", gap: "0.35em",
          boxSizing: "border-box", animation: "rp-line 0.3s ease-out",
        }}>
          {lines.map((ln, k) => <div key={k} style={{ animation: "rp-line 0.4s ease-out", ...(ln.speaker ? { fontStyle: "normal" } : {}) }}>{ln.text}</div>)}
        </div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {data.panels.map((q, k) => (
          <div key={k} style={{ position: "relative", width: 58, height: 39, overflow: "hidden", border: `2px solid ${k === i ? "#ff3fa8" : "#2a2a30"}`, opacity: k <= i ? 1 : 0.35 }}>
            {/* panels further ahead show their tone until the next one is up (a skip wastes no bandwidth) */}
            <Art p={q} zoom={false} load={k <= i + 1} />
          </div>
        ))}
      </div>
      <div className="rp-z" style={{ color: "rgba(243,234,216,0.72)", font: "700 17px/1 'Courier Prime', 'Courier New', monospace", display: "flex", alignItems: "center", gap: 8 }}>
        {data.title ? `${data.title.toUpperCase()} · ` : ""}<Keycap k="CLICK" /> / <Keycap k="SPACE" />{pad && <> / <Keycap k="A" /></>} next <span style={{ opacity: 0.5, margin: "0 4px" }}>·</span> <Keycap k="ESC" />{pad && <> / <Keycap k="B" /></>} skip
      </div>
    </div>
  );
}

const audioLen = (line: string, speaker = "narrator") => sampleDuration(`voices/${speaker}/${line}`);

const cutscenes = new Map<string, Promise<CutsceneData | null>>();

/** A cutscene's panels (fetched once; the image URLs are versioned, assets.ts). */
function fetchCutscene(id: string): Promise<CutsceneData | null> {
  let p = cutscenes.get(id);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(assetUrl(`/cutscenes/${id}.json`));
        if (!r.ok) return null;
        const d = (await r.json()) as CutsceneData;
        for (const q of d.panels) if (q.image) q.image = assetUrl(q.image);
        return d;
      } catch {
        return null;
      }
    })();
    p.then(d => { if (!d) cutscenes.delete(id); }, () => cutscenes.delete(id));
    cutscenes.set(id, p);
  }
  return p;
}

export async function loadCutscene(id: string): Promise<CutsceneData | null> {
  const d = await fetchCutscene(id);
  // the first two panels now; each later one while the panel before it is read (the strip asks for it)
  if (d) for (const im of d.panels.slice(0, 2).map(p => p.image).filter(Boolean) as string[]) { const img = new Image(); img.src = im; }
  return d;
}

/** Warm a cutscene ahead of time at low priority (the title: cutscene 1's first `panels` panels; the
 *  rest load with the strip when it opens). */
export function prefetchCutscene(id: string, panels = Infinity): void {
  void fetchCutscene(id).then(d => {
    for (const im of (d?.panels ?? []).slice(0, panels).map(p => p.image).filter(Boolean) as string[]) void fetch(im, { priority: "low" }).catch(() => undefined);
  });
}
