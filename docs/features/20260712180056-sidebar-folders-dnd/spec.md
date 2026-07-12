# Sidebar folders + drag-and-drop reordering

## Overview

Give the ReqHook sidebar a **folder tree** and **drag-and-drop** so rules can be grouped and
reordered by hand, mirroring the `requi` sidebar. Today the sidebar is a flat `Rule[]` list
ordered by a numeric `priority`, reordered only via a "Move up / Move down" context-menu action.
This feature replaces that with an arbitrarily-nested tree of **folders** and **rules**, dragged
into place with `@dnd-kit/core` (the same library + core-primitive approach `requi` uses).

The reference implementation is `requi`'s `src/lib/workspace/` + `src/components/workspace/`
(nested `children[]` tree, `useDraggable`/`useDroppable` per row, manual pointer-Y drop
projection, `move.ts`/`moveNodes`). `dbui` mirrors it. We port the shape, adapting node types to
ReqHook's `Rule`.

## Why

- Users accumulate many rules; a flat list with menu-only reorder is slow to organize.
- ReqHook and `requi` are one product family (shared visual contract); the sidebar interaction
  should match too.
- The match engine already treats the rule list as an **ordered sequence** (first enabled match
  wins - `decideInterception` uses `.find()` over the `priority`-sorted array). Tree position can
  become that order directly, so folders + reorder are a UI/storage concern, not an engine change.

## Key architectural insight

`decideInterception` (`src/engine/page/decide.ts`) and the content bridge (`src/content/bridge.ts`)
consume a **flat, ordered `Rule[]`** from `repository.getAll()` and never read `rule.priority`
numerically - only array order. Therefore:

- The **source of truth** becomes a **tree** of folders + rules.
- `getAll()` flattens the tree **depth-first (pre-order)** into an ordered `Rule[]`.
- Engine, bridge, `decide`, `match`, DevTools panel stay **unchanged**.
- `priority: number` is **removed** from the `Rule` model - tree DFS position is the sole ordering.

## Scope

### Data model

A **workspace tree** is an ordered array of **nodes**. A node is a discriminated union on `kind`:

```
RuleNode   = { kind: 'rule';   rule: Rule }
FolderNode = { kind: 'folder'; id: string; name: string; collapsed: boolean; children: TreeNode[] }
TreeNode   = RuleNode | FolderNode
Workspace  = TreeNode[]        // ordered roots (mixed rules + folders at root)
```

- `Rule` loses `priority` (`{ id, name, enabled, matchers, actions }`).
- Folders nest arbitrarily (folder in folder).
- Root holds a mix of loose rules and folders (no forced default folder).
- `collapsed` is persisted per folder (expansion state survives reload - a deliberate divergence
  from requi, which does not persist it; ReqHook already persists theme, so persisting collapse is
  consistent and cheap).

### Ordering / match precedence

- Effective match order = **DFS pre-order flatten of the tree** (a folder's rules occupy the
  folder's slot, in order, recursively).
- Dragging any rule/folder changes the flatten order, hence match precedence. "What you see
  top-to-bottom is the order rules match."
- `collapsed` does **not** affect flatten order (collapsed folders still contribute their rules).

### Drag-and-drop (ported from requi core-primitive approach)

- Library: **`@dnd-kit/core@^6.3.1`** only (no `@dnd-kit/sortable`; the tree uses core
  `useDraggable` + `useDroppable` per row with manual drop-position projection, exactly as requi).
- Supported operations:
  1. Reorder a node among its siblings (before / after).
  2. Move a rule or folder **into** a folder (drop "inside" a folder row, or onto an empty folder's
     drop zone).
  3. Move a node **out** to root (drop in the root drop zone below the last row).
  4. Reorder folders themselves (folders are ordinary draggable nodes).
- Drop projection: pointer-Y within the hovered row's rect -> `before | after | inside` bands
  (inside only valid over a folder row). A visible drop indicator (1px line for before/after, inset
  ring for inside) shows the target.
- Illegal move guard: a folder cannot be dropped into itself or any of its descendants (cycle
  prevention).
- Spring-loaded expand: hovering a collapsed folder during a drag for a short dwell auto-expands it.
  (Ported from requi; nice-to-have - see edge cases if descoped.)
- `PointerSensor` with a small activation distance (5px) so a click still selects/edits without
  starting a drag.

### Folder CRUD

- **Create**: "New folder" in the sidebar root context menu (creates at root) and in a folder row's
  context menu (creates inside that folder). New folder starts in inline-rename mode with a default
  name.
- **Rename**: inline `<input>` on the folder row - via context-menu "Rename" or double-click.
  Commit on Enter/blur, cancel on Escape. Empty name reverts to previous.
- **Delete**: context-menu "Delete" on a folder. **Deletes the whole subtree** (contained rules +
  subfolders) after a `window.confirm` (requi parity). Empty folder still confirms.
- **Collapse/expand**: click the folder's chevron (or the row) toggles `collapsed`; persisted.

### Rule row (unchanged behavior, new affordances)

- Keeps: enable switch, name, URL/action subline, click-to-edit, existing context menu
  (Edit / Duplicate / Delete). "Move up / Move down" menu items are **removed** (DnD replaces them).
- Gains: draggable (whole row is a drag handle via the activation-distance sensor).

### Surfaces

- **Options page**: full tree + DnD + folder CRUD.
- **Popup**: shows the **folder tree with collapse/expand** (read + toggle + click-to-open-options),
  but **no DnD and no folder CRUD** (popup is a compact glance surface; organizing happens in
  options). Collapsed state is shared with options via storage.
- **DevTools panel**: unaffected (does not render the rule list).

### Import / export

- Pre-release: **change the portable format freely, no version bump.** `portableSchema` carries the
  **workspace tree** instead of a flat `rules[]`. Export writes the tree; import parses it and
  replaces (or merges) the workspace.
- Merge mode: imported tree's nodes are appended at root after existing roots; duplicate rule ids
  are re-suffixed (as today). Folder ids likewise de-duplicated.
- A tree with duplicate rule ids (anywhere) fails validation (extend the existing duplicate-id
  refine to walk the tree).

### Explicitly out of scope (v1)

- Folder-level enable/disable toggle (per-rule `enabled` only).
- Multi-select drag (requi has it; ReqHook v1 drags one node at a time).
- Keyboard-driven move (Alt+Arrow in requi); not ported in v1.
- Folder-level config/metadata (requi folders carry env config; ReqHook folders are name + children
  only).
- Reordering the popup tree.

## Data model (final)

```
Rule       = { id, name, enabled, matchers, actions }          // priority removed
RuleNode   = { kind: 'rule';   rule: Rule }
FolderNode = { kind: 'folder'; id, name, collapsed, children: TreeNode[] }
TreeNode   = RuleNode | FolderNode
Workspace  = TreeNode[]

flatten(workspace): Rule[]   // DFS pre-order, rules in visible sequence
```

Storage: one key holds the workspace tree (replacing the flat `reqhook.rules` array shape).
`getAll()` returns `flatten(tree)` for engine consumers; a new `getWorkspace()`/`saveWorkspace()`
serves the UI.

## Acceptance criteria

- AC-001: The sidebar renders a nested tree of folders and rules; folders can contain rules and
  other folders to arbitrary depth; rules and folders may sit at root.
- AC-002: A rule can be dragged to a new position among its siblings and the new order persists
  across reload.
- AC-003: A rule can be dragged into a folder (incl. an empty folder) and out to root; the change
  persists.
- AC-004: A folder can be dragged to reorder among siblings and into/out of other folders; the
  change persists.
- AC-005: Dropping a folder into itself or a descendant is rejected (no-op, tree unchanged).
- AC-006: The engine's effective rule order equals the DFS pre-order flatten of the tree; changing
  tree order changes which rule matches first. `flatten` places a folder's rules in the folder's
  slot, recursively.
- AC-007: "New folder" (root menu and folder menu) creates a folder at the correct location in
  inline-rename mode; committing sets its name; empty/blank name is rejected (reverts).
- AC-008: Renaming a folder (menu or double-click) updates its name and persists; Escape cancels.
- AC-009: Deleting a folder removes the folder and its entire subtree after a confirm; cancel leaves
  the tree unchanged.
- AC-010: A folder's collapsed/expanded state toggles on chevron/row click, persists across reload,
  and does NOT change flatten order.
- AC-011: `Rule` no longer has a `priority` field anywhere (model, schema, form, merge); the app
  builds, type-checks, and all existing behavior that depended on ordering now derives from tree
  position.
- AC-012: Export writes the workspace tree; import parses it and restores the same tree (round-trip
  fidelity). Import of a tree with duplicate rule ids fails validation.
- AC-013: The popup renders the folder tree with working collapse/expand and click-to-open-options,
  with no drag-and-drop and no folder CRUD controls.
- AC-014: All three surfaces keep the visual contract (no rounded corners, flush bars, 1px
  dividers, `font-mono` data, neutral tokens) - folder rows and drop indicators included.

## Test cases

- TC-001 (happy, AC-002): tree `[r1, r2, r3]` at root; drag `r3` before `r1` -> order `[r3, r1, r2]`;
  `flatten` reflects it; reload -> same. Maps to: AC-002, AC-006.
- TC-002 (happy, AC-003): drag `r2` inside folder `f`; `f.children` contains `r2`; root no longer
  has `r2`. Then drag `r2` back to root. Maps to: AC-003.
- TC-003 (edge, AC-003): drag a rule into an **empty** folder (empty-folder drop zone) -> becomes
  its only child. Maps to: AC-003.
- TC-004 (happy, AC-004): folder `a` before folder `b` at root; drag `b` before `a` -> `[b, a]`.
  Maps to: AC-004.
- TC-005 (edge, AC-005): folder `parent` contains `child`; drag `parent` into `child` -> rejected,
  tree unchanged. Maps to: AC-005.
- TC-006 (edge, AC-005): drag a folder onto its own row -> no-op. Maps to: AC-005.
- TC-007 (happy, AC-006): `flatten([f([r1,r2]), r3])` === `[r1, r2, r3]`; nested
  `flatten([f([g([r1]), r2])])` === `[r1, r2]`. Maps to: AC-006.
- TC-008 (edge, AC-006): a collapsed folder still contributes its rules to `flatten`. Maps to:
  AC-006, AC-010.
- TC-009 (happy, AC-007): "New folder" at root -> a folder appears at root end in rename mode;
  commit "API" -> named "API". Maps to: AC-007.
- TC-010 (edge, AC-007): commit blank folder name -> rejected, keeps prior/default name. Maps to:
  AC-007.
- TC-011 (happy, AC-008): rename folder to "Auth" via double-click -> persists; Escape mid-edit ->
  reverts. Maps to: AC-008.
- TC-012 (happy, AC-009): delete folder with 2 rules -> confirm accepted -> folder + rules gone;
  confirm cancelled -> unchanged. Maps to: AC-009.
- TC-013 (happy, AC-010): toggle collapse -> children hidden; reload -> still collapsed; flatten
  order unchanged. Maps to: AC-010.
- TC-014 (edge, AC-011): grep shows no `priority` in `Rule`; a rule built without `priority`
  round-trips through storage + import. Maps to: AC-011.
- TC-015 (happy, AC-012): export tree with a folder + nested rules, re-import into empty workspace
  -> identical tree. Maps to: AC-012.
- TC-016 (edge, AC-012): import a tree containing two rules with the same id -> validation error.
  Maps to: AC-012.
- TC-017 (happy, AC-013): popup renders folder tree; clicking a folder chevron collapses it; no
  drag handles / "New folder" button present. Maps to: AC-013.
- TC-018 (edge, AC-001): deeply nested tree (folder in folder in folder) renders with correct
  indentation and each rule editable. Maps to: AC-001.

## UI States

| State                | Behavior                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| Empty workspace      | Dashed-border "No rules yet" block (existing empty state), plus reachable "New folder". |
| Empty folder         | Folder row + an indented drop-zone hint row ("empty" / drop target).           |
| Collapsed folder     | Chevron points right; children hidden; count of contained rules optional.       |
| Dragging             | Dragged row dims; `DragOverlay` chip follows cursor; drop indicator on target.  |
| Drop-before/after    | 1px accent line at the sibling gap.                                             |
| Drop-inside (folder) | Inset ring/highlight on the folder row.                                         |
| Illegal drop         | No indicator (or muted); release = no-op.                                       |
| Renaming folder      | Inline text input replaces the folder name; Enter commits, Esc cancels.        |
| Filtered search      | (Existing) matching rules shown; DnD disabled while a search filter is active.  |

## Edge cases

- Drag into own descendant / onto self -> rejected (AC-005).
- Empty folder as a drop target (dedicated drop zone) (TC-003).
- Collapsed folder as flatten contributor (TC-008) and as a spring-load target during drag.
- Blank / whitespace-only folder name on rename or create -> reject (TC-010).
- Search filter active: reorder disabled (matches today's "Move up/down disabled while filtering").
- Delete non-empty folder: confirm required, deletes subtree (AC-009).
- Import: duplicate rule ids anywhere in the tree -> fail (TC-016); duplicate folder ids on merge ->
  re-suffix.
- Reorder within the same parent must compensate the drop index for the dragged node's own removal
  (requi `dropTarget` compensation) so "drop after the 3rd item" lands correctly.
- Very deep nesting: indentation must stay legible; no crash / infinite recursion.

## Dependencies

- New runtime dep: `@dnd-kit/core@^6.3.1` (React 18 compatible; peer `react >=16.8`). No
  `@dnd-kit/sortable`/`utilities` needed for the tree.
- No new browser permissions (still `storage` only).
- Reference code to port: `requi/src/lib/workspace/{model,tree-edit,tree-locate,move}.ts` and
  `requi/src/components/workspace/{sidebar-tree,tree-row,tree-dnd}.tsx`. `dbui` mirrors these.
