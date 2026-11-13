import { extname } from "./path";

export type FileKind = "folder" | "image" | "document" | "code" | "data" | "other";

const CODE = new Set([".js", ".mjs", ".jsx", ".ts", ".tsx", ".html", ".css", ".py", ".sh", ".rs", ".go", ".java", ".c", ".cpp", ".rb", ".php"]);
const DATA = new Set([".json", ".csv", ".xml", ".yml", ".yaml", ".toml"]);
const DOCS = new Set([".md", ".txt", ".pdf", ".rtf"]);
const IMAGES = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

export function fileKind(name: string, type: "file" | "directory"): FileKind {
  if (type === "directory") return "folder";
  const ext = extname(name);
  if (IMAGES.has(ext)) return "image";
  if (CODE.has(ext)) return "code";
  if (DATA.has(ext)) return "data";
  if (DOCS.has(ext)) return "document";
  return "other";
}

const LABELS: Record<FileKind, string> = {
  folder: "Folder",
  image: "Image",
  document: "Document",
  code: "Source code",
  data: "Data",
  other: "File",
};

/** "Markdown document", "TypeScript source", or a generic label. */
export function kindLabel(name: string, type: "file" | "directory"): string {
  const ext = extname(name);
  const specific: Record<string, string> = {
    ".md": "Markdown document",
    ".txt": "Plain text",
    ".ts": "TypeScript source",
    ".tsx": "TypeScript source",
    ".js": "JavaScript source",
    ".html": "HTML document",
    ".css": "Stylesheet",
    ".json": "JSON data",
    ".png": "PNG image",
    ".jpg": "JPEG image",
    ".jpeg": "JPEG image",
    ".svg": "SVG image",
    ".pdf": "PDF document",
  };
  return specific[ext] ?? LABELS[fileKind(name, type)];
}
