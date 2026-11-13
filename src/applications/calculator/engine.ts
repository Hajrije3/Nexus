export type Operator = "+" | "-" | "×" | "÷";

export interface CalcState {
  display: string;
  stored: number | null;
  operator: Operator | null;
  /** Next digit starts a new operand instead of appending. */
  overwrite: boolean;
  /** Last `=` operand, so repeated `=` repeats the operation. */
  lastOperand: number | null;
  lastOperator: Operator | null;
  error: boolean;
}

export type CalcInput =
  | { type: "digit"; digit: string }
  | { type: "dot" }
  | { type: "operator"; operator: Operator }
  | { type: "equals" }
  | { type: "clear" }
  | { type: "backspace" }
  | { type: "negate" }
  | { type: "percent" };

const MAX_DIGITS = 15;

export const initialCalcState: CalcState = {
  display: "0",
  stored: null,
  operator: null,
  overwrite: false,
  lastOperand: null,
  lastOperator: null,
  error: false,
};

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const rounded = Number(n.toPrecision(12));
  const abs = Math.abs(rounded);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return rounded.toExponential(6).replace(/\.?0+e/, "e");
  return String(rounded);
}

function compute(a: number, b: number, op: Operator): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? Number.NaN : a / b;
  }
}

function withResult(state: CalcState, value: number, patch: Partial<CalcState>): CalcState {
  if (!Number.isFinite(value)) return { ...initialCalcState, display: "Error", error: true };
  return { ...state, ...patch, display: formatNumber(value), overwrite: true };
}

export function calcReducer(state: CalcState, input: CalcInput): CalcState {
  if (state.error && input.type !== "digit" && input.type !== "dot") {
    return input.type === "clear" || input.type === "backspace" ? initialCalcState : state;
  }
  const s = state.error ? initialCalcState : state;
  const current = Number(s.display);

  switch (input.type) {
    case "digit": {
      if (s.overwrite) return { ...s, display: input.digit, overwrite: false };
      if (s.display.replace(/[-.]/g, "").length >= MAX_DIGITS) return s;
      return { ...s, display: s.display === "0" ? input.digit : s.display === "-0" ? `-${input.digit}` : s.display + input.digit };
    }
    case "dot": {
      if (s.overwrite) return { ...s, display: "0.", overwrite: false };
      return s.display.includes(".") ? s : { ...s, display: `${s.display}.` };
    }
    case "operator": {
      if (s.operator && s.stored !== null && !s.overwrite) {
        return withResult(s, compute(s.stored, current, s.operator), {
          stored: compute(s.stored, current, s.operator),
          operator: input.operator,
        });
      }
      return { ...s, stored: current, operator: input.operator, overwrite: true };
    }
    case "equals": {
      if (s.operator && s.stored !== null) {
        return withResult(s, compute(s.stored, current, s.operator), {
          stored: null,
          operator: null,
          lastOperand: current,
          lastOperator: s.operator,
        });
      }
      if (s.lastOperator && s.lastOperand !== null) {
        return withResult(s, compute(current, s.lastOperand, s.lastOperator), {});
      }
      return { ...s, overwrite: true };
    }
    case "clear":
      return initialCalcState;
    case "backspace": {
      if (s.overwrite) return s;
      const next = s.display.slice(0, -1);
      return { ...s, display: next === "" || next === "-" ? "0" : next };
    }
    case "negate": {
      if (s.display === "0") return s;
      return { ...s, display: s.display.startsWith("-") ? s.display.slice(1) : `-${s.display}` };
    }
    case "percent":
      return withResult(s, current / 100, {});
  }
}

/** Map a keyboard event key to a calculator input. */
export function keyToInput(key: string): CalcInput | null {
  if (/^[0-9]$/.test(key)) return { type: "digit", digit: key };
  switch (key) {
    case ".":
    case ",":
      return { type: "dot" };
    case "+":
      return { type: "operator", operator: "+" };
    case "-":
      return { type: "operator", operator: "-" };
    case "*":
    case "x":
      return { type: "operator", operator: "×" };
    case "/":
      return { type: "operator", operator: "÷" };
    case "Enter":
    case "=":
      return { type: "equals" };
    case "Escape":
    case "Delete":
      return { type: "clear" };
    case "Backspace":
      return { type: "backspace" };
    case "%":
      return { type: "percent" };
    default:
      return null;
  }
}
