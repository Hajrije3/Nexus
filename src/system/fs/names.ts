import { FsError } from "./errors";
import { validateName } from "./path";

/** Split "report.final.md" into ["report.final", ".md"]; dotfiles have no extension. */
export function splitExtension(name: string): [stem: string, ext: string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/**
 * A name not in `taken`, derived from `desired`.
 *  - "number" style: "untitled folder", "untitled folder 2", …
 *  - "copy" style:   "notes.md", "notes copy.md", "notes copy 2.md", …
 * Comparison is case-sensitive, matching the filesystem.
 */
export function uniqueName(desired: string, taken: ReadonlySet<string>, style: "number" | "copy" = "number"): string {
  if (!taken.has(desired)) return desired;
  const [stem, ext] = splitExtension(desired);
  const base = style === "copy" ? `${stem} copy` : stem;
  if (style === "copy" && !taken.has(`${base}${ext}`)) return `${base}${ext}`;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Validation message for a new/renamed entry, or null if acceptable. */
export function nameProblem(name: string, siblings: ReadonlySet<string>, current?: string): string | null {
  try {
    validateName(name);
  } catch (error) {
    return error instanceof FsError ? error.message : "Invalid name";
  }
  if (name !== current && siblings.has(name)) return `“${name}” already exists here`;
  return null;
}
