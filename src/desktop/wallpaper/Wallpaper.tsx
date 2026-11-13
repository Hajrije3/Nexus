"use client";

/**
 * Default wallpaper: a deep neutral field with two very soft light sources and
 * a faint grain to prevent gradient banding. Wallpaper selection arrives with
 * the Settings app (Phase 3); this component will then read from settings.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")";

interface WallpaperProps {
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onContextMenu(e: React.MouseEvent<HTMLDivElement>): void;
}

export function Wallpaper({ onPointerDown, onContextMenu }: WallpaperProps) {
  return (
    <div
      data-desktop-surface
      className="absolute inset-0 bg-desk"
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      style={{
        backgroundImage: [
          "radial-gradient(1100px 760px at 18% 8%, rgb(124 147 255 / 0.17), transparent 62%)",
          "radial-gradient(900px 700px at 88% 96%, rgb(94 196 182 / 0.1), transparent 60%)",
          "linear-gradient(180deg, rgb(255 255 255 / 0.015), transparent 40%)",
        ].join(","),
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
    </div>
  );
}
