import { useColorScheme } from "nativewind";

import { THEME } from "@/lib/theme";

/**
 * Current color scheme + JS color tokens. Uses NativeWind's scheme (follows the
 * system by default) so `dark:` classes, `.dark:root` CSS variables and JS colors
 * always agree. `setColorScheme("light" | "dark" | "system")` for a theme toggle.
 */
export function useTheme() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  return {
    colorScheme: isDark ? ("dark" as const) : ("light" as const),
    isDark,
    colors: isDark ? THEME.dark : THEME.light,
    setColorScheme,
  };
}
