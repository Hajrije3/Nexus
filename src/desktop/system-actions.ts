/**
 * Desktop-wide actions shared by menus, the launcher, and keyboard shortcuts.
 * Each is a thin composition of window-manager / lifecycle operations.
 */
import { windowManager } from "@/system/window-manager/store";
import { lifecycle } from "@/system/runtime/lifecycle";
import { processTable } from "@/system/runtime/process-store";

export function showDesktop(): void {
  const wm = windowManager.getState();
  for (const id of wm.stack) wm.minimize(id);
}

export function closeAllWindows(): void {
  for (const p of processTable.list()) lifecycle.terminateInstance(p.instanceId);
}

export function quitApp(appId: string): void {
  for (const p of processTable.list()) if (p.appId === appId) lifecycle.terminateInstance(p.instanceId);
}

export function closeFocusedWindow(): void {
  const id = windowManager.getState().focusedId;
  if (id) lifecycle.closeWindow(id);
}
