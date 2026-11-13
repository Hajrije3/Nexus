/**
 * Pure window-manager state transitions.
 *
 * Every function takes the current state and returns the next one without
 * mutating its input. Unknown window ids are ignored (the input state is
 * returned unchanged) so stale UI events can never corrupt the state.
 */
import { cascadePosition, constrainPosition, fitSize } from "./geometry";
import type {
  OpenWindowOptions,
  Rect,
  SnapZone,
  WindowId,
  WindowManagerState,
  WindowMode,
  WindowState,
} from "./types";

export function createInitialState(workArea: Rect): WindowManagerState {
  return { windows: {}, stack: [], focusedId: null, workArea, snapPreview: null };
}

function updateWindow(
  state: WindowManagerState,
  id: WindowId,
  patch: (win: WindowState) => Partial<WindowState>,
): WindowManagerState {
  const win = state.windows[id];
  if (!win) return state;
  return { ...state, windows: { ...state.windows, [id]: { ...win, ...patch(win) } } };
}

/** Topmost visible window, excluding `exclude`. */
export function topVisibleWindow(
  state: WindowManagerState,
  exclude?: WindowId,
): WindowId | null {
  for (let i = state.stack.length - 1; i >= 0; i--) {
    const id = state.stack[i];
    if (id === undefined || id === exclude) continue;
    if (!state.windows[id]?.minimized) return id;
  }
  return null;
}

function raise(stack: readonly WindowId[], id: WindowId): WindowId[] {
  return [...stack.filter((s) => s !== id), id];
}

export function openWindow(state: WindowManagerState, opts: OpenWindowOptions): WindowManagerState {
  if (state.windows[opts.id]) return focusWindow(state, opts.id);

  const size = fitSize(opts.size, opts.minSize, state.workArea);
  const position =
    opts.position ??
    cascadePosition(
      size,
      state.workArea,
      state.stack.flatMap((id) => {
        const w = state.windows[id];
        return w && !w.minimized && w.mode === "normal" ? [w.bounds] : [];
      }),
    );

  const win: WindowState = {
    id: opts.id,
    appId: opts.appId,
    instanceId: opts.instanceId,
    title: opts.title,
    bounds: constrainPosition({ ...position, ...size }, state.workArea),
    mode: opts.mode && opts.mode !== "normal" && opts.resizable ? opts.mode : "normal",
    minimized: opts.minimized ?? false,
    minSize: opts.minSize,
    resizable: opts.resizable,
    openedAt: opts.openedAt,
  };

  return {
    ...state,
    windows: { ...state.windows, [win.id]: win },
    stack: [...state.stack, win.id],
    focusedId: win.minimized ? state.focusedId : win.id,
  };
}

/**
 * Re-order the stack (e.g. after restoring a session). Ids not in `order`
 * keep their relative order beneath the listed ones; unknown ids are ignored.
 * Focus goes to `focusedId` if it is visible, else the topmost visible window.
 */
export function restoreStack(
  state: WindowManagerState,
  order: readonly WindowId[],
  focusedId: WindowId | null,
): WindowManagerState {
  const listed = order.filter((id, i) => state.windows[id] && order.indexOf(id) === i);
  const rest = state.stack.filter((id) => !listed.includes(id));
  const next = { ...state, stack: [...rest, ...listed] };
  const focusable = focusedId && next.windows[focusedId] && !next.windows[focusedId].minimized;
  return { ...next, focusedId: focusable ? focusedId : topVisibleWindow(next) };
}

export function closeWindow(state: WindowManagerState, id: WindowId): WindowManagerState {
  if (!state.windows[id]) return state;
  const { [id]: _removed, ...windows } = state.windows;
  const next: WindowManagerState = {
    ...state,
    windows,
    stack: state.stack.filter((s) => s !== id),
  };
  return {
    ...next,
    focusedId: state.focusedId === id ? topVisibleWindow(next) : state.focusedId,
  };
}

/** Raise and focus a window, restoring it if minimised. */
export function focusWindow(state: WindowManagerState, id: WindowId): WindowManagerState {
  const win = state.windows[id];
  if (!win) return state;
  const isTop = state.stack[state.stack.length - 1] === id;
  if (isTop && state.focusedId === id && !win.minimized) return state;
  return {
    ...state,
    windows: win.minimized ? { ...state.windows, [id]: { ...win, minimized: false } } : state.windows,
    stack: isTop ? state.stack : raise(state.stack, id),
    focusedId: id,
  };
}

/** Clear focus (e.g. the user clicked the empty desktop). */
export function blurAll(state: WindowManagerState): WindowManagerState {
  return state.focusedId === null ? state : { ...state, focusedId: null };
}

export function minimizeWindow(state: WindowManagerState, id: WindowId): WindowManagerState {
  const win = state.windows[id];
  if (!win || win.minimized) return state;
  const next = updateWindow(state, id, () => ({ minimized: true }));
  return {
    ...next,
    focusedId: state.focusedId === id ? topVisibleWindow(next, id) : state.focusedId,
  };
}

export function setWindowMode(
  state: WindowManagerState,
  id: WindowId,
  mode: WindowMode,
): WindowManagerState {
  const win = state.windows[id];
  if (!win) return state;
  if (mode !== "normal" && !win.resizable) return state;
  return focusWindow(
    updateWindow(state, id, () => ({ mode, minimized: false })),
    id,
  );
}

export function toggleMaximize(state: WindowManagerState, id: WindowId): WindowManagerState {
  const win = state.windows[id];
  if (!win) return state;
  return setWindowMode(state, id, win.mode === "maximized" ? "normal" : "maximized");
}

/**
 * Commit a new floating rect (end of a drag or resize). Leaves any
 * maximised/tiled mode, since the user has taken manual control.
 */
export function setWindowBounds(
  state: WindowManagerState,
  id: WindowId,
  rect: Rect,
): WindowManagerState {
  const win = state.windows[id];
  if (!win) return state;
  const size = win.resizable
    ? fitSize(rect, win.minSize, state.workArea)
    : { width: win.bounds.width, height: win.bounds.height };
  return updateWindow(state, id, () => ({
    bounds: constrainPosition({ x: rect.x, y: rect.y, ...size }, state.workArea),
    mode: "normal",
  }));
}

export function setWindowTitle(
  state: WindowManagerState,
  id: WindowId,
  title: string,
): WindowManagerState {
  const win = state.windows[id];
  if (!win || win.title === title) return state;
  return updateWindow(state, id, () => ({ title }));
}

/**
 * The viewport changed. Floating windows are shrunk/pulled back so they stay
 * reachable; maximised/tiled windows follow automatically via effectiveRect.
 */
export function setWorkArea(state: WindowManagerState, workArea: Rect): WindowManagerState {
  const windows: Record<WindowId, WindowState> = {};
  for (const id of state.stack) {
    const win = state.windows[id];
    if (!win) continue;
    const size = fitSize(win.bounds, win.minSize, workArea);
    windows[id] = { ...win, bounds: constrainPosition({ ...win.bounds, ...size }, workArea) };
  }
  return { ...state, windows, workArea };
}

export function setSnapPreview(
  state: WindowManagerState,
  zone: SnapZone | null,
): WindowManagerState {
  return state.snapPreview === zone ? state : { ...state, snapPreview: zone };
}

/**
 * Cycle focus through visible windows (Alt+` style). `direction` 1 sends the
 * current top window to the back; -1 brings the bottom-most window forward.
 */
export function cycleFocus(state: WindowManagerState, direction: 1 | -1): WindowManagerState {
  const visible = state.stack.filter((id) => !state.windows[id]?.minimized);
  if (visible.length < 2) return state;
  if (direction === 1) {
    const top = visible[visible.length - 1];
    if (top === undefined) return state;
    const stack = [top, ...state.stack.filter((s) => s !== top)];
    return { ...state, stack, focusedId: topVisibleWindow({ ...state, stack }) };
  }
  const bottom = visible[0];
  return bottom === undefined ? state : focusWindow(state, bottom);
}
