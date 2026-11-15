import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GallerySort } from "@tng/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Library sort order (API `sort` param), remembered across launches. */
export const useGallerySort = create<{ sort: GallerySort; setSort: (sort: GallerySort) => void }>()(
  persist(
    (set) => ({
      sort: "newest",
      setSort: (sort) => set({ sort }),
    }),
    { name: "tng.gallerySort", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Menu order + i18n keys (`gallery.sort.*`, same as the web). */
export const SORT_OPTIONS: { value: GallerySort; labelKey: string }[] = [
  { value: "newest", labelKey: "gallery.sort.newest" },
  { value: "oldest", labelKey: "gallery.sort.oldest" },
  { value: "name_asc", labelKey: "gallery.sort.nameAsc" },
  { value: "name_desc", labelKey: "gallery.sort.nameDesc" },
];
