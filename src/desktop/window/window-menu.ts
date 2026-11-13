import { Maximize2, Minimize2, Minus, PanelLeft, PanelRight, X } from "lucide-react";
import { windowManager } from "@/system/window-manager/store";
import { lifecycle } from "@/system/runtime/lifecycle";
import type { WindowState } from "@/system/window-manager/types";
import type { MenuItem } from "../shell-store";

/** Window-level actions, shared by the title-bar context menu and shortcuts. */
export function windowMenuItems(win: WindowState): MenuItem[] {
  const wm = windowManager.getState();
  const maximized = win.mode === "maximized";
  return [
    { label: "Minimize", icon: Minus, shortcut: "Alt M", onSelect: () => wm.minimize(win.id) },
    {
      label: maximized ? "Restore" : "Maximize",
      icon: maximized ? Minimize2 : Maximize2,
      shortcut: "Alt ⇧ ↑",
      disabled: !win.resizable,
      onSelect: () => wm.toggleMaximize(win.id),
    },
    { kind: "separator" },
    {
      label: "Tile Left",
      icon: PanelLeft,
      shortcut: "Alt ⇧ ←",
      disabled: !win.resizable,
      onSelect: () => wm.setMode(win.id, "tiled-left"),
    },
    {
      label: "Tile Right",
      icon: PanelRight,
      shortcut: "Alt ⇧ →",
      disabled: !win.resizable,
      onSelect: () => wm.setMode(win.id, "tiled-right"),
    },
    { kind: "separator" },
    { label: "Close", icon: X, shortcut: "Alt W", danger: true, onSelect: () => lifecycle.closeWindow(win.id) },
  ];
}
