import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import { VirtualFileSystem } from "@/system/fs/vfs";
import { EventBus } from "@/system/events/bus";
import type { SystemEventMap } from "@/system/events/types";
import { TextDocumentSession, type SaveState } from "../documents";

let fs: VirtualFileSystem;
let bus: EventBus<SystemEventMap>;
let states: SaveState[];

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  bus = new EventBus();
  fs = new VirtualFileSystem(createMemoryDatabase(), { events: bus, protectedPaths: [] });
  await fs.init();
  await fs.writeFile("/docs/a.md", "original", { createParents: true });
  states = [];
});

afterEach(() => vi.useRealTimers());

function open(callbacks = {}) {
  return new TextDocumentSession(fs, "/docs/a.md", bus, { onSaveState: (s) => states.push(s), ...callbacks }, 20);
}

describe("TextDocumentSession", () => {
  it("loads, autosaves after the debounce, and reports save states", async () => {
    const doc = open();
    expect(await doc.load()).toBe("original");
    doc.update("edited");
    expect(doc.saveState).toBe("dirty");
    await wait(60);
    expect(await fs.readText("/docs/a.md")).toBe("edited");
    expect(states).toEqual(["dirty", "saving", "saved"]);
    doc.dispose();
  });

  it("flush saves immediately; reverting to saved text cancels the save", async () => {
    const doc = open();
    await doc.load();
    doc.update("x");
    await doc.flush();
    expect(await fs.readText("/docs/a.md")).toBe("x");
    doc.update("y");
    doc.update("x");
    expect(doc.saveState).toBe("saved");
    doc.dispose();
  });

  it("reloads on external edits when clean, ignores its own saves", async () => {
    const onExternalChange = vi.fn();
    const doc = open({ onExternalChange });
    await doc.load();
    doc.update("mine");
    await doc.flush();
    await wait();
    expect(onExternalChange).not.toHaveBeenCalled();

    await fs.writeFile("/docs/a.md", "from terminal");
    await wait(10);
    expect(onExternalChange).toHaveBeenCalledWith("from terminal");
    doc.dispose();
  });

  it("keeps unsaved edits when the file changes underneath", async () => {
    const onExternalChange = vi.fn();
    const doc = open({ onExternalChange });
    await doc.load();
    doc.update("unsaved work");
    await fs.writeFile("/docs/a.md", "external");
    await wait(5);
    expect(onExternalChange).not.toHaveBeenCalled();
    await doc.flush();
    expect(await fs.readText("/docs/a.md")).toBe("unsaved work");
    doc.dispose();
  });

  it("follows moves of the file or its folder, and reports deletion", async () => {
    const onMoved = vi.fn();
    const onDeleted = vi.fn();
    const doc = open({ onMoved, onDeleted });
    await doc.load();
    await fs.rename("/docs", "/archive");
    expect(doc.path).toBe("/archive/a.md");
    expect(onMoved).toHaveBeenCalledWith("/archive/a.md");
    doc.update("after move");
    await doc.flush();
    expect(await fs.readText("/archive/a.md")).toBe("after move");

    await fs.remove("/archive", { recursive: true });
    expect(onDeleted).toHaveBeenCalled();
    doc.dispose();
  });

  it("reports save errors", async () => {
    const doc = new TextDocumentSession(
      { readText: async () => "", writeFile: async () => Promise.reject(new Error("quota")) },
      "/x",
      bus,
      { onSaveState: (s) => states.push(s) },
      5,
    );
    await doc.load();
    doc.update("x");
    await doc.flush();
    expect(doc.saveState).toBe("error");
    doc.dispose();
  });
});
