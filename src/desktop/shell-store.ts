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

interface ShellState {
  launcherOpen: boolean;
  contextMenu: ContextMenuState | null;
  setLauncherOpen(open: boolean): void;
  toggleLauncher(): void;
  openContextMenu(menu: ContextMenuState): void;
  closeContextMenu(): void;
}

/** Ephemeral desktop-shell UI state (not persisted). */
export const useShell = create<ShellState>()((set) => ({
  launcherOpen: false,
  contextMenu: null,
  setLauncherOpen: (launcherOpen) => set({ launcherOpen, contextMenu: null }),
  toggleLauncher: () => set((s) => ({ launcherOpen: !s.launcherOpen, contextMenu: null })),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
}));
