import { describe, expect, it } from "vitest";
import { formatBytes, formatDate } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [1048576, "1 MB"],
    [150 * 1024 * 1024, "150 MB"],
    [-1, "—"],
  ])("%d → %s", (n, s) => expect(formatBytes(n)).toBe(s));
});

describe("formatDate", () => {
  const now = new Date(2026, 10, 13, 15, 0).getTime();
  it("uses relative day names", () => {
    expect(formatDate(new Date(2026, 10, 13, 9, 30).getTime(), now)).toMatch(/^Today at /);
    expect(formatDate(new Date(2026, 10, 12, 23, 0).getTime(), now)).toMatch(/^Yesterday at /);
    expect(formatDate(new Date(2026, 9, 1).getTime(), now)).not.toMatch(/Today|Yesterday/);
  });
});
