/**
 * App SDK — system information and administration.
 * Intended for privileged system apps (Settings declares `system:settings`).
 */
import { useEffect, useState } from "react";
import { getServices, useSystemStatus } from "@/system/services";
import { estimateStorage, type StorageEstimate } from "@/system/storage/open";
import type { FsUsage } from "@/system/fs/vfs";
import { systemEvents } from "@/system/events/bus";

export { useSettings, updateSettings } from "@/system/settings/settings";
export type { Settings, ThemePreference, AccentId, WallpaperId } from "@/system/settings/settings";
export { useEffectiveTheme } from "@/system/settings/appearance";

export interface StorageInfo {
  persistent: boolean;
  degradedReason: string | null;
  usage: FsUsage | null;
  estimate: StorageEstimate | null;
}

/** Storage status, filesystem usage and the browser's quota estimate (live). */
export function useStorageInfo(): StorageInfo {
  const storage = useSystemStatus((s) => s.storage);
  const reason = useSystemStatus((s) => s.storageReason);
  const [usage, setUsage] = useState<FsUsage | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getServices()
        .fs.usage()
        .then((u) => !cancelled && setUsage(u))
        .catch(() => undefined);
      estimateStorage().then((e) => !cancelled && setEstimate(e));
    };
    refresh();
    const offs = (["fs.created", "fs.modified", "fs.deleted"] as const).map((t) => systemEvents.on(t, refresh));
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, []);

  return { persistent: storage !== "memory", degradedReason: reason, usage, estimate };
}

/**
 * Permanently delete every file, setting and saved session, then restart.
 * The caller is responsible for confirming with the user first.
 */
export async function eraseAllData(): Promise<void> {
  const { storage } = getServices();
  storage.db.close();
  await storage.db.delete();
  window.location.reload();
}
