"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// ============================================================================
// Theme state. Dark is the default (it fits the live-map / civic vibe). The
// actual `data-theme` attribute is applied to <html> by a tiny blocking script
// in layout.tsx *before* hydration (so there's no flash and no mismatch). This
// provider simply mirrors that into React state for components that need to
// react to the theme at runtime (e.g. the map style) and writes changes back to
// the DOM + localStorage.
// ============================================================================

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

function readInitialTheme(): Theme {
  // Runs in the useState initializer — on the client (incl. during hydration)
  // it reads the attribute the blocking script already set, so state matches
  // the painted theme immediately. On the server `document` is undefined.
  if (typeof document !== "undefined") {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") return t;
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("pp-theme", t);
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
