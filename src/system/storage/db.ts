import Dexie, { type DexieOptions, type Table } from "dexie";
import type { FsNodeType } from "@/system/events/types";

/** Filesystem node metadata. Content lives in `contents` (see ADR-0002). */
export interface FsNodeRecord {
  id: string;
  /** Parent directory id. The root's parent is `ROOT_PARENT`. */
  parentId: string;
  name: string;
  type: FsNodeType;
  /** Content size in bytes (0 for directories). */
  size: number;
  mimeType: string | null;
  createdAt: number;
  modifiedAt: number;
}

export type FileData = string | ArrayBuffer;

export interface FsContentRecord {
  id: string;
  data: FileData;
}

export interface KvRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export const ROOT_ID = "root";
/** IndexedDB keys can't be null, so the root's parent is the empty string. */
export const ROOT_PARENT = "";

export const DATABASE_NAME = "nexus";

export class NexusDatabase extends Dexie {
  nodes!: Table<FsNodeRecord, string>;
  contents!: Table<FsContentRecord, string>;
  kv!: Table<KvRecord, string>;

  constructor(name: string = DATABASE_NAME, options?: DexieOptions) {
    super(name, options);
    // Schema history. Never edit a published version — add a new one with an upgrade().
    this.version(1).stores({
      // &[parentId+name] makes sibling names unique and gives O(log n) path-segment lookups.
      nodes: "id, parentId, &[parentId+name], name",
      contents: "id",
      kv: "key",
    });
  }
}
