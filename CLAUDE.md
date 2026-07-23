# puredevtools

Briefing for Claude Code. Read [README.md](README.md) first - build/dev commands, load-unpacked steps, usage, architecture, platform limitations. This file lists conventions and the non-obvious bits not visible from reading individual files.

## Communication

- Keep replies short and to the point. No filler, no pleasantries, no recap of what the user just said.
- Status updates fit in one or two sentences.

## UI / design

- Read [docs/design.md](docs/design.md) before any UI change - the visual contract (ported from `requi`). Key rules: no rounded corners anywhere (`--radius` pinned to `0`; strip `rounded-full`/`rounded-xl`/`rounded-[..]`), flush bars (zero gap/padding, 1px dividers), `font-mono` for data, neutral `--primary`. The token source is `src/ui/globals.css`; all three surfaces (options, popup, DevTools panel) share it.

## Stack

- **Browser extension**, Manifest V3, one codebase targeting **Chromium (MV3) and Firefox**.
- **Vite 5** + **`@crxjs/vite-plugin`** - bundles the extension; `TARGET=chrome|firefox` selects the browser variant (`dev:chrome`/`build:firefox` etc).
- **React 18 + TypeScript** - UI (popup, options page, DevTools panel).
- **Tailwind v4** (`@tailwindcss/vite`) + shadcn-style primitives (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) in `src/ui/components/ui`.
- **`webextension-polyfill`** - promise-based cross-browser WebExtension API. Import `browser` from it; do not touch the global `chrome.*` directly.
- **`zod` v3** - validate/parse anything crossing a boundary (message payloads, stored + imported rules).
- **Vitest** (+ `@testing-library/react`, jsdom) - the only test layer. No Playwright/E2E.
- **Biome** (`biome.json` extends `@pziel/pureui/biome`, shared with the pure* suite; `npm run lint` = `biome check .`, `lint:fix` writes). Package manager **npm**. Node managed by **mise** (`mise.toml` pins node 22) - no `.nvmrc`.

## Cross-browser

- Route ALL extension API calls through `webextension-polyfill` (`import browser from "webextension-polyfill"`), not `chrome.*`.
- A single manifest source (`src/manifest/index.ts`) emits both Chrome and Firefox manifests - don't fork the tree per engine. Permissions requested: `storage` + `cookies` (the latter only for Cookie sync; see below). Adding a permission is ADR-worthy.
- **Single enforcement mechanism = the page layer** (`src/engine/page/`, injected via `src/content/page-main.ts` in the MAIN world): monkey-patches `window.fetch` + `XMLHttpRequest`, mutates the outgoing request (request header ops + optional body replacement) before forwarding, then overrides the response headers/body before the page's callback sees it. Identical on Chrome and Firefox. There is NO network layer (no `declarativeNetRequest`/`webRequest`, no `RequestEngine`/`selectEngine`, no capabilities/diagnostics) - it was deleted (see [docs/adr.md](docs/adr.md) 2026-07-10). Don't reintroduce a per-engine adapter without a new ADR.
- `decideInterception` (`src/engine/page/decide.ts`) maps a matched rule to an `override` carrying both request-side (`requestHeaderOps` + optional `requestBody`) and response-side (`headerOps` + optional `body`) mutations; `patchFetch`/`patchXhr` apply it. Request mutation was reintroduced 2026-07-19 (partial reversal of the 2026-07-10 response-only ADR - see [docs/adr.md](docs/adr.md)); a request-only rule still forwards and returns the original response unchanged (on the fetch path the sink only reports response overrides). The rule model + UI stay browser-agnostic.
- Read README's **Platform limitations** before changing interception - `fetch`/`XHR` only, main-frame document navigation is deliberately out of scope.
- **Cookie sync is a SEPARATE subsystem, not a rule** (`src/cookies/` + `src/ui/cookies/`, ADR 2026-07-20 + 2026-07-21). It uses `browser.cookies.getAll/set` from the options page (privileged extension page - no background relay), NEVER the page-layer patch, and stores under its own key `puredevtools.cookieSync`. Since 2026-07-21 the store is a **folder tree** `{ tree: CookieTreeNode[] }` (`CookieMappingNode | CookieFolderNode`, own recursive `.strict()` schema), NOT a flat `CookieMapping[]`; `CookieSyncRepository.getAll()` transparently migrates a legacy `{ mappings }` payload to a root-level tree. It must never enter the RULES workspace tree / rules `flatten` / `decideInterception` (it has its own `src/cookies/tree.ts` `flatten` for the sync path). The `CookieMapping` leaf shape + pure core `syncMapping(mapping, port)` (`src/cookies/sync.ts`, injected `{getAll,set}` port) are unchanged. Two non-negotiable semantics: **omit `domain`** on `cookies.set` (else the browser rejects a prod cookie for a localhost target) and **drop `secure` when the target URL is `http:`** (a `Secure` cookie can't be written to `http://localhost`). Never log cookie values - names + counts only.
- **Tree machinery is generic + shared** (ADR 2026-07-21). Folder/leaf tree algorithms live in `src/shared/tree.ts` (`createTreeOps<Leaf,Payload>`) + `src/shared/tree-keyboard.ts` (`createTreeKeyboard`); rules `tree.ts`/`tree-locate.ts` + `shortcuts/tree-keyboard.ts` DELEGATE to them via re-export wrappers (keep their public surface stable - `engine`/`storage`/`bridge` import unchanged). The sidebar UI is generic `TreeSidebar` + `TreeAdapter<Leaf>` (`src/ui/shared/`): `SidebarTree` = rules adapter (`RuleRow` leaf), Cookie sync mounts the same `TreeSidebar` with `MappingRow`. Add a folder feature to one sidebar => it's automatically available to the other; don't fork a second tree implementation.
- **Keyboard shortcuts are a SEPARATE subsystem** (`src/shortcuts/` pure core + `src/ui/shared/` React glue + `src/ui/shortcuts/` settings UI, ported from `purerequest`; no rule, no page layer). `src/shortcuts/registry.ts` is the single source of truth (a `ShortcutActionId` union + `SHORTCUT_ACTIONS`); `resolveShortcuts`/`findConflict` (`resolve.ts`) overlay stored overrides on defaults; `useActionHotkeys(handlers)` binds them via `@tanstack/react-hotkeys`. Overrides persist under `puredevtools.shortcuts` via `ShortcutsProvider` (live-synced across roots by `storage.onChanged`, useTheme pattern). Invariants: (1) **in-page listeners only** - no manifest `commands`, adding one is ADR-worthy; (2) **defaults must avoid browser-reserved combos** (Cmd/Ctrl+T/W/N/Tab/Shift+I etc. - `preventDefault` can't stop them in a page); `registry.test.ts` guards this against a blocklist; (3) **generic ids `new-item`/`delete-item` are contextual** - each mounted options view wires its own `useActionHotkeys`, so only the active view's handler fires (no cross-component reaching, no per-view id duplication); (4) **the pure `eventToHotkey` lives in `src/shortcuts/record-hotkey.ts` (node env) but the `useRecordHotkey` hook lives in `src/ui/shared/` (jsdom env)** - vitest picks the env by path; a React hook under `src/shortcuts/` would get the DOM-less node env. Consumers that must NOT pull `webextension-polyfill` at import (e.g. `SidebarTree`) import the shortcut hooks from `shortcutsContext.ts`, not `ShortcutsProvider.tsx`. Sidebar tree keyboard nav is a roving-tabindex layer (`tree-keyboard.ts` resolver -> `tree-nav.tsx` seam -> `TreeRow`) additive over the existing DnD - keep DnD attrs intact.

## Message passing & boundaries

- Every message between contexts (page sink -> content bridge -> background relay -> DevTools panel) is validated with `zod` on receipt. Never trust an unparsed payload.
- Rules are data (serializable, `zod`-schema'd in `src/rules/schema.ts`), stored via `browser.storage`; the page layer applies rules, the UI edits them. Import/export round-trips through the same schema. The matchers schema is `.strict()` so a stored/imported rule carrying a removed field (e.g. `resourceTypes`) fails import.
- The stored source of truth is a **workspace tree** (`FolderNode | RuleNode`, arbitrary nesting, mixed root - `src/rules/tree.ts`, `schema.ts`), NOT a flat `Rule[]`. `RuleRepository.getAll()` returns `flatten(workspace)` (DFS pre-order), so the engine (`decide.ts` first-match over the ordered array), `content/bridge.ts`, and `match.ts` stay tree-agnostic - preserve that flat ordered contract when touching storage. `Rule` has no `priority`; tree position is the sole ordering and equals match precedence. The sidebar DnD ports requi with `@dnd-kit/core` core primitives only (per-row `useDraggable`+`useDroppable` + manual drop projection in `tree-locate.ts`), never `@dnd-kit/sortable`. Deleting a folder deletes its whole subtree. See [docs/adr.md](docs/adr.md) 2026-07-12.

## Learning from conversation

If during a session you learn something project-specific that future-you would otherwise have to re-derive - a non-obvious convention the user prefers, a constraint that bit us, a browser-API quirk - append it to [docs/learnings.md](docs/learnings.md).

For architectural trade-offs (significant, costly-to-reverse, or contested choices) use [docs/adr.md](docs/adr.md) instead - that's a separate log.

Don't add: one-off task context, debugging notes, things obvious from the code itself, or anything that would fit better in [README.md](README.md). Don't ask permission for small additions - just keep the file tight and the diff visible in the next commit.

## Domain language

Keep terms consistent with [docs/glossary.md](docs/glossary.md). When a new domain term gets pinned down in a session, add it there.

## Features

- Each feature lives in its own folder: `docs/features/<timestamp>-<slug>/`.
  - `<timestamp>` = `YYYYMMDDHHMMSS` (creation time). `<slug>` = short kebab-case name.
- Every feature folder holds two files:
  - `spec.md` - what + why (overview, acceptance criteria, user test cases, data model, edge cases, dependencies).
  - `plan.md` - how (task breakdown, execution order, file changes, acceptance verification).
- Adding a new feature:
  1. Create the folder with current timestamp + slug.
  2. Write `spec.md` first. Get it approved before planning.
  3. Write `plan.md` from the approved spec.
  4. Log any significant choices made while specing to [docs/adr.md](docs/adr.md).
- Branch naming: when working on a feature (not a quick fix), the branch name must match the feature's folder name under `docs/features/` exactly. Quick fixes are exempt.

## Architectural Decisions

- Log only significant, costly-to-reverse or contested decisions to [docs/adr.md](docs/adr.md).
- Significant = changes architecture/data model, hard to undo later, or had real alternatives debated. NOT routine config (script aliases, package manager, default lib options).

## Before committing

- Check whether the change makes README.md or CLAUDE.md drift:
  - New script / removed dependency / renamed module -> update README.
  - New convention or gotcha that future-you would miss -> add to CLAUDE.md (or docs/learnings.md).
  - Removed feature or file referenced in either doc -> remove the reference.
- No duplicates between README.md and CLAUDE.md. Each fact lives in exactly one place:
  - README.md = onboarding facts a human needs to run/load the extension: build/dev commands, load-unpacked steps, usage, architecture overview, platform limitations, repo layout.
  - CLAUDE.md = working rules for an agent editing this repo: conventions, gotchas, "how to add a feature", invariants.
  - If a fact would fit both, put it in CLAUDE.md and link from README only if a human reader needs the pointer.
- If neither doc needs to change, say so explicitly in the pre-commit summary so it's a deliberate decision, not an oversight.

## TDD

Write code red-green-refactor:

1. Red - add a failing test that pins the behaviour you want. Run the relevant suite and confirm it fails for the right reason (not a typo, not a missing import).
2. Green - write the smallest production change that makes it pass. No speculative branches, no helper extraction yet.
3. Refactor - once green, clean up names, extract duplication, tighten types. Tests stay green throughout.

The whole codebase is TDD'd with Vitest - production files sit next to their `*.test.ts(x)`. Put a test beside the unit it covers; run `npm test` (once) or `npm run test:watch`.

Don't skip red. A test that's never seen failing is a test you can't trust. Don't refactor on red - get to green first, then improve.
