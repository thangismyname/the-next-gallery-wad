import { useSelectionStore, type MediaListItem } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useCompetingGestures, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import type { TileNode } from "./components/MediaTile";

/** Hold this long on a tile (outside selection mode) to start selecting. */
const LONG_PRESS_MS = 300;
/** Auto-scroll: band at the top / bottom edge where it kicks in, and max speed (pt per frame). */
const EDGE_ZONE = 90;
const MAX_SPEED = 22;
/** Re-measure the tiles this often while auto-scrolling (newly mounted rows). */
const REMEASURE_MS = 120;

const now = () => Date.now();

/** Tile rect in **content** coordinates (window y + scroll offset at measure time). */
interface TileRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the list gives the hook for auto-scrolling. */
export interface DragSelectScroller {
  /** Current scroll offset (contentOffset.y). */
  getOffset: () => number;
  /** Largest valid offset (content height − viewport height). */
  getMaxOffset: () => number;
  scrollTo: (offset: number) => void;
  /** Window y of the visible area's top / bottom edge (below the header, above the bar). */
  edges: { top: number; bottom: number };
}

/**
 * Multi-select gestures on the gallery grid (Google Photos / iOS Photos style):
 *
 * - **Hold** a tile → selection mode with that tile selected; keep the finger
 *   down and drag to select a range.
 * - In selection mode, **drag sideways** starting on a tile → range select
 *   (starting on a selected tile deselects instead). Vertical drags still scroll.
 * - Finger near the top / bottom edge → the list **auto-scrolls** (faster the
 *   closer to the edge) and the range keeps following the finger.
 *
 * The range is by position in `items` (anchor → finger), applied over the
 * selection at drag start, so dragging back un-does it. Tile rects are kept in
 * content coordinates (measured at drag start, re-measured while auto-scrolling),
 * so hit tests stay right as the list moves. The user can't scroll during a drag
 * (`dragging` → `scrollEnabled={false}`); auto-scroll uses `scrollTo`.
 */
export function useDragSelect({
  items,
  tiles,
  scroller,
}: {
  items: MediaListItem[];
  tiles: RefObject<Map<string, TileNode>>;
  scroller: DragSelectScroller;
}) {
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const [dragging, setDragging] = useState(false);

  const indexById = useMemo(() => new Map(items.map((m, i) => [m.id, i])), [items]);
  const latest = useRef({ items, indexById, scroller });
  useEffect(() => {
    latest.current = { items, indexById, scroller };
  });

  const drag = useRef({
    active: false,
    rects: null as TileRect[] | null,
    anchor: -1,
    last: -1,
    add: true,
    base: new Set<string>(),
    finger: null as { x: number; y: number } | null,
    offset: 0,
    speed: 0,
    frame: 0 as number,
    measuring: false,
    measuredAt: 0,
    endedAt: 0,
  });

  /** Measure every mounted tile → content-space rects. */
  const measure = useCallback(async () => {
    const d = drag.current;
    const { indexById: ids } = latest.current;
    const offset = d.offset;
    const rects = await Promise.all(
      [...(tiles.current?.entries() ?? [])].map(
        ([id, node]) =>
          new Promise<TileRect | null>((resolve) => {
            const index = ids.get(id);
            if (index == null) return resolve(null);
            node.measureInWindow((x, y, w, h) => resolve(w > 0 ? { index, x, y: y + offset, w, h } : null));
          }),
      ),
    );
    return rects.filter((r): r is TileRect => r !== null);
  }, [tiles]);

  const hitAt = (x: number, y: number) => {
    const cy = y + drag.current.offset;
    return drag.current.rects?.find((r) => x >= r.x && x <= r.x + r.w && cy >= r.y && cy <= r.y + r.h)?.index ?? -1;
  };

  const applyRange = (to: number) => {
    const d = drag.current;
    if (to < 0 || to === d.last) return;
    d.last = to;
    const next = new Set(d.base);
    const list = latest.current.items;
    for (let i = Math.min(d.anchor, to); i <= Math.max(d.anchor, to); i++) {
      const id = list[i]?.id;
      if (!id) continue;
      if (d.add) next.add(id);
      else next.delete(id);
    }
    useSelectionStore.setState({ selectedIds: next, isSelecting: true });
    void Haptics.selectionAsync();
  };

  const followFinger = () => {
    const f = drag.current.finger;
    if (f && drag.current.rects) applyRange(hitAt(f.x, f.y));
  };

  // ── Auto-scroll loop (JS frames; stops when the finger leaves the edge band) ──
  const tick = () => {
    const d = drag.current;
    d.frame = 0;
    if (!d.active || d.speed === 0) return;
    const { scroller: s } = latest.current;
    const next = Math.min(Math.max(d.offset + d.speed, 0), Math.max(s.getMaxOffset(), 0));
    if (next !== d.offset) {
      d.offset = next;
      s.scrollTo(next);
      followFinger();
      // Rows mounted by the scroll aren't in `rects` yet → re-measure now and then.
      if (!d.measuring && now() - d.measuredAt > REMEASURE_MS) {
        d.measuring = true;
        void measure().then((rects) => {
          d.measuring = false;
          d.measuredAt = now();
          if (!d.active) return;
          d.rects = rects;
          followFinger();
        });
      }
    }
    d.frame = requestAnimationFrame(tick);
  };

  const updateSpeed = (y: number) => {
    const d = drag.current;
    const { top, bottom } = latest.current.scroller.edges;
    const ramp = (depth: number) => Math.min(Math.max(depth / EDGE_ZONE, 0), 1) ** 2 * MAX_SPEED;
    d.speed = y < top + EDGE_ZONE ? -ramp(top + EDGE_ZONE - y) : y > bottom - EDGE_ZONE ? ramp(y - (bottom - EDGE_ZONE)) : 0;
    if (d.speed !== 0 && !d.frame) d.frame = requestAnimationFrame(tick);
  };

  const move = useCallback((x: number, y: number) => {
    const d = drag.current;
    if (!d.active) return;
    d.finger = { x, y };
    if (!d.rects) return; // still measuring — `begin` applies the latest finger
    followFinger();
    updateSpeed(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = useCallback(async (x: number, y: number, fromLongPress: boolean) => {
    const d = drag.current;
    d.active = true;
    d.rects = null;
    d.finger = { x, y };
    d.last = -1;
    d.speed = 0;
    d.offset = latest.current.scroller.getOffset();
    setDragging(true);

    const rects = await measure();
    if (!d.active) return;
    d.rects = rects;
    d.measuredAt = now();

    const start = hitAt(x, y);
    if (start < 0) {
      d.active = false;
      setDragging(false);
      return;
    }
    const { selectedIds } = useSelectionStore.getState();
    const startId = latest.current.items[start]?.id;
    d.anchor = start;
    d.base = new Set(selectedIds);
    // Hold → always selects; sideways drag from a selected tile → deselects.
    d.add = fromLongPress || !(startId && selectedIds.has(startId));
    if (fromLongPress) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    applyRange(start);
    // The finger may have moved while measuring.
    followFinger();
    if (d.finger) updateSpeed(d.finger.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  const end = useCallback(() => {
    const d = drag.current;
    d.endedAt = now();
    d.active = false;
    d.rects = null;
    d.speed = 0;
    if (d.frame) cancelAnimationFrame(d.frame);
    d.frame = 0;
    setDragging(false);
  }, []);

  useEffect(() => () => cancelAnimationFrame(drag.current.frame), []);

  const startHold = useCallback((x: number, y: number) => void begin(x, y, true), [begin]);
  const startSwipe = useCallback((x: number, y: number) => void begin(x, y, false), [begin]);

  const hold = usePanGesture({
    activateAfterLongPress: LONG_PRESS_MS,
    maxPointers: 1,
    onActivate: (e) => {
      "worklet";
      scheduleOnRN(startHold, e.absoluteX, e.absoluteY);
    },
    onUpdate: (e) => {
      "worklet";
      scheduleOnRN(move, e.absoluteX, e.absoluteY);
    },
    onDeactivate: () => {
      "worklet";
      scheduleOnRN(end);
    },
  });

  const swipe = usePanGesture({
    enabled: isSelecting,
    maxPointers: 1,
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onActivate: (e) => {
      "worklet";
      scheduleOnRN(startSwipe, e.absoluteX, e.absoluteY);
    },
    onUpdate: (e) => {
      "worklet";
      scheduleOnRN(move, e.absoluteX, e.absoluteY);
    },
    onDeactivate: () => {
      "worklet";
      scheduleOnRN(end);
    },
  });

  const gesture = useCompetingGestures(hold, swipe);
  /**
   * True during a drag-select and right after it: the tile's Pressable may still
   * fire `onPress` on release — ignore that tap (it would un-toggle the tile).
   */
  const swallowTap = useCallback(
    () => drag.current.active || now() - drag.current.endedAt < 250,
    [],
  );
  return { gesture, dragging, swallowTap };
}
