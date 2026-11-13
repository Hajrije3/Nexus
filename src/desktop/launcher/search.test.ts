import { describe, expect, it } from "vitest";
import { rank, scoreMatch } from "./search";

const entries = [
  { title: "Activity Monitor", keywords: ["processes", "tasks"] },
  { title: "Calculator" },
  { title: "Close All Windows" },
  { title: "Welcome" },
];

describe("launcher search", () => {
  it("returns everything for an empty query, in order", () => {
    expect(rank(entries, "  ").map((e) => e.title)).toEqual(entries.map((e) => e.title));
  });

  it("ranks prefix matches above word and substring matches", () => {
    expect(rank(entries, "c").map((e) => e.title)).toEqual(["Calculator", "Close All Windows", "Activity Monitor", "Welcome"]);
  });

  it("matches keywords", () => {
    expect(rank(entries, "process").map((e) => e.title)).toEqual(["Activity Monitor"]);
  });

  it("matches in-order subsequences", () => {
    expect(scoreMatch({ title: "Calculator" }, "clc")).toBeGreaterThan(0);
    expect(scoreMatch({ title: "Calculator" }, "zz")).toBe(0);
  });
});
