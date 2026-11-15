import { useCallback, useEffect, useMemo } from "react";
import {
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { cancelAnimation, useSharedValue, withDecay, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { APP_DURATION, EASE_OUT } from "@/lib/motion";

import { panBounds, transformRect, type Rect } from "./geometry";

/** Gap between pages while swiping (edges don't touch). */
export const PAGE_GAP = 20;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const HI_RES_SCALE = 1.8;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
const PAGE_VELOCITY = 500;
const SETTLE = { duration: APP_DURATION.base, easing: EASE_OUT };
const PAGE = { duration: APP_DURATION.slow - 40, easing: EASE_OUT };

/** Drag modes, decided once when a pan activates. */
const NONE = 0;
const PAGING = 1;
const DISMISSING = 2;
const PANNING = 3;
const INFO = 4;
/** Drag distance (fraction of screen height) that fully opens the info sheet. */
const INFO_DRAG = 0.35;

/** Shared values the pages read (stable object — safe in memo'd pages). */
export interface ViewerValues {
  index: SharedValue<number>;
  pagerX: SharedValue<number>;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  dismissX: SharedValue<number>;
  dismissY: SharedValue<number>;
  /** 0 resting → 1 dragged far down (backdrop follows it). */
  dismiss: SharedValue<number>;
  /** 0 closed → 1 info sheet fully open (photo lifts above it). */
  info: SharedValue<number>;
  /** How far the info sheet's content is scrolled (0 … `infoOverflow`). */
  infoScroll: SharedValue<number>;
  /** Content height beyond the sheet's viewport (set by the sheet on layout). */
  infoOverflow: SharedValue<number>;
}

/**
 * All viewer gestures in one place, on the UI thread (no React state while a
 * finger is down). A pan picks its mode when it activates: zoomed → move the
 * photo; mostly horizontal → page; mostly vertical → dismiss. Pinch zooms around
 * the fingers (photos only). Up-drag (or any vertical drag while open) moves the
 * info sheet. Taps (photos only): double = zoom in/out at the point, single =
 * toggle chrome (or close the info sheet). React is told only about results:
 * page changed, dismissed, zoomed in, dragging, info open, hi-res needed.
 */
export function useViewerGestures(options: {
  width: number;
  height: number;
  count: number;
  startIndex: number;
  /** Fitted size of the current item (`fitRect`). */
  baseWidth: number;
  baseHeight: number;
  isVideo: boolean;
  onPageChange: (index: number) => void;
  onDismiss: (from: Rect) => void;
  onToggleChrome: () => void;
  onHiRes: () => void;
  /** Zoom went above 1× (hide the chrome, like iOS Photos). */
  onZoomIn: () => void;
  /** A dismiss drag started / ended (chrome hides while dragging). */
  onDragChange: (dragging: boolean) => void;
  onInfoChange: (open: boolean) => void;
}) {
  const { width, height, count, startIndex, baseWidth, baseHeight, isVideo } = options;

  const index = useSharedValue(startIndex);
  const pagerX = useSharedValue(0);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const dismissX = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const dismiss = useSharedValue(0);
  const mode = useSharedValue(NONE);
  const info = useSharedValue(0);
  const infoOpen = useSharedValue(false);
  const infoScroll = useSharedValue(0);
  const infoOverflow = useSharedValue(0);
  /** Info drag start: sheet + content as one distance (see INFO in the pan). */
  const infoStart = useSharedValue(0);
  /** Zoom-in already reported for the current zoom session. */
  const zoomNotified = useSharedValue(false);

  // Values that change with React props, mirrored for the worklets.
  const size = useSharedValue({ w: width, h: height, bw: baseWidth, bh: baseHeight, count });
  useEffect(() => {
    size.set({ w: width, h: height, bw: baseWidth, bh: baseHeight, count });
  }, [width, height, baseWidth, baseHeight, count, size]);

  const { onPageChange, onDismiss, onToggleChrome, onHiRes, onZoomIn, onDragChange, onInfoChange } = options;

  const values: ViewerValues = useMemo(
    () => ({ index, pagerX, scale, tx, ty, dismissX, dismissY, dismiss, info, infoScroll, infoOverflow }),
    [index, pagerX, scale, tx, ty, dismissX, dismissY, dismiss, info, infoScroll, infoOverflow],
  );

  const baseRect = () => {
    "worklet";
    const s = size.get();
    return { x: (s.w - s.bw) / 2, y: (s.h - s.bh) / 2, width: s.bw, height: s.bh };
  };

  const resetZoom = (animated: boolean) => {
    "worklet";
    scale.set(animated ? withTiming(1, SETTLE) : 1);
    tx.set(animated ? withTiming(0, SETTLE) : 0);
    ty.set(animated ? withTiming(0, SETTLE) : 0);
    savedScale.set(1);
    savedTx.set(0);
    savedTy.set(0);
    zoomNotified.set(false);
  };

  const notifyZoomIn = () => {
    "worklet";
    if (zoomNotified.get()) return;
    zoomNotified.set(true);
    scheduleOnRN(onZoomIn);
  };

  const setInfo = (open: boolean) => {
    "worklet";
    info.set(withTiming(open ? 1 : 0, SETTLE));
    if (!open) infoScroll.set(withTiming(0, SETTLE));
    if (open !== infoOpen.get()) {
      infoOpen.set(open);
      scheduleOnRN(onInfoChange, open);
    }
  };

  /** Scale back into [1, MAX] and translation inside the bounds. */
  const settle = () => {
    "worklet";
    const s = Math.min(Math.max(scale.get(), 1), MAX_SCALE);
    const bounds = panBounds(baseRect(), s, size.get().w, size.get().h);
    const nx = Math.min(Math.max(tx.get(), -bounds.x), bounds.x);
    const ny = Math.min(Math.max(ty.get(), -bounds.y), bounds.y);
    scale.set(withTiming(s, SETTLE));
    tx.set(withTiming(nx, SETTLE));
    ty.set(withTiming(ny, SETTLE));
    savedScale.set(s);
    savedTx.set(nx);
    savedTy.set(ny);
    if (s <= 1.01) zoomNotified.set(false);
  };

  const pan = usePanGesture({
    maxPointers: 1,
    minDistance: 6,
    onActivate: (e) => {
      "worklet";
      if (scale.get() > 1.01) {
        mode.set(PANNING);
        savedTx.set(tx.get());
        savedTy.set(ty.get());
      } else if (Math.abs(e.translationX) >= Math.abs(e.translationY)) {
        mode.set(PAGING);
      } else if (infoOpen.get() || e.translationY < 0) {
        // Up = open the info sheet; any vertical drag while it is open moves it.
        mode.set(INFO);
        cancelAnimation(infoScroll);
        infoStart.set(info.get() * size.get().h * INFO_DRAG + infoScroll.get());
      } else {
        mode.set(DISMISSING);
        scheduleOnRN(onDragChange, true);
      }
    },
    onUpdate: (e) => {
      "worklet";
      const m = mode.get();
      if (m === PANNING) {
        tx.set(savedTx.get() + e.translationX);
        ty.set(savedTy.get() + e.translationY);
      } else if (m === PAGING) {
        const i = index.get();
        const atEdge = (i === 0 && e.translationX > 0) || (i >= size.get().count - 1 && e.translationX < 0);
        pagerX.set(atEdge ? e.translationX * 0.3 : e.translationX);
      } else if (m === INFO) {
        // Sheet + content as one track: the first INFO_DRAG of the screen opens the
        // sheet, further up scrolls its content; down scrolls back, then closes.
        const open = size.get().h * INFO_DRAG;
        const pos = Math.min(Math.max(infoStart.get() - e.translationY, 0), open + infoOverflow.get());
        info.set(Math.min(pos / open, 1));
        infoScroll.set(Math.max(pos - open, 0));
      } else if (m === DISMISSING) {
        dismissX.set(e.translationX * 0.6);
        dismissY.set(e.translationY);
        dismiss.set(Math.min(Math.abs(e.translationY) / (size.get().h * 0.5), 1));
      }
    },
    onDeactivate: (e) => {
      "worklet";
      const m = mode.get();
      if (m === PANNING) {
        settle();
      } else if (m === PAGING) {
        const i = index.get();
        const step = size.get().w + PAGE_GAP;
        let target = i;
        if (e.translationX < -step * 0.25 || e.velocityX < -PAGE_VELOCITY) target = i + 1;
        else if (e.translationX > step * 0.25 || e.velocityX > PAGE_VELOCITY) target = i - 1;
        target = Math.min(Math.max(target, 0), size.get().count - 1);
        pagerX.set(
          withTiming(-(target - i) * step, PAGE, (finished) => {
            "worklet";
            if (!finished) return;
            // Same frame: the new page becomes "current" at offset 0 → no jump.
            index.set(target);
            pagerX.set(0);
            if (target !== i) {
              resetZoom(false);
              infoScroll.set(0);
              scheduleOnRN(onPageChange, target);
            }
          }),
        );
      } else if (m === INFO) {
        if (infoScroll.get() > 0) {
          // Released while scrolling the content: keep the sheet open, glide on.
          infoScroll.set(withDecay({ velocity: -e.velocityY, clamp: [0, infoOverflow.get()] }));
          setInfo(true);
        } else {
          const open = e.velocityY < -PAGE_VELOCITY || (e.velocityY <= PAGE_VELOCITY && info.get() > 0.5);
          setInfo(open);
        }
      } else if (m === DISMISSING) {
        scheduleOnRN(onDragChange, false);
        if (Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
          const shrink = 1 - dismiss.get() * 0.35;
          scheduleOnRN(onDismiss, transformRect(baseRect(), shrink, dismissX.get(), dismissY.get()));
        } else {
          dismissX.set(withTiming(0, SETTLE));
          dismissY.set(withTiming(0, SETTLE));
          dismiss.set(withTiming(0, SETTLE));
        }
      }
    },
    onFinalize: () => {
      "worklet";
      mode.set(NONE);
    },
  });

  const pinch = usePinchGesture({
    enabled: !isVideo,
    onActivate: () => {
      "worklet";
      if (infoOpen.get()) setInfo(false);
      // A pinch wins over a page swipe that just started.
      if (mode.get() === PAGING) pagerX.set(withTiming(0, SETTLE));
      savedScale.set(scale.get());
      savedTx.set(tx.get());
      savedTy.set(ty.get());
    },
    onUpdate: (e) => {
      "worklet";
      const next = Math.min(Math.max(savedScale.get() * e.scale, 0.8), MAX_SCALE * 1.2);
      const k = next / savedScale.get();
      // Keep the point under the fingers fixed (and follow them as they move).
      const fx = e.focalX - size.get().w / 2;
      const fy = e.focalY - size.get().h / 2;
      scale.set(next);
      tx.set(fx - (fx - savedTx.get()) * k);
      ty.set(fy - (fy - savedTy.get()) * k);
      if (next > 1.05) notifyZoomIn();
      if (next > HI_RES_SCALE) scheduleOnRN(onHiRes);
    },
    onDeactivate: () => {
      "worklet";
      settle();
    },
  });

  const doubleTap = useTapGesture({
    enabled: !isVideo,
    numberOfTaps: 2,
    onDeactivate: (e) => {
      "worklet";
      if (scale.get() > 1.01) {
        resetZoom(true);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const bounds = panBounds(baseRect(), s, size.get().w, size.get().h);
      const nx = Math.min(Math.max(-(e.x - size.get().w / 2) * (s - 1), -bounds.x), bounds.x);
      const ny = Math.min(Math.max(-(e.y - size.get().h / 2) * (s - 1), -bounds.y), bounds.y);
      scale.set(withTiming(s, SETTLE));
      tx.set(withTiming(nx, SETTLE));
      ty.set(withTiming(ny, SETTLE));
      savedScale.set(s);
      savedTx.set(nx);
      savedTy.set(ny);
      notifyZoomIn();
      scheduleOnRN(onHiRes);
    },
  });

  const singleTap = useTapGesture({
    enabled: !isVideo,
    onDeactivate: () => {
      "worklet";
      // With the info sheet open a tap closes it; otherwise it toggles the chrome.
      if (infoOpen.get()) setInfo(false);
      else scheduleOnRN(onToggleChrome);
    },
  });

  /** Outer detector: drags + pinch. Inner detector (pages): taps. */
  const dragGesture = useSimultaneousGestures(pan, pinch);
  const tapGesture = useExclusiveGestures(doubleTap, singleTap);

  /** Open the info sheet from React (the ⓘ button). */
  const openInfo = useCallback(() => {
    scale.set(withTiming(1, SETTLE));
    tx.set(withTiming(0, SETTLE));
    ty.set(withTiming(0, SETTLE));
    info.set(withTiming(1, SETTLE));
    infoScroll.set(0);
    infoOpen.set(true);
    onInfoChange(true);
  }, [scale, tx, ty, info, infoScroll, infoOpen, onInfoChange]);

  /** Close the info sheet from React (e.g. its close button). */
  const closeInfo = useCallback(() => {
    info.set(withTiming(0, SETTLE));
    infoScroll.set(withTiming(0, SETTLE));
    infoOpen.set(false);
    onInfoChange(false);
  }, [info, infoScroll, infoOpen, onInfoChange]);

  /** Jump without animation (list changed under the viewer, e.g. after a delete). */
  const syncIndex = useCallback(
    (i: number) => {
      index.set(i);
      pagerX.set(0);
      scale.set(1);
      tx.set(0);
      ty.set(0);
      infoScroll.set(0);
      zoomNotified.set(false);
    },
    [index, pagerX, scale, tx, ty, infoScroll, zoomNotified],
  );

  return { values, dragGesture, tapGesture, syncIndex, openInfo, closeInfo };
}
