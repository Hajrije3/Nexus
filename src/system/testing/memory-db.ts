import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { NexusDatabase } from "@/system/storage/db";

let n = 0;

/** A fresh, isolated in-memory database for tests. */
export function createMemoryDatabase(): NexusDatabase {
  return new NexusDatabase(`test-${++n}`, { indexedDB: new IDBFactory(), IDBKeyRange });
}
