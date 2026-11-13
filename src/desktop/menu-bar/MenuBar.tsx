"use client";

import { Activity, EyeOff, Info, Search, X } from "lucide-react";
import { useWindowManager } from "@/system/window-manager/store";
import { useAppManifest } from "@/system/runtime/registry";
import { lifecycle } from "@/system/runtime/lifecycle";
import { MENU_BAR_HEIGHT } from "@/system/window-manager/constants";
import { NexusMark } from "@/ui/NexusMark";
import { Kbd, modKeyLabel } from "@/ui/Kbd";
import { cn } from "@/lib/utils";
import { useShell } from "../shell-store";
import { closeContextMenu, openContextMenu, useContextMenuStore } from "@/system/sdk/context-menu";
import { closeAllWindows, showDesktop } from "../system-actions";
import { Clock } from "./Clock";
import { StorageIndicator } from "./StorageIndicator";

const SYSTEM_MENU = "System";

export function MenuBar() {
  const focusedAppId = useWindowManager((s) => (s.focusedId ? s.windows[s.focusedId]?.appId : undefined));
  const focusedApp = useAppManifest(focusedAppId);
  const hasWindows = useWindowManager((s) => s.stack.length > 0);
  const menuOpen = useContextMenuStore((s) => s.menu?.label === SYSTEM_MENU);
  const { toggleLauncher } = useShell.getState();

  const toggleSystemMenu = (anchor: HTMLElement) => {
    if (menuOpen) return closeContextMenu();
    const r = anchor.getBoundingClientRect();
    openContextMenu({
      label: SYSTEM_MENU,
      position: { x: r.left, y: r.bottom + 4 },
      items: [
        { label: "About NEXUS", icon: Info, onSelect: () => lifecycle.launchApp("nexus.welcome") },
        { label: "Activity Monitor", icon: Activity, onSelect: () => lifecycle.launchApp("nexus.activity-monitor") },
        { kind: "separator" },
        { label: "Show Desktop", icon: EyeOff, disabled: !hasWindows, onSelect: showDesktop },
        { label: "Close All Windows", icon: X, disabled: !hasWindows, danger: true, onSelect: closeAllWindows },
      ],
    });
  };

  return (
    <header
      className="absolute inset-x-0 top-0 z-[6000] flex items-center justify-between border-b border-line bg-chrome px-2 text-[12.5px] backdrop-blur-xl backdrop-saturate-150"
      style={{ height: MENU_BAR_HEIGHT }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          data-menu-trigger
          aria-label="System menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => toggleSystemMenu(e.currentTarget)}
          className={cn(
            "grid h-[22px] w-8 place-items-center rounded-[5px] text-fg transition-colors hover:bg-hover",
            menuOpen && "bg-active",
          )}
        >
          <NexusMark className="size-[15px]" />
        </button>
        <span className="truncate px-1.5 font-semibold tracking-[-0.01em]">{focusedApp?.name ?? "Desktop"}</span>
      </div>

      <div className="flex items-center gap-1">
        <StorageIndicator />
        <button
          type="button"
          onClick={toggleLauncher}
          aria-label="Open launcher"
          className="flex h-[22px] items-center gap-1.5 rounded-[5px] px-1.5 text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Search size={13} strokeWidth={2} />
          <Kbd className="h-4 border-none bg-transparent px-0 text-[11px]">{modKeyLabel()} K</Kbd>
        </button>
        <Clock />
      </div>
    </header>
  );
}
