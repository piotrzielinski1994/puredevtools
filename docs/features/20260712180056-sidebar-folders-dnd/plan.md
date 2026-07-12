# Plan: Sidebar folders + drag-and-drop reordering

## Approach

Introduce a **workspace tree** (`FolderNode | RuleNode`, arbitrary nesting, mixed root) as the
source of truth. The engine keeps consuming a **flat ordered `Rule[]`** produced by a
**DFS pre-order `flatten`** of the tree, so `decide`/`match`/`bridge`/DevTools stay untouched and
`Rule.priority` is removed. Port requi's core-primitive DnD (`@dnd-kit/core` only: per-row
`useDraggable`+`useDroppable`, manual pointer-Y drop projection, `move`/cycle guard).

TDD throughout: RED (fresh test-writer subagent from spec) -> GREEN -> REFACTOR -> fresh verifier.

Layering (pure logic first, React last) so most ACs are covered by fast unit tests:

```
model.ts (types)          -> tree types + Rule w/o priority
tree.ts (pure ops)        -> flatten, insert, remove, move, findNode, containsId, walkRuleIds
tree-locate.ts (pure)     -> projectDropPosition + rawDropTarget/dropTarget (index compensation)
storage.ts                -> workspace get/save + getAll()=flatten
schema.ts / portable      -> workspace zod schema + tree duplicate-id refine
gateway + RulesProvider    -> expose workspace + tree mutators
SidebarTree / TreeRow / tree-dnd -> DnD UI (options)
PopupTree                  -> read-only collapse tree (popup)
```

## Task breakdown (execution order)

### 1. Data model (AC-001, AC-011)
- `src/rules/model.ts`: remove `priority` from `Rule`. Add `RuleNode`, `FolderNode`, `TreeNode`,
  `Workspace` types (see spec "Data model (final)").
- Delete `priority` fallback in `RuleForm.tsx:141`, `storage.ts` `byPriority`, `merge.ts` index
  reassignment.

### 2. Pure tree ops - `src/rules/tree.ts` (AC-005, AC-006, and backbone for 002-004)
- `flatten(workspace): Rule[]` - DFS pre-order; folder contributes children in place, recursively.
- `findNode(tree, id)`, `containsId(node, id)` (cycle guard), `removeNode(tree, id): {tree, node}`,
  `insertNode(tree, node, target: { parentId: string | null; index: number })`.
- `moveNode(tree, id, target)` - remove + cycle-check (reject if target parent is the node or its
  descendant) + insert; returns unchanged tree on illegal move.
- `renameFolder`, `toggleCollapse`, `newFolderId` helper, `walkRuleIds(tree)` for dup detection.
- Node id: folders get `folder-<n>` unique ids; rules keep `rule.id`.
- Co-locate `tree.test.ts` (from RED subagent).

### 3. Drop projection - `src/rules/tree-locate.ts` (AC-002, AC-003, AC-004)
- `projectDropPosition(pointerY, rect, isFolder): 'before' | 'after' | 'inside'` - bands per requi
  (inside only for folder rows; request rows only before/after).
- `dropTarget(tree, overId, position): { parentId, index }` with same-parent index compensation for
  the dragged node's removal (requi `tree-locate.dropTarget`).
- `tree-locate.test.ts`.

### 4. Storage - `src/rules/storage.ts` (AC-006, AC-002..004 persistence)
- Store the workspace tree under `STORAGE_KEYS.workspace` (rename/repurpose `reqhook.rules`).
  Keep back-compat read: if stored value is a flat `Rule[]` (old shape), wrap each as a `RuleNode`
  at root (tolerant migration; drops any legacy `priority`).
- `RuleRepository`:
  - `getWorkspace(): Workspace`, `saveWorkspace(tree)`.
  - `getAll(): Rule[]` = `flatten(getWorkspace())` (engine-facing, signature unchanged).
  - Replace `add/update/remove/reorder` with tree-aware equivalents used by the UI:
    `addRuleNode`, `updateRule` (find by id, replace `rule`), `removeNode(id)`, `moveNode(id,target)`,
    `renameFolder`, `toggleCollapse`, `addFolder(parentId)`.
  - Keep `getGlobalEnabled/setGlobalEnabled`, `replaceAll(workspace)`.
- `storage.test.ts` extended.

### 5. Schema + portable (AC-012)
- `src/rules/schema.ts`: `ruleSchema` drops `priority`. Add `folderNodeSchema` (recursive via
  `z.lazy`), `ruleNodeSchema`, `treeNodeSchema` (discriminated union on `kind`), `workspaceSchema =
  z.array(treeNodeSchema)`. `portableSchema` = `{ globalEnabled, workspace }` (drop `version`/flat
  `rules`; pre-release). Duplicate-id refine walks the tree (`walkRuleIds`).
- `src/rules/portable.ts` + `merge.ts`: operate on trees. Merge = append imported roots after
  current roots; re-suffix duplicate rule ids and folder ids.
- `portable.test.ts` / `merge.test.ts` updated.

### 6. Gateway + provider (wires UI to storage)
- `src/ui/shared/gateway.ts` (`UiGateway`): replace flat mutators with workspace ops:
  `getWorkspace`, `addRule`, `updateRule`, `duplicateRule`(still), `removeNode`, `moveNode`,
  `addFolder(parentId)`, `renameFolder`, `toggleCollapse`, keep `getGlobalEnabled/set`, import/export.
- `src/ui/shared/createGateway.ts`: implement against `RuleRepository`.
- `src/ui/shared/RulesProvider.tsx`: expose `workspace: TreeNode[]` (+ derived `rules=flatten` for
  any consumer that still needs the flat list, e.g. counts) and the new mutators; keep the
  refresh-after-write pattern.
- Update `RulesProvider.test.tsx`.

### 7. DnD tree UI - options (AC-001..010, AC-014)
- `src/ui/shared/tree-dnd.tsx`: `TreeDndProvider` + `useTreeDnd` sharing `{ overId, position }` drop
  indicator state (port requi `tree-dnd.tsx`).
- `src/ui/shared/TreeRow.tsx`: dispatch `FolderRow` / `RuleRow`. `useRowDnd(id)` = `useDraggable` +
  `useDroppable` on one ref. FolderRow: chevron (collapse), inline `RenameInput`, recursive
  `<ul>` children, empty-folder drop zone, context menu (New folder / Rename / Delete). RuleRow:
  existing switch/name/subline/edit + context menu (Edit / Duplicate / Delete) - "Move up/down"
  removed. Depth indent via `paddingLeft`. Drop indicator lines/ring read from `useTreeDnd`.
- `src/ui/shared/SidebarTree.tsx`: owns `DndContext` (`PointerSensor` distance 5, `pointerWithin`),
  `handleDragStart/Over/End`, root drop zone, `DragOverlay`, root context menu (New folder), spring-
  load expand on dwell. Replaces `RuleList` usage in `OptionsWorkspace`. Search filter disables DnD.
- `OptionsWorkspace.tsx`: swap `<RuleList>` for `<SidebarTree>`; keep search/tabs/editor. Filtering
  falls back to a flat filtered rule list (reuse existing filter rendering) with DnD off.
- Tests: `tree-dnd`/`TreeRow`/`SidebarTree` component tests. DnD end-to-end drag is hard in jsdom;
  test the **handlers** (`handleDragEnd` -> `moveNode` given `{active,over}` + projected position)
  and CRUD/collapse via fireEvent, plus the pure `dropTarget` already unit-tested in step 3.

### 8. Popup tree - read-only (AC-013)
- `src/ui/popup/App.tsx` (or new `PopupTree.tsx`): render the workspace tree with collapse/expand
  (toggle persists via `toggleCollapse`) and click-to-open-options; NO drag, NO folder CRUD, NO
  "New folder" button. Reuse row visuals in a `compact`, non-draggable mode.
- Popup test.

### 9. Cleanup + docs
- Remove `RuleList.tsx` "Move up/Move down" (or retire `RuleList` if fully replaced; keep a
  filtered flat list helper if OptionsWorkspace search reuses it).
- `npm i @dnd-kit/core@^6.3.1`.
- README: architecture note (workspace tree + flatten, DnD sidebar). CLAUDE.md/docs: add learning
  (engine reads flat flatten; `@dnd-kit/core` core-primitive tree not `sortable`). ADR: record
  "tree source-of-truth flattened to ordered Rule[]; priority removed" (hard to reverse, surprising,
  real alternative was cosmetic folders) + "delete folder deletes subtree".
- glossary: add `Workspace`, `TreeNode`, `FolderNode`, `RuleNode`, `flatten`.

## Files

Create: `src/rules/tree.ts`(+test), `src/rules/tree-locate.ts`(+test),
`src/ui/shared/tree-dnd.tsx`, `src/ui/shared/TreeRow.tsx`(+test),
`src/ui/shared/SidebarTree.tsx`(+test), maybe `src/ui/popup/PopupTree.tsx`(+test).

Modify: `src/rules/model.ts`, `schema.ts`, `storage.ts`(+test), `portable.ts`(+test),
`merge.ts`(+test), `clone.ts`, `src/shared/constants.ts`,
`src/ui/shared/{gateway,createGateway,RulesProvider,OptionsWorkspace,RuleForm}.tsx`(+tests),
`src/ui/popup/App.tsx`, `package.json`, `README.md`, `CLAUDE.md`/`docs/*`.

Untouched (proves the insight): `src/engine/**`, `src/content/**`, `src/background/**`,
`src/rules/match.ts`, `src/ui/devtools/**`.

## Edge cases -> tests

- Illegal move (into descendant / onto self): TC-005, TC-006 (`tree.test`).
- Empty-folder drop zone: TC-003 (`TreeRow`/`SidebarTree` test).
- Collapsed folder still flattens: TC-008 (`tree.test`).
- Blank folder name rejected: TC-010 (`TreeRow` test).
- Same-parent reorder index compensation: covered in `tree-locate.test`.
- Duplicate rule ids on import: TC-016 (`portable.test`).
- Deep nesting render: TC-018 (`SidebarTree` test).
- Search filter -> DnD disabled (assert no drag context / handlers) - component test.

## Acceptance verification

- Each AC-NNN -> at least one TC-NNN test (mapping in spec).
- Gates: `npm run lint`, `npm run typecheck` (no `any`, no errors), `npm test` (full suite green),
  Chrome + Firefox builds (`npm run build:chrome`, `npm run build:firefox`).
- Manual: load unpacked, verify drag rule/folder, create/rename/delete folder, collapse persists,
  popup tree collapses, export/import round-trip. (Fresh verifier subagent runs the gates.)
- Coverage threshold: 90% (lines/functions/branches/statements) in `vitest.config.ts`.

## AC traceability (verified)

Gates green: lint, typecheck, 304 tests, coverage 97.02/91.92/92.52/97.02 (all >= 90), Chrome + Firefox builds.

| AC | Proving test(s) |
| --- | --- |
| AC-001 | `SidebarTree.test` "render a nested tree ... to arbitrary depth (TC-018)"; `schema.test` "parse a nested tree" |
| AC-002 | `SidebarTree.test` "moveNode when a rule is dropped before another" (real drag); `storage.test` "persist a reorder among root siblings"; `tree.test` moveNode reorder |
| AC-003 | `SidebarTree.test` "moveNode with the folder as parent ... dropped inside a folder" (real drag); `tree.test` into-folder / out-to-root; `tree-locate.test` empty-zone -> {folder,0}; `storage.test` move into folder |
| AC-004 | `tree.test` "reorder folders among themselves (TC-004)" |
| AC-005 | `tree.test` TC-005 (into descendant), TC-006 (onto self) |
| AC-006 | `tree.test` TC-007 (nested pre-order), TC-008 (collapsed still contributes); `storage.test` getAll = flatten; engine files unchanged vs main |
| AC-007 | `SidebarTree.test` "open the newly created folder in inline-rename mode (TC-009)"; blank reject `tree.test` TC-010 |
| AC-008 | `SidebarTree.test` "rename ... inline input" + "cancel a rename on Escape"; `tree.test` renameFolder |
| AC-009 | `SidebarTree.test` delete confirm=true / confirm=false; `tree.test`/`storage.test` removeNode subtree |
| AC-010 | `storage.test` "persist a collapsed toggle and not change flatten order"; `SidebarTree.test` collapse hides children |
| AC-011 | `model.ts`/`ruleSchema` no priority (`.strict()`); `schema.test` "not expose a priority field"; `storage.test` "drop a legacy priority field" |
| AC-012 | `portable.test` TC-015 round-trip, TC-016 dup fail; `schema.test` dup-anywhere fail; portable = {globalEnabled, workspace} |
| AC-013 | `PopupTree.test` renders tree, collapse works, "no drag handles and no folder CRUD controls" |
| AC-014 | Grep-level: no rounded/radius, 1px dividers, font-mono on URL in tree components |

Deferred (spec-flagged, not v1-blocking): spring-loaded expand dwell has no automated test; AC-004 folder drag + out-to-root drop proven at pure-logic level, not via UI drag simulation.
