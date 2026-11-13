/**
 * File associations: decide which application opens a path.
 *
 * Directories open in Files. For files, every installed app's `fileHandlers`
 * are matched against the extension (and text-ness); the highest priority wins
 * unless the caller names an app ("Open With").
 */
import { extname, basename } from "@/system/fs/path";
import { isTextMime, mimeTypeFor } from "@/system/fs/mime";
import type { VirtualFileSystem } from "@/system/fs/vfs";
import type { AppRegistry } from "./registry";
import type { Lifecycle } from "./lifecycle";
import type { AppId, AppManifest, LaunchResult } from "./types";

export const FILES_APP_ID = "nexus.files";

/** Apps able to open `path`, best first. */
export function appsForFile(path: string, apps: readonly AppManifest[]): AppManifest[] {
  const ext = extname(path);
  const text = isTextMime(mimeTypeFor(path));
  const scored: { app: AppManifest; priority: number }[] = [];
  for (const app of apps) {
    let best = -Infinity;
    for (const h of app.fileHandlers ?? []) {
      if (h.textOnly && !text) continue;
      if (h.extensions === "*" || h.extensions.includes(ext)) best = Math.max(best, h.priority);
    }
    if (best > -Infinity) scored.push({ app, priority: best });
  }
  return scored.sort((a, b) => b.priority - a.priority).map((s) => s.app);
}

export interface OpenDeps {
  fs: Pick<VirtualFileSystem, "stat">;
  registry: Pick<AppRegistry, "list" | "get">;
  lifecycle: Pick<Lifecycle, "launchApp">;
}

export async function openPath(path: string, deps: OpenDeps, options: { appId?: AppId } = {}): Promise<LaunchResult> {
  let stat;
  try {
    stat = await deps.fs.stat(path);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (stat.type === "directory") {
    return deps.lifecycle.launchApp(options.appId ?? FILES_APP_ID, { path: stat.path });
  }

  const appId = options.appId ?? appsForFile(stat.path, deps.registry.list())[0]?.id;
  if (!appId) return { ok: false, error: `No application can open “${basename(stat.path)}”` };
  return deps.lifecycle.launchApp(appId, { path: stat.path });
}
