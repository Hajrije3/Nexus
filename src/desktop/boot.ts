/**
 * Boot sequence. Runs once per page load:
 *
 *  1. Register built-in applications.
 *  2. Measure the work area (session restore needs real geometry).
 *  3. Open storage (IndexedDB, or in-memory fallback).
 *  4. Mount the filesystem and ensure the standard layout exists.
 *  5. Load settings and apply the appearance; install services and bridges.
 *  6. Restore the previous workspace session, or show Welcome on first boot.
 *  7. Start autosaving the session.
 */
import { appRegistry } from "@/system/runtime/registry";
import { lifecycle } from "@/system/runtime/lifecycle";
import { processTable } from "@/system/runtime/process-store";
import { windowManager } from "@/system/window-manager/store";
import { systemEvents } from "@/system/events/bus";
import { bridgeWindowFocusEvents } from "@/system/events/bridges";
import { openStorage } from "@/system/storage/open";
import { createKeyValueStore } from "@/system/storage/kv";
import { VirtualFileSystem } from "@/system/fs/vfs";
import { seedFileSystem } from "@/system/fs/seed";
import { installServices } from "@/system/services";
import { parseSession, restoreSession, SESSION_KEY } from "@/system/workspace/session";
import { startSessionPersistence } from "@/system/workspace/persistence";
import { startSettingsPersistence } from "@/system/settings/settings";
import { builtinApps } from "@/applications";
import { applyCurrentAppearance } from "./appearance";
import { measureWorkArea } from "./work-area";

export interface BootResult {
  persistent: boolean;
  restoredWindows: number;
  firstBoot: boolean;
}

let bootPromise: Promise<BootResult> | null = null;

/** Idempotent: StrictMode double effects and HMR share the same boot. */
export function bootSystem(): Promise<BootResult> {
  bootPromise ??= runBoot();
  return bootPromise;
}

function registerBuiltinApps(): void {
  for (const manifest of builtinApps) {
    if (!appRegistry.get(manifest.id)) appRegistry.register(manifest);
  }
}

async function runBoot(): Promise<BootResult> {
  registerBuiltinApps();
  windowManager.getState().setWorkArea(measureWorkArea());

  const storage = await openStorage();
  const kv = createKeyValueStore(storage.db);
  const fs = new VirtualFileSystem(storage.db, { events: systemEvents });
  await seedFileSystem(fs, kv);

  // Settings load before the desktop paints, so the theme never flashes.
  await startSettingsPersistence(kv);
  applyCurrentAppearance();

  installServices({ storage, kv, fs });
  if (!storage.persistent) {
    systemEvents.emit("storage.degraded", { reason: storage.degradedReason ?? "unknown" });
  }
  bridgeWindowFocusEvents(windowManager, systemEvents);

  // A missing or unreadable session is not fatal — start fresh.
  const snapshot = await kv.get(SESSION_KEY, parseSession).catch((error: unknown) => {
    console.warn("[nexus] could not read saved workspace", error);
    return null;
  });

  let restoredWindows = 0;
  if (snapshot) {
    const summary = restoreSession(snapshot, {
      lifecycle,
      restoreStack: (order, focused) => windowManager.getState().restoreStack(order, focused),
    });
    restoredWindows = summary.windows;
    systemEvents.emit("workspace.restored", summary);
  } else {
    lifecycle.launchApp("nexus.welcome");
  }

  const persistence = startSessionPersistence({ kv, windows: windowManager, processes: processTable });
  // Best effort: flush pending saves when the page is hidden or closed.
  const flush = () => void persistence.flush();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());

  return { persistent: storage.persistent, restoredWindows, firstBoot: snapshot === null };
}
