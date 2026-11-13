"use client";

import type { RefObject } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { windowManager } from "@/system/window-manager/store";
import { lifecycle } from "@/system/runtime/lifecycle";
import { TITLE_BAR_HEIGHT } from "@/system/window-manager/constants";
import type { WindowState } from "@/system/window-manager/types";
import type { AppIconSpec } from "@/system/runtime/types";
import { AppIcon } from "@/ui/AppIcon";
import { useShell } from "../shell-store";
import { startWindowDrag } from "./gestures";
import { windowMenuItems } from "./window-menu";

interface TitleBarProps {
  win: WindowState;
  focused: boolean;
  icon: AppIconSpec | undefined;
  frameRef: RefObject<HTMLElement | null>;
}

export function TitleBar({ win, focused, icon, frameRef }: TitleBarProps) {
  const openContextMenu = useShell((s) => s.openContextMenu);
  const maximized = win.mode === "maximized";

  return (
    <header
      className={cn(
        "relative flex shrink-0 touch-none items-center gap-2 border-b border-line pl-3 pr-1.5 transition-colors",
        focused ? "bg-titlebar" : "bg-titlebar-inactive",
      )}
      style={{ height: TITLE_BAR_HEIGHT }}
      onPointerDown={(e) => startWindowDrag(e, win.id, frameRef)}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest("[data-no-drag]")) return;
        windowManager.getState().toggleMaximize(win.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu({ position: { x: e.clientX, y: e.clientY }, items: windowMenuItems(win), label: "Window" });
      }}
    >
      {icon && <AppIcon icon={icon} size={16} className={cn("transition-opacity", !focused && "opacity-50")} />}
      <h2
        className={cn(
          "min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[-0.005em] transition-colors",
          focused ? "text-fg" : "text-subtle",
        )}
      >
        {win.title}
      </h2>

      <div className="flex items-center" data-no-drag>
        <ChromeButton label="Minimize" onClick={() => windowManager.getState().minimize(win.id)}>
          <Minus size={14} strokeWidth={1.75} />
        </ChromeButton>
        {win.resizable && (
          <ChromeButton
            label={maximized ? "Restore" : "Maximize"}
            onClick={() => windowManager.getState().toggleMaximize(win.id)}
          >
            {maximized ? <Copy size={12} strokeWidth={1.75} className="-scale-x-100" /> : <Square size={11.5} strokeWidth={1.75} />}
          </ChromeButton>
        )}
        <ChromeButton label="Close" danger onClick={() => lifecycle.closeWindow(win.id)}>
          <X size={15} strokeWidth={1.75} />
        </ChromeButton>
      </div>
    </header>
  );
}

function ChromeButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "grid h-7 w-8 place-items-center rounded-md text-muted transition-colors",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
