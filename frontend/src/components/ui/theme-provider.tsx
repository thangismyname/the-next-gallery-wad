"use client";

import * as React from "react";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: string | string[];
  defaultTheme?: string;
  enableSystem?: boolean;
  storageKey?: string;
  themes?: string[];
  forcedTheme?: string;
  enableColorScheme?: boolean;
  value?: Record<string, string>;
  disableTransitionOnChange?: boolean;
  nonce?: string;
  scriptProps?: React.ScriptHTMLAttributes<HTMLScriptElement>;
};

interface ThemeContextValue {
  theme: string;
  setTheme: (theme: string) => void;
  resolvedTheme: string | undefined;
  systemTheme: string | undefined;
  themes: string[];
  forcedTheme: string | undefined;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const MEDIA = "(prefers-color-scheme: dark)";

function getSystemTheme(): string {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(MEDIA).matches ? "dark" : "light";
}

function applyTheme(
  resolved: string,
  attribute: string | string[],
  value?: Record<string, string>,
  enableColorScheme?: boolean,
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const attrs = Array.isArray(attribute) ? attribute : [attribute];
  const v = value ? (value[resolved] ?? resolved) : resolved;
  attrs.forEach((attr) => {
    if (attr === "class") {
      root.classList.remove("light", "dark");
      if (v) root.classList.add(v);
    } else if (attr && attr.startsWith("data-")) {
      if (v) root.setAttribute(attr, v);
      else root.removeAttribute(attr);
    }
  });
  if (enableColorScheme !== false && (resolved === "light" || resolved === "dark")) {
    root.style.colorScheme = resolved;
  }
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  storageKey = "theme",
  themes,
  forcedTheme,
  enableColorScheme = true,
  value,
}: ThemeProviderProps) {
  const allThemes = React.useMemo(
    () => themes ?? (enableSystem ? ["light", "dark", "system"] : ["light", "dark"]),
    [themes, enableSystem],
  );

  const [theme, setThemeState] = React.useState<string>(() => {
    if (typeof window === "undefined") return defaultTheme;
    try {
      return localStorage.getItem(storageKey) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  const [systemTheme, setSystemTheme] = React.useState<string>(() => getSystemTheme());

  const resolvedTheme = React.useMemo(() => {
    if (forcedTheme) return forcedTheme;
    if (theme === "system" && enableSystem) return systemTheme;
    return theme;
  }, [theme, forcedTheme, enableSystem, systemTheme]);

  const setTheme = React.useCallback(
    (next: string) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  React.useEffect(() => {
    const resolved = forcedTheme ?? (theme === "system" && enableSystem ? systemTheme : theme);
    applyTheme(resolved, attribute, value, enableColorScheme);
  }, [theme, systemTheme, forcedTheme, enableSystem, attribute, value, enableColorScheme]);

  React.useEffect(() => {
    if (!enableSystem) return;
    const mq = window.matchMedia(MEDIA);
    const handler = () => setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [enableSystem]);

  React.useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) setThemeState(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey]);

  const ctx = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme: enableSystem ? systemTheme : undefined,
      themes: allThemes,
      forcedTheme,
    }),
    [theme, setTheme, resolvedTheme, systemTheme, enableSystem, allThemes, forcedTheme],
  );

  return <ThemeContext.Provider value={ctx}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "system",
      setTheme: () => {},
      resolvedTheme: "light",
      systemTheme: "light",
      themes: ["light", "dark"],
      forcedTheme: undefined,
    };
  }
  return ctx;
}
