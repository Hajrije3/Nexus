import type { StoreApi } from "zustand/vanilla";
import type { WindowManagerStore } from "@/system/window-manager/store";
import type { EventBus, Unsubscribe } from "./bus";
import type { SystemEventMap } from "./types";

/**
 * The window manager is a pure state machine and knows nothing about events.
 * This bridge observes it and publishes focus changes on the bus.
 */
export function bridgeWindowFocusEvents(
  windows: StoreApi<WindowManagerStore>,
  bus: EventBus<SystemEventMap>,
): Unsubscribe {
  let last = windows.getState().focusedId;
  return windows.subscribe((state) => {
    if (state.focusedId === last) return;
    last = state.focusedId;
    const win = last ? state.windows[last] : undefined;
    bus.emit("window.focused", { windowId: last, appId: win?.appId ?? null });
  });
}
