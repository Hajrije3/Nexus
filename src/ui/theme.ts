/**
 * Visual definitions for settings identifiers: accent palettes and wallpapers.
 * Shared by the desktop (to apply them) and Settings (to preview them).
 */
import type { AccentId, EffectiveTheme, WallpaperId } from "@/system/settings/settings";

export interface AccentSpec {
  label: string;
  /** Accent colour per theme, plus the foreground used on top of it. */
  dark: { accent: string; fg: string };
  light: { accent: string; fg: string };
}

export const ACCENT_SPECS: Record<AccentId, AccentSpec> = {
  indigo: { label: "Indigo", dark: { accent: "#7c93ff", fg: "#0d0e12" }, light: { accent: "#4b63e6", fg: "#ffffff" } },
  blue: { label: "Blue", dark: { accent: "#5aa9ff", fg: "#0d0e12" }, light: { accent: "#1f6fd6", fg: "#ffffff" } },
  teal: { label: "Teal", dark: { accent: "#3fcfbf", fg: "#0d0e12" }, light: { accent: "#0f8f83", fg: "#ffffff" } },
  green: { label: "Green", dark: { accent: "#6bd68a", fg: "#0d0e12" }, light: { accent: "#228a45", fg: "#ffffff" } },
  amber: { label: "Amber", dark: { accent: "#f4b860", fg: "#0d0e12" }, light: { accent: "#b86a0c", fg: "#ffffff" } },
  rose: { label: "Rose", dark: { accent: "#ff7a9c", fg: "#0d0e12" }, light: { accent: "#c8325a", fg: "#ffffff" } },
  graphite: { label: "Graphite", dark: { accent: "#c7c9d1", fg: "#0d0e12" }, light: { accent: "#3f424b", fg: "#ffffff" } },
};

/** Convert "#rrggbb" + alpha to an rgb() string for soft accent fills. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

export interface WallpaperSpec {
  label: string;
  /** Base colour per theme. */
  base: Record<EffectiveTheme, string>;
  /** CSS background-image layers per theme. */
  layers: Record<EffectiveTheme, string>;
}

const glow = (x: string, y: string, w: number, h: number, color: string, stop = 62) =>
  `radial-gradient(${w}px ${h}px at ${x} ${y}, ${color}, transparent ${stop}%)`;

export const WALLPAPER_SPECS: Record<WallpaperId, WallpaperSpec> = {
  aurora: {
    label: "Aurora",
    base: { dark: "#0d0e12", light: "#e7e8ee" },
    layers: {
      dark: [glow("18%", "8%", 1100, 760, "rgb(124 147 255 / 0.17)"), glow("88%", "96%", 900, 700, "rgb(94 196 182 / 0.1)", 60)].join(","),
      light: [glow("18%", "8%", 1100, 760, "rgb(124 147 255 / 0.28)"), glow("88%", "96%", 900, 700, "rgb(94 196 182 / 0.22)", 60)].join(","),
    },
  },
  midnight: {
    label: "Midnight",
    base: { dark: "#08090c", light: "#dfe3ec" },
    layers: {
      dark: glow("50%", "-10%", 1400, 800, "rgb(90 110 180 / 0.12)", 70),
      light: glow("50%", "-10%", 1400, 800, "rgb(90 110 180 / 0.25)", 70),
    },
  },
  dusk: {
    label: "Dusk",
    base: { dark: "#120d12", light: "#efe6ea" },
    layers: {
      dark: [glow("80%", "10%", 1000, 700, "rgb(255 122 156 / 0.13)"), glow("10%", "100%", 1000, 700, "rgb(244 184 96 / 0.08)")].join(","),
      light: [glow("80%", "10%", 1000, 700, "rgb(255 122 156 / 0.25)"), glow("10%", "100%", 1000, 700, "rgb(244 184 96 / 0.22)")].join(","),
    },
  },
  forest: {
    label: "Forest",
    base: { dark: "#0a100e", light: "#e3ebe6" },
    layers: {
      dark: [glow("25%", "90%", 1100, 700, "rgb(107 214 138 / 0.1)"), glow("90%", "5%", 900, 600, "rgb(63 207 191 / 0.08)")].join(","),
      light: [glow("25%", "90%", 1100, 700, "rgb(107 214 138 / 0.24)"), glow("90%", "5%", 900, 600, "rgb(63 207 191 / 0.2)")].join(","),
    },
  },
  graphite: {
    label: "Graphite",
    base: { dark: "#111214", light: "#e9e9eb" },
    layers: {
      dark: "linear-gradient(180deg, rgb(255 255 255 / 0.03), transparent 50%)",
      light: "linear-gradient(180deg, rgb(255 255 255 / 0.5), transparent 50%)",
    },
  },
  mist: {
    label: "Mist",
    base: { dark: "#0f1216", light: "#eef1f5" },
    layers: {
      dark: [glow("50%", "50%", 1300, 900, "rgb(180 200 230 / 0.07)", 70)].join(","),
      light: [glow("50%", "50%", 1300, 900, "rgb(255 255 255 / 0.9)", 70)].join(","),
    },
  },
};
