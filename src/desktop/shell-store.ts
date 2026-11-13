import { create } from "zustand";
import { closeContextMenu } from "@/system/sdk/context-menu";

export type { ContextMenuState, MenuItem } from "@/system/sdk/context-menu";

interface ShellState {
  launcherOpen: boolean;
  setLauncherOpen(open: boolean): void;
  toggleLauncher(): void;
}

/** Ephemeral desktop-shell UI state (not persisted). */
export const useShell = create<ShellState>()((set) => ({
  launcherOpen: false,
  setLauncherOpen: (launcherOpen) => {
    closeContextMenu();
    set({ launcherOpen });
  },
  toggleLauncher: () => {
    closeContextMenu();
    set((s) => ({ launcherOpen: !s.launcherOpen }));
  },
}));
