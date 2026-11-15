import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "system" | "light" | "dark";

/** Order of the options (account sheet → Appearance). */
export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

/**
 * Light / dark / system choice (web `ThemeProvider`, localStorage `theme`),
 * remembered across launches. Apply it once at the root with `useApplyThemeMode()`.
 */
export const useThemeMode = create<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>()(
  persist(
    (set) => ({
      mode: "system",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "tng.themeMode",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mode: s.mode }),
    },
  ),
);

/** Root layout: push the stored mode into NativeWind (drives `dark:` classes + `useTheme`). */
export function useApplyThemeMode() {
  const mode = useThemeMode((s) => s.mode);
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(mode);
  }, [mode, setColorScheme]);
}
