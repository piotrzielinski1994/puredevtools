# Cookie sync folders

## Overview

Cookie sync currently stores a **flat `CookieMapping[]`** under `puredevtools.cookieSync` (ADR 2026-07-20).
The Rules sidebar has a full folder tree (nesting, DnD, context-menu CRUD, collapse); Cookie sync has
none. This feature gives Cookie sync the **same folder-tree UX as Rules**: arbitrary nesting of folders
holding cookie mappings, drag-reorder, per-node context menu, collapse, and empty-area "New mapping /
New folder" menu.

**This reverses part of ADR 2026-07-20** ("flat `CookieMapping[]`, never touches the workspace tree").
A new ADR must record the reversal.

## Why

- Users accumulate many mappings (per-env, per-service); a flat list does not scale.
- The Rules tree already proves the UX; parity is expected once both sidebars look identical.
- User explicitly requested it after seeing folders on Rules but not Cookie sync.

## Goal / Non-goals

**Goals**
- Cookie mappings live in a nestable folder tree, stored as a tree, edited with the same interactions as Rules.
- Existing flat stored mappings migrate transparently to a single-level tree (all at root) on first load.
- Import/export (if/when added) round-trips the tree. (Cookie sync has NO import/export today - out of scope here.)

**Non-goals**
- No change to sync semantics (`syncMapping`, the `CookieApiPort`, drop-secure-on-http, omit-domain - all untouched).
- No cross-window live tree sync beyond what already exists.
- No auto-sync, no folder-level "sync all" action (YAGNI; can be a follow-up).
- No sharing of a rendered tree component with Rules if it forces churn in the mature Rules UI (see Design).

## Design decision: generic-ize in place (chosen)

The folder machinery is **leaf-agnostic**: `tree-locate.ts` has 0 Rule refs; `tree.ts`'s Rule refs live
only in leaf-typed helpers (`flatten`/`updateRuleInTree`/`walkRuleIds`). All folder behavior
(`moveNode`/`insertNode`/`duplicateNode`/collapse/DnD projection) is already generic. The only
rule-specific UI is the **leaf row** (`RuleRow`: Switch + `actionSummary`) and the `'rule'` discriminant.
Folders are literal copy&paste.

**Chosen: generic-ize in place, one tree, two leaf renderers.**
- Parameterize the tree by leaf: a discriminant kind (`'rule' | 'mapping'`) + an injected leaf-row renderer.
- Keep `RuleRow` as-is; add `MappingRow`. `SidebarTree`/`TreeRow`/`tree.ts` operate over `FolderNode | LeafNode<T>`.
- Cookie sync mounts the same tree with the mapping leaf renderer + a cookie-backed provider.
- Rules subsystem must stay green throughout (its full suite is the regression guard).

The `.strict()` recursive schema, storage migration, and ADR reversal are the non-negotiable core.

## Data model

Current:
```
CookieMapping = { id, name, enabled, sourceUrl, targetUrl, cookieNames[] }
CookieSyncState = { mappings: CookieMapping[] }
```

New (mirrors rules `TreeNode`):
```
CookieMappingNode = { kind: 'mapping'; mapping: CookieMapping }
CookieFolderNode  = { kind: 'folder'; id; name; collapsed; children: CookieTreeNode[] }
CookieTreeNode    = CookieMappingNode | CookieFolderNode
CookieSyncState   = { tree: CookieTreeNode[] }        // was { mappings: CookieMapping[] }
```
- `CookieMapping` leaf shape is UNCHANGED.
- `flatten(tree)` (DFS pre-order) yields `CookieMapping[]` - the sync path + selection keep consuming a flat list.
- Schema `.strict()` and recursive (mirror `src/rules/schema.ts` tree schema).

### Migration
`CookieSyncRepository.getAll()` must accept BOTH shapes:
- New: `{ tree: CookieTreeNode[] }` -> parse with new schema.
- Legacy: `{ mappings: CookieMapping[] }` -> wrap each mapping as `{kind:'mapping',mapping}` at root (mirror rules `migrateLegacy`).
- Malformed/missing -> empty tree.
First `save` writes the new shape; legacy key is overwritten in place (pre-release, no version bump - same precedent as ADR 2026-07-12).

## Acceptance criteria

- AC-001: Cookie sync sidebar renders a nested folder/mapping tree to arbitrary depth (folders + mappings, mixed root).
- AC-002: Legacy flat `{mappings:[...]}` storage loads as a single-level tree (all mappings at root), no data loss.
- AC-003: Right-click a folder -> context menu: New folder, Rename, Duplicate, Delete (subtree). Mirrors Rules folder menu.
- AC-004: Right-click a mapping -> context menu: Edit, Duplicate, Delete. Mirrors Rules rule menu.
- AC-005: Right-click empty sidebar area -> context menu: New mapping, New folder (reuses shared ContextMenu, no self-dismiss).
- AC-006: Drag-reorder mappings and folders within/between folders (same DnD as Rules); tree position persists.
- AC-007: Collapse/expand folders; collapsed state persists across reloads.
- AC-008: Deleting a folder deletes its whole subtree after a confirm (mirror ADR 2026-07-12).
- AC-009: Duplicating a folder deep-clones the subtree with fresh ids ("(copy)" on top node only) - mirror F5.
- AC-010: Duplicating a mapping clones it with a fresh id + "(copy)" name.
- AC-011: Selecting a mapping in the tree opens it in the detail editor (unchanged form); sync/delete from detail still work.
- AC-012: The content top-bar "Add mapping" (+) button still adds a mapping (at root) - existing behavior preserved.
- AC-013: `syncMapping` and the `CookieApiPort` are byte-for-byte unchanged; sync still works on any selected mapping.
- AC-014: Stored schema is recursive + `.strict()`; a stored/imported node with an unknown field fails parse (falls back to empty).

## Test cases

- TC-001 (migration): storage has legacy `{mappings:[m1,m2]}` -> getAll returns tree `[{kind:mapping,m1},{kind:mapping,m2}]`. Maps: AC-002.
- TC-002 (migration empty/malformed): missing key or garbage -> empty tree. Maps: AC-002, AC-014.
- TC-003 (new shape round-trip): save tree -> getAll returns identical tree. Maps: AC-001, AC-014.
- TC-004 (schema strict): node with extra field -> parse fails -> empty. Maps: AC-014.
- TC-005 (nested render): folder>folder>mapping renders all. Maps: AC-001.
- TC-006 (folder menu): right-click folder -> New folder/Rename/Duplicate/Delete present + wired. Maps: AC-003.
- TC-007 (mapping menu): right-click mapping -> Edit/Duplicate/Delete present + wired. Maps: AC-004.
- TC-008 (empty-area menu): right-click background -> New mapping + New folder, creates at root. Maps: AC-005.
- TC-009 (DnD reorder): drag mapping into folder -> persisted tree reflects move. Maps: AC-006.
- TC-010 (collapse persist): collapse folder -> reload -> still collapsed. Maps: AC-007.
- TC-011 (delete subtree): delete folder w/ children after confirm -> subtree gone. Maps: AC-008.
- TC-012 (dup folder): duplicate folder -> deep clone, fresh ids, "(copy)" top only. Maps: AC-009.
- TC-013 (dup mapping): duplicate mapping -> fresh id, "(copy)" name. Maps: AC-010.
- TC-014 (select -> edit): click mapping row -> detail form shows it; sync/delete work. Maps: AC-011, AC-013.
- TC-015 (+ button): content-bar + adds mapping at root. Maps: AC-012.
- TC-016 (sync unchanged): sync a selected mapping -> syncMapping called with the mapping unchanged. Maps: AC-013.

## UI states

| State   | Behavior                                                                    |
| ------- | --------------------------------------------------------------------------- |
| Loading | Existing async load; tree renders once ready.                               |
| Empty   | "No cookie mappings yet" prompt; right-click still opens New mapping/folder. |
| Success | Nested tree, DnD, menus, collapse - identical feel to Rules sidebar.         |

## Edge cases

- Legacy mapping missing new fields: leaf shape unchanged, so straight wrap - no per-field migration.
- Mapping id collisions after duplicate/import: fresh-id minting over the whole tree (mirror F5 minters).
- Selected mapping deleted (via subtree folder delete): selection falls back to first remaining mapping or null.
- Folder with no mappings: valid; sync path just flattens to fewer leaves.
- Empty tree: `flatten` -> `[]`, selection null, empty-state prompt.

## Dependencies

- Reuses shared `ContextMenu` (`src/ui/shared/ContextMenu.tsx`).
- Reuses rules tree algorithms (`duplicateNode`, `moveNode`, `insertNode`, `flatten`, etc.) - either
  generically or mirrored in `src/cookies/tree.ts` (plan decides).
- `@dnd-kit/core` (already used by Rules) for cookie DnD.
- New ADR reversing the flat-store part of 2026-07-20.

## Open questions (resolve in plan grill)

1. Generic tree core vs `src/cookies/tree.ts` mirror - measured by how cleanly `tree.ts` parameterizes without touching Rules tests.
2. Share the DnD-heavy renderer or build a cookie `CookieSidebarTree` - default: parallel renderer to protect Rules.
3. Keep the content-bar tabs strip (per-mapping tabs) or replace with tree-only selection - default: keep (AC-012 preserves + button).
