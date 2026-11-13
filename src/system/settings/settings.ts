/**
 * System settings: user preferences that affect the whole environment.
 *
 * Stored as one validated record in the key-value store. Settings hold only
 * identifiers (e.g. an accent id); the visual definitions live in `ui/theme.ts`,
 * keeping this module free of presentation details.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { KeyValueStore } from "@/system/storage/kv";

export const THEME_PREFERENCES = ["system", "dark", "light"] as const;
export const ACCENTS = ["indigo", "blue", "teal", "green", "amber", "rose", "graphite"] as const;
export const WALLPAPERS = ["aurora", "midnight", "dusk", "forest", "graphite", "mist"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type AccentId = (typeof ACCENTS)[number];
export type WallpaperId = (typeof WALLPAPERS)[number];
export type EffectiveTheme = "dark" | "light";

export interface Settings {
  theme: ThemePreference;
  accent: AccentId;
  wallpaper: WallpaperId;
  /** Disable window and UI animations regardless of the OS setting. */
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "indigo",
  wallpaper: "aurora",
  reduceMotion: false,
};

export const SETTINGS_KEY = "system.settings";

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && list.includes(v as T);

/** Merge valid stored fields over the defaults; ignore anything malformed. */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    theme: oneOf(THEME_PREFERENCES, r.theme) ? r.theme : DEFAULT_SETTINGS.theme,
    accent: oneOf(ACCENTS, r.accent) ? r.accent : DEFAULT_SETTINGS.accent,
    wallpaper: oneOf(WALLPAPERS, r.wallpaper) ? r.wallpaper : DEFAULT_SETTINGS.wallpaper,
    reduceMotion: typeof r.reduceMotion === "boolean" ? r.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
  };
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): EffectiveTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

interface SettingsState {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  replace(settings: Settings): void;
}

export function createSettingsStore(initial: Settings = DEFAULT_SETTINGS) {
  return createStore<SettingsState>()((set) => ({
    settings: initial,
    update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    replace: (settings) => set({ settings }),
  }));
}

export const settingsStore = createSettingsStore();

export function useSettings<T>(selector: (s: Settings) => T): T {
  return useStore(settingsStore, (s) => selector(s.settings));
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.getState().update(patch);
}

/** Load stored settings, then save every change. Returns a stop function. */
export async function startSettingsPersistence(
  kv: KeyValueStore,
  store = settingsStore,
  onError: (e: unknown) => void = (e) => console.error("[nexus] failed to save settings", e),
): Promise<() => void> {
  const stored = await kv.get(SETTINGS_KEY, parseSettings).catch(() => null);
  if (stored) store.getState().replace(stored);
  return store.subscribe((s, prev) => {
    if (s.settings !== prev.settings) kv.set(SETTINGS_KEY, s.settings).catch(onError);
  });
}
