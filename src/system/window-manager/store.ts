import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import * as ops from "./operations";
import type {
  OpenWindowOptions,
  Rect,
  SnapZone,
  WindowId,
  WindowManagerState,
  WindowMode,
  WindowState,
} from "./types";

export interface WindowManagerActions {
  open(opts: OpenWindowOptions): void;
  close(id: WindowId): void;
  focus(id: WindowId): void;
  blurAll(): void;
  minimize(id: WindowId): void;
  toggleMaximize(id: WindowId): void;
  setMode(id: WindowId, mode: WindowMode): void;
  setBounds(id: WindowId, rect: Rect): void;
  setTitle(id: WindowId, title: string): void;
  setWorkArea(rect: Rect): void;
  setSnapPreview(zone: SnapZone | null): void;
  cycleFocus(direction: 1 | -1): void;
}

export type WindowManagerStore = WindowManagerState & WindowManagerActions;

/** Placeholder until the desktop measures the real viewport on mount. */
const INITIAL_WORK_AREA: Rect = { x: 0, y: 30, width: 1280, height: 690 };

export function createWindowManagerStore(workArea: Rect = INITIAL_WORK_AREA) {
  return createStore<WindowManagerStore>()((set) => {
    const apply =
      <A extends unknown[]>(fn: (s: WindowManagerState, ...args: A) => WindowManagerState) =>
      (...args: A) =>
        set((s) => fn(s, ...args));

    return {
      ...ops.createInitialState(workArea),
      open: apply(ops.openWindow),
      close: apply(ops.closeWindow),
      focus: apply(ops.focusWindow),
      blurAll: apply(ops.blurAll),
      minimize: apply(ops.minimizeWindow),
      toggleMaximize: apply(ops.toggleMaximize),
      setMode: apply(ops.setWindowMode),
      setBounds: apply(ops.setWindowBounds),
      setTitle: apply(ops.setWindowTitle),
      setWorkArea: apply(ops.setWorkArea),
      setSnapPreview: apply(ops.setSnapPreview),
      cycleFocus: apply(ops.cycleFocus),
    };
  });
}

/** The single window manager instance for this browser session. */
export const windowManager = createWindowManagerStore();

export function useWindowManager<T>(selector: (s: WindowManagerStore) => T): T {
  return useStore(windowManager, selector);
}

export function useWindowState(id: WindowId): WindowState | undefined {
  return useStore(windowManager, (s) => s.windows[id]);
}
