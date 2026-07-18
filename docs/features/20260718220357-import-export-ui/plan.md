# Plan - Import/Export UI controls

## Approach

Wire the existing gateway plumbing to the UI. Two icon controls in the sidebar header (styled like `ThemeSwitch`),
a hidden file `<input>` for import, `window.confirm` before the destructive replace, and a new toast for feedback.
Replace-only (merge stays unexposed). No engine, storage, schema, or rule-model changes.

## File Structure

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/ui/components/ui/toast.tsx` | create | `ToastProvider` + `useToast`; aria-live region, variant, auto-dismiss. Coverage-excluded (`ui/components/**`). |
| `src/ui/components/ui/toast.test.tsx` | create | render + dismiss + variant styling. |
| `src/ui/shared/ImportExportControls.tsx` | create | Export/Import buttons + hidden file input; `useRules` + `useToast`. |
| `src/ui/shared/ImportExportControls.test.tsx` | create | AC-001..006. |
| `src/ui/shared/OptionsWorkspace.tsx` | modify (header cluster ~54-57) | render `<ImportExportControls />` before `GlobalSwitch`. |
| `src/ui/options/App.tsx` | modify | wrap in `<ToastProvider>`. |

## Execution order

Task 1 (toast) -> Task 2 (controls + wiring). Task 2 consumes Task 1's `useToast`.

## Task 1: Toast infrastructure

**Files:** create `src/ui/components/ui/toast.tsx`, `toast.test.tsx`.

**Interfaces:**
- Consumes: nothing (React only).
- Produces:
  - `ToastProvider({ children }: { children: ReactNode }): JSX.Element`
  - `useToast(): { show(message: string, variant?: 'success' | 'error'): void }`
  - No-op `show` when unwrapped.

Port `purerequest/src/components/ui/toast.tsx`. Diffs: strip `rounded-md` (design.md: no rounded); add `variant`
(`success` -> `text-emerald-600`, `error` -> `text-destructive`, undefined -> neutral); name the dismiss timeout const.

- [ ] Write failing toast test (show renders message; clears after fake-timer advance; error variant class).
- [ ] Run, confirm RED.
- [ ] Implement `ToastProvider`/`useToast`.
- [ ] Run, confirm GREEN.
- [ ] Commit `feat(F1): toast infra for import/export feedback`.

## Task 2: ImportExportControls + wiring

**Files:** create `src/ui/shared/ImportExportControls.tsx`, `ImportExportControls.test.tsx`;
modify `OptionsWorkspace.tsx`, `options/App.tsx`.

**Interfaces:**
- Consumes: `useRules().exportRules()`, `useRules().importRules(json, 'replace')`, `useToast().show`,
  Task 1's `ToastProvider`.
- Produces: `<ImportExportControls />` (no props).

Behavior:
- Export button (`Download` icon, `aria-label="Export rules"`) -> `void exportRules()`.
- Import button (`Upload` icon, `aria-label="Import rules"`) -> `fileInputRef.current?.click()`.
- Hidden `<input type="file" accept="application/json,.json">`; onChange:
  - read `const text = await file.text()`,
  - `if (!window.confirm(REPLACE_MSG)) { reset; return; }`,
  - `const outcome = await importRules(text, 'replace')`,
  - `show(outcome.ok ? 'Rules imported.' : 'Import failed: ' + outcome.error, outcome.ok ? 'success' : 'error')`,
  - always `event.target.value = ''` (AC-006).
- Style buttons like `ThemeSwitch` (`text-muted-foreground hover:text-foreground`, `size-4` icon).
- `OptionsWorkspace`: insert `<ImportExportControls />` first in the `gap-3` right cluster.
- `App.tsx`: wrap `<OptionsWorkspace />` in `<ToastProvider>`.

- [ ] Write failing tests: AC-001 export click, AC-003 import replace + toast, AC-004 cancel, AC-005 error toast, AC-006 input reset.
- [ ] Run, confirm RED.
- [ ] Implement `ImportExportControls`, wire into `OptionsWorkspace` + `App`.
- [ ] Run, confirm GREEN.
- [ ] Refactor if ifology; keep GREEN.
- [ ] Commit `feat(F1): AC-001..006 import/export controls in options header`.

## Acceptance verification

- Full `npm test` green; new files covered (ImportExportControls in included path; toast excluded).
- `npm run lint`, typecheck (`tsc`) clean; no `any`.
- Fresh verifier subagent maps every AC to a real asserting test.
- Manual (optional): build:chrome, load-unpacked, export a set, edit the JSON invalid, import -> error toast; import valid -> replace + success toast.

## Notes

- README needs no change: line 36 already states import "replaces the current set". Confirm no drift at pre-commit.
- `docs/learnings.md`: record the jsdom `File.text()` handling if it bites.
