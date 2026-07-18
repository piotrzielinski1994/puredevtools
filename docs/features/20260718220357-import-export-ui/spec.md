# Import/Export UI controls

## Overview

The options page can already export the full workspace to JSON and import it back - the plumbing exists end-to-end
(`RulesProvider.exportRules`/`importRules`, `createGateway.exportToFile`/`importFromFile`, `rules/portable.ts`,
`rules/merge.ts`) - but no UI wires it, so grep finds zero callers of `exportRules()`/`importRules(` outside the
provider. README line 36 and the feature list advertise the capability, making this doc/feature drift. This feature
adds Export and Import controls to the options-page sidebar header.

## Why

- Backlog F1: the documented export/import feature is unreachable from the UI.
- README (line 36) promises "Export all rules ... and import them back (replaces the current set)".

## Scope

### In scope

- Export control: triggers the existing `exportRules()` (downloads `puredevtools.json`).
- Import control: file picker (`.json`) -> read text -> confirm -> `importRules(json, 'replace')`.
- Replace-only import, guarded by a confirm dialog (destructive: discards the current set).
- Success / error feedback via a new lightweight toast (options page has no toast infra today).

### Out of scope (YAGNI)

- Merge-mode import in the UI. The gateway/`mergeRules` support `'merge'`, but the UI stays replace-only
  (matches README). `mergeRules` remains reachable via the gateway arg for a future feature.
- A mode-picker (dropdown / two buttons).
- Import into a chosen folder, partial import, or diff/preview before replace.
- Toasts on other surfaces (popup, DevTools) - only the options page gets the provider now.

## Acceptance Criteria

- AC-001: The sidebar header exposes an **Export** control; clicking it calls `exportRules()`.
- AC-002: The sidebar header exposes an **Import** control that opens a JSON file picker.
- AC-003: Selecting a valid rules JSON and confirming calls `importRules(json, 'replace')` and shows a success toast.
- AC-004: A confirm precedes the destructive replace; cancelling aborts - `importRules` is not called, rules intact.
- AC-005: A malformed / schema-invalid file shows an error toast with the message and leaves rules unchanged.
- AC-006: After a cancelled or failed import the same file can be re-selected (the file input value is reset).

## Test Cases

- TC-001 (happy, export): ready -> click Export -> `exportToFile` called once. Maps to: AC-001.
- TC-002 (happy, import replace): confirm=true, valid file -> `importFromFile(json, 'replace')` once + success toast. Maps to: AC-003.
- TC-003 (confirm cancel): confirm=false -> `importFromFile` not called; no success toast. Maps to: AC-004.
- TC-004 (invalid file): gateway `{ ok:false, error:'boom' }` -> error toast contains 'boom'; rules unchanged. Maps to: AC-005.
- TC-005 (re-pick same file): after cancel, input value empty -> re-selecting the same file re-fires. Maps to: AC-006.
- TC-006 (toast infra): `useToast().show(msg, 'error')` renders in an aria-live region, clears after timeout. Maps to: supporting.

## UI States

| State           | Behavior                                                                |
| --------------- | ----------------------------------------------------------------------- |
| Loading / error | Controls not rendered (workspace shows the loading/error placeholder).  |
| Ready (idle)    | Export + Import icon buttons in the sidebar header cluster.             |
| Import success  | Transient success toast, bottom-right, auto-dismiss.                    |
| Import error    | Transient error toast with the message, auto-dismiss.                   |

## Edge cases

- User cancels the OS file picker -> onChange does not fire (or fires with no file) -> no-op.
- User confirms then the JSON is invalid -> error toast, rules untouched.
- Same file re-picked after a failure -> input value reset so the change handler re-fires.
- `useToast` used without a provider -> no-op `show` (controls still work; only feedback is dropped).

## Dependencies

- Existing: `RulesProvider` (`exportRules`/`importRules`), gateway, `rules/portable.ts`, `rules/merge.ts`.
- `lucide-react` icons (`Upload`, `Download`) - already a dependency.
- New toast component under `src/ui/components/ui/` (no new npm dependency).
