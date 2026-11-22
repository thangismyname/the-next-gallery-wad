import AsyncStorage from "@react-native-async-storage/async-storage";
import { useWindowDimensions } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Cỡ chữ toàn app (account sheet → Appearance) — cùng 4 mức với web `lib/fontScale.ts` (15 / 16 / 18 / 20px). */
export type FontScale = "small" | "default" | "large" | "xlarge";

export const FONT_SCALES: Record<FontScale, number> = { small: 0.9375, default: 1, large: 1.125, xlarge: 1.25 };
export const FONT_SCALE_OPTIONS = Object.keys(FONT_SCALES) as FontScale[];

/** Áp dụng ở `components/ui/text.tsx` (mọi chữ đi qua Text). Nhân thêm trên cỡ chữ hệ thống (Dynamic Type). */
export const useFontScale = create<{ scale: FontScale; setScale: (scale: FontScale) => void }>()(
  persist((set) => ({ scale: "default", setScale: (scale) => set({ scale }) }), {
    name: "tng.fontScale",
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/** Hệ số chữ thực tế = cỡ chữ app × Dynamic Type của hệ thống — để layout chừa chỗ cho chữ to (trục biểu đồ, thẻ…). */
export function useTextFactor() {
  const app = FONT_SCALES[useFontScale((s) => s.scale)];
  return app * useWindowDimensions().fontScale;
}
