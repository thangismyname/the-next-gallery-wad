import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Tab Thí nghiệm: "steps" = 4 bước luận văn, "pipeline" = thứ tự chạy (PIPELINE). Nhớ lựa chọn; ‹ › ở chi tiết đi theo nó. */
export type ExperimentsView = "steps" | "pipeline";

export const useExperimentsView = create<{ view: ExperimentsView; setView: (view: ExperimentsView) => void }>()(
  persist((set) => ({ view: "steps", setView: (view) => set({ view }) }), {
    name: "tng.labExperimentsView",
    storage: createJSONStorage(() => AsyncStorage),
  }),
);
