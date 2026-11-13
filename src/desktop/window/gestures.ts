/**
 * Window drag & resize gestures.
 *
 * See docs/adr/0001-imperative-window-gestures.md: during a gesture the frame
 * element is mutated directly (once per animation frame) and the store is
 * written once on release. Geometry comes from the same pure functions the
 * store uses, so the committed state always matches what the user saw.
 */
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { windowManager } from "@/system/window-manager/store";
import {
  constrainPosition,
  effectiveRect,
  modeForSnapZone,
  resizeRect,
  snapZoneAt,
  tearOffRect,
} from "@/system/window-manager/geometry";
import type { Point, Rect, ResizeEdge, SnapZone, WindowId } from "@/system/window-manager/types";

const DRAG_THRESHOLD_PX = 3;

export const RESIZE_CURSORS: Record<ResizeEdge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

export function applyRect(el: HTMLElement, r: Rect): void {
  el.style.translate = `${r.x}px ${r.y}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

function setGesture(kind: string | null, cursor?: string): void {
  const body = document.body;
  if (kind) {
    body.dataset.gesture = kind;
    if (cursor) body.style.setProperty("--nx-gesture-cursor", cursor);
  } else {
    delete body.dataset.gesture;
    body.style.removeProperty("--nx-gesture-cursor");
  }
}

/**
 * Shared gesture plumbing: pointer capture, rAF batching, cleanup, and the
 * post-commit DOM resync (React won't touch the DOM if the committed state
 * happens to equal its previous render, e.g. dragging a maximised window and
 * dropping it back into the maximise zone).
 */
function runGesture(
  e: ReactPointerEvent<HTMLElement>,
  frame: HTMLElement,
  id: WindowId,
  handlers: {
    onMove(pointer: Point, delta: Point): Rect | null;
    onEnd(moved: boolean): void;
    gesture: string;
    cursor?: string;
  },
): void {
  const target = e.currentTarget;
  const pointerId = e.pointerId;
  const start: Point = { x: e.clientX, y: e.clientY };
  let moved = false;
  let pending: Rect | null = null;
  let raf = 0;

  target.setPointerCapture(pointerId);

  const flush = () => {
    raf = 0;
    if (pending) applyRect(frame, pending);
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    const delta = { x: ev.clientX - start.x, y: ev.clientY - start.y };
    if (!moved) {
      if (Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD_PX) return;
      moved = true;
      setGesture(handlers.gesture, handlers.cursor);
    }
    pending = handlers.onMove({ x: ev.clientX, y: ev.clientY }, delta);
    if (!raf) raf = requestAnimationFrame(flush);
  };

  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", finish);
    target.removeEventListener("pointercancel", finish);
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    if (raf) cancelAnimationFrame(raf);
    setGesture(null);

    handlers.onEnd(moved);

    if (moved) {
      const s = windowManager.getState();
      const win = s.windows[id];
      if (win) applyRect(frame, effectiveRect(win, s.workArea));
    }
  };

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", finish);
  target.addEventListener("pointercancel", finish);
}

/** Pointer-down handler for a window's title bar. */
export function startWindowDrag(
  e: ReactPointerEvent<HTMLElement>,
  id: WindowId,
  frameRef: RefObject<HTMLElement | null>,
): void {
  const frame = frameRef.current;
  if (e.button !== 0 || !frame) return;
  if ((e.target as Element).closest("[data-no-drag]")) return;

  const { windows, workArea } = windowManager.getState();
  const win = windows[id];
  if (!win) return;

  let origin = effectiveRect(win, workArea);
  let originPointer: Point = { x: e.clientX, y: e.clientY };
  let floating = win.mode === "normal";
  let current = origin;
  let zone: SnapZone | null = null;

  runGesture(e, frame, id, {
    gesture: "move",
    onMove(pointer) {
      if (!floating) {
        // Tear a maximised/tiled window off at its floating size.
        origin = tearOffRect(origin, win.bounds, pointer);
        originPointer = pointer;
        floating = true;
      }
      current = constrainPosition(
        { ...origin, x: origin.x + pointer.x - originPointer.x, y: origin.y + pointer.y - originPointer.y },
        workArea,
      );
      const nextZone = win.resizable ? snapZoneAt(pointer, workArea) : null;
      if (nextZone !== zone) {
        zone = nextZone;
        windowManager.getState().setSnapPreview(zone);
      }
      return current;
    },
    onEnd(moved) {
      const wm = windowManager.getState();
      wm.setSnapPreview(null);
      if (!moved) return;
      if (zone) {
        // Tearing off already restored the floating size; keep the original bounds.
        wm.setMode(id, modeForSnapZone(zone));
      } else {
        wm.setBounds(id, current);
      }
    },
  });
}

/** Pointer-down handler for a resize handle. */
export function startWindowResize(
  e: ReactPointerEvent<HTMLElement>,
  id: WindowId,
  edge: ResizeEdge,
  frameRef: RefObject<HTMLElement | null>,
): void {
  const frame = frameRef.current;
  if (e.button !== 0 || !frame) return;
  e.stopPropagation();

  const { windows, workArea } = windowManager.getState();
  const win = windows[id];
  if (!win?.resizable) return;

  const origin = effectiveRect(win, workArea);
  let current = origin;

  runGesture(e, frame, id, {
    gesture: `resize-${edge}`,
    cursor: RESIZE_CURSORS[edge],
    onMove(_pointer, delta) {
      current = resizeRect(origin, edge, delta, win.minSize, workArea);
      return current;
    },
    onEnd(moved) {
      if (moved) windowManager.getState().setBounds(id, current);
    },
  });
}

