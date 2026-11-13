# ADR-0004: Self-host Monaco's prebuilt bundle

- Status: Accepted
- Date: 2026-11-13

## Context

Code Studio uses Monaco (via `@monaco-editor/react`). Monaco is large (~25 MB
unpacked), ships its own web workers and CSS, and is famously difficult to
bundle. The project runs Next.js 16 with Turbopack.

## Options

| | CDN (library default) | Bundle Monaco ESM via Turbopack | Self-host prebuilt `min/vs` |
|---|---|---|---|
| Setup | None | Worker URLs, CSS imports, config | Copy script |
| Works offline | No | Yes | Yes |
| Third-party dependency at runtime | jsdelivr | None | None |
| Bundler risk | None | High (CSS-in-node_modules, worker chunks) | None |
| Initial page weight | 0 | 0 if lazy | 0 (loaded on first launch) |

## Decision

Self-host. `scripts/copy-monaco.mjs` copies
`node_modules/monaco-editor/min/vs` to `public/monaco/vs` (skipped when the
version stamp matches). It runs on `postinstall`, `predev` and `prebuild`.
`code-studio/monaco-setup.ts` calls
`loader.config({ paths: { vs: "/monaco/vs" } })`. `public/monaco/` is
git-ignored.

## Consequences

- The editor works without internet access and with no third-party origin.
- Monaco is downloaded the first time Code Studio opens, never on the desktop.
- Upgrading Monaco is `npm i monaco-editor@x`; the script re-copies.
- Deployments must run the build script (they do: `prebuild`).
- Monaco's TypeScript language service runs in its own worker, keeping the
  UI thread free.
