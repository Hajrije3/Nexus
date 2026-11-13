import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import { createKeyValueStore } from "@/system/storage/kv";
import { VirtualFileSystem } from "../vfs";
import { seedFileSystem, SYSTEM_DIRECTORIES } from "../seed";

function setup() {
  const db = createMemoryDatabase();
  return { fs: new VirtualFileSystem(db), kv: createKeyValueStore(db) };
}

describe("seedFileSystem", () => {
  it("creates the standard layout and starter files on first boot", async () => {
    const { fs, kv } = setup();
    expect(await seedFileSystem(fs, kv)).toEqual({ seeded: true });
    for (const dir of SYSTEM_DIRECTORIES) expect((await fs.stat(dir)).type).toBe("directory");
    expect(await fs.readText("/home/user/Documents/Welcome.md")).toContain("Welcome to NEXUS");
    expect((await fs.readdir("/home/user/Projects/hello-world")).length).toBe(4);
  });

  it("does not resurrect starter files the user deleted", async () => {
    const { fs, kv } = setup();
    await seedFileSystem(fs, kv);
    await fs.remove("/home/user/Documents/Welcome.md");
    expect(await seedFileSystem(fs, kv)).toEqual({ seeded: false });
    expect(await fs.exists("/home/user/Documents/Welcome.md")).toBe(false);
  });

  it("restores missing system directories on every boot", async () => {
    const { fs, kv } = setup();
    await seedFileSystem(fs, kv);
    await fs.remove("/home/user/Pictures");
    await seedFileSystem(fs, kv);
    expect(await fs.exists("/home/user/Pictures")).toBe(true);
  });
});
