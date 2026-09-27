import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import PlayPage from "./app/PlayPage.tsx";
import { startBridge } from "./radbro/bridge.ts";
import { unlockAudio } from "./audio/engine.ts";
import { watchDevices } from "./input/device.ts";

window.addEventListener("error", e => console.error("[window.error]", e.message));
window.addEventListener("unhandledrejection", e => console.error("[unhandledrejection]", String(e.reason)));

// Framed on radbro.fun: tell the portal what this is; the first click focuses the frame + unlocks the audio.
startBridge({ onFirstGesture: unlockAudio });
// the last device used (keys / a pad, and which pad) decides every prompt; pads hot-plug
watchDevices();

const DEV = import.meta.env.MODE !== "production";
const EditorPage = DEV ? lazy(() => import("./app/dev/EditorPage.tsx")) : null;
const params = new URLSearchParams(location.search);

// No StrictMode: the game lives outside React and the canvas is mounted exactly once.
function App() {
  if (EditorPage && params.has("editor")) return <Suspense fallback={<div style={{ padding: 20 }}>loading…</div>}><EditorPage /></Suspense>;
  return <PlayPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
