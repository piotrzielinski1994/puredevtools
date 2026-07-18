# Plan - Persist open editor tabs across sessions

## Approach

Keep `useOpenTabs` a pure reducer and inject a thin `TabsStore` port (the seam). The browser+zod
implementation lives in a new `createTabsStore.ts` (coverage-excluded, like `createGateway`/`useTheme`),
so the reducer stays unit-testable and the persistence I/O is isolated. Hydration is gated on
`ready` (rules loaded) to avoid pruning/clobbering against an empty rule set during load. This
mirrors the `useTheme` precedent (storage-backed UI hook, browser touched only in the excluded file).

`pz-codebase-design` verdict: the persistence seam is a deep, narrow port (`load`/`save`) hiding all
storage + validation; the hook consumes it via two params. `pz-ddd`/`pz-archetypes`: N/A (presentation state, no domain model).

## File Structure

- `src/shared/constants.ts` - Modify: add `openTabs: 'puredevtools.openTabs'` to `STORAGE_KEYS`.
- `src/ui/shared/useOpenTabs.ts` - Modify: export `TabsStore` type; add optional
  `{ store?, ready? }` opts; hydrate-on-ready, reconcile against ruleIds, save-on-change, strip draft.
  Pure no-opts behavior unchanged.
- `src/ui/shared/useOpenTabs.test.ts` - Modify: existing pure suite stays; add persistence suite
  (hydrate / draft-strip / prune-deleted / active-fallback / malformed-guard / no-clobber / save-on-change).
- `src/ui/shared/createTabsStore.ts` - Create: `createTabsStore(): TabsStore` using
  `browser.storage.local` + zod schema; malformed/missing → empty state. Coverage-excluded.
- `src/ui/shared/createTabsStore.test.ts` - Create: round-trip + malformed-guard via mocked browser.
- `src/ui/shared/OptionsWorkspace.tsx` - Modify: optional `tabsStore?` prop (default `createTabsStore()`),
  pass `{ store, ready: status === 'ready' }` into `useOpenTabs`.
- `src/ui/shared/OptionsWorkspace.test.tsx` - Modify: reframe the misleading "session-only remount"
  test to "empty store → no restore"; add integration round-trip test with an injected fake store.
- `vitest.config.ts` - Modify: add `src/ui/shared/createTabsStore.ts` to coverage `exclude`.
- `README.md` - Modify: replace "open tabs are session-only" with the persistence statement.
- `docs/adr.md` - Modify: append entry reversing the 2026-07-10 no-persistence deferral.

## Tasks

### Task 1: TabsStore port + persistence in useOpenTabs

**Files:** Modify `src/ui/shared/useOpenTabs.ts`, `src/shared/constants.ts`; Test `src/ui/shared/useOpenTabs.test.ts`.

**Interfaces:**
- Produces:
  - `type TabsStore = { load(): Promise<OpenTabsState>; save(state: OpenTabsState): void }`
  - `useOpenTabs(ruleIds: string[], opts?: { store?: TabsStore; ready?: boolean }): OpenTabs`
  - `STORAGE_KEYS.openTabs: 'puredevtools.openTabs'`

Behavior: no store → pure in-memory (unchanged). With store + ready: `load()` once, filter openKeys
to current ruleIds, keep persisted active if still valid else last remaining else null; on every
subsequent state change persist `save(stripDraft(state))`; never save before hydration; draft never
persisted (openKeys filtered, active-draft → last remaining/null).

Covers: AC-002..AC-008 (unit-level).

### Task 2: createTabsStore (browser + zod impl)

**Files:** Create `src/ui/shared/createTabsStore.ts`, `src/ui/shared/createTabsStore.test.ts`; Modify `vitest.config.ts` (coverage exclude).

**Interfaces:**
- Consumes: `TabsStore`, `OpenTabsState`, `DRAFT_KEY` from Task 1; `STORAGE_KEYS.openTabs`.
- Produces: `createTabsStore(): TabsStore`.

zod schema `{ openKeys: string[]; activeKey: string | null }`; `load` safe-parses, malformed/missing → empty; `save` writes under `STORAGE_KEYS.openTabs`.

Covers: AC-006 (impl), AC-007 (dedicated key).

### Task 3: Wire into OptionsWorkspace + docs

**Files:** Modify `src/ui/shared/OptionsWorkspace.tsx`, `src/ui/shared/OptionsWorkspace.test.tsx`, `README.md`, `docs/adr.md`.

**Interfaces:**
- Consumes: `useOpenTabs(ruleIds, { store, ready })`, `createTabsStore` (Task 1/2).
- Produces: `OptionsWorkspace` accepts optional `tabsStore?: TabsStore` (default `createTabsStore()`).

Integration round-trip test with injected fake store (open → unmount → remount restores; draft not
restored; rules key untouched). Reframe the old session-only remount test. Doc updates.

Covers: AC-001, AC-007 (integration), AC-002 (integration).

## Edge cases (from spec)

Missing/undefined storage → empty; malformed object → zod fail → empty; all rules deleted → empty;
active was draft/deleted → last remaining/null; two options pages → last-write-wins (documented).

## Tests

One test per AC minimum + edge TCs (TC-001..TC-009 in spec). Regression: existing `useOpenTabs` and
`OptionsWorkspace` suites stay green (AC-008).

## Risks

- Load race clobbers persisted state before hydrate: mitigated by `ready` gate + save-only-after-hydrate flag.
- Existing "session-only" remount test becomes misleading: reframed to "empty store → no restore".
- Cross-window last-write-wins surprises a user with two options pages open: out of scope, documented in README + spec.
