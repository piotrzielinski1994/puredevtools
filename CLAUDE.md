# ReqHook

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
- **ESLint** (flat config). Package manager **npm**. Node managed by **mise** (`mise.toml` pins node 22) - no `.nvmrc`.

## Cross-browser

- Route ALL extension API calls through `webextension-polyfill` (`import browser from "webextension-polyfill"`), not `chrome.*`.
- A single manifest source (`src/manifest/index.ts`) emits both Chrome and Firefox manifests - don't fork the tree per engine. Only permission requested is `storage`.
- **Single enforcement mechanism = the page layer** (`src/engine/page/`, injected via `src/content/page-main.ts` in the MAIN world): monkey-patches `window.fetch` + `XMLHttpRequest`, forwards the real request, then overrides the response headers/body before the page's callback sees it. Identical on Chrome and Firefox. There is NO network layer (no `declarativeNetRequest`/`webRequest`, no `RequestEngine`/`selectEngine`, no capabilities/diagnostics) - it was deleted (see [docs/adr.md](docs/adr.md) 2026-07-10). Don't reintroduce a per-engine adapter without a new ADR.
- `decideInterception` (`src/engine/page/decide.ts`) maps a matched rule to an `override` (headerOps + optional body); `patchFetch`/`patchXhr` apply it. The rule model + UI stay browser-agnostic.
- Read README's **Platform limitations** before changing interception - `fetch`/`XHR` only, main-frame document navigation is deliberately out of scope.

## Message passing & boundaries

- Every message between contexts (page sink -> content bridge -> background relay -> DevTools panel) is validated with `zod` on receipt. Never trust an unparsed payload.
- Rules are data (serializable, `zod`-schema'd in `src/rules/schema.ts`), stored via `browser.storage`; the page layer applies rules, the UI edits them. Import/export round-trips through the same schema. The matchers schema is `.strict()` so a stored/imported rule carrying a removed field (e.g. `resourceTypes`) fails import.

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
