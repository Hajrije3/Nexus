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
│   Welcome · Activity Monitor · Calculator · (Files, Terminal, …)      │
│   Talk to the system only through the App SDK (hooks + services).    │
├──────────────────────────────────────────────────────────────────────┤
│ Desktop Environment     src/desktop/*                                 │
│   Shell, menu bar, dock, launcher, wallpaper, window chrome,          │
│   snap preview, context menus, notification center (Phase 4).         │
│   Pure presentation of system state + translation of user input.      │
├──────────────────────────────────────────────────────────────────────┤
│ System Services         src/system/*                                  │
│   window-manager · runtime (registry + processes) · events (P2)       │
│   fs (P2) · storage (P2) · settings (P3) · permissions (P4)           │
│   Framework-agnostic TypeScript. No React imports in core logic.      │
├──────────────────────────────────────────────────────────────────────┤
│ Platform                                                              │
│   IndexedDB (Dexie) · Web Workers · DOM / Pointer Events              │
└──────────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows only point down. Applications may import from
`system/*/public` APIs and `ui/*`; they never import from `desktop/*` or from
another application. System services never import from `desktop/*` or
`applications/*`. This is enforced by convention now and will be enforced with
an ESLint `no-restricted-imports` rule once more applications exist.

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
│   ├── events/               Typed event bus                       (Phase 2)
│   ├── storage/              Dexie database + migrations           (Phase 2)
│   └── fs/                   Virtual filesystem service            (Phase 2)
├── desktop/                  Desktop environment (React)
│   ├── Desktop.tsx           Root shell composition
│   ├── menu-bar/             Menu bar + clock
│   ├── dock/                 Dock with running indicators
│   ├── launcher/             Spotlight-style command launcher
│   ├── wallpaper/
│   └── window/               Window chrome, drag/resize hooks, error boundary
├── applications/             One folder per app: manifest.ts + UI
│   ├── index.ts              Built-in app list (registered at boot)
│   ├── welcome/
│   ├── activity-monitor/
│   └── calculator/
├── ui/                       Shared design-system primitives (+ shadcn later)
└── lib/                      Tiny generic utilities (cn, ids, clamp)
docs/
├── ARCHITECTURE.md           This file
└── adr/                      Architecture Decision Records
e2e/                          Playwright specs
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
- Workspace persistence (Phase 4) is "serialise `windows` + `stack`".
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

## 6. Rendering & performance strategy

- The whole desktop is client-only (`next/dynamic` with `ssr: false` inside a
  client boundary). There is no meaningful server render of a desktop, and
  this avoids hydration mismatches on viewport-dependent geometry.
- Each `<Window>` subscribes to *its own* `WindowState` by id; the window list
  subscribes only to `stack`. Moving one window re-renders one window frame.
- App content is a memoised child of the frame, so focus/geometry changes
  never re-render the application.
- React Compiler is enabled for automatic memoisation; hot paths still avoid
  creating per-render objects in selectors (`useShallow` where needed).

## 7. Testing strategy

| Layer | Tool | What is covered |
|---|---|---|
| Window manager geometry & operations | Vitest (Node) | Clamping, resize anchoring, snapping, cascade, focus/z-order, minimise/close refocus, immutability |
| Runtime | Vitest (Node) | Registry validation, single/multi-instance launch, instance termination, dock activation semantics |
| Pure app logic | Vitest | Launcher ranking, calculator engine |
| Desktop end-to-end | Playwright (Chromium, production build) | Real pointer drag/resize, snapping with preview, maximise/restore, minimise/restore via dock, z-order, shortcuts, launcher, app interaction |

Services are built as factories (`createLifecycle({ registry, processes, windows })`)
so each test gets isolated instances instead of sharing module singletons.

## 8. Technical risks

| Risk | Mitigation |
|---|---|
| Pointer-move re-render storms | Imperative gesture updates (ADR-0001). |
| Iframes/Monaco swallowing pointer events mid-drag | Full-screen transparent capture layer while a gesture is active; pointer capture on handles. |
| IndexedDB unavailable (private mode, quota) | Storage layer exposes an explicit `available` state; in-memory fallback with a visible warning (Phase 2). |
| Large files in IndexedDB | Store content blobs separately from metadata; stream into workers for search (Phase 2/5). |
| Monaco bundle size & SSR | Lazy loaded per app, client-only, workers via Monaco's ESM worker setup (Phase 3). |
| Plugin code executing with full privileges | Phase 4 plugins run in sandboxed iframes / workers with a message-based SDK and manifest-declared permissions — never `eval` in the main realm. |
| Next.js 16 conventions differ from older docs (Cache Components, React Compiler enabled) | Consult `node_modules/next/dist/docs` before using new framework APIs. |
| Browser shortcuts colliding with OS shortcuts | Use `Ctrl/⌘+K` for the launcher, `Alt`-based window shortcuts; never rely on `⌘W`/`⌘T`/`⌘N`. |

## 9. Roadmap status

- [x] **Phase 1 — Desktop foundation** (window manager, runtime skeleton, shell, dock, launcher)
- [ ] Phase 2 — Event bus, storage, virtual filesystem
- [ ] Phase 3 — Files, Terminal, Code Studio, Notes, Settings
- [ ] Phase 4 — Plugins, permissions, workspace persistence, marketplace, notifications
- [ ] Phase 5 — Quality hardening
