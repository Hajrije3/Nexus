import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
}

/** Centered message for empty, no-results and error states. */
export function EmptyState({ icon: Icon, title, description, action, tone = "neutral", className }: EmptyStateProps) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-3 p-8 text-center", className)} role={tone === "danger" ? "alert" : undefined}>
      <div
        className={cn(
          "grid size-10 place-items-center rounded-full",
          tone === "danger" ? "bg-danger/10 text-danger" : "bg-active text-subtle",
        )}
      >
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {description && <p className="max-w-[320px] text-[12px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div className={cn("grid h-full place-items-center", className)} role="status" aria-label={label}>
      <div className="size-4 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg/70" />
    </div>
  );
}
