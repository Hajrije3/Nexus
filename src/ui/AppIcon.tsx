import {
  Activity,
  Calculator,
  CodeXml,
  Folder,
  NotebookPen,
  Settings,
  Sparkles,
  SquareTerminal,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { AppGlyph, AppIconSpec } from "@/system/runtime/types";
import { cn } from "@/lib/utils";

const GLYPHS: Record<AppGlyph, LucideIcon> = {
  sparkles: Sparkles,
  activity: Activity,
  calculator: Calculator,
  folder: Folder,
  terminal: SquareTerminal,
  code: CodeXml,
  notebook: NotebookPen,
  settings: Settings,
  store: Store,
};

interface AppIconProps {
  icon: AppIconSpec;
  /** Rendered edge length in px. */
  size?: number;
  className?: string;
}

/** App tile: tinted rounded square with a single glyph. Consistent at every size. */
export function AppIcon({ icon, size = 44, className }: AppIconProps) {
  const Glyph = GLYPHS[icon.glyph];
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center text-white", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: icon.tint,
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 0 0 1px rgb(255 255 255 / 0.06), 0 1px 2px rgb(0 0 0 / 0.3)",
      }}
      aria-hidden="true"
    >
      <Glyph size={Math.round(size * 0.5)} strokeWidth={1.75} />
    </span>
  );
}
