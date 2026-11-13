import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import { VirtualFileSystem } from "@/system/fs/vfs";
import { splitExtension, uniqueName } from "@/system/fs/names";
import { pasteInto, setFileClipboard, useFileClipboard } from "../clipboard";

describe("uniqueName", () => {
  it("numbers folders and copies", () => {
    expect(uniqueName("untitled folder", new Set())).toBe("untitled folder");
    expect(uniqueName("untitled folder", new Set(["untitled folder", "untitled folder 2"]))).toBe("untitled folder 3");
    expect(uniqueName("notes.md", new Set(["notes.md"]), "copy")).toBe("notes copy.md");
    expect(uniqueName("notes.md", new Set(["notes.md", "notes copy.md"]), "copy")).toBe("notes copy 2.md");
  });

  it("splits extensions but not dotfiles", () => {
    expect(splitExtension("a.tar.gz")).toEqual(["a.tar", ".gz"]);
    expect(splitExtension(".bashrc")).toEqual([".bashrc", ""]);
  });
});

describe("pasteInto", () => {
  let fs: VirtualFileSystem;
  beforeEach(async () => {
    fs = new VirtualFileSystem(createMemoryDatabase(), { protectedPaths: [] });
    await fs.init();
    await fs.writeFile("/a/one.txt", "1", { createParents: true });
    await fs.writeFile("/a/sub/two.txt", "2", { createParents: true });
    await fs.mkdir("/b");
  });

  it("copies with non-conflicting names", async () => {
    const r1 = await pasteInto(fs, { mode: "copy", paths: ["/a/one.txt"] }, "/a");
    const r2 = await pasteInto(fs, { mode: "copy", paths: ["/a/one.txt"] }, "/a");
    expect([...r1.pasted, ...r2.pasted]).toEqual(["/a/one copy.txt", "/a/one copy 2.txt"]);
    expect(await fs.readText("/a/one copy.txt")).toBe("1");
  });

  it("moves on cut, then clears the clipboard", async () => {
    setFileClipboard({ mode: "cut", paths: ["/a/sub"] });
    const entry = useFileClipboard.getState().entry!;
    const r = await pasteInto(fs, entry, "/b");
    expect(r.pasted).toEqual(["/b/sub"]);
    expect(await fs.exists("/a/sub")).toBe(false);
    expect(useFileClipboard.getState().entry).toBeNull();
  });

  it("treats cutting into the same folder as a no-op and reports moves into self", async () => {
    const same = await pasteInto(fs, { mode: "cut", paths: ["/a/one.txt"] }, "/a");
    expect(same).toEqual({ pasted: [], errors: [] });
    const self = await pasteInto(fs, { mode: "cut", paths: ["/a"] }, "/a/sub");
    expect(self.errors[0]?.message).toMatch(/into itself/);
  });
});
