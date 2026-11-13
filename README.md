# NEXUS

A browser-based operating environment: a desktop with a real window manager,
application runtime, and (in upcoming phases) a virtual filesystem, terminal,
code editor and app marketplace — running entirely client-side.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (Next.js + TypeScript rules, `no-explicit-any` = error) |
| `npm test` | Vitest unit tests (system services, pure logic) |
| `npm run test:e2e` | Playwright end-to-end tests — run `npm run build` first |

First-time e2e setup: `npx playwright install chromium`.

## Using the desktop

- **Launch apps** from the dock, the launcher (`Ctrl/⌘ K`), or the Welcome window.
- **Windows**: drag by the title bar, resize from any edge or corner, double-click
  the title bar to maximize, right-click it for window actions.
- **Snapping**: drag to the left/right screen edge to tile, to the top to maximize.
- **Dock**: click to launch / focus; click the focused app to minimize; right-click
  for *New Window* and *Quit*.

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ K` | Launcher |
| `Alt `` ` / `Alt ⇧ `` ` | Cycle windows |
| `Alt ⇧ ↑ / ← / →` | Maximize / tile left / tile right (toggle) |
| `Alt ⇧ ↓` | Restore |
| `Alt M` / `Alt W` | Minimize / close |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, data models, window manager design, risks.
- [ADRs](docs/adr) — recorded architectural decisions.

## Status

Phase 1 (desktop foundation) is complete. See the roadmap in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#9-roadmap-status).
