# Architectural Decisions - ReqHook

Append-only log of architectural and design decisions made during development.

## Format

Each entry follows this structure:

| Date | Decision | Rationale |
|------|----------|-----------|
| {YYYY-MM-DD} | {What was decided} | {Why this choice was made} |

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-09 | Cross-browser MV3 extension (Chromium + Firefox) from one codebase, built by Vite + `@crxjs/vite-plugin` | Core platform choice, expensive to swap. `@crxjs` handles MV3 bundling + HMR for both engines; alternative (webpack + hand-rolled manifest) rejected as more boilerplate |
| 2026-07-09 | Single typed manifest source (`buildManifest(target)` in `src/manifest/index.ts`) emits both Chrome (service_worker) and Firefox (scripts + gecko) variants; `TARGET` env selects the build, unknown value throws | Keeps the per-engine divergence (background shape, permissions, gecko settings) in one testable place instead of two hand-maintained `manifest.json` files that drift. Fail-fast on unknown target prevents silently shipping the wrong manifest |
| 2026-07-09 | Extension API via `webextension-polyfill` (`import browser`), never raw `chrome.*` | Promise-based, normalizes the Chromium/Firefox namespace + callback-vs-promise gap; one API surface across the codebase |
| 2026-07-09 | Vitest as the sole test layer for the scaffold (no Playwright/E2E yet) | Pure logic + React components cover the scaffold; a real-browser E2E layer is deferred until there is interception to drive |
