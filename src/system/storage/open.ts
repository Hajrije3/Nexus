import { NexusDatabase } from "./db";

export interface StorageHandle {
  db: NexusDatabase;
  /** False when IndexedDB was unavailable and an in-memory database is used instead. */
  persistent: boolean;
  /** Why storage is not persistent, if it isn't. */
  degradedReason?: string;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Open the system database.
 *
 * Falls back to an in-memory IndexedDB implementation (same code path, same
 * schema) when the browser refuses IndexedDB — e.g. some private-browsing
 * modes, disabled site data, or a corrupted profile. The caller is told, so
 * the UI can warn that changes won't survive a reload.
 */
export async function openStorage(name?: string): Promise<StorageHandle> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available");
    const db = new NexusDatabase(name);
    await db.open();
    // Ask the browser not to evict our data under storage pressure (best effort).
    void navigator.storage?.persist?.().catch(() => undefined);
    return { db, persistent: true };
  } catch (error) {
    const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
    const db = new NexusDatabase(`${name ?? "nexus"}-memory`, { indexedDB: new IDBFactory(), IDBKeyRange });
    await db.open();
    return { db, persistent: false, degradedReason: describe(error) };
  }
}

export interface StorageEstimate {
  usedBytes: number | null;
  quotaBytes: number | null;
}

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    const e = await navigator.storage?.estimate?.();
    return { usedBytes: e?.usage ?? null, quotaBytes: e?.quota ?? null };
  } catch {
    return { usedBytes: null, quotaBytes: null };
  }
}
