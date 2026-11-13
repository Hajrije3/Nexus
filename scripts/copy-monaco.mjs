/**
 * Copy Monaco's prebuilt AMD bundle into /public so Code Studio can load it
 * from our own origin (offline-capable, no CDN, no bundler involvement).
 * See docs/adr/0004-self-hosted-monaco.md. Skips work when already current.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// monaco-editor's "exports" map hides package.json, so locate the package directly.
const pkgRoot = join(process.cwd(), "node_modules", "monaco-editor");
const pkgPath = join(pkgRoot, "package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const source = join(pkgRoot, "min", "vs");
const target = join(process.cwd(), "public", "monaco", "vs");
const stamp = join(process.cwd(), "public", "monaco", ".version");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version && existsSync(join(target, "loader.js"))) {
  process.exit(0);
}

rmSync(join(process.cwd(), "public", "monaco"), { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
writeFileSync(stamp, version);
console.log(`[copy-monaco] monaco-editor ${version} → public/monaco/vs`);
