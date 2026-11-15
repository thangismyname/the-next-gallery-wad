import AsyncStorage from "@react-native-async-storage/async-storage";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AlbumSearchResult, FriendSearchResult, MediaListItem } from "@tng/shared";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { friendsApi, mediaApi } from "@/services";

const DEBOUNCE_MS = 400;
const MAX_RECENT = 8;

export interface SearchResults {
  friends: FriendSearchResult[];
  albums: AlbumSearchResult[];
  /** Hybrid search (CLIP + content tags + YOLO), with `score` / `scoreParts`. */
  media: MediaListItem[];
  /** Photos with a matching YOLO object (`score` = confidence). */
  objects: MediaListItem[];
}

/** React Query keys — `useMediaActions` patches these after favorite / trash. */
export const searchKeys = {
  all: ["search"] as const,
  query: (q: string) => ["search", q] as const,
};

/**
 * Multi-source search like the web Spotlight (`useSpotlightSearch`): friends ·
 * albums · photos (hybrid) · objects in parallel, a failing source is just
 * empty. Debounced 400 ms; typing a new query aborts the old requests (React
 * Query `signal`) and keeps the previous results on screen until the new ones
 * arrive (no flicker). Cached per query, so going back to a query is instant.
 */
export function useSearch(input: string) {
  const [query, setQuery] = useState(input.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const result = useQuery({
    queryKey: searchKeys.query(query),
    enabled: query.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<SearchResults> => {
      const [friends, albums, media, objects] = await Promise.allSettled([
        friendsApi.searchFriend(query, signal),
        mediaApi.searchAlbums(query, signal),
        mediaApi.searchGallerySemantic(query, signal),
        mediaApi.searchGalleryObjects(query, signal),
      ]);
      const value = <T,>(r: PromiseSettledResult<T[]>) => (r.status === "fulfilled" ? r.value : []);
      return { friends: value(friends), albums: value(albums), media: value(media), objects: value(objects) };
    },
  });

  return {
    query,
    /** Still typing, or waiting for the current query's results. */
    pending: input.trim() !== query || (query.length > 0 && result.isFetching),
    results: query ? result.data : undefined,
    isError: result.isError,
  };
}

/** Last searches (newest first), remembered across launches. */
export const useRecentSearches = create<{
  recent: string[];
  add: (q: string) => void;
  remove: (q: string) => void;
  clear: () => void;
}>()(
  persist(
    (set) => ({
      recent: [],
      add: (q) => {
        const text = q.trim();
        if (text.length < 2) return;
        set((s) => ({
          recent: [text, ...s.recent.filter((r) => r.toLowerCase() !== text.toLowerCase())].slice(0, MAX_RECENT),
        }));
      },
      remove: (q) => set((s) => ({ recent: s.recent.filter((r) => r !== q) })),
      clear: () => set({ recent: [] }),
    }),
    { name: "tng.recentSearches", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
