import { useEffect } from "react";
import { windowManager } from "@/system/window-manager/store";
import type { WindowMode } from "@/system/window-manager/types";
import { useShell } from "./shell-store";
import { closeFocusedWindow } from "./system-actions";

/**
 * Global desktop shortcuts. Deliberately avoids browser-reserved chords
 * (⌘W, ⌘T, ⌘N, Alt+←/→) — see docs/ARCHITECTURE.md §7.
 *
 *   ⌘/Ctrl K          launcher
 *   Alt `  / Alt ⇧ `  cycle windows
 *   Alt W             close window
 *   Alt M             minimise window
 *   Alt ⇧ ↑ / ← / →   maximise / tile left / tile right (toggle)
 *   Alt ⇧ ↓           restore
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.altKey && !e.shiftKey && e.code === "KeyK") {
        e.preventDefault();
        useShell.getState().toggleLauncher();
        return;
      }

      if (!e.altKey || mod) return;
      // The launcher handles its own keys while open.
      if (useShell.getState().launcherOpen) return;

      const wm = windowManager.getState();
      const focused = wm.focusedId ? wm.windows[wm.focusedId] : undefined;

      const toggleMode = (mode: WindowMode) => {
        if (focused) wm.setMode(focused.id, focused.mode === mode ? "normal" : mode);
      };

      const handled = (() => {
        switch (e.code) {
          case "Backquote":
            wm.cycleFocus(e.shiftKey ? -1 : 1);
            return true;
          case "KeyW":
            if (e.shiftKey) return false;
            closeFocusedWindow();
            return true;
          case "KeyM":
            if (e.shiftKey || !focused) return false;
            wm.minimize(focused.id);
            return true;
          case "ArrowUp":
            if (!e.shiftKey) return false;
            toggleMode("maximized");
            return true;
          case "ArrowLeft":
            if (!e.shiftKey) return false;
            toggleMode("tiled-left");
            return true;
          case "ArrowRight":
            if (!e.shiftKey) return false;
            toggleMode("tiled-right");
            return true;
          case "ArrowDown":
            if (!e.shiftKey || !focused) return false;
            wm.setMode(focused.id, "normal");
            return true;
          default:
            return false;
        }
      })();

      if (handled) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
