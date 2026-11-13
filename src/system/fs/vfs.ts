/**
 * Virtual filesystem service.
 *
 * A tree of nodes linked by `parentId` (ADR-0002), stored in IndexedDB via
 * Dexie. Every mutating operation runs in a single read-write transaction, so
 * check-then-act sequences (e.g. "fail if exists, else create") are atomic,
 * and a failure leaves no partial state. Events are emitted only after the
 * transaction commits, so listeners never observe uncommitted changes.
 *
 * Transaction binding: internal helpers receive the tables to use explicitly
 * (`Tables`). Inside a mutation these are bound to the transaction via
 * `tx.table()`, so correctness never depends on Dexie's implicit zone tracking
 * surviving deep chains of native `await`s (which it does not reliably do —
 * see ADR-0002, "Consequences").
 */
import type { Table } from "dexie";
import { createId } from "@/lib/utils";
import type { EventBus } from "@/system/events/bus";
import type { FsNodeType, SystemEventMap } from "@/system/events/types";
import {
  ROOT_ID,
  ROOT_PARENT,
  type FileData,
  type FsContentRecord,
  type FsNodeRecord,
  type NexusDatabase,
} from "@/system/storage/db";
import { FsError } from "./errors";
import { mimeTypeFor } from "./mime";
import { basename, dirname, HOME, isDescendant, join, normalize, ROOT, segments, validateName } from "./path";

export interface FsStat {
  /** Stable identity: survives renames and moves. */
  id: string;
  path: string;
  name: string;
  type: FsNodeType;
  size: number;
  mimeType: string | null;
  createdAt: number;
  modifiedAt: number;
}

export interface SearchOptions {
  /** Only return results inside this directory. */
  root?: string;
  type?: FsNodeType;
  limit?: number;
}

export interface FsUsage {
  files: number;
  directories: number;
  bytes: number;
}

export interface VfsOptions {
  events?: EventBus<SystemEventMap>;
  now?: () => number;
  /** Paths that can't be removed or renamed (contents may still change). */
  protectedPaths?: readonly string[];
}

export const DEFAULT_PROTECTED_PATHS: readonly string[] = [
  ROOT,
  "/home",
  HOME,
  "/system",
  "/applications",
  "/settings",
];

interface Tables {
  nodes: Table<FsNodeRecord, string>;
  contents: Table<FsContentRecord, string>;
}

type PendingEvent = { [K in keyof SystemEventMap]: [K, SystemEventMap[K]] }[keyof SystemEventMap];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function byteLength(data: FileData): number {
  return typeof data === "string" ? encoder.encode(data).byteLength : data.byteLength;
}

function compareEntries(a: FsNodeRecord, b: FsNodeRecord): number {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export class VirtualFileSystem {
  private readonly events: EventBus<SystemEventMap> | undefined;
  private readonly now: () => number;
  private readonly protectedPaths: ReadonlySet<string>;
  /** Unbound tables for read-only queries outside a transaction. */
  private readonly t: Tables;

  constructor(
    private readonly db: NexusDatabase,
    options: VfsOptions = {},
  ) {
    this.events = options.events;
    this.now = options.now ?? Date.now;
    this.protectedPaths = new Set(options.protectedPaths ?? DEFAULT_PROTECTED_PATHS);
    this.t = { nodes: db.nodes, contents: db.contents };
  }

  /** Ensure the root directory exists. Idempotent. */
  async init(): Promise<void> {
    await this.mutate(async (t) => {
      if (await t.nodes.get(ROOT_ID)) return;
      const time = this.now();
      await t.nodes.add({
        id: ROOT_ID,
        parentId: ROOT_PARENT,
        name: "",
        type: "directory",
        size: 0,
        mimeType: null,
        createdAt: time,
        modifiedAt: time,
      });
    });
  }

  /* ───────────────────────────── Queries ───────────────────────────── */

  async stat(path: string): Promise<FsStat> {
    const p = normalize(path);
    return this.toStat(await this.requireNode(this.t, p), p);
  }

  async exists(path: string): Promise<boolean> {
    try {
      return (await this.lookup(this.t, normalize(path))) !== undefined;
    } catch (error) {
      if (error instanceof FsError && error.code === "ENOTDIR") return false;
      throw error;
    }
  }

  /** Directory listing: directories first, then natural name order. */
  async readdir(path: string): Promise<FsStat[]> {
    const p = normalize(path);
    const dir = await this.requireDir(this.t, p);
    const children = await this.t.nodes.where("parentId").equals(dir.id).toArray();
    return children.sort(compareEntries).map((c) => this.toStat(c, join(p, c.name)));
  }

  async readFile(path: string): Promise<FileData> {
    const p = normalize(path);
    const node = await this.requireNode(this.t, p);
    if (node.type === "directory") throw new FsError("EISDIR", undefined, p);
    const content = await this.t.contents.get(node.id);
    return content?.data ?? "";
  }

  async readText(path: string): Promise<string> {
    const data = await this.readFile(path);
    return typeof data === "string" ? data : decoder.decode(data);
  }

  /** All descendants of a directory, depth-first, each level in listing order. */
  async walk(path: string): Promise<FsStat[]> {
    const p = normalize(path);
    const root = await this.requireDir(this.t, p);
    const out: FsStat[] = [];
    const visit = async (dirId: string, dirPath: string): Promise<void> => {
      const children = (await this.t.nodes.where("parentId").equals(dirId).toArray()).sort(compareEntries);
      for (const child of children) {
        const childPath = join(dirPath, child.name);
        out.push(this.toStat(child, childPath));
        if (child.type === "directory") await visit(child.id, childPath);
      }
    };
    await visit(root.id, p);
    return out;
  }

  /**
   * Case-insensitive name search. Ranked: exact name, name prefix, substring;
   * ties broken by shallower path. (Content search is a Phase 5 worker task.)
   */
  async search(query: string, options: SearchOptions = {}): Promise<FsStat[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const root = normalize(options.root ?? ROOT);
    const limit = options.limit ?? 50;

    const matches = await this.t.nodes
      .filter((n) => n.id !== ROOT_ID && n.name.toLowerCase().includes(q) && (!options.type || n.type === options.type))
      .toArray();

    const paths = new Map<string, string>();
    const results: { stat: FsStat; rank: number }[] = [];
    for (const node of matches) {
      const path = await this.pathOf(this.t, node, paths);
      if (path === null) continue; // orphan — shouldn't happen, but never crash a search
      if (root !== ROOT && path !== root && !isDescendant(root, path)) continue;
      const name = node.name.toLowerCase();
      const rank = name === q ? 0 : name.startsWith(q) ? 1 : 2;
      results.push({ stat: this.toStat(node, path), rank });
    }

    return results
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          segments(a.stat.path).length - segments(b.stat.path).length ||
          a.stat.path.localeCompare(b.stat.path),
      )
      .slice(0, limit)
      .map((r) => r.stat);
  }

  async usage(): Promise<FsUsage> {
    const usage: FsUsage = { files: 0, directories: 0, bytes: 0 };
    await this.t.nodes.each((n) => {
      if (n.id === ROOT_ID) return;
      if (n.type === "directory") usage.directories++;
      else {
        usage.files++;
        usage.bytes += n.size;
      }
    });
    return usage;
  }

  /* ──────────────────────────── Mutations ──────────────────────────── */

  /** Create a directory. With `recursive`, behaves like `mkdir -p`. */
  async mkdir(path: string, { recursive = false }: { recursive?: boolean } = {}): Promise<FsStat> {
    const p = normalize(path);
    return this.mutate(async (t, events) => {
      if (recursive) {
        const node = await this.ensureDirectories(t, p, events);
        return this.toStat(node, p);
      }
      if (p === ROOT) throw new FsError("EEXIST", undefined, p);
      const parent = await this.requireDir(t, dirname(p));
      const name = basename(p);
      validateName(name);
      if (await this.child(t, parent.id, name)) throw new FsError("EEXIST", undefined, p);
      const node = await this.insert(t, parent.id, name, "directory", null);
      events.push(["fs.created", { path: p, type: "directory" }]);
      return this.toStat(node, p);
    });
  }

  /** Create or overwrite a file. */
  async writeFile(
    path: string,
    data: FileData,
    { createParents = false }: { createParents?: boolean } = {},
  ): Promise<FsStat> {
    const p = normalize(path);
    if (p === ROOT) throw new FsError("EISDIR", undefined, p);
    const name = basename(p);
    validateName(name);

    return this.mutate(async (t, events) => {
      const parent = createParents
        ? await this.ensureDirectories(t, dirname(p), events)
        : await this.requireDir(t, dirname(p));
      const existing = await this.child(t, parent.id, name);
      if (existing?.type === "directory") throw new FsError("EISDIR", undefined, p);

      const size = byteLength(data);
      if (existing) {
        const updated: FsNodeRecord = { ...existing, size, modifiedAt: this.now() };
        await t.nodes.put(updated);
        await t.contents.put({ id: existing.id, data });
        events.push(["fs.modified", { path: p }]);
        return this.toStat(updated, p);
      }
      const node = await this.insert(t, parent.id, name, "file", data);
      events.push(["fs.created", { path: p, type: "file" }]);
      return this.toStat(node, p);
    });
  }

  /** Create an empty file, or bump the modification time of an existing node. */
  async touch(path: string): Promise<FsStat> {
    const p = normalize(path);
    if (p === ROOT) throw new FsError("EISDIR", undefined, p);
    const name = basename(p);
    validateName(name);

    return this.mutate(async (t, events) => {
      const parent = await this.requireDir(t, dirname(p));
      const existing = await this.child(t, parent.id, name);
      if (existing) {
        const next = { ...existing, modifiedAt: this.now() };
        await t.nodes.put(next);
        events.push(["fs.modified", { path: p }]);
        return this.toStat(next, p);
      }
      const node = await this.insert(t, parent.id, name, "file", "");
      events.push(["fs.created", { path: p, type: "file" }]);
      return this.toStat(node, p);
    });
  }

  /** Move and/or rename. The destination must not exist. */
  async rename(from: string, to: string): Promise<FsStat> {
    const src = normalize(from);
    const dest = normalize(to);
    if (src === dest) return this.stat(src);
    this.assertMutable(src);
    if (isDescendant(src, dest)) {
      throw new FsError("EINVAL", `Cannot move "${src}" into itself`, dest);
    }
    const name = basename(dest);
    validateName(name);

    return this.mutate(async (t, events) => {
      const node = await this.requireNode(t, src);
      const parent = await this.requireDir(t, dirname(dest));
      if (await this.child(t, parent.id, name)) throw new FsError("EEXIST", undefined, dest);
      const moved: FsNodeRecord = {
        ...node,
        parentId: parent.id,
        name,
        mimeType: node.type === "file" ? mimeTypeFor(name) : null,
      };
      await t.nodes.put(moved);
      events.push(["fs.moved", { from: src, to: dest, type: node.type }]);
      return this.toStat(moved, dest);
    });
  }

  /** Recursively copy a file or directory. The destination must not exist. */
  async copy(from: string, to: string): Promise<FsStat> {
    const src = normalize(from);
    const dest = normalize(to);
    if (src === dest || isDescendant(src, dest)) {
      throw new FsError("EINVAL", `Cannot copy "${src}" into itself`, dest);
    }
    const name = basename(dest);
    validateName(name);

    return this.mutate(async (t, events) => {
      const source = await this.requireNode(t, src);
      const parent = await this.requireDir(t, dirname(dest));
      if (await this.child(t, parent.id, name)) throw new FsError("EEXIST", undefined, dest);

      const time = this.now();
      const rootCopy: FsNodeRecord = {
        ...source,
        id: createId("node"),
        parentId: parent.id,
        name,
        mimeType: source.type === "file" ? mimeTypeFor(name) : null,
        createdAt: time,
        modifiedAt: time,
      };
      const nodes: FsNodeRecord[] = [rootCopy];
      const idMap = new Map<string, string>([[source.id, rootCopy.id]]);

      // Breadth-first clone of the subtree.
      const queue = [source.id];
      for (let i = 0; i < queue.length; i++) {
        const oldId = queue[i]!;
        const children = await t.nodes.where("parentId").equals(oldId).toArray();
        for (const c of children) {
          const copy: FsNodeRecord = { ...c, id: createId("node"), parentId: idMap.get(oldId)!, createdAt: time, modifiedAt: time };
          nodes.push(copy);
          idMap.set(c.id, copy.id);
          queue.push(c.id);
        }
      }

      const contents = await t.contents.bulkGet([...idMap.keys()]);
      await t.nodes.bulkAdd(nodes);
      await t.contents.bulkAdd(contents.flatMap((c) => (c ? [{ id: idMap.get(c.id)!, data: c.data }] : [])));
      events.push(["fs.created", { path: dest, type: source.type }]);
      return this.toStat(rootCopy, dest);
    });
  }

  /** Delete a file or directory. Non-empty directories require `recursive`. */
  async remove(path: string, { recursive = false }: { recursive?: boolean } = {}): Promise<void> {
    const p = normalize(path);
    this.assertMutable(p);
    await this.mutate(async (t, events) => {
      const node = await this.requireNode(t, p);
      const ids = [node.id];
      if (node.type === "directory") {
        for (let i = 0; i < ids.length; i++) {
          const childIds = await t.nodes.where("parentId").equals(ids[i]!).primaryKeys();
          if (i === 0 && childIds.length > 0 && !recursive) throw new FsError("ENOTEMPTY", undefined, p);
          ids.push(...childIds);
        }
      }
      await t.nodes.bulkDelete(ids);
      await t.contents.bulkDelete(ids);
      events.push(["fs.deleted", { path: p, type: node.type }]);
    });
  }

  /* ──────────────────────────── Internals ──────────────────────────── */

  /**
   * Run a mutation in one read-write transaction, with transaction-bound
   * tables, and emit its events only after a successful commit.
   */
  private async mutate<T>(fn: (t: Tables, events: PendingEvent[]) => Promise<T>): Promise<T> {
    const events: PendingEvent[] = [];
    const result = await this.db.transaction("rw", this.db.nodes, this.db.contents, (tx) =>
      fn(
        {
          nodes: tx.table<FsNodeRecord, string>("nodes"),
          contents: tx.table<FsContentRecord, string>("contents"),
        },
        events,
      ),
    );
    if (this.events) {
      const emit = this.events.emit.bind(this.events) as (type: PendingEvent[0], payload: PendingEvent[1]) => void;
      for (const [type, payload] of events) emit(type, payload);
    }
    return result;
  }

  private assertMutable(path: string): void {
    if (this.protectedPaths.has(path)) {
      throw new FsError("EPERM", `"${path}" is a protected system location`, path);
    }
  }

  private child(t: Tables, parentId: string, name: string): Promise<FsNodeRecord | undefined> {
    return t.nodes.where("[parentId+name]").equals([parentId, name]).first();
  }

  /** Resolve a normalised path to its node, or undefined if it doesn't exist. */
  private async lookup(t: Tables, path: string): Promise<FsNodeRecord | undefined> {
    let node = await t.nodes.get(ROOT_ID);
    for (const seg of segments(path)) {
      if (!node) return undefined;
      if (node.type !== "directory") throw new FsError("ENOTDIR", undefined, path);
      node = await this.child(t, node.id, seg);
    }
    return node;
  }

  private async requireNode(t: Tables, path: string): Promise<FsNodeRecord> {
    const node = await this.lookup(t, path);
    if (!node) throw new FsError("ENOENT", undefined, path);
    return node;
  }

  private async requireDir(t: Tables, path: string): Promise<FsNodeRecord> {
    const node = await this.requireNode(t, path);
    if (node.type !== "directory") throw new FsError("ENOTDIR", undefined, path);
    return node;
  }

  /** `mkdir -p`: create every missing directory along `path`. */
  private async ensureDirectories(t: Tables, path: string, events: PendingEvent[]): Promise<FsNodeRecord> {
    let node = await t.nodes.get(ROOT_ID);
    if (!node) throw new FsError("ENOENT", "Filesystem is not initialised", ROOT);
    let current = ROOT;
    for (const seg of segments(path)) {
      validateName(seg);
      current = join(current, seg);
      const existing: FsNodeRecord | undefined = await this.child(t, node.id, seg);
      if (existing) {
        if (existing.type !== "directory") throw new FsError("ENOTDIR", undefined, current);
        node = existing;
      } else {
        node = await this.insert(t, node.id, seg, "directory", null);
        events.push(["fs.created", { path: current, type: "directory" }]);
      }
    }
    return node;
  }

  private async insert(
    t: Tables,
    parentId: string,
    name: string,
    type: FsNodeType,
    data: FileData | null,
  ): Promise<FsNodeRecord> {
    const time = this.now();
    const node: FsNodeRecord = {
      id: createId("node"),
      parentId,
      name,
      type,
      size: data === null ? 0 : byteLength(data),
      mimeType: type === "file" ? mimeTypeFor(name) : null,
      createdAt: time,
      modifiedAt: time,
    };
    await t.nodes.add(node);
    if (type === "file") await t.contents.add({ id: node.id, data: data ?? "" });
    return node;
  }

  /** Absolute path of a node, walking up parent links (memoised per call). */
  private async pathOf(t: Tables, node: FsNodeRecord, cache: Map<string, string>): Promise<string | null> {
    if (node.id === ROOT_ID) return ROOT;
    const cached = cache.get(node.id);
    if (cached) return cached;
    const parent = await t.nodes.get(node.parentId);
    if (!parent) return null;
    const parentPath = await this.pathOf(t, parent, cache);
    if (parentPath === null) return null;
    const path = join(parentPath, node.name);
    cache.set(node.id, path);
    return path;
  }

  private toStat(node: FsNodeRecord, path: string): FsStat {
    return {
      id: node.id,
      path,
      name: node.id === ROOT_ID ? "/" : node.name,
      type: node.type,
      size: node.size,
      mimeType: node.mimeType,
      createdAt: node.createdAt,
      modifiedAt: node.modifiedAt,
    };
  }
}
