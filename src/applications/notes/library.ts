/**
 * Notes library logic (pure). A "note" is any .md or .txt file under the
 * user's Documents folder — notes are ordinary files, visible to every app.
 */
import { extname, HOME } from "@/system/fs/path";
import { splitExtension } from "@/system/fs/names";

export const NOTES_ROOT = `${HOME}/Documents`;
/** Where new notes are created. */
export const NEW_NOTES_DIR = `${HOME}/Documents/Notes`;
const NOTE_EXTENSIONS = new Set([".md", ".txt"]);

export interface NoteSummary {
  path: string;
  name: string;
  title: string;
  snippet: string;
  modifiedAt: number;
  /** Content used for search (truncated for very large files). */
  searchText: string;
}

export const isNoteFile = (name: string) => NOTE_EXTENSIONS.has(extname(name));

/** Title shown for a note: its file name without the extension. */
export const titleOf = (name: string) => splitExtension(name)[0];

/** First meaningful line of content, without Markdown syntax. */
export function snippetOf(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+>]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/[*_`~]|\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim();
    if (line) return line.slice(0, 140);
  }
  return "";
}

/** Case-insensitive search over title and content; all terms must match. */
export function filterNotes(notes: readonly NoteSummary[], query: string): NoteSummary[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...notes];
  return notes.filter((n) => {
    const hay = `${n.title}\n${n.searchText}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Turn a typed title into a safe file name, keeping the original extension. */
export function fileNameForTitle(title: string, extension: string): string {
  const clean = title
    .replace(/[/\\\0]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${clean || "Untitled"}${extension}`;
}
