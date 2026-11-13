/**
 * File I/O helpers for the Files app: moving data between the user's real
 * computer and the virtual filesystem, and validating names.
 */
import type { VirtualFileSystem } from "@/system/fs/vfs";
import { join, validateName } from "@/system/fs/path";
import { isTextMime, mimeTypeFor } from "@/system/fs/mime";
import { uniqueName } from "@/system/fs/names";

/** Max size for a single uploaded file. IndexedDB can hold more, but the UI stays responsive. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface UploadResult {
  written: string[];
  skipped: { name: string; reason: string }[];
}

/** Copy files from the host OS (file picker or drag-and-drop) into `dir`. */
export async function uploadFiles(fs: VirtualFileSystem, files: Iterable<File>, dir: string): Promise<UploadResult> {
  const result: UploadResult = { written: [], skipped: [] };
  const taken = new Set((await fs.readdir(dir)).map((e) => e.name));
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      result.skipped.push({ name: file.name, reason: "larger than 50 MB" });
      continue;
    }
    try {
      validateName(file.name);
      const name = uniqueName(file.name, taken, "copy");
      // Keep text as strings so editors can open it directly; binary stays binary.
      const data = isTextMime(mimeTypeFor(name)) && file.type !== "application/octet-stream" ? await file.text() : await file.arrayBuffer();
      await fs.writeFile(join(dir, name), data);
      taken.add(name);
      result.written.push(join(dir, name));
    } catch (error) {
      result.skipped.push({ name: file.name, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/** Save a virtual file to the host OS via the browser's download mechanism. */
export async function downloadFile(fs: VirtualFileSystem, path: string, name: string): Promise<void> {
  const data = await fs.readFile(path);
  const blob = new Blob([data], { type: mimeTypeFor(path) ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export { nameProblem } from "@/system/fs/names";
