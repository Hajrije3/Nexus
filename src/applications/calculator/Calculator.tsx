"use client";

import { useEffect, useReducer } from "react";
import { useWindow } from "@/system/sdk/window";
import { cn } from "@/lib/utils";
import { calcReducer, formatNumber, initialCalcState, keyToInput, type CalcInput, type Operator } from "./engine";

type Key = { label: React.ReactNode; aria: string; input: CalcInput; kind: "digit" | "fn" | "op"; wide?: boolean };

const op = (o: Operator, aria: string): Key => ({ label: o === "-" ? "−" : o, aria, input: { type: "operator", operator: o }, kind: "op" });
const digit = (d: string): Key => ({ label: d, aria: d, input: { type: "digit", digit: d }, kind: "digit" });

export default function Calculator() {
  const [state, dispatch] = useReducer(calcReducer, initialCalcState);
  const { windowId, isFocused } = useWindow();

  // Keyboard input while this window is focused (and focus isn't in a text field elsewhere).
  useEffect(() => {
    if (!isFocused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      const owner = t.closest("[data-window-id]");
      if (owner && owner.getAttribute("data-window-id") !== windowId) return;
      const input = keyToInput(e.key);
      if (!input) return;
      e.preventDefault();
      dispatch(input);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFocused, windowId]);

  const keys: Key[] = [
    { label: state.display === "0" ? "AC" : "C", aria: "Clear", input: { type: "clear" }, kind: "fn" },
    { label: "±", aria: "Negate", input: { type: "negate" }, kind: "fn" },
    { label: "%", aria: "Percent", input: { type: "percent" }, kind: "fn" },
    op("÷", "Divide"),
    digit("7"), digit("8"), digit("9"), op("×", "Multiply"),
    digit("4"), digit("5"), digit("6"), op("-", "Subtract"),
    digit("1"), digit("2"), digit("3"), op("+", "Add"),
    { ...digit("0"), wide: true },
    { label: ".", aria: "Decimal point", input: { type: "dot" }, kind: "digit" },
    { label: "=", aria: "Equals", input: { type: "equals" }, kind: "op" },
  ];

  const expression = state.operator && state.stored !== null ? `${formatNumber(state.stored)} ${state.operator === "-" ? "−" : state.operator}` : "";
  const size = state.display.length > 12 ? "text-[26px]" : state.display.length > 9 ? "text-[32px]" : "text-[40px]";

  return (
    <div className="flex h-full flex-col bg-surface-sunken p-3">
      <div className="flex flex-1 flex-col items-end justify-end gap-0.5 px-2 pb-3" aria-live="polite">
        <div className="h-4 text-[12px] text-subtle tabular-nums">{expression}</div>
        <div
          data-selectable
          data-testid="calc-display"
          className={cn("w-full truncate text-right font-light tracking-tight text-fg tabular-nums", size)}
        >
          {state.display}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => {
          const pending = k.input.type === "operator" && state.operator === k.input.operator && state.overwrite;
          return (
            <button
              key={k.aria}
              type="button"
              aria-label={k.aria}
              onClick={() => dispatch(k.input)}
              className={cn(
                "flex h-12 items-center justify-center rounded-lg text-[17px] transition-[background-color,filter] active:brightness-90",
                k.wide && "col-span-2",
                k.kind === "digit" && "bg-surface-raised text-fg hover:bg-hover",
                k.kind === "fn" && "bg-active text-muted hover:text-fg",
                k.kind === "op" && (pending ? "bg-fg text-surface" : "bg-accent text-accent-fg hover:brightness-110"),
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
