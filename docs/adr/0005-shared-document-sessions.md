# ADR-0005: Shared document sessions for editors

- Status: Accepted
- Date: 2026-11-13

## Context

Notes and Code Studio both edit files that other apps can change at any time:
the Terminal can overwrite them, Files can move or delete them, and the same
file can be open in both editors. Each editor needs autosave, a save state,
and correct behaviour when the file changes underneath it.

## Decision

A single framework-free class, `TextDocumentSession` (`system/documents.ts`),
exposed to apps as `openDocument(path, callbacks)` in the SDK. It provides:

- **Debounced autosave** with an observable `SaveState`
  (`saved | dirty | saving | error`) and an explicit `flush()` (Ctrl+S,
  switching documents, closing). `autosave` can be switched off (Code Studio).
- **External changes:** on `fs.modified` it re-reads the file. Its own saves
  are recognised (disk content equals the last saved text) and ignored. If
  the buffer is clean, the new text is delivered; if there are unsaved edits,
  they are kept and the user's next save wins (no silent data loss).
- **Moves:** on `fs.moved` of the file or any ancestor, the session's path is
  updated, so autosave keeps writing to the right place.
- **Deletion:** on `fs.deleted` of the file or an ancestor, pending saves are
  cancelled and the editor is notified (Code Studio switches the tab to
  read-only; Notes shows a deleted state).

## Consequences

- Both editors get identical, tested semantics (6 unit tests cover autosave,
  flush, external edits, conflict, moves, deletion and save errors).
- Conflict policy is "last writer wins, but never discard unsaved edits".
  A merge UI is out of scope.
- Code Studio additionally has to move Monaco models when a file moves,
  because model URIs are immutable. It creates the new model from the old
  buffer before disposing the old one, preserving unsaved edits.
