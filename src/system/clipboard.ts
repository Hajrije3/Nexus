/**
 * System file clipboard, shared by every window (copy in one Files window,
 * paste in another). Holds paths, not contents — like a real file manager.
 */
import { create } from "zustand";
import type { VirtualFileSystem } from "./fs/vfs";
import { basename, isDescendant, join } from "./fs/path";
import { uniqueName } from "./fs/names";

export interface FileClipboard {
  mode: "copy" | "cut";
  paths: readonly string[];
}

export const useFileClipboard = create<{ entry: FileClipboard | null }>()(() => ({ entry: null }));

export function setFileClipboard(entry: FileClipboard | null): void {
  useFileClipboard.setState({ entry });
}

export interface PasteResult {
  pasted: string[];
  errors: { path: string; message: string }[];
}

/**
 * Paste clipboard paths into `destDir`. Copies get a non-conflicting name
 * ("x copy.txt"); cuts move and clear the clipboard. Cutting into the same
 * folder is a no-op; moving a folder into itself is reported as an error.
 */
export async function pasteInto(
  fs: Pick<VirtualFileSystem, "readdir" | "copy" | "rename">,
  entry: FileClipboard,
  destDir: string,
): Promise<PasteResult> {
  const result: PasteResult = { pasted: [], errors: [] };
  const taken = new Set((await fs.readdir(destDir)).map((e) => e.name));

  for (const src of entry.paths) {
    const name = basename(src);
    try {
      if (entry.mode === "cut") {
        if (join(destDir, name) === src) continue;
        if (src === destDir || isDescendant(src, destDir)) throw new Error(`Can’t move “${name}” into itself`);
        const target = uniqueName(name, taken);
        await fs.rename(src, join(destDir, target));
        taken.add(target);
        result.pasted.push(join(destDir, target));
      } else {
        const target = uniqueName(name, taken, "copy");
        await fs.copy(src, join(destDir, target));
        taken.add(target);
        result.pasted.push(join(destDir, target));
      }
    } catch (error) {
      result.errors.push({ path: src, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (entry.mode === "cut") setFileClipboard(null);
  return result;
}
