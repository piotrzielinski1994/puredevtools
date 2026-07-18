# Architectural Decisions - puredevtools

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
| 2026-07-10 | Options page = master-detail shell (sidebar rule list + right tab strip/editor), replacing the single-column editor-swaps-list layout | Keeps the full rule list visible while editing; mirrors the requi workspace. Tab state isolated in a pure `useOpenTabs` hook (testable, no persistence in v1). pz-ddd/pz-archetypes evaluated - neither applies (pure presentation, no domain model) |
| 2026-07-10 | Single-mechanism response override (page layer only): deleted the whole network layer (`ChromeEngine`/`declarativeNetRequest`, `FirefoxEngine`/`webRequest`+`filterResponseData`, `RequestEngine` abstraction, `selectEngine`, `dataUrl`) plus the request-side/mock/status/latency actions and the `capabilities`/`diagnostics` plumbing. A rule now only forwards the real request and overrides response headers/body via the patched `fetch`/`XHR`. | The network layer was the sole source of Chrome/Firefox asymmetry (no Chrome body rewrite, no custom mock status/headers, Firefox-only latency). The page layer already forwarded+overrode identically on both engines, so the abstraction earned nothing. Cost: main-frame document navigation is no longer interceptable (documented limitation), matching peer tools. pz-ddd/pz-archetypes evaluated - neither applies (tooling reduction, no domain model) |
| 2026-07-12 | Rules are stored as a **workspace tree** (`FolderNode \| RuleNode`, arbitrary nesting, mixed root) instead of a flat `Rule[]`. `RuleRepository.getAll()` returns a **DFS pre-order `flatten`** of the tree, so the engine keeps consuming an ordered `Rule[]`; `Rule.priority` is removed and tree position is the sole ordering. Match precedence = visible top-to-bottom tree order. | Folders + hand drag-reorder are a UI/storage concern only: the engine already treated the list as an ordered first-match-wins sequence (`decide.find()` never read `priority` numerically), so flattening the tree leaves `engine/**`, `content/bridge.ts`, `match.ts`, `decide.ts` untouched. Alternative (cosmetic folders keeping flat priority) rejected - "what you see = what matches" is the intuitive contract. Pre-release, so the stored + portable format changed without a version bump. pz-ddd/pz-archetypes evaluated - neither applies (UI/storage reorg of existing model, ported requi's proven nested-tree structure). |
| 2026-07-12 | Deleting a folder deletes its **entire subtree** (contained rules + subfolders) after a `window.confirm`, rather than reparenting the contents up. | Matches the requi reference behavior 1:1 and keeps the delete mental model simple (the folder IS its contents). Alternative (move children to parent on delete) rejected for parity + simplicity; the confirm dialog guards the destructive case. |
