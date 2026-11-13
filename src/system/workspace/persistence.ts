import type { StoreApi } from "zustand/vanilla";
import type { KeyValueStore } from "@/system/storage/kv";
import type { WindowManagerStore } from "@/system/window-manager/store";
import type { ProcessTable } from "@/system/runtime/process-store";
import { captureSession, SESSION_KEY } from "./session";

export interface SessionPersistenceDeps {
  kv: KeyValueStore;
  windows: StoreApi<WindowManagerStore>;
  processes: ProcessTable;
  debounceMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

/**
 * Autosave the workspace session whenever windows or processes change.
 *
 * Writes are debounced so a burst of changes (closing several windows,
 * resizing the browser) produces one write. Only persistable state is
 * compared — transient fields like the snap preview never trigger a save.
 * Returns a handle to flush (on page hide) and stop.
 */
export function startSessionPersistence({
  kv,
  windows,
  processes,
  debounceMs = 400,
  now = Date.now,
  onError = (e) => console.error("[nexus] failed to save workspace", e),
}: SessionPersistenceDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSerialized = "";

  const save = async () => {
    timer = null;
    const snapshot = captureSession(windows.getState(), processes.list(), now());
    // Compare without the timestamp so unchanged state isn't rewritten.
    const serialized = JSON.stringify(snapshot.instances);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    try {
      await kv.set(SESSION_KEY, snapshot);
    } catch (error) {
      lastSerialized = ""; // retry on the next change
      onError(error);
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), debounceMs);
  };

  // Seed with the current state so starting persistence doesn't trigger a write.
  lastSerialized = JSON.stringify(captureSession(windows.getState(), processes.list(), now()).instances);

  const unsubWindows = windows.subscribe((s, prev) => {
    if (s.windows !== prev.windows || s.stack !== prev.stack || s.focusedId !== prev.focusedId) schedule();
  });
  const unsubProcesses = processes.store.subscribe(schedule);

  return {
    /** Save immediately if a save is pending. */
    flush(): Promise<void> {
      if (!timer) return Promise.resolve();
      clearTimeout(timer);
      return save();
    },
    stop(): void {
      if (timer) clearTimeout(timer);
      unsubWindows();
      unsubProcesses();
    },
  };
}
