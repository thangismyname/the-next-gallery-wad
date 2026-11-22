import { useState, useCallback, useEffect } from "react";

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 224;

/** Kéo mép phải sidebar shadcn để đổi rộng; lưu theo `storageKey` (sidebar chính / admin riêng)
 *  và ghi `--sidebar-width` lên sidebar-wrapper. */
export function useResizable(storageKey = "sidebar-width") {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
  });

  const onMouseMove = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
  }, []);

  const onMouseUp = useCallback(() => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onMouseMove]);

  const onMouseDown = useCallback(() => {
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onMouseMove, onMouseUp]);

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
    const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
    wrapper?.style.setProperty("--sidebar-width", `${width}px`);
  }, [width, storageKey]);

  return { width, onMouseDown };
}
