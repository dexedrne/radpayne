import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import PlayPage from "./app/PlayPage.tsx";

window.addEventListener("error", e => console.error("[window.error]", e.message));
window.addEventListener("unhandledrejection", e => console.error("[unhandledrejection]", String(e.reason)));

const DEV = import.meta.env.MODE !== "production";
const EditorPage = DEV ? lazy(() => import("./app/dev/EditorPage.tsx")) : null;
const params = new URLSearchParams(location.search);

// No StrictMode: the game lives outside React and the canvas is mounted exactly once.
function App() {
  if (EditorPage && params.has("editor")) return <Suspense fallback={<div style={{ padding: 20 }}>loading…</div>}><EditorPage /></Suspense>;
  return <PlayPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
