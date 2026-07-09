import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { DARK, LIGHT, Palette, spacing, radius, fonts, type } from "./tokens";

type Mode = "dark" | "light";
type ThemeShape = {
  mode: Mode;
  c: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  fonts: typeof fonts;
  type: typeof type;
  toggle: () => void;
  setMode: (m: Mode) => void;
};

const THEME_KEY = "cf_theme_mode";
const ThemeContext = createContext<ThemeShape | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("dark");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(THEME_KEY, "dark");
      if (saved === "light" || saved === "dark") setModeState(saved);
    })();
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    storage.setItem(THEME_KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      storage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const value: ThemeShape = {
    mode,
    c: mode === "dark" ? DARK : LIGHT,
    spacing,
    radius,
    fonts,
    type,
    toggle,
    setMode,
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
