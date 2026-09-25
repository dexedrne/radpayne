// The live HUD scale (--s) for the JS-positioned layers, kept in step by UiEffects.
let current = 1;
export const hudScaleNow = (): number => current;
export function setHudScaleNow(s: number): void {
  current = s;
}
