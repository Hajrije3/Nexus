"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { EyeOff, Info, Search, X } from "lucide-react";
import { useWindowManager, windowManager } from "@/system/window-manager/store";
import { lifecycle } from "@/system/runtime/lifecycle";
import { Kbd, modKeyLabel } from "@/ui/Kbd";
import { bootSystem } from "./boot";
import { BootError } from "./BootError";
import { BootScreen } from "./BootScreen";
import { useShell } from "./shell-store";
import { useGlobalShortcuts } from "./shortcuts";
import { closeAllWindows, showDesktop } from "./system-actions";
import { measureWorkArea } from "./work-area";
import { ContextMenuHost } from "./context-menu/ContextMenuHost";
import { Dock } from "./dock/Dock";
import { Launcher } from "./launcher/Launcher";
import { MenuBar } from "./menu-bar/MenuBar";
import { Wallpaper } from "./wallpaper/Wallpaper";
import { SnapPreview } from "./window/SnapPreview";
import { WindowLayer } from "./window/WindowLayer";

type BootState = { status: "booting" } | { status: "ready" } | { status: "failed"; error: Error };

export function Desktop() {
  const [boot, setBoot] = useState<BootState>({ status: "booting" });

  useEffect(() => {
    bootSystem().then(
      () => setBoot({ status: "ready" }),
      (error: unknown) => {
        console.error("[nexus] boot failed", error);
        setBoot({ status: "failed", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
  }, []);

  if (boot.status === "booting") return <BootScreen />;
  if (boot.status === "failed") return <BootError error={boot.error} />;
  return <DesktopShell />;
}

/** Keep the window manager's work area in sync with the viewport. */
function useWorkAreaSync(): void {
  useLayoutEffect(() => {
    let raf = 0;
    const sync = () => {
      raf = 0;
      windowManager.getState().setWorkArea(measureWorkArea());
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

function DesktopShell() {
  useWorkAreaSync();
  useGlobalShortcuts();

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
