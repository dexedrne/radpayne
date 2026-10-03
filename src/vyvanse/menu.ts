// The vyvanse.beer menu hook. vyvanse.beer, a controller-first launcher, plays the game in a full-screen
// iframe; a pad gets back to its menu by holding View + Menu, the keys cannot once the game has the
// focus. Framed there, the pause menu and the title get a BACK TO VYVANSE.BEER entry: it posts
// { type: "vyvanse:menu" } to the launcher's origin (never "*") and the launcher closes the game.
// Framed: window.top !== window, and the parent is https://vyvanse.beer by location.ancestorOrigins or
// by the referrer. A dev or test build also takes an http://localhost / 127.0.0.1 parent (the headless
// check's harness). Opened on its own, or framed by anyone else (radbro.fun: src/radbro/bridge.ts),
// there is no entry and nothing is sent.

export const VYVANSE_ORIGIN = "https://vyvanse.beer";

/** The parts of `window` the hook reads (a fake one in the tests). */
export type HookWindow = {
  top: unknown;
  parent: unknown;
  location: { ancestorOrigins?: { readonly [i: number]: string } | null };
  document: { referrer: string };
};
type Target = { postMessage(message: unknown, targetOrigin: string): void };

const DEV = import.meta.env?.MODE !== "production";
const LOCAL_PARENT = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const page = (): HookWindow | undefined => (typeof window === "undefined" ? undefined : (window as unknown as HookWindow));

function originOf(url: string): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/** The origin of the launcher framing this page, or null (not framed, or framed by someone else). */
export function launcherOrigin(win: HookWindow | undefined = page(), dev = DEV): string | null {
  if (!win || win.top === win) return null;
  const parent = win.location.ancestorOrigins?.[0];
  const ref = win.document.referrer ?? "";
  if (parent === VYVANSE_ORIGIN || ref.startsWith(`${VYVANSE_ORIGIN}/`)) return VYVANSE_ORIGIN;
  if (dev) for (const o of [parent, originOf(ref)]) if (o && LOCAL_PARENT.test(o)) return o;
  return null;
}

/** Whether this page shows the entry (decided once, at load: a frame's parent does not change). */
export const IN_VYVANSE: boolean = launcherOrigin() !== null;

/** Back to the launcher's menu: posts { type: "vyvanse:menu" } to it. False when there is none. */
export function backToVyvanse(win: HookWindow | undefined = page(), dev = DEV): boolean {
  const origin = launcherOrigin(win, dev);
  if (!win || !origin) return false;
  try {
    (win.parent as Target).postMessage({ type: "vyvanse:menu" }, origin);
    return true;
  } catch {
    return false; // the frame is going away
  }
}
