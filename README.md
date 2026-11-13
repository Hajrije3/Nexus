# NEXUS

A desktop operating environment that runs entirely in the browser: a real
window manager, an application runtime, a virtual filesystem stored in
IndexedDB, and applications that work together — a file manager, a terminal,
a code editor, notes and settings. Nothing is installed and nothing leaves the
browser.

## Getting started

```bash
npm install          # also copies the Monaco editor into public/monaco
npm run dev          # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint, including architectural boundary rules |
| `npm test` | Vitest unit tests (system services, app logic) |
| `npm run test:e2e` | Playwright end-to-end tests — run `npm run build` first |

First-time e2e setup: `npx playwright install chromium`.

## Applications

| App | What it does |
|---|---|
| **Files** | Browse, search, preview and organise files: grid/list views, drag-and-drop, cut/copy/paste, upload from and download to your computer |
| **Terminal** | A real shell over the virtual filesystem: pipes, redirection, wildcards, variables, history, tab completion, 27 commands (`help`) |
| **Code Studio** | Monaco editor with a project tree, tabs, autosave and Ctrl+S |
| **Notes** | Markdown notes with live preview — each note is a `.md` file in `~/Documents` |
| **Settings** | Theme, accent colour, wallpaper, motion, storage usage, app permissions |
| **Activity Monitor** | Running apps, window stack and a live system event log |
| **Calculator** | Keyboard-friendly calculator |

The apps share one filesystem, so they work together: create a file in the
Terminal and it appears in an open Files window; open it in Code Studio;
`cat` a note you wrote in Notes.

## Using the desktop

- **Launch apps** from the dock, the launcher (`Ctrl/⌘ K`), or by opening a file in Files.
- **Windows**: drag by the title bar, resize from any edge or corner, double-click
  the title bar to maximize, right-click it for window actions.
- **Snapping**: drag to the left/right screen edge to tile, to the top to maximize.
- **Dock**: click to launch / focus; click the focused app to minimize; right-click
  for *New Window* and *Quit*.
- Your open windows, files and settings are restored when you come back.

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ K` | Launcher |
| `Alt `` ` / `Alt ⇧ `` ` | Cycle windows |
| `Alt ⇧ ↑ / ← / →` | Maximize / tile left / tile right (toggle) |
| `Alt ⇧ ↓` | Restore |
| `Alt M` / `Alt W` | Minimize / close |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, data models, services, apps, risks.
- [ADRs](docs/adr) — recorded architectural decisions.

## Status

Phases 1–3 (desktop foundation, core system services, applications) are
complete. Next: plugins, permissions, marketplace and notifications. See the
roadmap in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#10-roadmap-status).
