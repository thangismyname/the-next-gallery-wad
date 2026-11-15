import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

interface ZoomState {
  zoom: number;
  pan: { x: number; y: number };
}

// Zoom & pan cho Lightbox, clamp theo vùng ảnh:
// - chuột: lăn để zoom, nhấp đúp (zoom 2× / về 1×), kéo khi zoom > 1;
// - cảm ứng: chụm / mở 2 ngón (zoom quanh điểm giữa 2 ngón, kéo 2 ngón để di
//   chuyển), chạm đúp (như nhấp đúp), 1 ngón kéo khi zoom > 1.
// - isVideo: disabled zoom (giữ ref để tránh stale trong wheel/zoomStep).
// - resetKey: khi đổi giá trị (media.id) → reset zoom/pan về gốc.
// viewRef luôn cập nhật NGAY khi đổi view (không chờ render) — pointermove bắn
// dồn dập, tính trên view cũ sẽ làm ảnh giật.

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const TAP_MOVE_PX = 10;
export function useLightboxZoom({
  isVideo,
  resetKey,
  maxZoom = 5,
}: {
  isVideo: boolean;
  resetKey: string;
  maxZoom?: number;
}) {
  const [view, setView] = useState<ZoomState>({ zoom: 1, pan: { x: 0, y: 0 } });
  const viewRef = useRef(view);
  const isVideoRef = useRef(isVideo);
  const imgAreaRef = useRef<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panGesture = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  // Ngón tay / chuột đang chạm (pointerId → vị trí) — 2 điểm = đang chụm.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number; mid: { x: number; y: number } } | null>(null);
  // Chạm đúp (cảm ứng): lần chạm trước + có kéo đi không.
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const touchDoubleTapAt = useRef(0);

  const commit = useCallback((next: ZoomState) => {
    viewRef.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    isVideoRef.current = isVideo;
  }, [isVideo]);

  const clampPan = useCallback(
    (pan: { x: number; y: number }, zoom: number, rect: DOMRect) => {
      const halfX = (rect.width / 2) * Math.max(zoom - 1, 0);
      const halfY = (rect.height / 2) * Math.max(zoom - 1, 0);
      return {
        x: Math.min(halfX, Math.max(-halfX, pan.x)),
        y: Math.min(halfY, Math.max(-halfY, pan.y)),
      };
    },
    [],
  );

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const el = imgAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const { zoom: z, pan: p } = viewRef.current;
      const px = cx - rect.left - rect.width / 2;
      const py = cy - rect.top - rect.height / 2;
      const wx = (px - p.x) / z;
      const wy = (py - p.y) / z;
      const nz = Math.min(maxZoom, Math.max(1, z * factor));
      if (nz === 1) {
        commit({ zoom: 1, pan: { x: 0, y: 0 } });
        return;
      }
      commit({
        zoom: nz,
        pan: clampPan({ x: px - wx * nz, y: py - wy * nz }, nz, rect),
      });
    },
    [clampPan, commit, maxZoom],
  );

  const resetZoom = useCallback(() => {
    commit({ zoom: 1, pan: { x: 0, y: 0 } });
  }, [commit]);

  // Lăn chuột zoom: dùng native listener để preventDefault (chống cuộn trang)
  useEffect(() => {
    const el = imgAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isVideoRef.current) return;
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Reset zoom khi đổi ảnh
  useEffect(() => {
    resetZoom();
  }, [resetKey, resetZoom]);

  const zoomStep = useCallback(
    (factor: number) => {
      if (isVideoRef.current) return;
      const el = imgAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt],
  );

  /** Zoom 2× tại điểm chạm, hoặc về 1× nếu đang zoom. */
  const toggleZoomAt = useCallback(
    (x: number, y: number) => {
      if (viewRef.current.zoom > 1) resetZoom();
      else zoomAt(x, y, 2);
    },
    [resetZoom, zoomAt],
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      if (isVideoRef.current) return;
      // Trình duyệt di động có thể bắn thêm dblclick sau chạm đúp đã xử lý.
      if (Date.now() - touchDoubleTapAt.current < 500) return;
      toggleZoomAt(e.clientX, e.clientY);
    },
    [toggleZoomAt],
  );

  const startPan = (x: number, y: number) => {
    panGesture.current = {
      dragging: true,
      startX: x,
      startY: y,
      originX: viewRef.current.pan.x,
      originY: viewRef.current.pan.y,
    };
    setIsPanning(true);
  };

  const stopPan = () => {
    panGesture.current.dragging = false;
    setIsPanning(false);
  };

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onImgPointerDown = (e: ReactPointerEvent) => {
    if (isVideoRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Ngón thứ 2 chạm → bắt đầu chụm (bỏ kéo 1 ngón, bỏ chạm đúp).
      stopPan();
      tapStart.current = null;
      const { dist, mid } = pinchState();
      pinch.current = { dist, zoom: viewRef.current.zoom, mid };
      return;
    }
    if (pointers.current.size > 2) return;
    tapStart.current = { x: e.clientX, y: e.clientY, moved: false };
    if (viewRef.current.zoom > 1) startPan(e.clientX, e.clientY);
  };

  const onImgPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = imgAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = tapStart.current;
    if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_MOVE_PX) t.moved = true;

    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      // Điểm ảnh nằm dưới tâm 2 ngón lần trước giữ nguyên dưới tâm mới → vừa
      // zoom vừa kéo theo 2 ngón.
      const { dist, mid } = pinchState();
      const { zoom: z, pan } = viewRef.current;
      const nz = Math.min(maxZoom, Math.max(1, (p.zoom * dist) / p.dist));
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const wx = (p.mid.x - cx - pan.x) / z;
      const wy = (p.mid.y - cy - pan.y) / z;
      p.mid = mid;
      commit(
        nz === 1
          ? { zoom: 1, pan: { x: 0, y: 0 } }
          : { zoom: nz, pan: clampPan({ x: mid.x - cx - wx * nz, y: mid.y - cy - wy * nz }, nz, rect) },
      );
      return;
    }

    const g = panGesture.current;
    if (!g.dragging) return;
    const { zoom } = viewRef.current;
    commit({
      zoom,
      pan: clampPan({ x: g.originX + e.clientX - g.startX, y: g.originY + e.clientY - g.startY }, zoom, rect),
    });
  };

  const onImgPointerUp = (e: ReactPointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const wasPinching = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);

    if (wasPinching) {
      pinch.current = null;
      // Còn 1 ngón trên ảnh đang zoom → kéo tiếp bằng ngón đó.
      const rest = [...pointers.current.values()][0];
      if (rest && viewRef.current.zoom > 1) startPan(rest.x, rest.y);
      return;
    }
    stopPan();

    // Chạm đúp (cảm ứng; chuột dùng dblclick): 2 lần chạm ngắn, gần nhau.
    const t = tapStart.current;
    tapStart.current = null;
    if (e.type !== "pointerup" || e.pointerType !== "touch" || !t || t.moved) return;
    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX) {
      lastTap.current = null;
      touchDoubleTapAt.current = now;
      toggleZoomAt(e.clientX, e.clientY);
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  return {
    view,
    isPanning,
    imgAreaRef,
    zoomStep,
    resetZoom,
    handleDoubleClick,
    onImgPointerDown,
    onImgPointerMove,
    onImgPointerUp,
  };
}