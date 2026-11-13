# NEXUS Architecture

NEXUS is a desktop operating environment that runs entirely in the browser. This
document is the source of truth for how the system is layered, what each layer
owns, and why the important decisions were made. Update it whenever a boundary
moves.

---

## 1. Layered model

```
┌──────────────────────────────────────────────────────────────────────┐
│ Applications            src/applications/*                            │
│   Files · Terminal · Code Studio · Notes · Settings · Activity        │
│   Monitor · Calculator · Welcome                                      │
│   Talk to the system only through the App SDK (hooks + services).    │
├──────────────────────────────────────────────────────────────────────┤
│ Desktop Environment     src/desktop/*                                 │
│   Shell, menu bar, dock, launcher, wallpaper, window chrome,          │
│   snap preview, context menus, notification center (Phase 4).         │
│   Pure presentation of system state + translation of user input.      │
├──────────────────────────────────────────────────────────────────────┤
│ System Services         src/system/*                                  │
│   window-manager · runtime (registry + processes) · events · storage  │
│   fs · documents · clipboard · settings · workspace · sdk ·           │
│   permissions (P4)                                                    │
│   Framework-agnostic TypeScript. No React imports in core logic.      │
├──────────────────────────────────────────────────────────────────────┤
│ Platform                                                              │
│   IndexedDB (Dexie) · Web Workers · DOM / Pointer Events              │
└──────────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows only point down. Applications may import from
the App SDK (`system/sdk/*`) and `ui/*`; they never import from `desktop/*` or from
another application. System services never import from `desktop/*` or
`applications/*`. **Enforced by ESLint** (`no-restricted-imports` in
`eslint.config.mjs`): a violating import fails `npm run lint`.

## 2. Folder structure

```
src/
├── app/                      Next.js routes only (layout, page, globals.css)
├── system/                   OS services — plain TS, unit-tested in Node
│   ├── window-manager/
│   │   ├── types.ts          WindowState, Rect, SnapZone, WorkArea …
│   │   ├── constants.ts      Chrome metrics, minimum sizes, snap thresholds
│   │   ├── geometry.ts       Pure rect math: clamp, resize, snap, cascade
│   │   ├── operations.ts     Pure state transitions (open/focus/move/…)
│   │   ├── store.ts          Zustand vanilla store wrapping operations
│   │   └── __tests__/
│   ├── runtime/
│   │   ├── types.ts          AppManifest, AppInstance, AppComponentProps
│   │   ├── registry.ts       Application registry (manifests + loaders)
│   │   ├── process-store.ts  Running instances (the "process table")
│   │   ├── lifecycle.ts      launch / close / focus orchestration
│   │   └── __tests__/
│   ├── events/
│   │   ├── types.ts          SystemEventMap — the registry of every event
│   │   ├── bus.ts            Typed synchronous EventBus + systemEvents
│   │   └── bridges.ts        Publish events for pure stores (window focus)
│   ├── storage/
│   │   ├── db.ts             Dexie schema (nodes, contents, kv) + versions
│   │   ├── open.ts           Open IndexedDB, in-memory fallback, estimates
│   │   └── kv.ts             Validated key-value store
│   ├── fs/
│   │   ├── path.ts           POSIX path utilities (normalize, resolve, ~)
│   │   ├── errors.ts         FsError with ENOENT/EEXIST/… codes
│   │   ├── mime.ts           Extension → MIME type
│   │   ├── vfs.ts            VirtualFileSystem service
│   │   ├── names.ts          Unique names ("x copy 2.md"), name validation
│   │   ├── kinds.ts          File kinds and labels (folder, image, code…)
│   │   └── seed.ts           Standard layout + one-time starter files
│   ├── settings/             Theme, accent, wallpaper, motion (+ persistence)
│   ├── documents.ts          TextDocumentSession — editor file model (ADR-0005)
│   ├── clipboard.ts          System file clipboard + paste logic
│   ├── workspace/
│   │   ├── session.ts        Capture / validate / restore session snapshots
│   │   └── persistence.ts    Debounced autosave
│   ├── sdk/                  App SDK (see §6.6)
│   ├── services.ts           Booted-service registry + system status store
│   └── testing/              Test helpers (in-memory database)
├── desktop/                  Desktop environment (React)
│   ├── Desktop.tsx           Boot gating + root shell composition
│   ├── boot.ts               Boot sequence (see §6)
│   ├── menu-bar/             Menu bar + clock
│   ├── dock/                 Dock with running indicators
│   ├── launcher/             Spotlight-style command launcher
│   ├── wallpaper/
│   └── window/               Window chrome, drag/resize hooks, error boundary
├── applications/             One folder per app: manifest.ts + UI
│   ├── index.ts              Built-in app list (registered at boot)
│   ├── files/                File Explorer (model.ts = pure state logic)
│   ├── terminal/             Terminal UI + engine/ (parser, shell, commands)
│   ├── code-studio/          Monaco editor, tabs, project tree
│   ├── notes/                Markdown notes stored as files
│   ├── settings/
│   ├── welcome/
│   ├── activity-monitor/
│   └── calculator/
├── ui/                       Design system: Button, Input, Switch, Dialog
│                             (Radix, shadcn-style), FileIcon, Markdown, theme
└── lib/                      Tiny generic utilities (cn, ids, clamp)
docs/
├── ARCHITECTURE.md           This file
└── adr/                      Architecture Decision Records
e2e/                          Playwright specs
scripts/copy-monaco.mjs       Self-hosts Monaco into public/ (ADR-0004)
```

`src/app` (Next.js routes) and `src/applications` (NEXUS apps) are deliberately
different names so the two meanings of "app" never collide.

## 3. Core data models

The authoritative definitions live in the `types.ts` files; this is the summary.

```ts
// Window manager
type WindowId = string;               // "win_xxx"
interface Rect { x: number; y: number; width: number; height: number }
type WindowMode = "normal" | "maximized" | "tiled-left" | "tiled-right";

interface WindowState {
  id: WindowId;
  appId: AppId;
  instanceId: InstanceId;
  title: string;
  bounds: Rect;            // floating geometry, always kept (restore target)
  mode: WindowMode;        // effective rect is derived from mode + work area
  minimized: boolean;
  minSize: Size;
  resizable: boolean;
  openedAt: number;
}

interface WindowManagerState {
  windows: Record<WindowId, WindowState>;
  stack: WindowId[];       // paint order, bottom → top
  focusedId: WindowId | null;
  workArea: Rect;          // viewport minus menu bar and dock
  snapPreview: SnapZone | null;
}

// Application runtime
interface AppManifest {
  id: AppId;               // reverse-DNS: "nexus.calculator"
  name: string;
  version: string;         // semver
  description: string;
  icon: AppIconSpec;       // serialisable (glyph name + tint) — plugin-safe
  permissions: Permission[];
  window: WindowDefaults;  // default size, min size, resizable
  singleInstance: boolean;
  load: () => Promise<{ default: ComponentType<AppComponentProps> }>;
}

interface AppInstance {
  instanceId: InstanceId;  // "proc_xxx"
  appId: AppId;
  windowIds: WindowId[];
  launchedAt: number;
  args: LaunchArgs;
}
```

### Why window ≠ instance

An application *instance* (a process) can own several windows (e.g. a Code
Studio instance with a detached preview, or a settings sheet). Keeping them
separate now avoids a painful migration later. Closing the last window of an
instance terminates it; `singleInstance` apps focus their existing window
instead of spawning a second process.

## 4. Window manager design

### 4.1 State is pure, the store is thin

Every transition — `openWindow`, `focusWindow`, `moveWindow`, `resizeWindow`,
`minimizeWindow`, `toggleMaximize`, `tileWindow`, `closeWindow`,
`setWorkArea` — is a pure function `(state, …args) => state` in
`operations.ts`. The Zustand store just binds them. Consequences:

- Window behaviour is fully unit-testable without a DOM.
- Workspace persistence is "serialise `windows` + `stack`" (see §6.4).
- An undo stack or multi-workspace support is a state-shape change, not a
  rewrite.

### 4.2 Z-order via a stack, not counters

`stack` is an ordered array of ids. Focusing moves the id to the end. A
window's `z-index` is `BASE + index`. Compared with a monotonically increasing
counter this never overflows, keeps z-indices dense, and makes "focus the next
window" (after minimise/close) a trivial reverse scan.

### 4.3 Geometry is derived from mode

`bounds` always holds the floating rectangle. `maximized` / `tiled-*` are modes,
and the rendered rectangle is computed by `effectiveRect(window, workArea)`.
This gives restore-for-free and makes maximised windows track browser resizes
without any listener writing to every window.

### 4.4 Interaction: imperative during gesture, commit on release

**Decision (see ADR-0001).** While a drag or resize is in progress the window's
DOM node is mutated directly (`transform`, `width`, `height`) inside a
`requestAnimationFrame`; the store is written once on `pointerup`.

- Pro: zero React renders per pointer move, regardless of how heavy the app
  inside the window is. Monaco and terminal windows stay at 60 fps.
- Pro: one store write per gesture keeps the persistence layer quiet.
- Con: the store is briefly stale during a gesture. Nothing reads geometry
  mid-gesture except the snap preview, which is driven by a separate
  low-frequency `snapPreview` field that only changes when the pointer enters
  or leaves a snap zone.

### 4.5 Snapping

Dragging the pointer within `SNAP_EDGE_THRESHOLD` px of the left/right edge of
the work area previews a half-screen tile; the top edge previews maximise.
Releasing applies the mode. Dragging a maximised or tiled window "tears it off":
it returns to its floating size, positioned so the pointer keeps the same
relative spot on the title bar.

### 4.6 Constraints

- Windows can never be dragged so that the title bar leaves the work area
  (at least `MIN_VISIBLE_PX` must remain reachable horizontally, and `y` is
  clamped to the work-area top).
- Resizes respect per-window `minSize` from the manifest.
- New windows cascade from the centre in `CASCADE_STEP` increments, wrapping
  when they would overflow.

### 4.7 Lifecycle of a window's content

Minimised windows stay mounted (hidden with `visibility`) so app state
survives. Every window body is wrapped in an error boundary and a Suspense
boundary: a crashing app shows a recoverable error state inside its own window
and never takes down the desktop.

## 5. Application runtime

- **Registry** (`registry.ts`) maps `AppId → AppManifest`. Built-ins register at
  boot; the marketplace (Phase 4) will register/unregister at runtime.
- **Process table** (`process-store.ts`) holds `AppInstance`s.
- **Lifecycle** (`lifecycle.ts`) is the only module that touches both the
  process table and the window manager. `launchApp`, `closeWindow`,
  `terminateInstance`, `activateApp` (dock click semantics) live here.
- Code splitting: each manifest's `load()` is a dynamic `import()`, so an app's
  bundle (Monaco in particular) is fetched only on first launch.
- Apps receive `AppComponentProps` and the `useWindow()` hook from
  `system/sdk` (set title, close, minimise, focus state). They never import
  the window store directly.
- **Exception — privileged system apps.** Activity Monitor declares
  `system:processes` and reads the process table and window stack directly.
  This is deliberate for now; in Phase 4 the permission manager will expose
  these reads through a permission-checked SDK API and the direct imports
  will be removed.
- Lifecycle changes are published on the event bus: `app.launched`,
  `window.opened`, `window.closed`, `app.terminated`.

## 6. Core system services (Phase 2)

### 6.1 Event bus — ADR-0003

`systemEvents` is a typed, synchronous bus. `SystemEventMap` lists every
event; emitting anything else is a compile error. Listener failures are
isolated. The last 200 events are retained (Activity Monitor shows them).

| Domain | Events |
|---|---|
| Runtime | `app.launched`, `app.terminated` |
| Windows | `window.opened`, `window.closed`, `window.focused` |
| Filesystem | `fs.created`, `fs.modified`, `fs.deleted`, `fs.moved`, `file.opened` |
| System | `workspace.restored`, `storage.degraded`, `theme.changed`*, `notification.received`* |

\* declared now, emitted from Phase 3/4.

### 6.2 Storage

One Dexie database, `nexus`, version 1:

| Table | Key | Indexes | Holds |
|---|---|---|---|
| `nodes` | `id` | `parentId`, `&[parentId+name]`, `name` | File/directory metadata |
| `contents` | `id` | — | File bodies (`string \| ArrayBuffer`) |
| `kv` | `key` | — | System state (session, seed version, settings) |

If IndexedDB can't be opened, `openStorage()` falls back to an in-memory
implementation with the same schema and code path, reports
`persistent: false`, and the menu bar shows a **Not saving** warning. The
browser is asked (best effort) to make storage persistent so it isn't evicted.

### 6.3 Virtual filesystem — ADR-0002

`VirtualFileSystem` offers `stat`, `exists`, `readdir`, `readFile`/`readText`,
`writeFile`, `mkdir` (incl. `-p`), `touch`, `rename` (move), `copy`
(recursive), `remove` (incl. recursive), `walk`, `search` and `usage`.

- Tree of nodes linked by `parentId`; rename/move is O(1).
- Every mutation is one transaction; events are emitted after commit.
- Errors are `FsError`s with POSIX codes (`ENOENT`, `EEXIST`, `ENOTDIR`,
  `EISDIR`, `ENOTEMPTY`, `EINVAL`, `EPERM`) so the terminal can print familiar
  messages.
- `/`, `/home`, `/home/user`, `/system`, `/applications` and `/settings` are
  protected: their contents can change, but they can't be removed or renamed.
- Standard directories are recreated on every boot if missing; starter files
  are written once (versioned), so files the user deletes stay deleted.

### 6.4 Workspace persistence

`captureSession` serialises running instances (app id + launch args) and their
windows (title, floating bounds, mode, minimised, z-position, focus) into a
versioned snapshot stored under `kv["workspace.session"]`. `parseSession`
validates stored data field by field — malformed entries are dropped, not
trusted. `restoreSession` re-creates instances through
`lifecycle.restoreInstance`, then `restoreStack` re-applies z-order and focus.
Apps that are no longer installed are skipped and reported.

Autosave subscribes to the window manager and process table, ignores transient
state (snap preview), debounces writes (400 ms), skips unchanged snapshots and
flushes on `pagehide` / tab hide.

### 6.5 Boot sequence (`desktop/boot.ts`)

1. Register built-in apps. 2. Measure the work area. 3. Open storage.
4. Mount and seed the filesystem. 5. Install services and event bridges.
6. Restore the saved session — or launch Welcome on a first boot.
7. Start autosave. The desktop shows the boot screen until this resolves and a
dedicated error screen if it fails. Boot is memoised, so React StrictMode and
HMR never run it twice.

### 6.6 App SDK (`system/sdk`)

| Hook | Purpose |
|---|---|
| `useWindow()` | Host window: title, close, minimise, maximise, focus state |
| `useFileSystem()` | The shared `VirtualFileSystem` |
| `useDirectory(path)` | Live listing with `loading` / `ready` / `error` states; reloads on any `fs.*` event affecting the directory (including an ancestor being moved or deleted) |
| `useSystemEvent(type, fn)` | Typed subscription for a component's lifetime |
| `useRecentEvents(n)` | Rolling list of recent events |
| `openDocument(path, cb)` | Editor file session: autosave, external-change reload, move/delete tracking (ADR-0005) |
| `openPath(path, appId?)`, `useAppsForFile(path)` | Open a file in its default app; list "Open With" candidates |
| `useLaunchRequests(fn)` | Receive new launch args when a single-instance app is launched again |
| `useAppPreference(key, …)` | Small per-app persistent preferences (`app.<id>.<key>` in kv) |
| `showContextMenu(e, label, items)` | System context menu (same look and keyboard support everywhere) |
| `useWindowPortal()` | Portal target for window-scoped dialogs |
| `useSettings`, `useEffectiveTheme`, `useStorageInfo` | Settings and system information (Settings app) |

### 6.7 Settings and appearance

Settings (`system/settings`) hold identifiers only — theme preference, accent,
wallpaper, reduce-motion — validated on load and saved on change. Visual
definitions live in `ui/theme.ts`. The desktop applies them to `<html>`
(`data-theme`, accent CSS variables, `data-reduce-motion`) before first paint;
Tailwind's `dark:` variant is bound to `data-theme`, not just the OS setting.

## 6b. Applications (Phase 3)

| App | Highlights | Logic tested in |
|---|---|---|
| **Files** | Sidebar places, breadcrumbs, back/forward/up history, grid and sortable list views, kind filter, recursive search, multi-select (click/Ctrl/Shift/keyboard), new/rename/delete/duplicate, cut/copy/paste through the system clipboard, drag-and-drop moves, upload from and download to the real computer, details pane with text/image preview, "Open with", "Open in Terminal", hidden-files toggle; follows its folder when it is moved | `files/model.test.ts`, `clipboard.test.ts` |
| **Terminal** | `nsh`: quoting, `$VAR`/`$?`, `~`, globs, pipes, `>` `>>` `<`, `;` `&&` `\|\|`; 27 commands (ls, cd, pwd, mkdir, rmdir, touch, cat, rm, mv, cp, echo, grep, wc, head, tail, find, tree, stat, open, history, env, export, clear, help, …); history persisted to `~/.nsh_history`; tab completion; Ctrl+C / L / U | `terminal/engine/engine.test.ts` |
| **Code Studio** | Self-hosted Monaco (ADR-0004), project tree with context menu, tabs with unsaved markers, autosave toggle, Ctrl+S, unsaved-changes prompt, status bar (line/column, language); workspace (folder, tabs, expanded folders) persisted; tabs follow moved files and become read-only when deleted | `documents.test.ts` |
| **Notes** | Every `.md`/`.txt` under `~/Documents` is a note; edit / split / preview with GitHub-flavoured Markdown; autosave; search across titles and content; rename by editing the title; opens files from anywhere via Files | `notes/library.test.ts`, `documents.test.ts` |
| **Settings** | Theme (system/light/dark), accent colour, wallpaper with live miniatures, reduce motion; storage status, usage and quota, erase all data; installed apps with declared permissions; about | `settings.test.ts` |

**Design decisions in this phase**

- *Documents are files.* Notes and Code Studio keep user content in the shared
  filesystem, never in private storage, so every app — and the terminal — can
  work with it.
- *File associations* live in manifests (`fileHandlers` with priorities). Notes
  wins for `.md`/`.txt`; Code Studio handles any text file; "Open with" lists
  every capable app. A running single-instance app receives new requests as
  `app.relaunched` events.
- *Window-scoped dialogs.* Radix dialogs are portalled into their window and
  are non-modal at page level, so a prompt in one window blocks only that
  window, never the whole desktop.
- *Terminal output protocol.* Commands write styled text; pipes and
  redirection strip styling; `ls` switches to one-per-line when piped; `clear`
  writes a form feed that the view interprets, as real terminals do.

## 7. Rendering & performance strategy

- The whole desktop is client-only (`next/dynamic` with `ssr: false` inside a
  client boundary). There is no meaningful server render of a desktop, and
  this avoids hydration mismatches on viewport-dependent geometry.
- Each `<Window>` subscribes to *its own* `WindowState` by id; the window list
  subscribes only to `stack`. Moving one window re-renders one window frame.
- App content is a memoised child of the frame, so focus/geometry changes
  never re-render the application.
- React Compiler is enabled for automatic memoisation; hot paths still avoid
  creating per-render objects in selectors (`useShallow` where needed).

## 8. Testing strategy

| Layer | Tool | What is covered |
|---|---|---|
| Window manager geometry & operations | Vitest (Node) | Clamping, resize anchoring, snapping, cascade, focus/z-order, minimise/close refocus, immutability, stack restore |
| Runtime | Vitest (Node) | Registry validation, single/multi-instance launch, instance termination, dock activation semantics, lifecycle event order |
| Event bus | Vitest | Typed delivery, unsubscribe/once, listener isolation, dispatch snapshotting, bounded history |
| Storage & filesystem | Vitest + fake-indexeddb | Every VFS operation and error code, atomicity, binary data, search ranking, seeding idempotency, in-memory fallback |
| Workspace | Vitest | Snapshot round-trip, validation of corrupt data, missing apps, debounced autosave |
| Pure app logic | Vitest | Launcher ranking, calculator engine, directory-change matching |
| Desktop end-to-end | Playwright (Chromium, production build) | Pointer drag/resize, snapping, maximise/restore, dock, z-order, shortcuts, launcher, apps, **session restore across real reloads**, event log |

Services are built as factories (`createLifecycle({ registry, processes, windows })`,
`new VirtualFileSystem(db)`) so each test gets isolated instances; filesystem
tests get a fresh in-memory IndexedDB per test (`system/testing/memory-db.ts`).

## 9. Technical risks

| Risk | Mitigation |
|---|---|
| Pointer-move re-render storms | Imperative gesture updates (ADR-0001). |
| Iframes/Monaco swallowing pointer events mid-drag | Full-screen transparent capture layer while a gesture is active; pointer capture on handles. |
| IndexedDB unavailable (private mode, quota) | **Done:** in-memory fallback on the same code path; `persistent: false`; "Not saving" warning in the menu bar. |
| Large files in IndexedDB | **Done:** content stored separately from metadata (ADR-0002). Content search moves to a Web Worker in Phase 5. |
| Dexie losing transaction context across deep native `await` chains | **Done:** transaction-bound tables passed explicitly (ADR-0002, Decision 4). |
| Monaco memory with many tabs | Models are disposed when tabs close; Monaco loads only when Code Studio opens. |
| Slow first boot under heavy CPU load | First boot runs ~20 small seeding transactions. Fine for a single user; e2e allows 15 s and caps parallel workers. Candidate optimisation: seed in one transaction. |
| Two NEXUS tabs open on the same database | Writes are transactional, so data stays consistent, but each tab's UI won't see the other's changes and the last tab to save wins the workspace session. Planned: `BroadcastChannel` relay of `fs.*` events and a single-active-session lock (Phase 5). |
| Session changes lost if the page closes mid-debounce | Flush on `pagehide`/tab hide; worst case loses < 400 ms of window movement. |
| Monaco bundle size & SSR | Lazy loaded per app, client-only, workers via Monaco's ESM worker setup (Phase 3). |
| Plugin code executing with full privileges | Phase 4 plugins run in sandboxed iframes / workers with a message-based SDK and manifest-declared permissions — never `eval` in the main realm. |
| Next.js 16 conventions differ from older docs (Cache Components, React Compiler enabled) | Consult `node_modules/next/dist/docs` before using new framework APIs. |
| Browser shortcuts colliding with OS shortcuts | Use `Ctrl/⌘+K` for the launcher, `Alt`-based window shortcuts; never rely on `⌘W`/`⌘T`/`⌘N`. |

## 10. Roadmap status

- [x] **Phase 1 — Desktop foundation** (window manager, runtime skeleton, shell, dock, launcher)
- [x] **Phase 2 — Core system services** (event bus, storage, virtual filesystem, App SDK, workspace session persistence)
- [x] **Phase 3 — Applications** (Files, Terminal, Code Studio, Notes, Settings)
- [ ] Phase 4 — Plugins, permissions, marketplace, notifications, multiple workspaces
- [ ] Phase 5 — Quality hardening
