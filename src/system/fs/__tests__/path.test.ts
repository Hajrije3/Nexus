import { describe, expect, it } from "vitest";
import { basename, dirname, displayPath, extname, isDescendant, join, normalize, resolve, validateName } from "../path";
import { FsError } from "../errors";

describe("normalize", () => {
  it.each([
    ["/", "/"],
    ["//a///b/", "/a/b"],
    ["/a/./b/../c", "/a/c"],
    ["/../..", "/"],
    ["/a/b/../../..", "/"],
  ])("%s → %s", (input, expected) => expect(normalize(input)).toBe(expected));

  it("rejects relative paths", () => {
    expect(() => normalize("a/b")).toThrow(FsError);
  });
});

describe("resolve", () => {
  it("resolves relative to cwd", () => {
    expect(resolve("/home/user", "Documents/../Projects")).toBe("/home/user/Projects");
    expect(resolve("/home/user/Projects", "..")).toBe("/home/user");
  });
  it("lets absolute paths win", () => expect(resolve("/home", "/etc")).toBe("/etc"));
  it("expands ~", () => {
    expect(resolve("/", "~")).toBe("/home/user");
    expect(resolve("/", "~/Documents")).toBe("/home/user/Documents");
  });
});

describe("components", () => {
  it("dirname / basename / extname / join", () => {
    expect(dirname("/a/b/c.txt")).toBe("/a/b");
    expect(dirname("/a")).toBe("/");
    expect(basename("/a/b/c.txt")).toBe("c.txt");
    expect(basename("/")).toBe("");
    expect(extname("/a/Notes.MD")).toBe(".md");
    expect(extname("/a/.gitignore")).toBe("");
    expect(join("/a", "b/", "../c")).toBe("/a/c");
  });

  it("isDescendant is strict and segment-aware", () => {
    expect(isDescendant("/a", "/a/b")).toBe(true);
    expect(isDescendant("/a", "/a")).toBe(false);
    expect(isDescendant("/a", "/ab")).toBe(false);
    expect(isDescendant("/", "/x")).toBe(true);
  });

  it("collapses the home directory for display", () => {
    expect(displayPath("/home/user/Projects")).toBe("~/Projects");
    expect(displayPath("/home/user")).toBe("~");
    expect(displayPath("/home/username")).toBe("/home/username");
  });
});

describe("validateName", () => {
  it.each(["", ".", "..", "a/b", "a\0b", "x".repeat(256)])("rejects %j", (name) => {
    expect(() => validateName(name)).toThrow(FsError);
  });
  it("accepts ordinary names", () => {
    expect(() => validateName("My Notes (1).md")).not.toThrow();
  });
});
