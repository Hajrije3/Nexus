# ADR-0002: Filesystem storage model

- Status: Accepted
- Date: 2026-11-13

## Context

The virtual filesystem persists to IndexedDB (via Dexie). We must choose how
paths map to records, where file content lives, and how multi-step operations
stay consistent.

## Decision 1 — Node tree linked by `parentId` (not path-keyed records)

| | Path-keyed (`/a/b/c.txt` is the key) | Tree (`{ id, parentId, name }`) |
|---|---|---|
| Lookup by path | 1 read | 1 read per path segment (indexed) |
| Rename/move a directory | Rewrite **every descendant's** key | **1 write** |
| Stable identity across renames | No | Yes (`id`) |
| Sibling-name uniqueness | Implicit | `&[parentId+name]` unique index |

Moving and renaming folders is an everyday file-manager operation, and an open
editor tab should keep pointing at a file after it's renamed. Paths are short
(lookups cost a handful of indexed reads). **We use the tree.**

The root has id `root` and parent `""` (IndexedDB keys can't be `null`).

## Decision 2 — Metadata and content in separate tables

`nodes` holds small metadata records; `contents` holds file bodies keyed by
node id. Directory listings, searches and usage totals scan only `nodes` and
never deserialise file bodies, which matters once Pictures holds megabytes.
Content is `string | ArrayBuffer` so binary files (images) are supported.

## Decision 3 — Every mutation is one read-write transaction; events after commit

Check-then-act sequences ("fail with EEXIST, else create") run inside a single
Dexie `rw` transaction over `nodes` + `contents`, so they're atomic and a
thrown `FsError` rolls everything back. Events (`fs.created`, …) are queued
during the transaction and emitted only after it commits, so a listener can
never observe a change that was rolled back.

## Decision 4 — Transaction-bound tables are passed explicitly

Dexie normally finds "the current transaction" through implicit zone tracking.
During implementation, operations that chained several native `async`
helpers lost that context: later writes ran *outside* the transaction, which
then auto-committed and failed with `PrematureCommitError`. (Verified with
isolated reproductions: one or two levels of `await` worked, the real call
depth did not.)

All internal helpers therefore take a `Tables` argument. Inside a mutation it
contains `tx.table("nodes")` / `tx.table("contents")`, which Dexie binds
directly to the transaction object (`Table._tx`), independent of zones.
Outside transactions, the unbound `db.nodes` / `db.contents` are passed.

## Consequences

- Path resolution costs O(depth) indexed reads. Fine for interactive use; a
  path→id cache can be added later if profiling shows a need.
- Content search requires reading bodies; it belongs in a Web Worker
  (Phase 5) so the UI thread never blocks.
- Any new filesystem helper must take `Tables` and never touch `this.db.*`
  inside a mutation. This is documented at the top of `vfs.ts`.
- Schema changes require a new Dexie `version(n)` with an `upgrade()`; the
  existing version must never be edited.
