// Comic-panel cutscene player (spec section 7 "src/ui"): public/cutscenes/<id>.json lists panels
// { image, caption, narration, dur, tone, audio? }. Panels land one at a time on a page (a 2 x 2 grid
// for four), each with a narrator box; click / Space / Enter goes to the next panel, Esc skips the
// rest. A panel without an image draws a painted placeholder in its tone until the art exists.
import { useCallback, useEffect, useRef, useState } from "react";

export type Panel = { image?: string; caption: string; narration: string; dur?: number; tone?: string; audio?: string };
export type CutsceneData = { id: string; title?: string; panels: Panel[] };

const font = "ui-monospace, SFMono-Regular, Menlo, monospace";
const serif = "Georgia, 'Times New Roman', serif";

const TONES: Record<string, string> = {
  street: "radial-gradient(ellipse at 70% 20%, rgba(255,63,168,0.35), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(255,174,82,0.3), transparent 50%), linear-gradient(180deg, #0c1224 0%, #141a2e 60%, #07080d 100%)",
  phone: "radial-gradient(circle at 50% 45%, rgba(120,200,255,0.45), transparent 30%), linear-gradient(180deg, #06070b, #0f1320)",
  club: "radial-gradient(ellipse at 50% 30%, rgba(255,63,168,0.55), transparent 45%), radial-gradient(ellipse at 50% 38%, rgba(63,240,255,0.3), transparent 60%), linear-gradient(180deg, #120817 0%, #0b0b14 100%)",
  guns: "radial-gradient(ellipse at 40% 50%, rgba(255,200,120,0.35), transparent 50%), linear-gradient(135deg, #0a0a10, #1c1410)",
};

function Placeholder({ tone }: { tone?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: TONES[tone ?? "street"] ?? TONES.street }}>
      {/* rain */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.35, backgroundImage: "repeating-linear-gradient(100deg, transparent 0 14px, rgba(200,220,255,0.35) 14px 15px, transparent 15px 31px)", animation: "rp-rain 0.5s linear infinite" }} />
      {tone === "club" && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "22%", textAlign: "center", font: `900 clamp(18px, 4vw, 44px) ${font}`, color: "#ff5fbf", letterSpacing: 4, textShadow: "0 0 8px #ff3fa8, 0 0 24px #ff3fa8" }}>CLUB MILADY</div>
      )}
      {tone === "phone" && (
        <div style={{ position: "absolute", left: "38%", right: "38%", top: "18%", bottom: "18%", borderRadius: 14, border: "3px solid #222", background: "#0a1422", display: "flex", alignItems: "center", justifyContent: "center", font: `800 clamp(12px, 2vw, 22px) ${font}`, color: "#ff4a4a" }}>0.00</div>
      )}
      {/* a figure in a coat: big head, long coat */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "78%" }}>
        <g fill="#050507">
          {tone !== "phone" && <path d="M50 30 C38 30 34 38 34 45 C34 52 40 57 50 57 C60 57 66 52 66 45 C66 38 62 30 50 30 Z M36 58 L64 58 L72 100 L28 100 Z" />}
          {tone === "guns" && <path d="M18 70 L34 66 L35 70 L22 74 Z M82 70 L66 66 L65 70 L78 74 Z" />}
        </g>
      </svg>
    </div>
  );
}

export function Cutscene({ data, onDone }: { data: CutsceneData; onDone: () => void }) {
  const [i, setI] = useState(0);
  const timer = useRef<number>(0);
  const done = useRef(false);
  const finish = useCallback(() => { if (!done.current) { done.current = true; onDone(); } }, [onDone]);
  const next = useCallback(() => setI(k => { if (k + 1 >= data.panels.length) { finish(); return k; } return k + 1; }), [data, finish]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(next, (data.panels[i]?.dur ?? 4.5) * 1000);
    const a = data.panels[i]?.audio;
    let audio: HTMLAudioElement | null = null;
    if (a) { audio = new Audio(a); void audio.play().catch(() => undefined); }
    return () => { clearTimeout(timer.current); audio?.pause(); };
  }, [i, data, next]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Escape") finish();
      else if (["Space", "Enter", "KeyE", "ArrowRight"].includes(e.code)) { e.preventDefault(); next(); }
    };
    addEventListener("keydown", kd);
    return () => removeEventListener("keydown", kd);
  }, [next, finish]);

  const n = data.panels.length;
  const cols = n >= 4 ? 2 : n;
  return (
    <div onClick={next} style={{ position: "fixed", inset: 0, zIndex: 40, background: "#08080b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <style>{"@keyframes rp-rain { from { background-position: 0 0 } to { background-position: -12px 60px } } @keyframes rp-land { from { opacity: 0; transform: scale(1.04) rotate(-0.6deg) } to { opacity: 1; transform: none } }"}</style>
      <div style={{ width: "min(94vw, 150vh)", aspectRatio: cols === 2 ? "16 / 10" : "16 / 7", display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, padding: 10, background: "#efe6d2", boxShadow: "0 10px 60px rgba(0,0,0,0.6)" }}>
        {data.panels.map((p, k) => (
          <div key={k} style={{ position: "relative", overflow: "hidden", border: "3px solid #111", background: "#111", visibility: k <= i ? "visible" : "hidden", animation: k === i ? "rp-land 0.45s ease-out" : undefined, filter: k < i ? "saturate(0.7) brightness(0.85)" : undefined }}>
            {p.image ? <img src={p.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <Placeholder tone={p.tone} />}
            <div style={{ position: "absolute", left: 8, top: 8, maxWidth: "70%", background: "#f6d860", color: "#111", padding: "5px 9px", font: `800 clamp(10px, 1.4vw, 16px) ${serif}`, textTransform: "uppercase", letterSpacing: 0.5, border: "2px solid #111" }}>{p.caption}</div>
            <div style={{ position: "absolute", right: 8, bottom: 8, maxWidth: "78%", background: "#fffdf4", color: "#111", padding: "6px 10px", font: `italic 600 clamp(10px, 1.3vw, 15px) ${serif}`, border: "2px solid #111" }}>{p.narration}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "fixed", bottom: 14, left: 0, right: 0, textAlign: "center", color: "#8a8478", font: `600 11px ${font}`, letterSpacing: 2 }}>
        {data.title ? `${data.title.toUpperCase()} · ` : ""}CLICK / SPACE: NEXT · ESC: SKIP
      </div>
    </div>
  );
}

export async function loadCutscene(id: string): Promise<CutsceneData | null> {
  try {
    const r = await fetch(`/cutscenes/${id}.json`);
    if (!r.ok) return null;
    return (await r.json()) as CutsceneData;
  } catch {
    return null;
  }
}
