"use client";

import { useEffect, useLayoutEffect } from "react";
import { EyeOff, Info, Search, X } from "lucide-react";
import { useWindowManager, windowManager } from "@/system/window-manager/store";
import { lifecycle } from "@/system/runtime/lifecycle";
import { DOCK_RESERVED_HEIGHT, MENU_BAR_HEIGHT } from "@/system/window-manager/constants";
import { Kbd, modKeyLabel } from "@/ui/Kbd";
import { bootSystem } from "./boot";
import { useShell } from "./shell-store";
import { useGlobalShortcuts } from "./shortcuts";
import { closeAllWindows, showDesktop } from "./system-actions";
import { ContextMenuHost } from "./context-menu/ContextMenuHost";
import { Dock } from "./dock/Dock";
import { Launcher } from "./launcher/Launcher";
import { MenuBar } from "./menu-bar/MenuBar";
import { Wallpaper } from "./wallpaper/Wallpaper";
import { SnapPreview } from "./window/SnapPreview";
import { WindowLayer } from "./window/WindowLayer";

bootSystem();

/** Keep the window manager's work area in sync with the viewport. */
function useWorkAreaSync(): void {
  useLayoutEffect(() => {
    let raf = 0;
    const sync = () => {
      raf = 0;
      windowManager.getState().setWorkArea({
        x: 0,
        y: MENU_BAR_HEIGHT,
        width: window.innerWidth,
        height: Math.max(200, window.innerHeight - MENU_BAR_HEIGHT - DOCK_RESERVED_HEIGHT),
      });
    };
    sync();
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

export function Desktop() {
  useWorkAreaSync();
  useGlobalShortcuts();

  // First boot experience. Welcome is single-instance, so StrictMode's double
  // effect invocation focuses the same window instead of opening two.
  useEffect(() => {
    if (windowManager.getState().stack.length === 0) lifecycle.launchApp("nexus.welcome");
  }, []);

  const openContextMenu = useShell((s) => s.openContextMenu);
  const hasWindows = useWindowManager((s) => s.stack.length > 0);

  return (
    <main className="fixed inset-0 overflow-hidden" aria-label="NEXUS desktop">
      <Wallpaper
        onPointerDown={() => windowManager.getState().blurAll()}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu({
            label: "Desktop",
            position: { x: e.clientX, y: e.clientY },
            items: [
              { label: "Open Launcher", icon: Search, shortcut: `${modKeyLabel()} K`, onSelect: () => useShell.getState().setLauncherOpen(true) },
              { label: "About NEXUS", icon: Info, onSelect: () => lifecycle.launchApp("nexus.welcome") },
              { kind: "separator" },
              { label: "Show Desktop", icon: EyeOff, disabled: !hasWindows, onSelect: showDesktop },
              { label: "Close All Windows", icon: X, danger: true, disabled: !hasWindows, onSelect: closeAllWindows },
            ],
          });
        }}
      />
      <EmptyDesktopHint />
      <WindowLayer />
      <SnapPreview />
      <MenuBar />
      <Dock />
      <Launcher />
      <ContextMenuHost />
    </main>
  );
}

/** Shown only when no window is visible. */
function EmptyDesktopHint() {
  const anyVisible = useWindowManager((s) => s.stack.some((id) => !s.windows[id]?.minimized));
  if (anyVisible) return null;
  return (
    <div className="nx-fade-in pointer-events-none absolute inset-0 grid place-items-center">
      <p className="flex items-center gap-2 text-[12.5px] text-subtle">
        Press <Kbd>{modKeyLabel()}</Kbd>
        <Kbd>K</Kbd> to open an application
      </p>
    </div>
  );
}
