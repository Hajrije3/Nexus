"use client";

import { useState, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { useWindowPortal } from "@/system/sdk/window";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Input } from "./Input";

interface WindowDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * A dialog scoped to its application window.
 *
 * Portalled into the window's content element and non-modal at the page
 * level (`modal={false}`), so other windows stay usable — but an overlay
 * blocks the owning window's content, like a sheet in a desktop OS. Radix
 * still provides roles, labelling, Escape-to-close and focus return.
 */
export function WindowDialog({ open, onOpenChange, title, description, children, className }: WindowDialogProps) {
  const container = useWindowPortal();
  return (
    <D.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <D.Portal container={container ?? undefined}>
        {open && <div className="nx-fade-in absolute inset-0 z-40 bg-black/25" aria-hidden="true" />}
        <D.Content
          // Stay open while the user works in another window.
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "nx-pop-in absolute left-1/2 top-[16%] z-50 w-[min(380px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-line-strong bg-surface-raised p-4 shadow-popover outline-none",
            className,
          )}
        >
          <D.Title className="text-[13.5px] font-semibold text-fg">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface PromptDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Return an error message to block submission. */
  validate?(value: string): string | null;
  /** Select only the part before the extension (file renames). */
  selectStem?: boolean;
  onSubmit(value: string): void | Promise<void>;
}

/** Single-field prompt (new folder, rename, …). */
export function PromptDialog(props: PromptDialogProps) {
  return (
    <WindowDialog open={props.open} onOpenChange={props.onOpenChange} title={props.title}>
      {/* Remount per opening so the field starts from initialValue. */}
      {props.open && <PromptForm {...props} />}
    </WindowDialog>
  );
}

function PromptForm({ label, initialValue = "", confirmLabel = "OK", validate, selectStem, onSubmit, onOpenChange }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    const problem = trimmed ? (validate?.(trimmed) ?? null) : "Name can’t be empty";
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <label className="block space-y-1.5">
        <span className="text-[11.5px] font-medium text-muted">{label}</span>
        <Input
          autoFocus
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf(".");
            if (selectStem && dot > 0) e.target.setSelectionRange(0, dot);
            else e.target.select();
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(): void | Promise<void>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, danger, onConfirm }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <WindowDialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          autoFocus
          variant={danger ? "dangerSolid" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </WindowDialog>
  );
}
