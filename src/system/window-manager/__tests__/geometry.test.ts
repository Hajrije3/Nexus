import { describe, expect, it } from "vitest";
import {
  cascadePosition,
  constrainPosition,
  effectiveRect,
  rectForMode,
  resizeRect,
  snapZoneAt,
  tearOffRect,
} from "../geometry";
import { MIN_VISIBLE_PX, TILE_GAP, TITLE_BAR_HEIGHT } from "../constants";
import type { Rect } from "../types";

const workArea: Rect = { x: 0, y: 30, width: 1200, height: 700 };
const min = { width: 300, height: 200 };

describe("constrainPosition", () => {
  it("keeps the title bar below the menu bar", () => {
    expect(constrainPosition({ x: 100, y: -50, width: 400, height: 300 }, workArea).y).toBe(30);
  });

  it("keeps a reachable strip visible horizontally", () => {
    const left = constrainPosition({ x: -1000, y: 100, width: 400, height: 300 }, workArea);
    expect(left.x + left.width).toBe(MIN_VISIBLE_PX);
    const right = constrainPosition({ x: 5000, y: 100, width: 400, height: 300 }, workArea);
    expect(right.x).toBe(workArea.width - MIN_VISIBLE_PX);
  });

  it("keeps the title bar above the bottom of the work area", () => {
    const r = constrainPosition({ x: 0, y: 5000, width: 400, height: 300 }, workArea);
    expect(r.y).toBe(workArea.y + workArea.height - TITLE_BAR_HEIGHT);
  });
});

describe("rectForMode / effectiveRect", () => {
  it("maximises inside the work area with a gap", () => {
    expect(rectForMode("maximized", workArea)).toEqual({
      x: TILE_GAP,
      y: 30 + TILE_GAP,
      width: 1200 - TILE_GAP * 2,
      height: 700 - TILE_GAP * 2,
    });
  });

  it("tiles left and right halves without overlap", () => {
    const l = rectForMode("tiled-left", workArea);
    const r = rectForMode("tiled-right", workArea);
    expect(l.x + l.width).toBeLessThan(r.x);
    expect(r.x + r.width).toBe(workArea.width - TILE_GAP);
  });

  it("uses floating bounds in normal mode", () => {
    const bounds = { x: 10, y: 40, width: 400, height: 300 };
    expect(effectiveRect({ bounds, mode: "normal" }, workArea)).toBe(bounds);
  });
});

describe("snapZoneAt", () => {
  it("detects edges", () => {
    expect(snapZoneAt({ x: 600, y: 31 }, workArea)).toBe("maximize");
    expect(snapZoneAt({ x: 2, y: 300 }, workArea)).toBe("left");
    expect(snapZoneAt({ x: 1199, y: 300 }, workArea)).toBe("right");
    expect(snapZoneAt({ x: 600, y: 300 }, workArea)).toBeNull();
  });
});

describe("resizeRect", () => {
  const start: Rect = { x: 200, y: 200, width: 500, height: 400 };

  it("grows from the south-east corner", () => {
    expect(resizeRect(start, "se", { x: 50, y: 30 }, min, workArea)).toEqual({
      x: 200,
      y: 200,
      width: 550,
      height: 430,
    });
  });

  it("anchors the right edge when pulling west", () => {
    const r = resizeRect(start, "w", { x: -100, y: 0 }, min, workArea);
    expect(r.x).toBe(100);
    expect(r.x + r.width).toBe(start.x + start.width);
  });

  it("respects the minimum size while keeping the opposite edge fixed", () => {
    const r = resizeRect(start, "nw", { x: 1000, y: 1000 }, min, workArea);
    expect(r.width).toBe(min.width);
    expect(r.height).toBe(min.height);
    expect(r.x + r.width).toBe(700);
    expect(r.y + r.height).toBe(600);
  });

  it("never drags the top edge above the work area", () => {
    expect(resizeRect(start, "n", { x: 0, y: -1000 }, min, workArea).y).toBe(workArea.y);
  });

  it("does not grow past the work area on the east/south edges", () => {
    const r = resizeRect(start, "se", { x: 5000, y: 5000 }, min, workArea);
    expect(r.x + r.width).toBe(workArea.width);
    expect(r.y + r.height).toBe(workArea.y + workArea.height);
  });
});

describe("tearOffRect", () => {
  it("keeps the pointer at the same relative position on the title bar", () => {
    const current = { x: 0, y: 30, width: 1200, height: 700 };
    const floating = { x: 300, y: 200, width: 600, height: 400 };
    const r = tearOffRect(current, floating, { x: 900, y: 45 });
    // pointer was 75% across → stays 75% across the floating width
    expect(r.x).toBe(900 - 450);
    expect(r.y).toBe(30);
    expect(r.width).toBe(600);
  });
});

describe("cascadePosition", () => {
  it("centres the first window and offsets following ones", () => {
    const size = { width: 400, height: 300 };
    const first = cascadePosition(size, workArea, []);
    expect(first.x).toBe(400);
    const second = cascadePosition(size, workArea, [{ ...first, ...size }]);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });
});
