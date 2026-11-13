/**
 * Booted system services.
 *
 * Services that depend on async initialisation (storage, filesystem) are
 * installed here once by the boot sequence. Anything that runs after boot —
 * every application — can rely on them being present.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { VirtualFileSystem } from "./fs/vfs";
import type { KeyValueStore } from "./storage/kv";
import type { StorageHandle } from "./storage/open";

export interface SystemServices {
  storage: StorageHandle;
  kv: KeyValueStore;
  fs: VirtualFileSystem;
}

let services: SystemServices | null = null;

export function installServices(next: SystemServices): void {
  services = next;
  systemStatus.setState({
    storage: next.storage.persistent ? "persistent" : "memory",
    storageReason: next.storage.degradedReason ?? null,
  });
}

export function getServices(): SystemServices {
  if (!services) throw new Error("System services accessed before boot completed");
  return services;
}

export interface SystemStatus {
  storage: "booting" | "persistent" | "memory";
  storageReason: string | null;
}

export const systemStatus = createStore<SystemStatus>()(() => ({ storage: "booting", storageReason: null }));

export function useSystemStatus<T>(selector: (s: SystemStatus) => T): T {
  return useStore(systemStatus, selector);
}
