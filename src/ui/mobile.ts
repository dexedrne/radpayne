import { isPhone } from '../phone.ts';
// Phones and tablets (an iPad, an iPhone, an Android phone or tablet): the lighter path. Their first visit
// starts on the Low graphics (look/gfx.ts; a choice they make is kept), the canvas stays at MOBILE_DPR
// pixels a point at most whatever the Resolution, and the characters wear lighter materials (lit by the
// diffuse light alone). On an iPad every browser is WebKit underneath (Chrome there too), and by default
// iPadOS asks for the desktop site: its user agent is then a Mac's ("Macintosh; Intel Mac OS X"), and only
// its touch points tell it from one (a Mac has none). A Windows laptop's touch screen does not make it a
// tablet (its UA says Windows).
//   ?mobile=1 / ?mobile=0 forces it either way for one page load (the tools; a desktop to try it on).

/** What the check reads: the user agent, `navigator.maxTouchPoints`, `navigator.platform` (may be ""). */
export type Agent = { ua: string; touch: number; platform: string };

/** Whether this is a phone or a tablet, and which kind (for the console). */
export function mobileFrom(a: Agent): { mobile: boolean; why: string } {
  const ua = a.ua || "";
  if (/\biPad\b/.test(ua)) return { mobile: true, why: "iPad" };
  if (/\biPhone\b|\biPod\b/.test(ua)) return { mobile: true, why: "iPhone" };
  if (/\bAndroid\b/.test(ua)) return { mobile: true, why: "Android" };
  // iPadOS asking for the desktop site: a Mac's UA (or platform) with a touch screen
  if ((/\bMacintosh\b|\bMac OS X\b/.test(ua) || a.platform === "MacIntel") && a.touch > 1) return { mobile: true, why: "iPad (as a Mac)" };
  if (/\bMobi|\bTablet\b|\bSilk\b|\bKindle\b|\bPlayBook\b|\bBB10\b|\bOpera Mini\b|\bIEMobile\b/.test(ua)) return { mobile: true, why: "mobile browser" };
  return { mobile: false, why: "" };
}

/** This page's check (once), `?mobile=1|0` first. */
function detect(): { mobile: boolean; why: string } {
  try {
    const q = new URLSearchParams(location.search).get("mobile");
    if (q === "1") return { mobile: true, why: "?mobile=1" };
    if (q === "0") return { mobile: false, why: "" };
  } catch { /* no page (the tests) */ }
  if (typeof navigator === "undefined") return { mobile: false, why: "" };
  return mobileFrom({ ua: navigator.userAgent ?? "", touch: navigator.maxTouchPoints ?? 0, platform: (navigator as Navigator & { platform?: string }).platform ?? "" });
}

const found = detect();
/** A phone or a tablet (this page load). */
export let MOBILE = found.mobile || isPhone();
if (typeof window !== 'undefined') addEventListener('vyvanse:device', () => { MOBILE = found.mobile || isPhone(); });
/** Why (the console's line). */
export const MOBILE_WHY = found.why;

/** The most canvas pixels per CSS pixel on a phone or a tablet, whatever the Resolution: a Retina screen's
 *  2 (or 3) would be four (or nine) times the pixels to fill, and an iPad's GPU fills each of them through
 *  the scene pass's MSAA and the post chain. */
export const MOBILE_DPR = 1.25;
/** A recent full-size iPhone (a 3x screen at 390 points or wider: the 12 and on) draws a little sharper:
 *  1.5 px a point is still under half of its 3, and the GPU has the headroom. */
export const HIGH_END_DPR = 1.5;

/** Whether this is an iPhone/iPod (iPadOS on a Mac's UA still says Macintosh). */
export function iosFrom(ua: string): boolean {
  return /\biPhone\b|\biPod\b/.test(ua || "");
}

/** iPhones with a 3x screen 390 points wide or more: the ones that can take Medium and 1.5x without
 *  dropping frames. Deliberately conservative: an SE, a mini-sized screen or an older phone stays Low. */
export function highEndPhoneFrom(ua: string, dpr: number, minSide: number): boolean {
  return iosFrom(ua) && dpr >= 3 && minSide >= 390;
}

/** A home-screen app (standalone), not a Safari tab. */
export function standaloneFrom(standalone: boolean | undefined, displayMode: boolean): boolean {
  return !!standalone || displayMode;
}

type Env = {
  ua: string; platform: string; touch: number; dpr: number; minSide: number;
  standalone?: boolean; displayMode?: boolean;
};
function env(): Env | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  const n = navigator as Navigator & { standalone?: boolean; userAgentData?: { mobile?: boolean } };
  const scr = typeof screen !== "undefined" ? screen : undefined;
  return {
    ua: n.userAgent ?? "", platform: (n as Navigator & { platform?: string }).platform ?? "",
    touch: n.maxTouchPoints ?? 0, dpr: typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
    minSide: scr ? Math.min(scr.width, scr.height) : 0,
    standalone: n.standalone,
    displayMode: typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches,
  };
}

const e = env();
/** iPhone / iPod Safari (or an iOS home-screen app). */
export const IOS = e ? iosFrom(e.ua) : false;
/** This page is launched from the home screen (no browser chrome). */
export const STANDALONE = e ? standaloneFrom(e.standalone, !!e.displayMode) : false;
/** The screen is a touch screen (a Mac with a touch bar says 0). */
export const TOUCH = e ? e.touch > 0 : false;
/** A recent full-size iPhone: Medium graphics and a 1.5 px-a-point canvas by default. */
export const HIGH_END_PHONE = e ? highEndPhoneFrom(e.ua, e.dpr, e.minSide) : false;
/** The canvas cap for this device (HIGH_END_DPR on a recent full-size iPhone, MOBILE_DPR else). */
export const MOBILE_DPR_CAP = HIGH_END_PHONE ? HIGH_END_DPR : MOBILE_DPR;
/** A foldable / dual-screen phone (two viewport segments): the layout keeps clear of the hinge. */
export const DUAL_SCREEN = typeof matchMedia === "function" && matchMedia("(horizontal-viewport-segments: 2), (vertical-viewport-segments: 2)").matches;

/** Mark the document for CSS (and the console): phone, touch, iOS, installed, dual-screen. */
export function markDevice(isPhoneDevice = false): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute("data-phone", MOBILE || isPhoneDevice);
  root.toggleAttribute("data-touch", TOUCH);
  root.toggleAttribute("data-ios", IOS);
  root.toggleAttribute("data-standalone", STANDALONE);
  root.toggleAttribute("data-dual", DUAL_SCREEN);
}
