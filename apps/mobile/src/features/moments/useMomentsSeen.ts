import AsyncStorage from "@react-native-async-storage/async-storage";
import { laterIso } from "@tng/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type Seen = {
  /** Newest moment viewed so far (persisted). */
  seenUntil: string | null;
  /** The mark as loaded at app start — what "New" is computed against (stays put while swiping). */
  baseline: string | null;
  /** AsyncStorage loaded (before that every friend moment would look new). */
  ready: boolean;
  markSeen: (iso: string) => void;
};

/**
 * "Seen until" mark of the Moments feed (AsyncStorage `tng.momentsSeenUntil`, web =
 * localStorage, same key): friends' moments created after `baseline` get a "New"
 * badge + an rose ring in the filter row. Viewing a page moves `seenUntil` forward.
 */
export const useMomentsSeen = create<Seen>()(
  persist(
    (set) => ({
      seenUntil: null,
      baseline: null,
      ready: false,
      markSeen: (iso) => set((s) => ({ seenUntil: laterIso(s.seenUntil, iso) })),
    }),
    {
      name: "tng.momentsSeenUntil",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ seenUntil }) => ({ seenUntil }),
      onRehydrateStorage: () => (state) => {
        useMomentsSeen.setState({ baseline: state?.seenUntil ?? null, ready: true });
      },
    },
  ),
);
