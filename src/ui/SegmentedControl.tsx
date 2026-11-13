"use client";

import type { ReactNode } from "react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange(value: T): void;
  options: readonly Option<T>[];
  "aria-label": string;
  size?: "sm" | "md";
}

/** Exclusive choice between a few options (view mode, theme…). */
export function SegmentedControl<T extends string>({ value, onChange, options, size = "md", ...rest }: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix emits "" when the active item is clicked again; keep a selection.
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={rest["aria-label"]}
      className="inline-flex rounded-md border border-line bg-surface-sunken p-0.5"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium text-muted transition-colors outline-none hover:text-fg",
            "data-[state=on]:bg-surface-raised data-[state=on]:text-fg data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.2)] focus-visible:ring-2 focus-visible:ring-accent-soft",
            size === "sm" ? "h-6 min-w-7 px-1.5 text-[12px]" : "h-7 px-3 text-[12.5px]",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
