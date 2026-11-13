"use client";

import { useSettings } from "@/system/settings/settings";
import { useEffectiveTheme } from "@/system/settings/appearance";
import { WALLPAPER_SPECS } from "@/ui/theme";

/**
 * Desktop wallpaper: the preset selected in Settings, rendered for the active
 * theme, with a faint grain to prevent gradient banding.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")";

interface WallpaperProps {
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onContextMenu(e: React.MouseEvent<HTMLDivElement>): void;
}

export function Wallpaper({ onPointerDown, onContextMenu }: WallpaperProps) {
  const id = useSettings((s) => s.wallpaper);
  const theme = useEffectiveTheme();
  const spec = WALLPAPER_SPECS[id];

  return (
    <div
      data-desktop-surface
      data-wallpaper={id}
      className="absolute inset-0 transition-[background-color] duration-300"
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      style={{ backgroundColor: spec.base[theme], backgroundImage: spec.layers[theme] }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
    </div>
  );
}
