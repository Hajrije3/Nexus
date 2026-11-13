/**
 * App SDK — window access.
 *
 * Applications use `useWindow()` to interact with the window that hosts them.
 * They never import the window manager store directly, so window behaviour
 * can change without touching any app.
 */
import { createContext, useContext } from "react";
import { windowManager, useWindowManager } from "@/system/window-manager/store";
import { lifecycle } from "@/system/runtime/lifecycle";
import type { WindowId } from "@/system/window-manager/types";
import type { InstanceId } from "@/system/runtime/types";

export interface WindowContextValue {
  windowId: WindowId;
  instanceId: InstanceId;
  appId: string;
  /**
   * Element covering the window's content area. Dialogs and popovers portal
   * here so they are scoped to their window (they move, minimise and stack
   * with it) instead of blocking the whole desktop.
   */
  portalContainer: HTMLElement | null;
}

export const WindowContext = createContext<WindowContextValue | null>(null);

export interface WindowHandle {
  windowId: WindowId;
  instanceId: InstanceId;
  isFocused: boolean;
  setTitle(title: string): void;
  close(): void;
  minimize(): void;
  toggleMaximize(): void;
}

export function useWindow(): WindowHandle {
  const ctx = useContext(WindowContext);
  if (!ctx) throw new Error("useWindow() must be used inside an application window");
  const { windowId, instanceId } = ctx;
  const isFocused = useWindowManager((s) => s.focusedId === windowId);

  return {
    windowId,
    instanceId,
    isFocused,
    setTitle: (title) => windowManager.getState().setTitle(windowId, title),
    close: () => lifecycle.closeWindow(windowId),
    minimize: () => windowManager.getState().minimize(windowId),
    toggleMaximize: () => windowManager.getState().toggleMaximize(windowId),
  };
}

/** Portal target for window-scoped overlays (null outside a window or before mount). */
export function useWindowPortal(): HTMLElement | null {
  return useContext(WindowContext)?.portalContainer ?? null;
}
