/**
 * App SDK — context menus.
 *
 * One context menu can be open system-wide. Apps and the desktop open menus
 * through this module; the desktop renders the active one (ContextMenuHost),
 * so every menu looks and behaves the same (keyboard navigation, dismissal,
 * screen-edge clamping).
 */
import type { LucideIcon } from "lucide-react";
import { create } from "zustand";
import type { Point } from "@/system/window-manager/types";

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    }
  | { kind: "separator" };

export interface ContextMenuState {
  position: Point;
  items: readonly MenuItem[];
  /** Accessible label for the menu. */
  label: string;
  /** Open upwards from `position` (e.g. menus anchored to the dock). */
  above?: boolean;
}

interface ContextMenuStore {
  menu: ContextMenuState | null;
}

export const useContextMenuStore = create<ContextMenuStore>()(() => ({ menu: null }));

export function openContextMenu(menu: ContextMenuState): void {
  useContextMenuStore.setState({ menu });
}

export function closeContextMenu(): void {
  useContextMenuStore.setState({ menu: null });
}

/** Convenience for `onContextMenu` handlers: open at the pointer. */
export function showContextMenu(
  e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number },
  label: string,
  items: readonly MenuItem[],
): void {
  e.preventDefault();
  e.stopPropagation();
  openContextMenu({ position: { x: e.clientX, y: e.clientY }, items, label });
}

/** Drop separators at the edges and doubled separators (from conditional items). */
export function tidyMenu(items: readonly (MenuItem | false | null | undefined)[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    if (!item) continue;
    if (item.kind === "separator" && (out.length === 0 || out[out.length - 1]?.kind === "separator")) continue;
    out.push(item);
  }
  while (out[out.length - 1]?.kind === "separator") out.pop();
  return out;
}
