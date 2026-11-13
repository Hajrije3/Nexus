/**
 * App SDK — filesystem access.
 *
 * `useFileSystem()` returns the shared filesystem service. `useDirectory()`
 * is a live directory listing: it reloads whenever a filesystem event touches
 * the directory, so every app showing the same folder stays in sync without
 * knowing about each other.
 */
import { useEffect, useState } from "react";
import { getServices } from "@/system/services";
import { systemEvents } from "@/system/events/bus";
import type { VirtualFileSystem, FsStat } from "@/system/fs/vfs";
import { dirname, isDescendant, normalize } from "@/system/fs/path";
import { TextDocumentSession, type DocumentCallbacks } from "@/system/documents";

export type { FsStat } from "@/system/fs/vfs";
export { FsError, isFsError } from "@/system/fs/errors";
export * as paths from "@/system/fs/path";

export function useFileSystem(): VirtualFileSystem {
  return getServices().fs;
}

export type DirectoryState =
  | { status: "loading"; entries: readonly FsStat[]; error: null }
  | { status: "ready"; entries: readonly FsStat[]; error: null }
  | { status: "error"; entries: readonly FsStat[]; error: Error };

interface Loaded {
  path: string;
  entries: readonly FsStat[];
  error: Error | null;
}

/** Does a change at `changed` affect the listing of directory `dir`? */
export function affectsDirectory(dir: string, changed: string): boolean {
  return changed === dir || dirname(changed) === dir || isDescendant(changed, dir);
}

export function useDirectory(path: string): DirectoryState & { reload(): void } {
  const fs = useFileSystem();
  const dir = normalize(path);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let request = 0;
    const load = () => {
      const id = ++request;
      fs.readdir(dir).then(
        (entries) => !cancelled && id === request && setLoaded({ path: dir, entries, error: null }),
        (error: unknown) =>
          !cancelled &&
          id === request &&
          setLoaded({ path: dir, entries: [], error: error instanceof Error ? error : new Error(String(error)) }),
      );
    };
    load();

    const hit = (p: string) => affectsDirectory(dir, p) && load();
    const offs = [
      systemEvents.on("fs.created", (e) => hit(e.path)),
      systemEvents.on("fs.modified", (e) => hit(e.path)),
      systemEvents.on("fs.deleted", (e) => hit(e.path)),
      systemEvents.on("fs.moved", (e) => (affectsDirectory(dir, e.from) || affectsDirectory(dir, e.to)) && load()),
    ];
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, [fs, dir, nonce]);

  const reload = () => setNonce((n) => n + 1);

  // A result for a different path is stale: we're loading the new one.
  if (!loaded || loaded.path !== dir) return { status: "loading", entries: [], error: null, reload };
  if (loaded.error) return { status: "error", entries: [], error: loaded.error, reload };
  return { status: "ready", entries: loaded.entries, error: null, reload };
}

/**
 * Open a text file for editing: autosave, external-change reload, move
 * tracking and deletion notices. Call `dispose()` when done.
 */
export function openDocument(path: string, callbacks: DocumentCallbacks = {}, debounceMs?: number): TextDocumentSession {
  return new TextDocumentSession(getServices().fs, path, systemEvents, callbacks, debounceMs);
}

export type { SaveState, DocumentCallbacks } from "@/system/documents";
