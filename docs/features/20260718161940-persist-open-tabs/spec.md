# Persist open editor tabs across sessions

## Overview

The options-page workspace opens each edited rule as a tab. Today `useOpenTabs` holds tab state
(`openKeys` + `activeKey`) in memory only, so reopening the options page loses the working set.
This feature persists the open-tabs state to `browser.storage.local` under a dedicated key
(separate from rules) and restores it on load, filtering out tabs whose rule no longer exists and
never persisting the unsaved draft.

This reverses the deferred decision in ADR 2026-07-10 ("tab state ... no persistence in v1").

## Why

- Backlog F3: reopening the options page discards the user's working set of open rules.
- README currently states "open tabs are session-only"; the working set should survive a reload/restart
  the same way rules and theme already do.

## Scope

### In scope

- Persist `{ openKeys, activeKey }` (draft excluded) to a dedicated `browser.storage.local` key.
- Restore on load: validate with zod, drop tabs for deleted rules, recompute the active tab.
- Persist on every tab mutation (open / close / switch / prune).

### Out of scope (YAGNI)

- Cross-window / cross-tab live sync (`storage.onChanged` subscription). Last-write-wins across
  multiple options pages is acceptable; tabs are a per-window working set.
- Persisting the unsaved draft tab or its in-progress form contents.
- Dirty-tracking / confirm-on-close (that is backlog F4).

## Acceptance Criteria

- AC-001: On opening the options page, previously open rule tabs are restored (both `openKeys` order
  and the active tab), read from `browser.storage.local` under a dedicated key.
- AC-002: The unsaved draft tab (`new:draft`) is never written to storage; if it was open at session
  end it does not reappear on reload.
- AC-003: Tabs whose rule no longer exists are filtered out on load; remaining valid tabs restore in
  their persisted order.
- AC-004: The active tab is restored when still valid; when the persisted active tab is invalid
  (deleted or draft), fall back to the last remaining open tab, or `null` when none remain.
- AC-005: Opening, closing, switching, or pruning a tab persists the updated open-tabs state (draft
  stripped).
- AC-006: Persisted state is validated with zod on load; malformed or missing data restores no tabs
  (empty state), never throws.
- AC-007: The open-tabs key is distinct from the rules key; persisting tabs never mutates rules or
  `globalEnabled`. Nothing is written to storage before the persisted state has been loaded
  (no clobber of prior state on mount).
- AC-008: With no store injected, `useOpenTabs` keeps its existing pure in-memory behavior unchanged
  (open / close / adjacent-active / no-duplicate / prune).

## Test Cases

- TC-001 (happy, AC-001/004/005): store holds `openKeys [a,b]`, active `a`; hook mounts with
  ruleIds `[a,b]` and `ready` → restores `[a,b]`, active `a`. Maps to: AC-001, AC-004.
- TC-002 (draft, AC-002/005): after hydrate, open draft + rule a; assert every `save` payload has no
  `new:draft` in `openKeys` and `activeKey` is never the draft. Maps to: AC-002.
- TC-003 (deleted, AC-003): store holds `[a,b,c]`; hook mounts with ruleIds `[a,c]` → restores
  `[a,c]`. Maps to: AC-003.
- TC-004 (invalid active fallback, AC-004): store active `b`, ruleIds `[a,c]` → openKeys `[a,c]`,
  active `c` (last remaining). Maps to: AC-004.
- TC-005 (malformed, AC-006): stored value is a non-conforming object → restores empty state, no throw.
  Maps to: AC-006.
- TC-006 (no clobber, AC-007): with `ready=false`, `save` is never called; and no `save` fires before
  `load` resolves. Maps to: AC-007.
- TC-007 (save on change, AC-005): after hydrate, `open('b')` triggers `save({ openKeys:[..,'b'], ... })`.
  Maps to: AC-005.
- TC-008 (round-trip integration, AC-001/002/007): OptionsWorkspace with a stateful storage mock -
  open a rule tab, unmount, remount → the tab is restored; the draft is not; the rules key is untouched.
  Maps to: AC-001, AC-002, AC-007.
- TC-009 (regression, AC-008): existing `useOpenTabs` suite (no store) stays green. Maps to: AC-008.

## Edge cases

- Missing key / `undefined` in storage → empty state.
- Malformed persisted object (wrong shape) → zod parse fails → empty state.
- All rules deleted → all persisted rule tabs filtered → empty state.
- Persisted active tab was the draft or a deleted rule → fall back to last remaining / null.
- Two options pages open at once → last-write-wins (no live sync); documented, not handled.

## Dependencies

- `zod` v3 (already present) for boundary validation.
- `webextension-polyfill` `browser.storage.local` (already used by `useTheme`, `RuleRepository`).
