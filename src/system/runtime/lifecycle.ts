/**
 * Application lifecycle manager.
 *
 * The only module that coordinates the process table and the window manager.
 * Desktop UI and applications call these functions; they never manipulate
 * instances and windows separately, so the two can never drift apart.
 * Lifecycle changes are published on the system event bus.
 */
import { createId } from "@/lib/utils";
import { windowManager as defaultWindowManager } from "@/system/window-manager/store";
import type { Rect, WindowId, WindowMode } from "@/system/window-manager/types";
import { systemEvents, type EventBus } from "@/system/events/bus";
import type { SystemEventMap } from "@/system/events/types";
import { appRegistry as defaultRegistry, type AppRegistry } from "./registry";
import { processTable as defaultProcessTable, type ProcessTable } from "./process-store";
import type { AppId, InstanceId, LaunchArgs, LaunchResult } from "./types";

type WindowManagerApi = typeof defaultWindowManager;

export interface LifecycleDeps {
  registry: AppRegistry;
  processes: ProcessTable;
  windows: WindowManagerApi;
  events?: EventBus<SystemEventMap>;
  now?: () => number;
}

/** Saved geometry/state used to re-open a window exactly as it was. */
export interface WindowSeed {
  title: string;
  bounds: Rect;
  mode: WindowMode;
  minimized: boolean;
}

export type RestoreResult = { ok: true; instanceId: InstanceId; windowIds: WindowId[] } | { ok: false; error: string };

export function createLifecycle({ registry, processes, windows, events, now = Date.now }: LifecycleDeps) {
  const wm = () => windows.getState();

  function windowsOfApp(appId: AppId): WindowId[] {
    const { stack, windows: all } = wm();
    return stack.filter((id) => all[id]?.appId === appId);
  }

  function openWindowFor(instanceId: InstanceId, seed?: Partial<WindowSeed>): LaunchResult {
    const instance = processes.get(instanceId);
    if (!instance) return { ok: false, error: `No running instance ${instanceId}` };
    const manifest = registry.get(instance.appId);
    if (!manifest) return { ok: false, error: `App ${instance.appId} is not installed` };

    const windowId: WindowId = createId("win");
    wm().open({
      id: windowId,
      appId: manifest.id,
      instanceId,
      title: seed?.title ?? manifest.name,
      size: seed?.bounds ?? manifest.window.defaultSize,
      minSize: manifest.window.minSize,
      resizable: manifest.window.resizable,
      ...(seed?.bounds ? { position: { x: seed.bounds.x, y: seed.bounds.y } } : {}),
      ...(seed?.mode ? { mode: seed.mode } : {}),
      ...(seed?.minimized !== undefined ? { minimized: seed.minimized } : {}),
      openedAt: now(),
    });
    processes.attachWindow(instanceId, windowId);
    events?.emit("window.opened", { windowId, appId: manifest.id, instanceId });
    return { ok: true, instanceId, windowId, reused: false };
  }

  function spawn(appId: AppId, args: LaunchArgs): InstanceId {
    const instanceId: InstanceId = createId("proc");
    processes.add({ instanceId, appId, windowIds: [], launchedAt: now(), args });
    return instanceId;
  }

  function launchApp(appId: AppId, args: LaunchArgs = {}): LaunchResult {
    const manifest = registry.get(appId);
    if (!manifest) return { ok: false, error: `App "${appId}" is not installed` };

    if (manifest.singleInstance) {
      const existing = processes.list().find((p) => p.appId === appId);
      const windowId = existing?.windowIds[existing.windowIds.length - 1];
      if (existing && windowId) {
        wm().focus(windowId);
        if (Object.keys(args).length > 0) {
          events?.emit("app.relaunched", { appId, instanceId: existing.instanceId, args });
        }
        return { ok: true, instanceId: existing.instanceId, windowId, reused: true };
      }
    }

    const instanceId = spawn(appId, args);
    events?.emit("app.launched", { appId, instanceId });
    const result = openWindowFor(instanceId);
    if (!result.ok) terminateInstance(instanceId);
    return result;
  }

  /** Re-create an instance with previously saved windows (session restore). */
  function restoreInstance(appId: AppId, args: LaunchArgs, seeds: readonly WindowSeed[]): RestoreResult {
    if (!registry.get(appId)) return { ok: false, error: `App "${appId}" is not installed` };
    if (seeds.length === 0) return { ok: false, error: "No windows to restore" };

    const instanceId = spawn(appId, args);
    events?.emit("app.launched", { appId, instanceId });
    const windowIds: WindowId[] = [];
    for (const seed of seeds) {
      const r = openWindowFor(instanceId, seed);
      if (r.ok) windowIds.push(r.windowId);
    }
    return { ok: true, instanceId, windowIds };
  }

  function terminateInstance(instanceId: InstanceId): void {
    const instance = processes.get(instanceId);
    if (!instance) return;
    for (const windowId of instance.windowIds) {
      wm().close(windowId);
      events?.emit("window.closed", { windowId, appId: instance.appId, instanceId });
    }
    processes.remove(instanceId);
    events?.emit("app.terminated", { appId: instance.appId, instanceId });
  }

  /** Close a window; the owning instance terminates with its last window. */
  function closeWindow(windowId: WindowId): void {
    const win = wm().windows[windowId];
    if (!win) return;
    const instanceId = win.instanceId as InstanceId;
    wm().close(windowId);
    processes.detachWindow(instanceId, windowId);
    events?.emit("window.closed", { windowId, appId: win.appId, instanceId });
    if (processes.get(instanceId)?.windowIds.length === 0) {
      processes.remove(instanceId);
      events?.emit("app.terminated", { appId: win.appId, instanceId });
    }
  }

  /**
   * Dock-click semantics:
   * - not running → launch
   * - focused     → minimise the focused window
   * - otherwise   → bring the app's topmost window forward (restoring if needed)
   */
  function activateApp(appId: AppId): LaunchResult {
    const ids = windowsOfApp(appId);
    const top = ids[ids.length - 1];
    if (!top) return launchApp(appId);

    const { focusedId, windows: all } = wm();
    const focused = focusedId ? all[focusedId] : undefined;
    const instanceId = all[top]?.instanceId as InstanceId;

    if (focused?.appId === appId && focusedId) {
      wm().minimize(focusedId);
      return { ok: true, instanceId: focused.instanceId as InstanceId, windowId: focusedId, reused: true };
    }

    const visible = ids.filter((id) => !all[id]?.minimized);
    const target = visible[visible.length - 1] ?? top;
    wm().focus(target);
    return { ok: true, instanceId, windowId: target, reused: true };
  }

  return { launchApp, restoreInstance, openWindowFor, closeWindow, terminateInstance, activateApp, windowsOfApp };
}

export type Lifecycle = ReturnType<typeof createLifecycle>;

export const lifecycle = createLifecycle({
  registry: defaultRegistry,
  processes: defaultProcessTable,
  windows: defaultWindowManager,
  events: systemEvents,
});
