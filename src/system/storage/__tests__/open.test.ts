import { describe, expect, it } from "vitest";
import { openStorage } from "../open";
import { createKeyValueStore } from "../kv";

describe("openStorage", () => {
  it("falls back to working in-memory storage when IndexedDB is unavailable", async () => {
    // Node has no global indexedDB, which is exactly the degraded case.
    const handle = await openStorage("fallback-test");
    expect(handle.persistent).toBe(false);
    expect(handle.degradedReason).toMatch(/IndexedDB/);

    const kv = createKeyValueStore(handle.db);
    await kv.set("k", { a: 1 });
    expect(await kv.get("k", (v) => v as { a: number })).toEqual({ a: 1 });
  });
});

describe("KeyValueStore", () => {
  it("returns null for missing keys and runs stored values through the validator", async () => {
    const { db } = await openStorage("kv-test");
    const kv = createKeyValueStore(db);
    expect(await kv.get("missing", () => 1)).toBeNull();
    await kv.set("n", "not a number");
    expect(await kv.get("n", (v) => (typeof v === "number" ? v : null))).toBeNull();
    await kv.delete("n");
    expect(await db.kv.count()).toBe(0);
  });
});
