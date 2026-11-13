import { useSyncExternalStore } from "react";
import { resolveTheme, settingsStore, type EffectiveTheme } from "./settings";

const QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  const unsub = settingsStore.subscribe(callback);
  return () => {
    media.removeEventListener("change", callback);
    unsub();
  };
}

export function getEffectiveTheme(): EffectiveTheme {
  return resolveTheme(settingsStore.getState().settings.theme, systemPrefersDark());
}

/** The theme actually in use ("system" resolved against the OS preference). */
export function useEffectiveTheme(): EffectiveTheme {
  return useSyncExternalStore(subscribe, getEffectiveTheme, () => "dark");
}
