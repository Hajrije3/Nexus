"use client";

import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useWindowManager, useWindowState, windowManager } from "@/system/window-manager/store";
import { effectiveRect } from "@/system/window-manager/geometry";
import type { WindowId } from "@/system/window-manager/types";
import type { InstanceId } from "@/system/runtime/types";
import { useAppManifest } from "@/system/runtime/registry";
import { TitleBar } from "./TitleBar";
import { ResizeHandles } from "./ResizeHandles";
import { WindowBody } from "./WindowBody";

interface WindowFrameProps {
  id: WindowId;
  zIndex: number;
}

/**
 * Window chrome + geometry. Subscribes only to its own window state, so a
 * change to one window re-renders one frame.
 */
export const WindowFrame = memo(function WindowFrame({ id, zIndex }: WindowFrameProps) {
  const win = useWindowState(id);
  const workArea = useWindowManager((s) => s.workArea);
  const focused = useWindowManager((s) => s.focusedId === id);
  const manifest = useAppManifest(win?.appId);
  const frameRef = useRef<HTMLElement>(null);

  // Move keyboard focus into the window when it becomes the focused window,
  // unless focus is already somewhere inside it.
  useEffect(() => {
    const el = frameRef.current;
    if (focused && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [focused]);

  if (!win) return null;
  const rect = effectiveRect(win, workArea);
  const canResize = win.resizable && win.mode !== "maximized";

  return (
    <section
      ref={frameRef}
      className="nx-window outline-none"
      aria-label={win.title}
      tabIndex={-1}
      data-window-id={id}
      data-app-id={win.appId}
      data-focused={focused}
      data-minimized={win.minimized}
      data-mode={win.mode}
      aria-hidden={win.minimized || undefined}
      style={{
        translate: `${rect.x}px ${rect.y}px`,
        width: rect.width,
        height: rect.height,
        zIndex,
      }}
      onPointerDownCapture={() => windowManager.getState().focus(id)}
    >
      <div
        className={cn(
          "nx-window-surface relative flex h-full flex-col overflow-hidden rounded-[10px] bg-surface transition-shadow",
          focused ? "shadow-window" : "shadow-window-inactive",
        )}
      >
        <TitleBar win={win} focused={focused} icon={manifest?.icon} frameRef={frameRef} />
        <div className="nx-window-body relative min-h-0 flex-1">
          <WindowBody
            windowId={id}
            instanceId={win.instanceId as InstanceId}
            appId={win.appId}
            appName={manifest?.name ?? win.appId}
          />
        </div>
      </div>
      {canResize && <ResizeHandles id={id} frameRef={frameRef} />}
    </section>
  );
});
