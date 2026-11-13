import { extname } from "./path";

const TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".jsx": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".html": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".yml": "application/yaml",
  ".yaml": "application/yaml",
  ".py": "text/x-python",
  ".sh": "application/x-sh",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export function mimeTypeFor(path: string): string | null {
  return TYPES[extname(path)] ?? null;
}

export function isTextMime(mime: string | null): boolean {
  if (!mime) return true; // unknown extensions default to text, like most editors
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/yaml" ||
    mime === "application/x-sh" ||
    mime === "image/svg+xml"
  );
}
