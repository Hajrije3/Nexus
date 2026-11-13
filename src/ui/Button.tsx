import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "ghost" | "danger" | "dangerSolid";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  default: "bg-surface-raised text-fg border border-line-strong hover:bg-hover active:bg-active",
  primary: "bg-accent text-accent-fg hover:brightness-110 active:brightness-95",
  ghost: "text-muted hover:text-fg hover:bg-hover active:bg-active",
  danger: "text-danger border border-line-strong hover:bg-danger/10 active:bg-danger/15",
  dangerSolid: "bg-danger text-white hover:brightness-110 active:brightness-95",
};

const SIZES: Record<Size, string> = {
  sm: "h-6 px-2 text-[12px] gap-1 rounded-[5px]",
  md: "h-7 px-3 text-[12.5px] gap-1.5 rounded-md",
};

export function Button({ variant = "default", size = "md", className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
