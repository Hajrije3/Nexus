import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWindowManagerStore } from "@/system/window-manager/store";
import { createAppRegistry, RegistryError } from "../registry";
import { createProcessTable } from "../process-store";
import { createLifecycle } from "../lifecycle";
import type { AppManifest } from "../types";

const Noop = () => null;

function manifest(id: string, extra: Partial<AppManifest> = {}): AppManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    description: "",
    icon: { glyph: "sparkles", tint: "#000" },
    permissions: [],
    window: { defaultSize: { width: 400, height: 300 }, minSize: { width: 200, height: 150 }, resizable: true },
    singleInstance: false,
    load: async () => ({ default: Noop }),
    ...extra,
  };
}

let registry: ReturnType<typeof createAppRegistry>;
let processes: ReturnType<typeof createProcessTable>;
let windows: ReturnType<typeof createWindowManagerStore>;
let lc: ReturnType<typeof createLifecycle>;

beforeEach(() => {
  registry = createAppRegistry();
  processes = createProcessTable();
  windows = createWindowManagerStore({ x: 0, y: 30, width: 1200, height: 700 });
  lc = createLifecycle({ registry, processes, windows, now: () => 1 });
  registry.register(manifest("nexus.multi"));
  registry.register(manifest("nexus.single", { singleInstance: true }));
});

describe("registry", () => {
  it("rejects duplicate and malformed ids", () => {
    expect(() => registry.register(manifest("nexus.multi"))).toThrow(RegistryError);
    expect(() => registry.register(manifest("NotDns"))).toThrow(RegistryError);
  });
});

describe("launchApp", () => {
  it("creates an instance and a window", () => {
    const r = lc.launchApp("nexus.multi");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(processes.get(r.instanceId)?.windowIds).toEqual([r.windowId]);
    expect(windows.getState().windows[r.windowId]?.instanceId).toBe(r.instanceId);
    expect(windows.getState().focusedId).toBe(r.windowId);
  });

  it("spawns separate instances for multi-instance apps", () => {
    lc.launchApp("nexus.multi");
    lc.launchApp("nexus.multi");
    expect(processes.list()).toHaveLength(2);
    expect(windows.getState().stack).toHaveLength(2);
  });

  it("reuses the running instance for single-instance apps", () => {
    const a = lc.launchApp("nexus.single");
    const b = lc.launchApp("nexus.single");
    expect(b.ok && b.reused).toBe(true);
    expect(a.ok && b.ok && a.instanceId === b.instanceId).toBe(true);
    expect(processes.list()).toHaveLength(1);
  });

  it("fails cleanly for unknown apps", () => {
    const r = lc.launchApp("nexus.missing");
    expect(r.ok).toBe(false);
    expect(processes.list()).toHaveLength(0);
  });
});

describe("closeWindow", () => {
  it("terminates the instance with its last window", () => {
    const r = lc.launchApp("nexus.multi");
    if (!r.ok) throw new Error("launch failed");
    const second = lc.openWindowFor(r.instanceId);
    if (!second.ok) throw new Error("open failed");

    lc.closeWindow(r.windowId);
    expect(processes.get(r.instanceId)?.windowIds).toEqual([second.windowId]);

    lc.closeWindow(second.windowId);
    expect(processes.get(r.instanceId)).toBeUndefined();
    expect(windows.getState().stack).toHaveLength(0);
  });
});

describe("terminateInstance", () => {
  it("closes every window of the instance", () => {
    const r = lc.launchApp("nexus.multi");
    if (!r.ok) throw new Error("launch failed");
    lc.openWindowFor(r.instanceId);
    lc.terminateInstance(r.instanceId);
    expect(windows.getState().stack).toHaveLength(0);
    expect(processes.list()).toHaveLength(0);
  });
});

describe("activateApp (dock click)", () => {
  it("launches when not running", () => {
    lc.activateApp("nexus.multi");
    expect(processes.list()).toHaveLength(1);
  });

  it("minimises when the app is focused, restores on the next click", () => {
    const r = lc.launchApp("nexus.multi");
    if (!r.ok) throw new Error("launch failed");
    lc.activateApp("nexus.multi");
    expect(windows.getState().windows[r.windowId]?.minimized).toBe(true);
    lc.activateApp("nexus.multi");
    expect(windows.getState().windows[r.windowId]?.minimized).toBe(false);
    expect(windows.getState().focusedId).toBe(r.windowId);
  });

  it("raises a background app instead of minimising it", () => {
    const a = lc.launchApp("nexus.multi");
    lc.launchApp("nexus.single");
    if (!a.ok) throw new Error("launch failed");
    lc.activateApp("nexus.multi");
    expect(windows.getState().focusedId).toBe(a.windowId);
    expect(windows.getState().windows[a.windowId]?.minimized).toBe(false);
  });
});

describe("lifecycle events", () => {
  it("publishes launch, window and termination events in order", async () => {
    const { EventBus } = await import("@/system/events/bus");
    const bus = new EventBus();
    const seen: string[] = [];
    bus.onAny((e) => seen.push(e.type));
    const withEvents = createLifecycle({ registry, processes, windows, events: bus, now: () => 1 });

    const r = withEvents.launchApp("nexus.multi");
    if (!r.ok) throw new Error("launch failed");
    withEvents.openWindowFor(r.instanceId);
    withEvents.terminateInstance(r.instanceId);

    expect(seen).toEqual([
      "app.launched",
      "window.opened",
      "window.opened",
      "window.closed",
      "window.closed",
      "app.terminated",
    ]);
  });

  it("emits app.terminated when the last window closes", async () => {
    const { EventBus } = await import("@/system/events/bus");
    const bus = new EventBus();
    const terminated = vi.fn();
    bus.on("app.terminated", terminated);
    const withEvents = createLifecycle({ registry, processes, windows, events: bus });
    const r = withEvents.launchApp("nexus.multi");
    if (!r.ok) throw new Error("launch failed");
    withEvents.closeWindow(r.windowId);
    expect(terminated).toHaveBeenCalledWith({ appId: "nexus.multi", instanceId: r.instanceId }, expect.anything());
  });
});
