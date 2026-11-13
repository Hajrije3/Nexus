/**
 * Pure state logic for the Files app: navigation history, selection, sorting
 * and filtering. No React, no I/O — unit-tested in isolation.
 */
import type { FsStat } from "@/system/sdk/fs";
import { fileKind, type FileKind } from "@/system/fs/kinds";

/* ─────────────────────────── Navigation history ─────────────────────────── */

export interface History {
  entries: readonly string[];
  index: number;
}

export const createHistory = (path: string): History => ({ entries: [path], index: 0 });
export const currentPath = (h: History): string => h.entries[h.index]!;
export const canGoBack = (h: History) => h.index > 0;
export const canGoForward = (h: History) => h.index < h.entries.length - 1;

/** Visit a new path: drops any forward entries, ignores re-visiting the current path. */
export function navigate(h: History, path: string): History {
  if (currentPath(h) === path) return h;
  const entries = [...h.entries.slice(0, h.index + 1), path];
  return { entries, index: entries.length - 1 };
}

export const goBack = (h: History): History => (canGoBack(h) ? { ...h, index: h.index - 1 } : h);
export const goForward = (h: History): History => (canGoForward(h) ? { ...h, index: h.index + 1 } : h);

/** Replace the current entry (e.g. the open folder was renamed elsewhere). */
export function replaceCurrent(h: History, path: string): History {
  const entries = [...h.entries];
  entries[h.index] = path;
  return { ...h, entries };
}

/* ─────────────────────────────── Selection ─────────────────────────────── */

export interface Selection {
  ids: ReadonlySet<string>;
  /** Anchor for shift-range selection. */
  anchor: string | null;
  /** Keyboard focus (last interacted item). */
  focus: string | null;
}

export const emptySelection: Selection = { ids: new Set(), anchor: null, focus: null };

export type SelectMode = "replace" | "toggle" | "range";

/** Apply a click with modifiers to the ordered list of visible ids. */
export function select(sel: Selection, order: readonly string[], id: string, mode: SelectMode): Selection {
  if (mode === "toggle") {
    const ids = new Set(sel.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id, focus: id };
  }
  if (mode === "range" && sel.anchor && order.includes(sel.anchor)) {
    const a = order.indexOf(sel.anchor);
    const b = order.indexOf(id);
    const [from, to] = a < b ? [a, b] : [b, a];
    return { ids: new Set(order.slice(from, to + 1)), anchor: sel.anchor, focus: id };
  }
  return { ids: new Set([id]), anchor: id, focus: id };
}

export const selectAll = (order: readonly string[]): Selection => ({
  ids: new Set(order),
  anchor: order[0] ?? null,
  focus: order[order.length - 1] ?? null,
});

/** Move keyboard focus by `delta` items; with `extend`, grow the selection from the anchor. */
export function moveFocus(sel: Selection, order: readonly string[], delta: number, extend: boolean): Selection {
  if (order.length === 0) return sel;
  const current = sel.focus ? order.indexOf(sel.focus) : -1;
  const nextIndex = current === -1 ? (delta > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, current + delta));
  const id = order[nextIndex]!;
  return extend ? select(sel, order, id, "range") : select(sel, order, id, "replace");
}

/** Drop ids that no longer exist (after a refresh). */
export function pruneSelection(sel: Selection, order: readonly string[]): Selection {
  const present = new Set(order);
  const ids = new Set([...sel.ids].filter((id) => present.has(id)));
  if (ids.size === sel.ids.size && (!sel.focus || present.has(sel.focus))) return sel;
  return {
    ids,
    anchor: sel.anchor && present.has(sel.anchor) ? sel.anchor : null,
    focus: sel.focus && present.has(sel.focus) ? sel.focus : null,
  };
}

/* ─────────────────────────── Sorting & filtering ─────────────────────────── */

export type SortKey = "name" | "modified" | "size" | "kind";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Folders always first; then by key; name as tie-breaker. */
export function sortEntries(entries: readonly FsStat[], sort: Sort): FsStat[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    let c = 0;
    if (sort.key === "modified") c = a.modifiedAt - b.modifiedAt;
    else if (sort.key === "size") c = a.size - b.size;
    else if (sort.key === "kind") c = collator.compare(fileKind(a.name, a.type), fileKind(b.name, b.type));
    return sign * (c || collator.compare(a.name, b.name));
  });
}

export type KindFilter = "all" | FileKind;

export function filterEntries(entries: readonly FsStat[], kind: KindFilter, showHidden: boolean): FsStat[] {
  return entries.filter(
    (e) => (showHidden || !e.name.startsWith(".")) && (kind === "all" || fileKind(e.name, e.type) === kind),
  );
}
