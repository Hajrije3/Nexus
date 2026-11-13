import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

/** Square icon-only toolbar button with a required accessible label. */
export function IconButton({ label, active, size = "md", className, type, ...rest }: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "grid shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-35",
        active && "bg-active text-fg",
        size === "sm" ? "size-6" : "size-7",
        className,
      )}
      {...rest}
    />
  );
}
