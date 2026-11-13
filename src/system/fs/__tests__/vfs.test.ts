import { beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "@/system/events/bus";
import type { SystemEvent, SystemEventMap } from "@/system/events/types";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import { VirtualFileSystem } from "../vfs";
import { FsError, type FsErrorCode } from "../errors";

let fs: VirtualFileSystem;
let events: SystemEvent[];

async function expectFsError(promise: Promise<unknown>, code: FsErrorCode) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof FsError && e.code === code);
}

beforeEach(async () => {
  const bus = new EventBus<SystemEventMap>();
  events = [];
  bus.onAny((e) => events.push(e));
  let clock = 1000;
  fs = new VirtualFileSystem(createMemoryDatabase(), { events: bus, now: () => clock++, protectedPaths: ["/", "/home"] });
  await fs.init();
});

describe("directories", () => {
  it("creates and lists directories, directories first in natural order", async () => {
    await fs.mkdir("/home");
    await fs.writeFile("/home/b.txt", "");
    await fs.mkdir("/home/z-dir");
    await fs.writeFile("/home/file10.txt", "");
    await fs.writeFile("/home/file2.txt", "");
    const names = (await fs.readdir("/home")).map((e) => e.name);
    expect(names).toEqual(["z-dir", "b.txt", "file2.txt", "file10.txt"]);
  });

  it("mkdir fails if the target exists or the parent is missing", async () => {
    await fs.mkdir("/a");
    await expectFsError(fs.mkdir("/a"), "EEXIST");
    await expectFsError(fs.mkdir("/missing/child"), "ENOENT");
  });

  it("mkdir -p creates the whole chain and is idempotent", async () => {
    await fs.mkdir("/a/b/c", { recursive: true });
    await fs.mkdir("/a/b/c", { recursive: true });
    expect((await fs.stat("/a/b/c")).type).toBe("directory");
    expect(events.filter((e) => e.type === "fs.created")).toHaveLength(3);
  });

  it("mkdir -p refuses to pass through a file", async () => {
    await fs.writeFile("/f", "x");
    await expectFsError(fs.mkdir("/f/sub", { recursive: true }), "ENOTDIR");
  });

  it("reports the root", async () => {
    const root = await fs.stat("/");
    expect(root).toMatchObject({ path: "/", name: "/", type: "directory" });
  });
});

describe("files", () => {
  it("writes, reads and overwrites with metadata", async () => {
    const created = await fs.writeFile("/notes.md", "héllo");
    expect(created).toMatchObject({ name: "notes.md", type: "file", size: 6, mimeType: "text/markdown" });
    expect(await fs.readText("/notes.md")).toBe("héllo");

    const updated = await fs.writeFile("/notes.md", "bye");
    expect(updated.id).toBe(created.id);
    expect(updated.size).toBe(3);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.modifiedAt).toBeGreaterThan(created.modifiedAt);
    expect(events.map((e) => e.type)).toEqual(["fs.created", "fs.modified"]);
  });

  it("stores binary data", async () => {
    const bytes = new Uint8Array([1, 2, 3, 255]).buffer;
    await fs.writeFile("/blob.bin", bytes);
    const data = await fs.readFile("/blob.bin");
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(data as ArrayBuffer)]).toEqual([1, 2, 3, 255]);
    expect((await fs.stat("/blob.bin")).size).toBe(4);
  });

  it("rejects file operations on directories and through files", async () => {
    await fs.mkdir("/dir");
    await fs.writeFile("/file", "");
    await expectFsError(fs.writeFile("/dir", "x"), "EISDIR");
    await expectFsError(fs.readFile("/dir"), "EISDIR");
    await expectFsError(fs.writeFile("/file/child", "x"), "ENOTDIR");
    await expectFsError(fs.readFile("/nope"), "ENOENT");
    expect(await fs.exists("/file/child")).toBe(false);
  });

  it("can create parent directories on write", async () => {
    await fs.writeFile("/deep/er/file.txt", "x", { createParents: true });
    expect(await fs.readText("/deep/er/file.txt")).toBe("x");
  });

  it("touch creates empty files and bumps mtime of existing ones", async () => {
    const a = await fs.touch("/t.txt");
    expect(a.size).toBe(0);
    const b = await fs.touch("/t.txt");
    expect(b.id).toBe(a.id);
    expect(b.modifiedAt).toBeGreaterThan(a.modifiedAt);
  });

  it("rejects invalid names", async () => {
    await expectFsError(fs.writeFile("/", "x"), "EISDIR");
    await expectFsError(fs.mkdir("/a/.."), "EEXIST"); // normalises to "/"
  });
});

describe("rename / move", () => {
  beforeEach(async () => {
    await fs.writeFile("/src/a.txt", "A", { createParents: true });
    await fs.writeFile("/src/sub/b.txt", "B", { createParents: true });
    await fs.mkdir("/dest");
  });

  it("renames a file, keeping identity and content", async () => {
    const before = await fs.stat("/src/a.txt");
    const after = await fs.rename("/src/a.txt", "/src/a.md");
    expect(after.id).toBe(before.id);
    expect(after.mimeType).toBe("text/markdown");
    expect(await fs.readText("/src/a.md")).toBe("A");
    expect(await fs.exists("/src/a.txt")).toBe(false);
  });

  it("moves a directory with its whole subtree in O(1) writes", async () => {
    await fs.rename("/src", "/dest/moved");
    expect(await fs.readText("/dest/moved/sub/b.txt")).toBe("B");
    expect(await fs.exists("/src")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "fs.moved", payload: { from: "/src", to: "/dest/moved", type: "directory" } });
  });

  it("refuses to overwrite, move into itself, or move protected paths", async () => {
    await fs.writeFile("/dest/a.txt", "");
    await expectFsError(fs.rename("/src/a.txt", "/dest/a.txt"), "EEXIST");
    await expectFsError(fs.rename("/src", "/src/sub/inside"), "EINVAL");
    await expectFsError(fs.rename("/src/a.txt", "/missing/a.txt"), "ENOENT");
    await fs.mkdir("/home");
    await expectFsError(fs.rename("/home", "/house"), "EPERM");
  });
});

describe("copy", () => {
  it("deep-copies a directory with new identities", async () => {
    await fs.writeFile("/p/x.txt", "X", { createParents: true });
    await fs.writeFile("/p/inner/y.txt", "Y", { createParents: true });
    const copy = await fs.copy("/p", "/p-copy");
    expect(copy.id).not.toBe((await fs.stat("/p")).id);
    expect(await fs.readText("/p-copy/inner/y.txt")).toBe("Y");

    // Independent: editing the copy leaves the original alone.
    await fs.writeFile("/p-copy/x.txt", "changed");
    expect(await fs.readText("/p/x.txt")).toBe("X");
  });

  it("refuses to copy into itself or onto an existing path", async () => {
    await fs.mkdir("/p");
    await fs.mkdir("/q");
    await expectFsError(fs.copy("/p", "/p/inner"), "EINVAL");
    await expectFsError(fs.copy("/p", "/q"), "EEXIST");
  });
});

describe("remove", () => {
  it("removes files and empty directories", async () => {
    await fs.writeFile("/f.txt", "x");
    await fs.mkdir("/empty");
    await fs.remove("/f.txt");
    await fs.remove("/empty");
    expect(await fs.readdir("/")).toEqual([]);
  });

  it("requires recursive for non-empty directories and removes everything with it", async () => {
    await fs.writeFile("/d/a/b/c.txt", "x", { createParents: true });
    await expectFsError(fs.remove("/d"), "ENOTEMPTY");
    await fs.remove("/d", { recursive: true });
    expect(await fs.exists("/d")).toBe(false);
    expect((await fs.usage()).files).toBe(0);
  });

  it("protects system paths", async () => {
    await expectFsError(fs.remove("/"), "EPERM");
  });

  it("leaves no partial state when a transaction fails", async () => {
    await fs.mkdir("/x");
    events = [];
    await expectFsError(fs.mkdir("/x"), "EEXIST");
    expect(events).toEqual([]);
  });
});

describe("traversal and search", () => {
  beforeEach(async () => {
    await fs.writeFile("/docs/report.md", "", { createParents: true });
    await fs.writeFile("/docs/old/report-2024.md", "", { createParents: true });
    await fs.writeFile("/code/Report.ts", "", { createParents: true });
    await fs.writeFile("/code/main.ts", "12345", { createParents: true });
  });

  it("walks depth-first", async () => {
    expect((await fs.walk("/docs")).map((e) => e.path)).toEqual(["/docs/old", "/docs/old/report-2024.md", "/docs/report.md"]);
  });

  it("searches case-insensitively with ranking and scoping", async () => {
    const all = await fs.search("report");
    expect(all.map((e) => e.path)).toEqual(["/code/Report.ts", "/docs/report.md", "/docs/old/report-2024.md"]);
    expect((await fs.search("report", { root: "/docs" })).map((e) => e.path)).toEqual([
      "/docs/report.md",
      "/docs/old/report-2024.md",
    ]);
    expect(await fs.search("old", { type: "file" })).toEqual([]);
    expect(await fs.search("  ")).toEqual([]);
  });

  it("reports usage", async () => {
    expect(await fs.usage()).toEqual({ files: 4, directories: 3, bytes: 5 });
  });
});
