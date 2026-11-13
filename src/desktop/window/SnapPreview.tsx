"use client";

import { useWindowManager } from "@/system/window-manager/store";
import { modeForSnapZone, rectForMode } from "@/system/window-manager/geometry";
import { WINDOW_Z_BASE } from "@/system/window-manager/constants";

/** Translucent target shown while a dragged window hovers a snap zone. */
export function SnapPreview() {
  const zone = useWindowManager((s) => s.snapPreview);
  const workArea = useWindowManager((s) => s.workArea);
  const depth = useWindowManager((s) => s.stack.length);
  if (!zone) return null;

  const r = rectForMode(modeForSnapZone(zone), workArea);
  return (
    <div
      aria-hidden="true"
      data-snap-preview={zone}
      className="nx-snap-preview nx-fade-in pointer-events-none absolute left-0 top-0 rounded-[12px] border border-accent/40 bg-accent/10 backdrop-blur-[2px]"
      style={{
        translate: `${r.x}px ${r.y}px`,
        width: r.width,
        height: r.height,
        // Directly beneath the window being dragged (always top of stack).
        zIndex: WINDOW_Z_BASE + (depth - 1) * 2 - 1,
      }}
    />
  );
}
