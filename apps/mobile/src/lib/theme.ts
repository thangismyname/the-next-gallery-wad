import { DarkTheme, DefaultTheme, type Theme } from "expo-router/react-navigation";

/**
 * JS copy of the tokens in `global.css` — only for places that need a color value
 * instead of a className (React Navigation theme, native-only props such as
 * `android_ripple`, BlurView tint). Keep both in sync.
 */
export const THEME = {
  light: {
    background: "hsl(40 69% 98%)",
    foreground: "hsl(0 0% 4%)",
    card: "hsl(40 69% 98%)",
    cardForeground: "hsl(0 0% 4%)",
    popover: "hsl(40 69% 98%)",
    popoverForeground: "hsl(0 0% 4%)",
    primary: "hsl(0 0% 9%)",
    primaryForeground: "hsl(40 28% 98%)",
    secondary: "hsl(40 10% 94%)",
    secondaryForeground: "hsl(0 0% 9%)",
    muted: "hsl(40 10% 94%)",
    mutedForeground: "hsl(40 2% 44%)",
    accent: "hsl(40 10% 94%)",
    accentForeground: "hsl(0 0% 9%)",
    destructive: "hsl(357 100% 45%)",
    border: "hsl(40 6% 89%)",
    input: "hsl(40 6% 89%)",
    ring: "hsl(40 2% 63%)",
    radius: "0.625rem",
  },
  dark: {
    background: "hsl(0 0% 1%)",
    foreground: "hsl(0 0% 98%)",
    card: "hsl(0 0% 3%)",
    cardForeground: "hsl(0 0% 98%)",
    popover: "hsl(0 0% 3%)",
    popoverForeground: "hsl(0 0% 98%)",
    primary: "hsl(0 0% 90%)",
    primaryForeground: "hsl(0 0% 9%)",
    secondary: "hsl(0 0% 14%)",
    secondaryForeground: "hsl(0 0% 98%)",
    muted: "hsl(0 0% 14%)",
    mutedForeground: "hsl(0 0% 63%)",
    accent: "hsl(0 0% 14%)",
    accentForeground: "hsl(0 0% 98%)",
    destructive: "hsl(359 100% 70%)",
    border: "hsl(0 0% 11%)",
    input: "hsl(0 0% 16%)",
    ring: "hsl(0 0% 45%)",
    radius: "0.625rem",
  },
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};

