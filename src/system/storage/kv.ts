import type { NexusDatabase } from "./db";

/**
 * Small typed key-value store for system and app state (workspace session,
 * settings, seed markers). Values are structured-cloned by IndexedDB, so they
 * must be plain data. Reads go through a validator because stored data may
 * come from an older version of the app.
 */
export interface KeyValueStore {
  get<T>(key: string, validate: (value: unknown) => T | null): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createKeyValueStore(db: NexusDatabase, now: () => number = Date.now): KeyValueStore {
  return {
    async get(key, validate) {
      const record = await db.kv.get(key);
      if (!record) return null;
      return validate(record.value);
    },
    async set(key, value) {
      await db.kv.put({ key, value, updatedAt: now() });
    },
    async delete(key) {
      await db.kv.delete(key);
    },
  };
}
