import { DOCK_RESERVED_HEIGHT, MENU_BAR_HEIGHT } from "@/system/window-manager/constants";
import type { Rect } from "@/system/window-manager/types";

/** Usable area for windows: the viewport minus the menu bar and dock. */
export function measureWorkArea(): Rect {
  return {
    x: 0,
    y: MENU_BAR_HEIGHT,
    width: window.innerWidth,
    height: Math.max(200, window.innerHeight - MENU_BAR_HEIGHT - DOCK_RESERVED_HEIGHT),
  };
}
