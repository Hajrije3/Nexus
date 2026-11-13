import { describe, expect, it } from "vitest";
import * as ops from "../operations";
import type { OpenWindowOptions, Rect, WindowId, WindowManagerState } from "../types";

const workArea: Rect = { x: 0, y: 30, width: 1200, height: 700 };

function opts(id: string, extra: Partial<OpenWindowOptions> = {}): OpenWindowOptions {
  return {
    id: `win_${id}`,
    appId: "nexus.test",
    instanceId: "proc_1",
    title: id,
    size: { width: 400, height: 300 },
    minSize: { width: 200, height: 150 },
    resizable: true,
    openedAt: 0,
    ...extra,
  };
}

function withWindows(...ids: string[]): WindowManagerState {
  return ids.reduce((s, id) => ops.openWindow(s, opts(id)), ops.createInitialState(workArea));
}

const w = (id: string) => `win_${id}` as WindowId;

describe("openWindow", () => {
  it("adds the window on top and focuses it", () => {
    const s = withWindows("a", "b");
    expect(s.stack).toEqual([w("a"), w("b")]);
    expect(s.focusedId).toBe(w("b"));
  });

  it("clamps oversized windows to the work area", () => {
    const s = ops.openWindow(
      ops.createInitialState(workArea),
      opts("big", { size: { width: 5000, height: 5000 } }),
    );
    expect(s.windows[w("big")]?.bounds.width).toBe(1200);
    expect(s.windows[w("big")]?.bounds.height).toBe(700);
  });

  it("does not mutate the previous state", () => {
    const before = withWindows("a");
    const snapshot = JSON.stringify(before);
    ops.openWindow(before, opts("b"));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("focusWindow", () => {
  it("raises the window to the top of the stack", () => {
    const s = ops.focusWindow(withWindows("a", "b", "c"), w("a"));
    expect(s.stack).toEqual([w("b"), w("c"), w("a")]);
    expect(s.focusedId).toBe(w("a"));
  });

  it("restores a minimised window", () => {
    let s = ops.minimizeWindow(withWindows("a", "b"), w("a"));
    s = ops.focusWindow(s, w("a"));
    expect(s.windows[w("a")]?.minimized).toBe(false);
    expect(s.focusedId).toBe(w("a"));
  });

  it("returns the same reference when nothing changes", () => {
    const s = withWindows("a");
    expect(ops.focusWindow(s, w("a"))).toBe(s);
  });

  it("ignores unknown ids", () => {
    const s = withWindows("a");
    expect(ops.focusWindow(s, w("nope"))).toBe(s);
  });
});

describe("minimizeWindow", () => {
  it("hands focus to the next visible window", () => {
    const s = ops.minimizeWindow(withWindows("a", "b", "c"), w("c"));
    expect(s.windows[w("c")]?.minimized).toBe(true);
    expect(s.focusedId).toBe(w("b"));
  });

  it("skips minimised windows when choosing the next focus", () => {
    let s = withWindows("a", "b", "c");
    s = ops.minimizeWindow(s, w("c"));
    s = ops.minimizeWindow(s, w("b"));
    expect(s.focusedId).toBe(w("a"));
    s = ops.minimizeWindow(s, w("a"));
    expect(s.focusedId).toBeNull();
  });
});

describe("closeWindow", () => {
  it("removes the window and refocuses", () => {
    const s = ops.closeWindow(withWindows("a", "b"), w("b"));
    expect(s.windows[w("b")]).toBeUndefined();
    expect(s.stack).toEqual([w("a")]);
    expect(s.focusedId).toBe(w("a"));
  });

  it("keeps focus when closing a background window", () => {
    const s = ops.closeWindow(withWindows("a", "b"), w("a"));
    expect(s.focusedId).toBe(w("b"));
  });
});

describe("modes", () => {
  it("toggles maximise and preserves floating bounds", () => {
    const s0 = withWindows("a");
    const bounds = s0.windows[w("a")]?.bounds;
    const s1 = ops.toggleMaximize(s0, w("a"));
    expect(s1.windows[w("a")]?.mode).toBe("maximized");
    expect(s1.windows[w("a")]?.bounds).toEqual(bounds);
    const s2 = ops.toggleMaximize(s1, w("a"));
    expect(s2.windows[w("a")]?.mode).toBe("normal");
  });

  it("refuses to maximise non-resizable windows", () => {
    const s = ops.openWindow(ops.createInitialState(workArea), opts("fixed", { resizable: false }));
    expect(ops.toggleMaximize(s, w("fixed"))).toBe(s);
  });

  it("setWindowBounds returns the window to normal mode", () => {
    let s = ops.setWindowMode(withWindows("a"), w("a"), "tiled-left");
    s = ops.setWindowBounds(s, w("a"), { x: 50, y: 60, width: 500, height: 400 });
    expect(s.windows[w("a")]?.mode).toBe("normal");
    expect(s.windows[w("a")]?.bounds).toEqual({ x: 50, y: 60, width: 500, height: 400 });
  });

  it("setWindowBounds keeps the size of non-resizable windows", () => {
    const s0 = ops.openWindow(ops.createInitialState(workArea), opts("fixed", { resizable: false }));
    const s1 = ops.setWindowBounds(s0, w("fixed"), { x: 10, y: 40, width: 999, height: 999 });
    expect(s1.windows[w("fixed")]?.bounds).toEqual({ x: 10, y: 40, width: 400, height: 300 });
  });
});

describe("setWorkArea", () => {
  it("pulls floating windows back on screen when the viewport shrinks", () => {
    let s = withWindows("a");
    s = ops.setWindowBounds(s, w("a"), { x: 1000, y: 500, width: 400, height: 300 });
    s = ops.setWorkArea(s, { x: 0, y: 30, width: 600, height: 400 });
    const b = s.windows[w("a")]!.bounds;
    expect(b.x).toBeLessThanOrEqual(600 - 96);
    expect(b.y).toBeLessThanOrEqual(30 + 400 - 40);
  });
});

describe("cycleFocus", () => {
  it("sends the top window to the back", () => {
    const s = ops.cycleFocus(withWindows("a", "b", "c"), 1);
    expect(s.stack).toEqual([w("c"), w("a"), w("b")]);
    expect(s.focusedId).toBe(w("b"));
  });

  it("brings the bottom window forward in reverse", () => {
    const s = ops.cycleFocus(withWindows("a", "b", "c"), -1);
    expect(s.focusedId).toBe(w("a"));
  });
});
