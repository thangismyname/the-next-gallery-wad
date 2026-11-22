import { useEffect, useState } from "react";

/** Above this offset the bar always shows; a move ≥ STEP px flips it (ignores jitter). Same rule as mobile `tabBarScroll.ts`. */
const SHOW_ABOVE = 48;
const STEP = 6;

export function nextHidden(y: number, dy: number, hidden: boolean) {
  if (y <= SHOW_ABOVE) return false;
  if (dy >= STEP) return true;
  if (dy <= -STEP) return false;
  return hidden;
}

/**
 * true while the page scrolls down (mobile BottomBar slides away to show content), false on scroll up /
 * near the top. Listens in the capture phase so any scroll container counts, not only the window.
 * `enabled = false` (e.g. Moments pager) → always visible.
 */
export function useHideOnScroll(enabled = true) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (!enabled) return;
    const last = new WeakMap<EventTarget, number>();
    const onScroll = (e: Event) => {
      const target = e.target === document ? window : e.target;
      if (!target) return;
      const y = target === window ? window.scrollY : (target as HTMLElement).scrollTop;
      const prev = last.get(target) ?? y;
      last.set(target, y);
      setHidden((h) => nextHidden(y, y - prev, h));
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [enabled]);
  return hidden;
}
