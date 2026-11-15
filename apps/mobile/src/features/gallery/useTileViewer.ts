import type { FlashListRef } from "@shopify/flash-list";
import type { MediaListItem } from "@tng/shared";
import { useCallback, useRef, useState, type RefObject } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TileNode } from "./components/MediaTile";
import type { Rect } from "./lightbox/geometry";

/**
 * Grid ↔ Lightbox plumbing for a row-virtualized grid (FlashList of rows of
 * `columns` tiles): tiles register their native node, the Lightbox opens from a
 * tile's rect, keeps the viewed photo's row on screen behind it, and flies back
 * to that tile on close (`getTileRect`). `topInset` = what covers the top of the
 * list (safe area + floating bar).
 */
export function useTileViewer<T extends MediaListItem>({
  items,
  columns,
  listRef,
  topInset,
}: {
  items: T[];
  columns: number;
  listRef: RefObject<FlashListRef<T[]> | null>;
  topInset: number;
}) {
  const { height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const tiles = useRef(new Map<string, TileNode>());
  const [viewer, setViewer] = useState<{ id: string; rect: Rect } | null>(null);

  const registerTile = useCallback((id: string, node: TileNode | null) => {
    if (node) tiles.current.set(id, node);
    else tiles.current.delete(id);
  }, []);

  const measureTile = useCallback(
    (id: string) =>
      new Promise<Rect | null>((resolve) => {
        const node = tiles.current.get(id);
        if (!node) return resolve(null);
        node.measureInWindow((x, y, w, h) => resolve(w > 0 ? { x, y, width: w, height: h } : null));
      }),
    [],
  );

  /** Keep the viewed photo's row on screen behind the Lightbox (close flies back to it). */
  const revealTile = useCallback(
    async (id: string) => {
      const rect = await measureTile(id);
      if (rect && rect.y >= topInset && rect.y + rect.height <= height - bottom) return;
      const i = items.findIndex((m) => m.id === id);
      if (i >= 0) await listRef.current?.scrollToIndex({ index: Math.floor(i / columns), animated: false, viewPosition: 0.5 });
    },
    [measureTile, items, columns, listRef, topInset, bottom, height],
  );

  const getTileRect = useCallback(
    async (id: string) => {
      await revealTile(id);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = await measureTile(id);
      return rect && rect.y + rect.height > 0 && rect.y < height ? rect : null;
    },
    [revealTile, measureTile, height],
  );

  return { tiles, registerTile, viewer, setViewer, revealTile, getTileRect };
}
