/**
 * Application lifecycle manager.
 *
 * The only module that coordinates the process table and the window manager.
 * Desktop UI and applications call these functions; they never manipulate
 * instances and windows separately, so the two can never drift apart.
 */
import { createId } from "@/lib/utils";
import { windowManager as defaultWindowManager } from "@/system/window-manager/store";
import type { WindowId } from "@/system/window-manager/types";
import { appRegistry as defaultRegistry, type AppRegistry } from "./registry";
import { processTable as defaultProcessTable, type ProcessTable } from "./process-store";
import type { AppId, InstanceId, LaunchArgs, LaunchResult } from "./types";

type WindowManagerApi = typeof defaultWindowManager;

export interface LifecycleDeps {
  registry: AppRegistry;
  processes: ProcessTable;
  windows: WindowManagerApi;
  now?: () => number;
}

export function createLifecycle({ registry, processes, windows, now = Date.now }: LifecycleDeps) {
  const wm = () => windows.getState();

  function windowsOfApp(appId: AppId): WindowId[] {
    const { stack, windows: all } = wm();
    return stack.filter((id) => all[id]?.appId === appId);
  }

  function openWindowFor(instanceId: InstanceId, title?: string): LaunchResult {
    const instance = processes.get(instanceId);
    if (!instance) return { ok: false, error: `No running instance ${instanceId}` };
    const manifest = registry.get(instance.appId);
    if (!manifest) return { ok: false, error: `App ${instance.appId} is not installed` };

    const windowId: WindowId = createId("win");
    wm().open({
      id: windowId,
      appId: manifest.id,
      instanceId,
      title: title ?? manifest.name,
      size: manifest.window.defaultSize,
      minSize: manifest.window.minSize,
      resizable: manifest.window.resizable,
      openedAt: now(),
    });
    processes.attachWindow(instanceId, windowId);
    return { ok: true, instanceId, windowId, reused: false };
  }

  function launchApp(appId: AppId, args: LaunchArgs = {}): LaunchResult {
    const manifest = registry.get(appId);
    if (!manifest) return { ok: false, error: `App "${appId}" is not installed` };

    if (manifest.singleInstance) {
      const existing = processes.list().find((p) => p.appId === appId);
      const windowId = existing?.windowIds[existing.windowIds.length - 1];
      if (existing && windowId) {
        wm().focus(windowId);
        return { ok: true, instanceId: existing.instanceId, windowId, reused: true };
      }
    }

    const instanceId: InstanceId = createId("proc");
    processes.add({ instanceId, appId, windowIds: [], launchedAt: now(), args });
    const result = openWindowFor(instanceId);
    if (!result.ok) processes.remove(instanceId);
    return result;
  }

  function terminateInstance(instanceId: InstanceId): void {
    const instance = processes.get(instanceId);
    if (!instance) return;
    for (const windowId of instance.windowIds) wm().close(windowId);
    processes.remove(instanceId);
  }

  /** Close a window; the owning instance terminates with its last window. */
  function closeWindow(windowId: WindowId): void {
    const win = wm().windows[windowId];
    if (!win) return;
    const instanceId = win.instanceId as InstanceId;
    wm().close(windowId);
    processes.detachWindow(instanceId, windowId);
    if (processes.get(instanceId)?.windowIds.length === 0) processes.remove(instanceId);
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

  return { launchApp, openWindowFor, closeWindow, terminateInstance, activateApp, windowsOfApp };
}

export type Lifecycle = ReturnType<typeof createLifecycle>;

export const lifecycle = createLifecycle({
  registry: defaultRegistry,
  processes: defaultProcessTable,
  windows: defaultWindowManager,
});
