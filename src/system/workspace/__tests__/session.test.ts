import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWindowManagerStore } from "@/system/window-manager/store";
import { createAppRegistry } from "@/system/runtime/registry";
import { createProcessTable } from "@/system/runtime/process-store";
import { createLifecycle } from "@/system/runtime/lifecycle";
import type { AppManifest } from "@/system/runtime/types";
import { createKeyValueStore } from "@/system/storage/kv";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import { captureSession, parseSession, restoreSession, SESSION_KEY } from "../session";
import { startSessionPersistence } from "../persistence";

const manifest = (id: string, extra: Partial<AppManifest> = {}): AppManifest => ({
  id,
  name: id,
  version: "1.0.0",
  description: "",
  icon: { glyph: "sparkles", tint: "#000" },
  permissions: [],
  window: { defaultSize: { width: 400, height: 300 }, minSize: { width: 200, height: 150 }, resizable: true },
  singleInstance: false,
  load: async () => ({ default: () => null }),
  ...extra,
});

function system() {
  const registry = createAppRegistry();
  const processes = createProcessTable();
  const windows = createWindowManagerStore({ x: 0, y: 30, width: 1200, height: 700 });
  const lifecycle = createLifecycle({ registry, processes, windows, now: () => 1 });
  registry.register(manifest("nexus.a"));
  registry.register(manifest("nexus.b"));
  return { registry, processes, windows, lifecycle };
}

describe("session capture → restore", () => {
  it("round-trips windows, modes, minimised state, z-order and focus", () => {
    const src = system();
    const a = src.lifecycle.launchApp("nexus.a", { file: "/x.md" });
    const b = src.lifecycle.launchApp("nexus.b");
    const a2 = src.lifecycle.launchApp("nexus.a");
    if (!a.ok || !b.ok || !a2.ok) throw new Error("launch failed");
    const wm = src.windows.getState();
    wm.setBounds(a.windowId, { x: 40, y: 60, width: 500, height: 350 });
    wm.setMode(b.windowId, "tiled-right");
    wm.minimize(a2.windowId);
    wm.focus(a.windowId); // setMode also raised b, so bottom→top: a2, b, a ; focus a

    const snapshot = parseSession(JSON.parse(JSON.stringify(captureSession(src.windows.getState(), src.processes.list(), 5))));
    expect(snapshot).not.toBeNull();

    const dst = system();
    const summary = restoreSession(snapshot!, {
      lifecycle: dst.lifecycle,
      restoreStack: (order, focused) => dst.windows.getState().restoreStack(order, focused),
    });
    expect(summary).toEqual({ windows: 3, skippedApps: [] });

    const s = dst.windows.getState();
    const byTitleAndMode = s.stack.map((id) => {
      const w = s.windows[id]!;
      return [w.appId, w.mode, w.minimized];
    });
    expect(byTitleAndMode).toEqual([
      ["nexus.a", "normal", true],
      ["nexus.b", "tiled-right", false],
      ["nexus.a", "normal", false],
    ]);
    const top = s.windows[s.stack[2]!]!;
    expect(top.bounds).toEqual({ x: 40, y: 60, width: 500, height: 350 });
    expect(s.focusedId).toBe(top.id);
    expect(dst.processes.list().map((p) => p.args)).toContainEqual({ file: "/x.md" });
  });

  it("skips apps that are no longer installed", () => {
    const src = system();
    src.lifecycle.launchApp("nexus.a");
    src.lifecycle.launchApp("nexus.b");
    const snapshot = captureSession(src.windows.getState(), src.processes.list(), 0);

    const dst = system();
    dst.registry.unregister("nexus.b");
    const summary = restoreSession(snapshot, {
      lifecycle: dst.lifecycle,
      restoreStack: (o, f) => dst.windows.getState().restoreStack(o, f),
    });
    expect(summary).toEqual({ windows: 1, skippedApps: ["nexus.b"] });
  });
});

describe("parseSession", () => {
  it.each([null, 42, "x", {}, { version: 2, instances: [] }, { version: 1 }])("rejects %j", (raw) => {
    expect(parseSession(raw)).toBeNull();
  });

  it("drops malformed windows and instances but keeps valid ones", () => {
    const parsed = parseSession({
      version: 1,
      savedAt: 1,
      instances: [
        { appId: "nexus.a", args: { ok: 1, bad: { nested: true } }, windows: [{ title: "A", bounds: { x: 0, y: 0, width: 10, height: 10 }, mode: "normal", z: 0 }] },
        { appId: "nexus.b", windows: [{ title: "B", bounds: { x: 0, y: 0, width: -1, height: 10 }, mode: "normal", z: 1 }] },
        { appId: 7, windows: [] },
      ],
    });
    expect(parsed?.instances).toHaveLength(1);
    expect(parsed?.instances[0]?.args).toEqual({ ok: 1 });
  });
});

describe("startSessionPersistence", () => {
  beforeEach(() => vi.useFakeTimers());

  it("debounces saves and skips unchanged state", async () => {
    const sys = system();
    const db = createMemoryDatabase();
    const kv = createKeyValueStore(db);
    const set = vi.spyOn(kv, "set");
    const persistence = startSessionPersistence({ kv, windows: sys.windows, processes: sys.processes, debounceMs: 100 });

    const r = sys.lifecycle.launchApp("nexus.a");
    if (!r.ok) throw new Error();
    sys.windows.getState().setBounds(r.windowId, { x: 10, y: 40, width: 300, height: 200 });
    sys.windows.getState().setSnapPreview("left"); // transient: must not count
    await vi.advanceTimersByTimeAsync(150);
    expect(set).toHaveBeenCalledTimes(1);

    sys.windows.getState().setSnapPreview(null);
    await vi.advanceTimersByTimeAsync(150);
    expect(set).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    const stored = await kv.get(SESSION_KEY, parseSession);
    expect(stored?.instances[0]?.windows[0]?.bounds).toEqual({ x: 10, y: 40, width: 300, height: 200 });
    persistence.stop();
  });
});
