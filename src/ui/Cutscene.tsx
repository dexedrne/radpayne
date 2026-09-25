// Comic-panel cutscene player (spec section 7 "src/ui"): public/cutscenes/<id>.json lists panels
// { image, box, lines: [{ audio, text }] }. One panel at a time fills the page (a slow push-in), the
// narrator reads its lines and they appear in the caption box drawn over the panel's painted one
// (box = [x, y, w, h] as fractions of the image); the strip below shows where you are. Click / Space /
// Enter goes to the next panel, Esc skips the rest. A panel without an image paints a placeholder.
import { useCallback, useEffect, useRef, useState } from "react";
import { narrate, sampleDuration, samplesReady, stopNarration } from "../audio/sfx.ts";

export type Line = { audio?: string; text: string };
export type Panel = { image?: string; tone?: string; box?: [number, number, number, number]; lines: Line[]; dur?: number };
export type CutsceneData = { id: string; title?: string; panels: Panel[] };

const font = "ui-monospace, SFMono-Regular, Menlo, monospace";
const serif = "Georgia, 'Times New Roman', serif";

const TONES: Record<string, string> = {
  street: "radial-gradient(ellipse at 70% 20%, rgba(255,63,168,0.35), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(255,174,82,0.3), transparent 50%), linear-gradient(180deg, #0c1224 0%, #141a2e 60%, #07080d 100%)",
  phone: "radial-gradient(circle at 50% 45%, rgba(120,200,255,0.45), transparent 30%), linear-gradient(180deg, #06070b, #0f1320)",
  club: "radial-gradient(ellipse at 50% 30%, rgba(255,63,168,0.55), transparent 45%), radial-gradient(ellipse at 50% 38%, rgba(63,240,255,0.3), transparent 60%), linear-gradient(180deg, #120817 0%, #0b0b14 100%)",
  guns: "radial-gradient(ellipse at 40% 50%, rgba(255,200,120,0.35), transparent 50%), linear-gradient(135deg, #0a0a10, #1c1410)",
};

function Art({ p, zoom }: { p: Panel; zoom: boolean }) {
  const style: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transformOrigin: "60% 45%", animation: zoom ? "rp-push 14s ease-out forwards" : undefined };
  if (p.image) return <img src={p.image} alt="" style={style} draggable={false} />;
  return <div style={{ ...style, background: TONES[p.tone ?? "street"] ?? TONES.street }} />;
}

/** Real seconds a line is shown when its audio does not play (muted / not loaded). */
const readTime = (t: string) => Math.max(2.8, t.length * 0.055);

export function Cutscene({ data, onDone }: { data: CutsceneData; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(1);
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);
  const done = useRef(false);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    stopNarration();
    onDone();
  }, [onDone]);
  const next = useCallback(() => setI(k => { if (k + 1 >= data.panels.length) { finish(); return k; } return k + 1; }), [data, finish]);

  // the narrator's voice files (decoded after the PLAY gesture); start the panels once they are in
  useEffect(() => { let live = true; void samplesReady(3500).then(() => { if (live) setReady(true); }); return () => { live = false; }; }, []);

  // read the panel's lines one after another, then turn the page
  useEffect(() => {
    if (!ready) return;
    const clear = () => { for (const t of timers.current) clearTimeout(t); timers.current = []; };
    clear();
    setShown(1);
    const lines = data.panels[i]?.lines ?? [];
    let t = 0.5;
    lines.forEach((ln, k) => {
      timers.current.push(window.setTimeout(() => {
        setShown(k + 1);
        if (ln.audio) narrate(ln.audio);
      }, t * 1000));
      const d = ln.audio ? audioLen(ln.audio) : 0;
      t += (d > 0 ? d : readTime(ln.text)) + 0.35;
    });
    timers.current.push(window.setTimeout(next, (t + (data.panels[i]?.dur ?? 1.1)) * 1000));
    return clear;
  }, [i, data, next, ready]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Escape") finish();
      else if (["Space", "Enter", "KeyE", "ArrowRight"].includes(e.code)) { e.preventDefault(); stopNarration(); next(); }
    };
    addEventListener("keydown", kd);
    return () => removeEventListener("keydown", kd);
  }, [next, finish]);

  const p = data.panels[i];
  const box = p.box ?? [0.02, 0.03, 0.2, 0.1];
  const lines = p.lines.slice(0, shown);
  return (
    <div onClick={() => { stopNarration(); next(); }} data-testid="cutscene" style={{ position: "fixed", inset: 0, zIndex: 40, background: "#07070a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
      <style>{"@keyframes rp-push { from { transform: scale(1.0) } to { transform: scale(1.07) } } @keyframes rp-land { from { opacity: 0; transform: translateY(8px) rotate(-0.4deg) } to { opacity: 1; transform: none } } @keyframes rp-line { from { opacity: 0 } to { opacity: 1 } }"}</style>
      <div key={i} style={{ position: "relative", width: "min(92vw, 126vh)", aspectRatio: "3 / 2", overflow: "hidden", border: "5px solid #f1e8d4", outline: "2px solid #111", boxShadow: "0 18px 80px rgba(0,0,0,0.8)", animation: "rp-land 0.4s ease-out", background: "#111" }}>
        {/* the art and its caption box push in together, so the box stays over the painted one */}
        <div style={{ position: "absolute", inset: 0, transformOrigin: "60% 45%", animation: "rp-push 14s ease-out forwards" }}>
        <Art p={p} zoom={false} />
        <div style={{
          position: "absolute", left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, minWidth: `${box[2] * 100}%`, minHeight: `${box[3] * 100}%`, maxWidth: "46%",
          background: "#f4e7b8", color: "#141210", padding: "0.55em 0.8em", border: "2px solid #141210", boxShadow: "3px 3px 0 rgba(0,0,0,0.55)",
          font: `italic 700 clamp(12px, 1.55vw, 21px)/1.3 ${serif}`, display: "flex", flexDirection: "column", gap: "0.35em",
        }}>
          {lines.map((ln, k) => <div key={k} style={{ animation: "rp-line 0.4s ease-out" }}>{ln.text}</div>)}
        </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {data.panels.map((q, k) => (
          <div key={k} style={{ position: "relative", width: 58, height: 39, overflow: "hidden", border: `2px solid ${k === i ? "#ff3fa8" : "#2a2a30"}`, opacity: k <= i ? 1 : 0.35 }}>
            <Art p={q} zoom={false} />
          </div>
        ))}
      </div>
      <div style={{ color: "#8a8478", font: `600 11px ${font}`, letterSpacing: 2 }}>
        {data.title ? `${data.title.toUpperCase()} · ` : ""}CLICK / SPACE: NEXT · ESC: SKIP
      </div>
    </div>
  );
}

const audioLen = (line: string) => sampleDuration(`voices/narrator/${line}`);

export async function loadCutscene(id: string): Promise<CutsceneData | null> {
  try {
    const r = await fetch(`/cutscenes/${id}.json`);
    if (!r.ok) return null;
    const d = (await r.json()) as CutsceneData;
    for (const im of d.panels.map(p => p.image).filter(Boolean) as string[]) { const img = new Image(); img.src = im; }
    return d;
  } catch {
    return null;
  }
}
