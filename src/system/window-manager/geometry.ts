import { clamp } from "@/lib/utils";
import {
  CASCADE_STEP,
  MIN_VISIBLE_PX,
  SNAP_EDGE_THRESHOLD,
  TILE_GAP,
  TITLE_BAR_HEIGHT,
} from "./constants";
import type {
  Point,
  Rect,
  ResizeEdge,
  Size,
  SnapZone,
  WindowMode,
  WindowState,
} from "./types";

/**
 * Keep a floating window reachable: the title bar may not go above the work
 * area or below its bottom edge, and at least MIN_VISIBLE_PX must remain
 * visible horizontally.
 */
export function constrainPosition(rect: Rect, workArea: Rect): Rect {
  const minX = workArea.x - rect.width + MIN_VISIBLE_PX;
  const maxX = workArea.x + workArea.width - MIN_VISIBLE_PX;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - TITLE_BAR_HEIGHT;
  return {
    ...rect,
    x: Math.round(clamp(rect.x, minX, maxX)),
    y: Math.round(clamp(rect.y, minY, maxY)),
  };
}

/** Shrink a size so it fits inside the work area, respecting the minimum. */
export function fitSize(size: Size, minSize: Size, workArea: Rect): Size {
  return {
    width: Math.round(clamp(size.width, minSize.width, Math.max(minSize.width, workArea.width))),
    height: Math.round(
      clamp(size.height, minSize.height, Math.max(minSize.height, workArea.height)),
    ),
  };
}

/** The rectangle a window should occupy for a non-floating mode. */
export function rectForMode(mode: Exclude<WindowMode, "normal">, workArea: Rect): Rect {
  const g = TILE_GAP;
  const full: Rect = {
    x: workArea.x + g,
    y: workArea.y + g,
    width: workArea.width - g * 2,
    height: workArea.height - g * 2,
  };
  if (mode === "maximized") return full;
  const half = Math.floor((full.width - g) / 2);
  return mode === "tiled-left"
    ? { ...full, width: half }
    : { ...full, x: full.x + full.width - half, width: half };
}

/** The rectangle a window is actually rendered at. */
export function effectiveRect(win: Pick<WindowState, "bounds" | "mode">, workArea: Rect): Rect {
  return win.mode === "normal" ? win.bounds : rectForMode(win.mode, workArea);
}

export function modeForSnapZone(zone: SnapZone): Exclude<WindowMode, "normal"> {
  switch (zone) {
    case "maximize":
      return "maximized";
    case "left":
      return "tiled-left";
    case "right":
      return "tiled-right";
  }
}

/** Which snap zone (if any) the pointer is in during a drag. */
export function snapZoneAt(pointer: Point, workArea: Rect): SnapZone | null {
  const t = SNAP_EDGE_THRESHOLD;
  if (pointer.y <= workArea.y + t) return "maximize";
  if (pointer.x <= workArea.x + t) return "left";
  if (pointer.x >= workArea.x + workArea.width - t) return "right";
  return null;
}

/**
 * Compute a new rect for a resize gesture.
 * `delta` is the pointer offset since the gesture began; `start` is the rect
 * at gesture start. Edges opposite the dragged one stay anchored.
 */
export function resizeRect(
  start: Rect,
  edge: ResizeEdge,
  delta: Point,
  minSize: Size,
  workArea: Rect,
): Rect {
  let { x, y, width, height } = start;
  const right = start.x + start.width;
  const bottom = start.y + start.height;

  if (edge.includes("e")) {
    width = clamp(start.width + delta.x, minSize.width, workArea.x + workArea.width - start.x);
  }
  if (edge.includes("s")) {
    height = clamp(start.height + delta.y, minSize.height, workArea.y + workArea.height - start.y);
  }
  if (edge.includes("w")) {
    const newX = clamp(start.x + delta.x, workArea.x - start.width, right - minSize.width);
    x = newX;
    width = right - newX;
  }
  if (edge.includes("n")) {
    // The title bar may never be dragged above the work area.
    const newY = clamp(start.y + delta.y, workArea.y, bottom - minSize.height);
    y = newY;
    height = bottom - newY;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * When a maximised/tiled window is dragged, it returns to its floating size.
 * Keep the pointer at the same relative position along the title bar so the
 * window doesn't jump away from the cursor.
 */
export function tearOffRect(current: Rect, floating: Rect, pointer: Point): Rect {
  const ratio = current.width > 0 ? (pointer.x - current.x) / current.width : 0.5;
  const offsetY = clamp(pointer.y - current.y, 0, TITLE_BAR_HEIGHT);
  return {
    ...floating,
    x: Math.round(pointer.x - floating.width * ratio),
    y: Math.round(pointer.y - offsetY),
  };
}

/**
 * Initial position for a new window: centred in the work area, cascading
 * diagonally from the most recently opened window and wrapping on overflow.
 */
export function cascadePosition(size: Size, workArea: Rect, existing: readonly Rect[]): Point {
  const centre: Point = {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - size.height) / 2.5)),
  };

  const taken = (p: Point) =>
    existing.some((r) => Math.abs(r.x - p.x) < 4 && Math.abs(r.y - p.y) < 4);

  let candidate = centre;
  for (let i = 0; i < 12 && taken(candidate); i++) {
    candidate = { x: candidate.x + CASCADE_STEP, y: candidate.y + CASCADE_STEP };
    const overflows =
      candidate.x + size.width > workArea.x + workArea.width ||
      candidate.y + size.height > workArea.y + workArea.height;
    if (overflows) {
      candidate = {
        x: workArea.x + CASCADE_STEP * ((i % 4) + 1),
        y: workArea.y + CASCADE_STEP * ((i % 3) + 1),
      };
    }
  }
  return candidate;
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
