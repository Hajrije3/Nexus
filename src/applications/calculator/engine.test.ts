import { describe, expect, it } from "vitest";
import { calcReducer, initialCalcState, keyToInput, type CalcState } from "./engine";

/** Feed a key sequence like "12+3=" through the reducer. */
function press(keys: string, from: CalcState = initialCalcState): CalcState {
  return [...keys].reduce((s, k) => {
    const input = keyToInput(k === "C" ? "Escape" : k === "<" ? "Backspace" : k);
    if (!input) throw new Error(`unmapped key ${k}`);
    return calcReducer(s, input);
  }, from);
}

describe("calculator engine", () => {
  it("does basic arithmetic", () => {
    expect(press("12+30=").display).toBe("42");
    expect(press("9-12=").display).toBe("-3");
    expect(press("7*6=").display).toBe("42");
    expect(press("1/4=").display).toBe("0.25");
  });

  it("chains operations left to right", () => {
    expect(press("2+3*4=").display).toBe("20");
  });

  it("hides binary floating point noise", () => {
    expect(press(".1+.2=").display).toBe("0.3");
  });

  it("repeats the last operation on repeated equals", () => {
    expect(press("5+2===").display).toBe("11");
  });

  it("reports division by zero and recovers on clear", () => {
    const s = press("8/0=");
    expect(s.display).toBe("Error");
    expect(s.error).toBe(true);
    expect(press("C", s).display).toBe("0");
    expect(press("3", s).display).toBe("3");
  });

  it("supports backspace, negate and percent", () => {
    expect(press("123<").display).toBe("12");
    expect(calcReducer(press("5"), { type: "negate" }).display).toBe("-5");
    expect(press("50%").display).toBe("0.5");
  });

  it("ignores a second decimal point", () => {
    expect(press("1.2.3").display).toBe("1.23");
  });

  it("starts a new operand after an operator", () => {
    const s = press("12+");
    expect(s.display).toBe("12");
    expect(press("3", s).display).toBe("3");
  });
});
