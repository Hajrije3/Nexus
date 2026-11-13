import { describe, expect, it } from "vitest";
import { createKeyValueStore } from "@/system/storage/kv";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  parseSettings,
  resolveTheme,
  SETTINGS_KEY,
  startSettingsPersistence,
} from "../settings";

describe("parseSettings", () => {
  it("returns defaults for garbage", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and replaces invalid ones", () => {
    expect(parseSettings({ theme: "light", accent: "neon", wallpaper: "dusk", reduceMotion: "yes" })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "light",
      wallpaper: "dusk",
    });
  });
});

describe("resolveTheme", () => {
  it("follows the OS only for 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("startSettingsPersistence", () => {
  it("loads stored settings and saves changes", async () => {
    const kv = createKeyValueStore(createMemoryDatabase());
    await kv.set(SETTINGS_KEY, { theme: "light" });
    const store = createSettingsStore();
    const stop = await startSettingsPersistence(kv, store);
    expect(store.getState().settings.theme).toBe("light");

    store.getState().update({ accent: "teal" });
    await new Promise((r) => setTimeout(r, 20));
    expect(await kv.get(SETTINGS_KEY, parseSettings)).toMatchObject({ theme: "light", accent: "teal" });
    stop();
  });
});
