import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface PanelSize {
  width: number;
  height: number;
}

interface UseResizablePanelOptions {
  storageKey?: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
}

// Lề chừa quanh viewport (khớp với px-4 của khung overlay).
const VIEWPORT_MARGIN_X = 32;
const VIEWPORT_MARGIN_Y = 96;

function getBounds(minWidth: number, minHeight: number): {
  maxWidth: number;
  maxHeight: number;
} {
  if (typeof window === "undefined") {
    return { maxWidth: minWidth, maxHeight: minHeight };
  }
  return {
    maxWidth: Math.max(minWidth, window.innerWidth - VIEWPORT_MARGIN_X),
    maxHeight: Math.max(minHeight, window.innerHeight - VIEWPORT_MARGIN_Y),
  };
}

function clampSize(
  size: PanelSize,
  minWidth: number,
  minHeight: number,
  maxWidth: number,
  maxHeight: number,
): PanelSize {
  return {
    width: Math.min(Math.max(size.width, minWidth), maxWidth),
    height: Math.min(Math.max(size.height, minHeight), maxHeight),
  };
}

function readStoredSize(storageKey?: string): PanelSize | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.width === "number" &&
      typeof parsed?.height === "number"
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    /* bỏ qua dữ liệu hỏng */
  }
  return null;
}

/**
 * Kích thước panel nổi có thể kéo resize từ góc dưới-phải, lưu vào localStorage.
 * `shiftX` / `shiftY` giữ cạnh trái / cạnh trên cố định trong lúc kéo (panel đang
 * canh giữa ngang / dọc — panel neo cạnh trên như Spotlight chỉ cần `shiftX`).
 */
export function useResizablePanel({
  storageKey,
  defaultWidth,
  defaultHeight,
  minWidth = 360,
  minHeight = 240,
}: UseResizablePanelOptions) {
  const [size, setSize] = useState<PanelSize>(() => {
    const stored = readStoredSize(storageKey) ?? {
      width: defaultWidth,
      height: defaultHeight,
    };
    const { maxWidth, maxHeight } = getBounds(minWidth, minHeight);
    return clampSize(stored, minWidth, minHeight, maxWidth, maxHeight);
  });
  const [shiftX, setShiftX] = useState(0);
  const [shiftY, setShiftY] = useState(0);
  const [isResizing, setIsResizing] = useState(false);

  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Khi cửa sổ đổi kích thước, clamp lại để panel không tràn viewport.
  useEffect(() => {
    const onWindowResize = () => {
      setSize((prev) => {
        const { maxWidth, maxHeight } = getBounds(minWidth, minHeight);
        return clampSize(prev, minWidth, minHeight, maxWidth, maxHeight);
      });
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [minWidth, minHeight]);

  // Trong lúc kéo: khóa chọn text + đổi con trỏ toàn cục.
  useEffect(() => {
    if (!isResizing) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing]);

  const persist = useCallback(
    (next: PanelSize) => {
      if (!storageKey || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* localStorage có thể bị chặn */
      }
    },
    [storageKey],
  );

  const startResize = useCallback(
    (e: ReactPointerEvent) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = sizeRef.current.width;
      const startH = sizeRef.current.height;
      let latest = sizeRef.current;

      const onMove = (ev: PointerEvent) => {
        const { maxWidth, maxHeight } = getBounds(minWidth, minHeight);
        const next = clampSize(
          {
            width: startW + (ev.clientX - startX),
            height: startH + (ev.clientY - startY),
          },
          minWidth,
          minHeight,
          maxWidth,
          maxHeight,
        );
        latest = next;
        setSize(next);
        setShiftX((next.width - startW) / 2);
        setShiftY((next.height - startH) / 2);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setShiftX(0);
        setShiftY(0);
        setIsResizing(false);
        persist(latest);
      };

      setIsResizing(true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [minWidth, minHeight, persist],
  );

  const reset = useCallback(() => {
    const { maxWidth, maxHeight } = getBounds(minWidth, minHeight);
    const base = clampSize(
      { width: defaultWidth, height: defaultHeight },
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    );
    setSize(base);
    setShiftX(0);
    setShiftY(0);
    persist(base);
  }, [defaultWidth, defaultHeight, minWidth, minHeight, persist]);

  return { size, shiftX, shiftY, isResizing, startResize, reset };
}
