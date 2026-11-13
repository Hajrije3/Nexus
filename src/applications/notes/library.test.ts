import { describe, expect, it } from "vitest";
import { fileNameForTitle, filterNotes, isNoteFile, snippetOf, titleOf, type NoteSummary } from "./library";

describe("notes library", () => {
  it("recognises note files and derives titles", () => {
    expect(isNoteFile("a.md")).toBe(true);
    expect(isNoteFile("a.TXT")).toBe(true);
    expect(isNoteFile("a.ts")).toBe(false);
    expect(titleOf("Meeting notes.md")).toBe("Meeting notes");
  });

  it("extracts a clean snippet", () => {
    expect(snippetOf("\n\n# Heading\nbody")).toBe("Heading");
    expect(snippetOf("- **bold** and [link](http://x) `code`")).toBe("bold and link code");
    expect(snippetOf("   \n")).toBe("");
  });

  it("filters by every term across title and content", () => {
    const notes: NoteSummary[] = [
      { path: "/a.md", name: "a.md", title: "Groceries", snippet: "", modifiedAt: 0, searchText: "milk eggs" },
      { path: "/b.md", name: "b.md", title: "Trip", snippet: "", modifiedAt: 0, searchText: "pack eggs and maps" },
    ];
    expect(filterNotes(notes, "eggs").map((n) => n.title)).toEqual(["Groceries", "Trip"]);
    expect(filterNotes(notes, "EGGS maps").map((n) => n.title)).toEqual(["Trip"]);
    expect(filterNotes(notes, "groc").map((n) => n.title)).toEqual(["Groceries"]);
  });

  it("sanitises titles into file names", () => {
    expect(fileNameForTitle("  Q3 / Q4   plans ", ".md")).toBe("Q3 - Q4 plans.md");
    expect(fileNameForTitle("", ".txt")).toBe("Untitled.txt");
  });
});
