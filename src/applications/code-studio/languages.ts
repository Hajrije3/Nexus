import { extname, basename } from "@/system/fs/path";

const BY_EXTENSION: Record<string, [id: string, label: string]> = {
  ".ts": ["typescript", "TypeScript"],
  ".tsx": ["typescript", "TypeScript JSX"],
  ".js": ["javascript", "JavaScript"],
  ".jsx": ["javascript", "JavaScript JSX"],
  ".mjs": ["javascript", "JavaScript"],
  ".json": ["json", "JSON"],
  ".md": ["markdown", "Markdown"],
  ".html": ["html", "HTML"],
  ".css": ["css", "CSS"],
  ".scss": ["scss", "SCSS"],
  ".py": ["python", "Python"],
  ".sh": ["shell", "Shell"],
  ".yml": ["yaml", "YAML"],
  ".yaml": ["yaml", "YAML"],
  ".xml": ["xml", "XML"],
  ".svg": ["xml", "SVG"],
  ".sql": ["sql", "SQL"],
  ".go": ["go", "Go"],
  ".rs": ["rust", "Rust"],
  ".java": ["java", "Java"],
  ".c": ["c", "C"],
  ".cpp": ["cpp", "C++"],
};

/** Monaco language id and display label for a file. */
export function languageFor(path: string): { id: string; label: string } {
  const name = basename(path);
  if (name === "Dockerfile") return { id: "dockerfile", label: "Dockerfile" };
  const hit = BY_EXTENSION[extname(path)];
  return hit ? { id: hit[0], label: hit[1] } : { id: "plaintext", label: "Plain Text" };
}

/** Model URI for a path. `file://` lets Monaco's TS service resolve relative imports between open files. */
export const modelUri = (path: string) => `file://${path}`;
