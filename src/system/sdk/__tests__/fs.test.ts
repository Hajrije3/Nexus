import { describe, expect, it } from "vitest";
import { affectsDirectory } from "../fs";

describe("affectsDirectory", () => {
  it("matches the directory itself and its direct children", () => {
    expect(affectsDirectory("/home/user", "/home/user")).toBe(true);
    expect(affectsDirectory("/home/user", "/home/user/notes.md")).toBe(true);
    expect(affectsDirectory("/", "/notes.md")).toBe(true);
  });

  it("matches changes to an ancestor (e.g. the folder being moved away)", () => {
    expect(affectsDirectory("/home/user/Projects", "/home")).toBe(true);
  });

  it("ignores grandchildren and unrelated paths", () => {
    expect(affectsDirectory("/home/user", "/home/user/Projects/a.ts")).toBe(false);
    expect(affectsDirectory("/home/user", "/home/username")).toBe(false);
  });
});
