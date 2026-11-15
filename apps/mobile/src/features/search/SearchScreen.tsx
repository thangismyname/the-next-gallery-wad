import { Portal } from "@rn-primitives/portal";
import type { MediaListItem } from "@tng/shared";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View, useWindowDimensions, type TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { TileNode } from "@/features/gallery/components/MediaTile";
import type { Rect } from "@/features/gallery/lightbox/geometry";
import { Lightbox } from "@/features/gallery/lightbox/Lightbox";

import { SearchField } from "./components/SearchField";
import { SearchHome } from "./components/SearchHome";
import { SearchResultsView, type ResultList } from "./components/SearchResultsView";
import { useRecentSearches, useSearch } from "./useSearch";

const BAR = 44;
const EMPTY: MediaListItem[] = [];

/**
 * Search (pushed from the header 🔍, swipe back to leave): glass search pill on
 * top, content scrolls under it. Empty → recent searches + AI categories +
 * common objects; typing → the web Spotlight's multi-source search
 * (`useSearch`). Photo results open the Lightbox (favorite / trash update the
 * results too). The query is saved to "recent" when submitted or a result is
 * opened.
 */
export function SearchScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [input, setInput] = useState("");
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { query, pending, results, isError } = useSearch(input);
  const addRecent = useRecentSearches((s) => s.add);

  const contentWidth = width - insets.left - insets.right;

  // ── Lightbox over a result grid ───────────────────────────────────────────
  const [viewer, setViewer] = useState<{ list: ResultList; id: string; rect: Rect } | null>(null);
  const tiles = useRef(new Map<string, TileNode>());
  const registerMedia = useCallback((id: string, node: TileNode | null) => {
    if (node) tiles.current.set(`media:${id}`, node);
    else tiles.current.delete(`media:${id}`);
  }, []);
  const registerObjects = useCallback((id: string, node: TileNode | null) => {
    if (node) tiles.current.set(`objects:${id}`, node);
    else tiles.current.delete(`objects:${id}`);
  }, []);
  const registerTile = useCallback(
    (list: ResultList) => (list === "media" ? registerMedia : registerObjects),
    [registerMedia, registerObjects],
  );
  const open = useCallback(
    (list: ResultList, item: MediaListItem, rect: Rect) => {
      addRecent(query);
      inputRef.current?.blur();
      setViewer({ list, id: item.id, rect });
    },
    [addRecent, query],
  );
  const viewerList = viewer && results ? results[viewer.list] : EMPTY;
  const getTileRect = useCallback(
    (id: string) =>
      new Promise<Rect | null>((resolve) => {
        const node = viewer ? tiles.current.get(`${viewer.list}:${id}`) : undefined;
        if (!node) return resolve(null);
        node.measureInWindow((x, y, w, h) =>
          resolve(w > 0 && y + h > 0 && y < height ? { x, y, width: w, height: h } : null),
        );
      }),
    [viewer, height],
  );

  const pick = (q: string) => {
    setInput(q);
    addRecent(q);
  };

  const top = insets.top + 8 + BAR + 16;
  const body = useMemo(() => {
    if (!query) return <SearchHome width={contentWidth} onPick={pick} />;
    if (isError) return <Text className="px-6 pt-16 text-center text-[15px] text-muted-foreground">{t("search.error")}</Text>;
    if (!results) return null;
    return (
      <SearchResultsView
        results={results}
        width={contentWidth}
        onOpen={open}
        registerTile={registerTile}
        onAlbum={(id) => router.push({ pathname: "/albums/[id]", params: { id } })}
        onFriend={(friend) => router.push({ pathname: "/friends", params: { q: friend.email || friend.name } })}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results, isError, contentWidth, open, registerTile, t]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: top,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {body}
      </ScrollView>

      {/* Floating glass bar: back · search field. */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0 flex-row items-center gap-2.5"
        style={{ paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}
      >
        <GlassButton size={BAR} accessibilityLabel={t("common.back")} onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </GlassButton>
        <SearchField
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={() => addRecent(input)}
          pending={pending}
        />
      </View>

      {viewer && viewerList.some((m) => m.id === viewer.id) ? (
        <Portal name="search-lightbox">
          <Lightbox
            items={viewerList}
            startId={viewer.id}
            originRect={viewer.rect}
            getTileRect={getTileRect}
            onEndReached={noop}
            onClose={() => setViewer(null)}
          />
        </Portal>
      ) : null}
    </View>
  );
}

const noop = () => {};
