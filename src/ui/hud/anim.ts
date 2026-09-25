// Restart a CSS animation class on an element when a stamp changes (without remounting it, so its
// transitions keep running). The class comes off again when the animation ends.
import { useEffect, useRef } from "react";

export function restartClass(el: Element | null, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // reflow: the animation starts over
  el.classList.add(cls);
  const off = (e: Event) => {
    if (e.target !== el) return;
    el.classList.remove(cls);
    el.removeEventListener("animationend", off);
  };
  el.addEventListener("animationend", off);
}

/** `cls` restarts on `el` whenever `stamp` changes to a truthy value. */
export function useStampClass<T extends Element>(stamp: number, cls: string): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const last = useRef(stamp);
  useEffect(() => {
    if (stamp === last.current) return;
    last.current = stamp;
    if (stamp) restartClass(ref.current, cls);
  }, [stamp, cls]);
  return ref;
}

/** A stamp (performance.now()) bumped whenever `cond(prev, next)` holds between renders. */
export function useEdge<V>(value: V, cond: (prev: V, next: V) => boolean, reset?: unknown): number {
  const prev = useRef(value);
  const stamp = useRef(0);
  const epoch = useRef(reset);
  if (epoch.current !== reset) { epoch.current = reset; prev.current = value; }
  if (value !== prev.current) {
    if (cond(prev.current, value)) stamp.current = performance.now();
    prev.current = value;
  }
  return stamp.current;
}
