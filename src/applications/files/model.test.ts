import { describe, expect, it } from "vitest";
import type { FsStat } from "@/system/sdk/fs";
import {
  canGoBack,
  canGoForward,
  createHistory,
  currentPath,
  emptySelection,
  filterEntries,
  goBack,
  goForward,
  moveFocus,
  navigate,
  pruneSelection,
  replaceCurrent,
  select,
  selectAll,
  sortEntries,
} from "./model";

describe("history", () => {
  it("navigates back and forward, truncating forward entries on a new visit", () => {
    let h = createHistory("/a");
    h = navigate(h, "/b");
    h = navigate(h, "/c");
    h = goBack(goBack(h));
    expect(currentPath(h)).toBe("/a");
    expect(canGoBack(h)).toBe(false);
    h = navigate(h, "/x");
    expect(h.entries).toEqual(["/a", "/x"]);
    expect(canGoForward(h)).toBe(false);
    expect(currentPath(goForward(goBack(h)))).toBe("/x");
  });

  it("ignores navigating to the current path and can replace it", () => {
    const h = createHistory("/a");
    expect(navigate(h, "/a")).toBe(h);
    expect(currentPath(replaceCurrent(h, "/renamed"))).toBe("/renamed");
  });
});

describe("selection", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("replaces, toggles and selects ranges from the anchor", () => {
    let s = select(emptySelection, order, "b", "replace");
    s = select(s, order, "d", "range");
    expect([...s.ids]).toEqual(["b", "c", "d"]);
    s = select(s, order, "c", "toggle");
    expect([...s.ids].sort()).toEqual(["b", "d"]);
    s = select(s, order, "a", "replace");
    expect([...s.ids]).toEqual(["a"]);
  });

  it("moves focus with the keyboard, optionally extending", () => {
    let s = moveFocus(emptySelection, order, 1, false);
    expect(s.focus).toBe("a");
    s = moveFocus(s, order, 2, true);
    expect([...s.ids]).toEqual(["a", "b", "c"]);
    s = moveFocus(s, order, 10, false);
    expect([...s.ids]).toEqual(["e"]);
  });

  it("selects all and prunes vanished items", () => {
    const all = selectAll(order);
    expect(all.ids.size).toBe(5);
    const pruned = pruneSelection(all, ["a", "b"]);
    expect([...pruned.ids]).toEqual(["a", "b"]);
    expect(pruned.focus).toBeNull();
  });
});

const stat = (name: string, type: "file" | "directory", size = 0, modifiedAt = 0): FsStat => ({
  id: name,
  path: `/${name}`,
  name,
  type,
  size,
  mimeType: null,
  createdAt: 0,
  modifiedAt,
});

describe("sorting and filtering", () => {
  const entries = [stat("b.txt", "file", 30, 1), stat("Zeta", "directory"), stat("a10.md", "file", 10, 3), stat("a2.md", "file", 20, 2), stat(".hidden", "file")];

  it("keeps folders first and sorts naturally", () => {
    expect(sortEntries(entries, { key: "name", dir: "asc" }).map((e) => e.name)).toEqual([
      "Zeta",
      ".hidden",
      "a2.md",
      "a10.md",
      "b.txt",
    ]);
    expect(sortEntries(entries, { key: "size", dir: "desc" }).map((e) => e.name).slice(0, 2)).toEqual(["Zeta", "b.txt"]);
  });

  it("filters by kind and hides dotfiles by default", () => {
    expect(filterEntries(entries, "all", false).map((e) => e.name)).not.toContain(".hidden");
    expect(filterEntries(entries, "folder", false).map((e) => e.name)).toEqual(["Zeta"]);
    expect(filterEntries(entries, "document", true).map((e) => e.name)).toEqual(["b.txt", "a10.md", "a2.md"]);
  });
});
