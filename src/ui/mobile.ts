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
