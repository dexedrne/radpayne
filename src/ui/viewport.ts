// The whole-screen shell: the layout viewport, the visual viewport (Safari's collapsing toolbar and the
// keyboard), rotations and a return from the background all re-fit the page and tell the canvas. The
// safe-area insets themselves are CSS (env(safe-area-inset-*), read into --sai-* in index.html).
import { DUAL_SCREEN } from "./mobile.ts";

/** The largest viewport this page has seen (the app's own height in CSS pixels). */
export const APP = { w: 0, h: 0, orientation: "landscape" as "portrait" | "landscape" };

function fit(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? innerWidth);
  const h = Math.round(vv?.height ?? innerHeight);
  APP.w = w;
  APP.h = h;
  APP.orientation = w >= h ? "landscape" : "portrait";
  root.style.setProperty("--app-w", `${w}px`);
  root.style.setProperty("--app-h", `${h}px`);
  root.dataset.orient = APP.orientation;
  root.toggleAttribute("data-dual", DUAL_SCREEN);
  dispatchEvent(new CustomEvent("radpayne:viewport", { detail: { width: w, height: h, orientation: APP.orientation } }));
}

/** Install the resize / rotation / visual-viewport listeners (idempotent). */
export function installViewport(): () => void {
  if (typeof window === "undefined") return () => undefined;
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; fit(); });
  };
  const later = () => { schedule(); setTimeout(schedule, 120); setTimeout(schedule, 420); };
  addEventListener("resize", schedule, { passive: true });
  addEventListener("orientationchange", later);
  addEventListener("pageshow", later);
  addEventListener("focus", schedule);
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) later(); });
  // iPhone Safari's own pinch and double-tap zoom (gesture* is WebKit's): the game keeps the screen.
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(name, e => e.preventDefault(), { passive: false });
  }
  document.addEventListener("dblclick", e => e.preventDefault());
  fit();
  return () => {
    removeEventListener("resize", schedule);
    removeEventListener("orientationchange", later);
    removeEventListener("pageshow", later);
    removeEventListener("focus", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
  };
}

/** Go truly full screen where the page may (Android Chrome and the like). iPhone Safari has no page-level
 *  Fullscreen API: there the home-screen app is the full-screen form (display: standalone). */
export function requestFullScreenIfAvailable(): void {
  if (typeof document === "undefined" || document.fullscreenElement) return;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const go = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!go) return;
  try {
    const p = go() as Promise<void> | undefined;
    p?.catch?.(() => undefined);
  } catch { /* not allowed without a gesture */ }
}
