# Plan - Cookie sync folders

Approach: **generic-ize in place**. Fold the leaf discriminant + leaf-row + provider-ops behind an
adapter so one tree stack serves Rules and Cookie sync. Rules full suite = the regression guard (must
stay green every step).

## What is already generic (no change)

- `src/rules/tree-locate.ts` - 0 leaf refs.
- `src/ui/shared/tree-nav.tsx`, `tree-dnd.tsx` - 0 leaf refs.
- `src/shortcuts/tree-keyboard.ts` - operates on `TreeNode` via `nodeId`/`findNode`; leaf-agnostic.
- `src/ui/shared/ContextMenu.tsx` - already shared.

## The seam

A `LeafAdapter<Node>` object supplies everything leaf/provider-specific to the tree UI:
```
type TreeAdapter = {
  workspace: TreeNode[];               // provider tree
  leaves: LeafData[];                  // flattened leaves (rules | mappings) for filter view
  moveNode/addFolder/renameFolder/removeNode/toggleCollapse/duplicateFolder   // generic ops (same names)
  duplicateLeaf(node): void            // duplicateRule | duplicateMapping
  onEditLeaf(id): void                 // open editor tab
  onNewLeaf(): void                    // New rule | New mapping
  matchesFilter(leaf, q): boolean
  renderLeafRow(node, depth): ReactNode // RuleRow | MappingRow
  leafMenu(node): MenuItem[]           // Edit/Duplicate/Delete
  labels: { newLeaf: string; emptyTitle: string; emptyHint: string }
}
```
`SidebarTree` consumes an adapter instead of calling `useRules()`. Rules builds its adapter from
`useRules`; cookies builds its adapter from a new cookie provider.

## Tasks

### Task 1: Cookie tree model + schema + migration (pure, node env)
Files: `src/cookies/model.ts` (+`CookieTreeNode`/`CookieFolderNode`/`CookieMappingNode`, `CookieSyncState.tree`),
`src/cookies/schema.ts` (recursive `.strict()` mirror of rules tree schema), `src/cookies/tree.ts`
(re-export/instantiate generic tree ops for the mapping leaf: `flatten`, `duplicateNode`, `walkMappingIds`),
`src/cookies/storage.ts` (getAll accepts `{tree}` OR legacy `{mappings}` -> wrap at root; save writes `{tree}`).
Tests: `schema.test.ts`, `storage.test.ts`, `tree` behavior (mirror rules `tree.test.ts` subset for the mapping leaf).
Covers AC-002, AC-014; TC-001..004.

### Task 2: Generic-ize the pure tree core for two leaves
Decide minimal change: rules `tree.ts` algorithms (`nodeId/findNode/insertNode/removeNode/moveNode/duplicateNode/collectFolderIds/newFolderId/toggleCollapse/renameFolder`) already only touch `.kind==='folder'`/`.id`/`.children`; the sole leaf-typed spots are `flatten`, `updateRuleInTree`, `walkRuleIds`, and `cloneSubtree` (touches `node.rule`).
- Extract the leaf-agnostic algorithms into a shared generic core (`src/shared/tree/` or keep in `rules/tree.ts` re-exported) parameterized by a leaf node `{kind: string; id-source}`.
- `cloneSubtree` gains a leaf-clone callback (rules clones `.rule` via cloneRule; cookies clones `.mapping`).
- Rules `tree.ts` keeps its current public surface (re-exports) so `engine`/`storage`/`bridge` imports and all rules tests are untouched.
Tests: existing rules `tree.test.ts` + `clone.test.ts` stay green (regression guard); no new behavior.
Covers AC-009 groundwork.

### Task 3: Adapter-ize SidebarTree + TreeRow
Files: `src/ui/shared/SidebarTree.tsx` (accept `adapter: TreeAdapter`, drop direct `useRules`), `TreeRow.tsx`
(leaf row via `adapter.renderLeafRow`; keep `RuleRow` as one impl), new `ruleTreeAdapter` (from `useRules`).
- `OptionsWorkspace` passes the rules adapter (behavior identical).
Tests: existing `SidebarTree.test.tsx` (27) + `tree-nav.test.tsx` stay green - render via the rules adapter.
Covers AC-001,003,004,005 (Rules parity preserved).

### Task 4: Cookie provider + mapping row + mount tree in CookieSyncView
Files: new `src/ui/cookies/CookieRulesProvider`-equiv (tree state + ops over `CookieSyncRepository`, mirror `RulesProvider`),
`MappingRow` (leaf row: enabled Switch + source->target subtitle), `cookieTreeAdapter`, wire into
`CookieSyncView` replacing the flat `CookieSidebar` list; keep the content-bar `+`/tabs + detail form.
Tests: `CookieSyncView.test.tsx` extended - nested render, folder+mapping+background menus, DnD move,
collapse-persist, delete-subtree, dup folder/mapping, select->edit, +button, sync-unchanged.
Covers AC-001,003-013; TC-005..016.

### Task 5: Shortcut ids + docs + ADR
- Shortcut registry: `duplicate-rule`/`new-folder`/`rename-node` are rule-worded; decide if cookie view
  reuses them (contextual, like `new-item`) or needs neutral ids. Default: reuse (contextual per mounted view).
- ADR entry: reverse the flat-store part of 2026-07-20 (cookie sync now a tree; migration; generic tree core seam; pz-codebase-design invoked).
- CLAUDE.md: update the Cookie-sync bullet (no longer "flat `CookieMapping[]`"; now a tree that DOES reuse the generic tree core, still its own store key + schema + never the rules workspace/`decideInterception`).
- README if it states cookie sync is flat.

## Execution order
1 -> 2 -> 3 (Rules green) -> 4 -> 5. Each task ends green; Rules suite re-run after 2 and 3.

## Design gate
- pz-codebase-design: **invoked** - the `TreeAdapter` seam + generic tree core is the core interface decision.
- pz-ddd / pz-archetypes: not applicable (UI/storage reorg, no domain model) - mirror ADR-2026-07-12 wording.

## Risks
- Regressing Rules during Task 2/3 refactor: mitigated - rules public tree surface unchanged (re-exports), full rules suite is the guard, run after every task.
- Shortcut id wording (`duplicate-rule` on cookie view): reuse contextually or add neutral alias; decide in Task 5.
- Coverage gate (90%): new `src/cookies/**` + `src/ui/cookies/**` already in include list; add tests to hold threshold.
