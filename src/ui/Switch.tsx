"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <S.Root
      {...props}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-line-strong bg-active transition-colors outline-none",
        "data-[state=checked]:border-transparent data-[state=checked]:bg-accent focus-visible:ring-2 focus-visible:ring-accent-soft",
        className,
      )}
    >
      <S.Thumb className="block size-3.5 translate-x-[1px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px]" />
    </S.Root>
  );
}
