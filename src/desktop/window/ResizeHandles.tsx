"use client";

import type { RefObject } from "react";
import type { ResizeEdge, WindowId } from "@/system/window-manager/types";
import { RESIZE_CURSORS, startWindowResize } from "./gestures";

const EDGE = 6; // px of grab area straddling each edge
const CORNER = 14;

const HANDLES: Record<ResizeEdge, React.CSSProperties> = {
  n: { top: -EDGE / 2, left: CORNER, right: CORNER, height: EDGE },
  s: { bottom: -EDGE / 2, left: CORNER, right: CORNER, height: EDGE },
  e: { right: -EDGE / 2, top: CORNER, bottom: CORNER, width: EDGE },
  w: { left: -EDGE / 2, top: CORNER, bottom: CORNER, width: EDGE },
  nw: { top: -EDGE / 2, left: -EDGE / 2, width: CORNER, height: CORNER },
  ne: { top: -EDGE / 2, right: -EDGE / 2, width: CORNER, height: CORNER },
  sw: { bottom: -EDGE / 2, left: -EDGE / 2, width: CORNER, height: CORNER },
  se: { bottom: -EDGE / 2, right: -EDGE / 2, width: CORNER, height: CORNER },
};

const EDGES = Object.keys(HANDLES) as ResizeEdge[];

export function ResizeHandles({ id, frameRef }: { id: WindowId; frameRef: RefObject<HTMLElement | null> }) {
  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge}
          data-resize-handle={edge}
          aria-hidden="true"
          className="absolute z-10 touch-none"
          style={{ ...HANDLES[edge], cursor: RESIZE_CURSORS[edge] }}
          onPointerDown={(e) => startWindowResize(e, id, edge, frameRef)}
        />
      ))}
    </>
  );
}
