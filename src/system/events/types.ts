/**
 * Every system event and its payload. Adding an event here is the only way to
 * make it emittable — the bus is fully typed against this map.
 *
 * Naming: `<domain>.<past-tense-verb>`.
 */
export type FsNodeType = "file" | "directory";

export interface SystemEventMap {
  /* Application runtime */
  "app.launched": { appId: string; instanceId: string };
  "app.terminated": { appId: string; instanceId: string };
  /** A single-instance app was launched again; `args` carry the new request. */
  "app.relaunched": { appId: string; instanceId: string; args: Readonly<Record<string, string | number | boolean>> };

  /* Window manager */
  "window.opened": { windowId: string; appId: string; instanceId: string };
  "window.closed": { windowId: string; appId: string; instanceId: string };
  "window.focused": { windowId: string | null; appId: string | null };

  /* Filesystem */
  "fs.created": { path: string; type: FsNodeType };
  "fs.modified": { path: string };
  "fs.deleted": { path: string; type: FsNodeType };
  "fs.moved": { from: string; to: string; type: FsNodeType };
  /** An application opened a file for viewing/editing. */
  "file.opened": { path: string; appId: string };

  /* System */
  "workspace.restored": { windows: number; skippedApps: readonly string[] };
  "storage.degraded": { reason: string };
  "theme.changed": { theme: "light" | "dark" };
  "notification.received": { id: string; title: string; body?: string; appId?: string };
}

export type SystemEventType = keyof SystemEventMap;

export interface EventMeta {
  /** Monotonic sequence number, unique per bus. */
  seq: number;
  timestamp: number;
}

/** A dispatched event, as seen by wildcard listeners and the history buffer. */
export type SystemEvent<M = SystemEventMap> = {
  [K in keyof M]: { type: K; payload: M[K] } & EventMeta;
}[keyof M];
