import { describe, expect, it, vi } from "vitest";
import type { AppManifest } from "../types";
import { appsForFile, openPath } from "../open";

const app = (id: string, fileHandlers: AppManifest["fileHandlers"]): AppManifest => ({
  id,
  name: id,
  version: "1",
  description: "",
  icon: { glyph: "sparkles", tint: "#000" },
  permissions: [],
  window: { defaultSize: { width: 1, height: 1 }, minSize: { width: 1, height: 1 }, resizable: true },
  singleInstance: false,
  load: async () => ({ default: () => null }),
  fileHandlers,
});

const notes = app("nexus.notes", [{ extensions: [".md", ".txt"], priority: 10 }]);
const code = app("nexus.code", [{ extensions: "*", textOnly: true, priority: 5 }]);
const viewer = app("nexus.viewer", [{ extensions: [".png"], priority: 10 }]);
const apps = [code, notes, viewer];

describe("appsForFile", () => {
  it("ranks handlers by priority", () => {
    expect(appsForFile("/a/readme.md", apps).map((a) => a.id)).toEqual(["nexus.notes", "nexus.code"]);
    expect(appsForFile("/a/main.ts", apps).map((a) => a.id)).toEqual(["nexus.code"]);
  });

  it("excludes text-only handlers for binary files", () => {
    expect(appsForFile("/p/photo.png", apps).map((a) => a.id)).toEqual(["nexus.viewer"]);
    expect(appsForFile("/p/archive.pdf", apps)).toEqual([]);
  });
});

describe("openPath", () => {
  const deps = (type: "file" | "directory", path: string) => ({
    fs: { stat: vi.fn(async () => ({ path, type }) as never) },
    registry: { list: () => apps, get: () => undefined },
    lifecycle: { launchApp: vi.fn(() => ({ ok: true, instanceId: "proc_1", windowId: "win_1", reused: false }) as const) },
  });

  it("opens directories in Files", async () => {
    const d = deps("directory", "/home/user");
    await openPath("/home/user", d);
    expect(d.lifecycle.launchApp).toHaveBeenCalledWith("nexus.files", { path: "/home/user" });
  });

  it("opens files in the default app or the requested one", async () => {
    const d = deps("file", "/n.md");
    await openPath("/n.md", d);
    expect(d.lifecycle.launchApp).toHaveBeenLastCalledWith("nexus.notes", { path: "/n.md" });
    await openPath("/n.md", d, { appId: "nexus.code" });
    expect(d.lifecycle.launchApp).toHaveBeenLastCalledWith("nexus.code", { path: "/n.md" });
  });

  it("reports unopenable files and missing paths", async () => {
    expect(await openPath("/x.pdf", deps("file", "/x.pdf"))).toMatchObject({ ok: false, error: expect.stringContaining("x.pdf") });
    const missing = deps("file", "/gone");
    missing.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await openPath("/gone", missing)).toEqual({ ok: false, error: "ENOENT" });
  });
});
