export type WindowId = `win_${string}`;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** How the window's rendered rectangle is derived. */
export type WindowMode = "normal" | "maximized" | "tiled-left" | "tiled-right";

/** Drop targets offered while dragging a window near a work-area edge. */
export type SnapZone = "maximize" | "left" | "right";

/** Which edge(s) of a window a resize gesture is pulling. */
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface WindowState {
  id: WindowId;
  appId: string;
  instanceId: string;
  title: string;
  /** Floating geometry. Preserved while maximised/tiled so restore is exact. */
  bounds: Rect;
  mode: WindowMode;
  minimized: boolean;
  minSize: Size;
  resizable: boolean;
  openedAt: number;
}

export interface WindowManagerState {
  windows: Readonly<Record<WindowId, WindowState>>;
  /** Paint order, bottom → top. Every window id appears exactly once. */
  stack: readonly WindowId[];
  focusedId: WindowId | null;
  /** Usable desktop area: viewport minus menu bar and dock. */
  workArea: Rect;
  snapPreview: SnapZone | null;
}

export interface OpenWindowOptions {
  id: WindowId;
  appId: string;
  instanceId: string;
  title: string;
  size: Size;
  minSize: Size;
  resizable: boolean;
  /** Explicit position; otherwise the window manager cascades. */
  position?: Point;
  openedAt: number;
}
