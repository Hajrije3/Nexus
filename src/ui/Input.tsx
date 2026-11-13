import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      spellCheck={false}
      autoComplete="off"
      className={cn(
        "h-8 w-full rounded-md border border-line-strong bg-surface-sunken px-2.5 text-[13px] text-fg outline-none transition-colors placeholder:text-subtle",
        "focus:border-accent focus:ring-2 focus:ring-accent-soft aria-invalid:border-danger",
        className,
      )}
      {...rest}
    />
  );
}
