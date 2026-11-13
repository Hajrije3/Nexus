import type { KeyValueStore } from "@/system/storage/kv";
import type { VirtualFileSystem } from "./vfs";
import { HOME } from "./path";

/** Directories that must always exist. Recreated on every boot if missing. */
export const SYSTEM_DIRECTORIES = [
  `${HOME}/Documents`,
  `${HOME}/Downloads`,
  `${HOME}/Projects`,
  `${HOME}/Pictures`,
  "/applications",
  "/system",
  "/settings",
] as const;

/** Bump to ship new starter content to existing installs. */
const SEED_VERSION = 1;
const SEED_KEY = "fs.seedVersion";

const STARTER_FILES: Record<string, string> = {
  [`${HOME}/Documents/Welcome.md`]: `# Welcome to NEXUS

This file lives in the NEXUS virtual filesystem, stored in your browser's
IndexedDB. Edit it, move it, or delete it — changes persist across reloads.

## Your home directory

- **Documents** — notes and writing
- **Projects** — code you work on in Code Studio
- **Pictures** — images
- **Downloads** — everything else
`,
  [`${HOME}/Projects/hello-world/README.md`]: `# hello-world

A tiny starter project. Open it in Code Studio.
`,
  [`${HOME}/Projects/hello-world/index.html`]: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Hello, NEXUS</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <h1 id="greeting">Hello, NEXUS</h1>
    <script src="main.js"></script>
  </body>
</html>
`,
  [`${HOME}/Projects/hello-world/main.js`]: `const greeting = document.getElementById("greeting");
const hour = new Date().getHours();

greeting.textContent = hour < 12 ? "Good morning, NEXUS" : "Good afternoon, NEXUS";
`,
  [`${HOME}/Projects/hello-world/styles.css`]: `body {
  font-family: system-ui, sans-serif;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
}
`,
};

export interface SeedResult {
  /** Starter files were written during this boot. */
  seeded: boolean;
}

/**
 * Bring the filesystem to a usable state:
 * 1. Root and system directories always exist (cheap, idempotent).
 * 2. Starter files are written once per SEED_VERSION, never overwriting user files.
 */
export async function seedFileSystem(fs: VirtualFileSystem, kv: KeyValueStore): Promise<SeedResult> {
  await fs.init();
  for (const dir of SYSTEM_DIRECTORIES) await fs.mkdir(dir, { recursive: true });

  const version = await kv.get(SEED_KEY, (v) => (typeof v === "number" ? v : null));
  if (version !== null && version >= SEED_VERSION) return { seeded: false };

  for (const [path, content] of Object.entries(STARTER_FILES)) {
    if (!(await fs.exists(path))) await fs.writeFile(path, content, { createParents: true });
  }
  await kv.set(SEED_KEY, SEED_VERSION);
  return { seeded: true };
}
