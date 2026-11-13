/**
 * Tab completion: command names for the first word, paths for the rest.
 */
import type { VirtualFileSystem } from "@/system/fs/vfs";
import { resolve } from "@/system/fs/path";

export interface Completion {
  /** The full new input line. */
  line: string;
  /** New cursor position. */
  cursor: number;
  /** Candidates to display when the completion is ambiguous. */
  candidates: string[];
}

function commonPrefix(values: readonly string[]): string {
  if (!values.length) return "";
  let prefix = values[0]!;
  for (const v of values) while (!v.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

export async function complete(
  line: string,
  cursor: number,
  ctx: { fs: Pick<VirtualFileSystem, "readdir">; cwd: string; commands: readonly string[] },
): Promise<Completion> {
  const before = line.slice(0, cursor);
  const after = line.slice(cursor);
  // The word being completed starts after the last unescaped space or operator.
  const start = Math.max(before.lastIndexOf(" "), before.lastIndexOf("|"), before.lastIndexOf(";"), before.lastIndexOf(">"), before.lastIndexOf("<")) + 1;
  const word = before.slice(start);
  const isCommand = before.slice(0, start).replace(/.*[|;&]/, "").trim() === "";

  let matches: string[];
  let base: string;
  if (isCommand && !word.includes("/")) {
    base = "";
    matches = ctx.commands.filter((c) => c.startsWith(word)).sort().map((c) => `${c} `);
  } else {
    const slash = word.lastIndexOf("/");
    base = slash === -1 ? "" : word.slice(0, slash + 1);
    const partial = word.slice(slash + 1);
    try {
      const entries = await ctx.fs.readdir(resolve(ctx.cwd, base || "."));
      matches = entries
        .filter((e) => e.name.startsWith(partial) && (partial.startsWith(".") || !e.name.startsWith(".")))
        .map((e) => (e.type === "directory" ? `${e.name}/` : `${e.name} `));
    } catch {
      matches = [];
    }
  }

  if (!matches.length) return { line, cursor, candidates: [] };
  const insert = matches.length === 1 ? matches[0]! : commonPrefix(matches.map((m) => m.trimEnd()));
  const completedWord = isCommand && !word.includes("/") ? insert : base + insert;
  const nextBefore = before.slice(0, start) + (completedWord.length >= word.length ? completedWord : word);
  return {
    line: nextBefore + after,
    cursor: nextBefore.length,
    candidates: matches.length > 1 ? matches.map((m) => m.trimEnd()) : [],
  };
}
