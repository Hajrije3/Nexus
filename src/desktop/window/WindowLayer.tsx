"use client";

import { useWindowManager } from "@/system/window-manager/store";
import { WINDOW_Z_BASE } from "@/system/window-manager/constants";
import { WindowFrame } from "./WindowFrame";

/**
 * Renders every window. Iterates a stable, id-sorted list so that raising a
 * window only changes its z-index instead of re-ordering DOM nodes (which
 * would remount iframes and reset scroll positions inside apps).
 */
export function WindowLayer() {
  const stack = useWindowManager((s) => s.stack);
  const ids = [...stack].sort();

  return (
    <div className="absolute inset-0" data-window-layer>
      {ids.map((id) => (
        <WindowFrame key={id} id={id} zIndex={WINDOW_Z_BASE + stack.indexOf(id) * 2} />
      ))}
    </div>
  );
}
