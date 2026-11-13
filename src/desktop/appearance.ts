import { useEffect, useRef } from "react";
import { settingsStore, useSettings, type Settings, type EffectiveTheme } from "@/system/settings/settings";
import { getEffectiveTheme, useEffectiveTheme } from "@/system/settings/appearance";
import { systemEvents } from "@/system/events/bus";
import { ACCENT_SPECS, withAlpha } from "@/ui/theme";

/** Write theme, accent and motion preferences onto <html>. */
export function applyAppearance(settings: Settings, theme: EffectiveTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.reduceMotion = String(settings.reduceMotion);
  const accent = ACCENT_SPECS[settings.accent][theme];
  root.style.setProperty("--accent", accent.accent);
  root.style.setProperty("--accent-fg", accent.fg);
  root.style.setProperty("--accent-soft", withAlpha(accent.accent, theme === "dark" ? 0.14 : 0.1));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0d0e12" : "#e7e8ec");
}

export function applyCurrentAppearance(): void {
  applyAppearance(settingsStore.getState().settings, getEffectiveTheme());
}

/** Keep <html> in sync with settings and the OS theme; publish theme changes. */
export function useAppearanceSync(): void {
  const theme = useEffectiveTheme();
  const accent = useSettings((s) => s.accent);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const previous = useRef<EffectiveTheme | null>(null);

  useEffect(() => {
    applyAppearance({ ...settingsStore.getState().settings, accent, reduceMotion }, theme);
    if (previous.current !== null && previous.current !== theme) systemEvents.emit("theme.changed", { theme });
    previous.current = theme;
  }, [theme, accent, reduceMotion]);
}
