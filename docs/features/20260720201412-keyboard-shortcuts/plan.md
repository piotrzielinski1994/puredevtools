# Plan - Keyboard shortcuts

How we build the spec. TDD throughout (Vitest). purerequest is the reference; port the module shapes, adapt keys per C1.

## Approach

Port purerequest's shortcut triad into puredevtools, in-page only:

1. **Core (pure, no React)** - `registry.ts` (action ids + defaults), `resolve.ts` (`safeNormalize`/`resolveShortcuts`/`findConflict`), `record-hotkey.ts` (`eventToHotkey` + `useRecordHotkey`), backed by `@tanstack/hotkeys`.
2. **Persistence** - `ShortcutsProvider` context over `browser.storage.local` (key `puredevtools.shortcuts`), zod-validated, live-synced via `storage.onChanged` (mirror `useTheme`). Exposes overrides + add/remove/replace/reset mutators.
3. **Binding hook** - `useActionHotkeys(handlers)` reads the provider + `resolveShortcuts`, feeds `@tanstack/react-hotkeys`'s `useHotkeys`.
4. **Wiring** - each surface (options views, popup, devtools) provides its handler map; contextual `new-item`/`delete-item` dispatch by active options view.
5. **Tree nav** - port `tree-keyboard.ts` (adapted from purerequest's `expandedIds:Set` to puredevtools' per-folder `collapsed` via a derived expanded-set) + a roving-focus `TreeNavProvider` consumed by `TreeRow`.
6. **Settings UI** - `ShortcutsSection` + `ShortcutRow`, added as the third options ViewSwitcher entry; reached by a button + `open-shortcuts`.

Design patterns: registry + command resolution (`resolveTreeKey` returns a `TreeKeyCommand` ADT dispatched via a record map, no ifology in the component); context/compound-component for provider + tree-nav seam; ADT (`{ok}`-style) already used by gateways - reused.

## File Structure

### Core (browser-agnostic, pure)
- `src/shortcuts/registry.ts` (NEW) - `ShortcutActionId` union, `ShortcutAction`, `ShortcutOverrides`, `SHORTCUT_ACTIONS`.
- `src/shortcuts/resolve.ts` (NEW) - `safeNormalize`, `resolveShortcuts`, `findConflict`.
- `src/shortcuts/record-hotkey.ts` (NEW) - `eventToHotkey` ONLY (pure; runs in `node` test env). The `useRecordHotkey` React hook lives under `src/ui/shared/useRecordHotkey.ts` (jsdom env) - split from purerequest's single file because puredevtools' vitest runs non-`ui` files in `node` (no DOM). Keeps the "core = pure, no React" boundary honest.
- `src/shortcuts/schema.ts` (NEW) - zod `shortcutOverridesSchema` (`.catch({})`), keyed by registry ids.
- `src/shortcuts/storage.ts` (NEW) - `ShortcutsRepository` over `StorageArea` (reuse the `StorageArea` type from `rules/storage.ts`), read+parse+write under `STORAGE_KEYS.shortcuts`.

### Tree keyboard (pure resolver + move math)
- `src/shortcuts/tree-keyboard.ts` (NEW) - `TreeKeyCommand` ADT, `TreeMoveDirection`, `treeMoveTarget`, `resolveTreeKey`, `flattenSelectable(tree, expandedIds)`, `expandedFolderIds(tree)` (derive Set from `collapsed:false`). Reuses `rules/tree.ts` (`findNode`, `nodeId`) + `rules/tree-locate.ts` (`locateNode`) + `MoveTarget`.

### React glue (all under `src/ui/shared/` -> jsdom test env)
- `src/ui/shared/ShortcutsProvider.tsx` (NEW) - context: `{overrides, addShortcut, removeShortcut, replaceShortcut, resetShortcut}`; persists + subscribes storage.
- `src/ui/shared/useActionHotkeys.ts` (NEW) - the binding hub.
- `src/ui/shared/useRecordHotkey.ts` (NEW) - the recorder React hook (wraps pure `eventToHotkey`).
- `src/ui/shared/tree-nav.tsx` (NEW) - `TreeNavProvider`/`useTreeNav` (roving id, registerRow, handleKeyDown), `openContextMenuOnKey`.

### Settings UI
- `src/ui/shortcuts/ShortcutsSection.tsx` (NEW) - the list.
- `src/ui/shortcuts/ShortcutRow.tsx` (NEW) - per-action Add/Edit/Remove/Reset row.

### Wiring (MODIFY)
- `src/shared/constants.ts` - add `shortcuts: 'puredevtools.shortcuts'`.
- `src/ui/options/main.tsx` - already has `HotkeysProvider`; wrap `App` in `ShortcutsProvider` too.
- `src/ui/popup/main.tsx` - add `HotkeysProvider` + `ShortcutsProvider`.
- `src/ui/devtools/main.tsx` - add `HotkeysProvider` + `ShortcutsProvider`.
- `src/ui/options/OptionsShell.tsx` - add `'shortcuts'` view + button; call `useActionHotkeys` for app-wide + view-cycle + contextual `new-item`/`delete-item`/`save`/`sync`.
- `src/ui/shared/OptionsWorkspace.tsx` - expose imperative handles (new rule, close/next/prev tab, delete active, duplicate, rename, collapse/expand all) so the shell's `useActionHotkeys` can call them; keep RuleForm's own `Mod+S` (save-rule).
- `src/ui/cookies/CookieSyncView.tsx` - REMOVE fake `Mod+S` toast; expose add/delete/sync handles for contextual actions.
- `src/ui/shared/SidebarTree.tsx` - mount `TreeNavProvider`, compute roving id, dispatch `resolveTreeKey`, refocus after move.
- `src/ui/shared/TreeRow.tsx` - roving `tabIndex`, `ref` registration, `onKeyDown` -> `useTreeNav().handleKeyDown`, `onKeyDown` -> `openContextMenuOnKey`.
- `src/ui/popup/App.tsx` - `useActionHotkeys({ 'toggle-global', 'toggle-theme' })`.
- `src/ui/devtools/main.tsx` (Panel) - `useActionHotkeys({ 'clear-log', 'focus-filter' })`; filter input gets a ref.
- `package.json` - add `@tanstack/hotkeys` explicit dep (currently transitive via react-hotkeys).
- `vitest.config.ts` - add `src/shortcuts/**`, `src/ui/shared/**` (already included), `src/ui/shortcuts/**` to coverage `include`; the enforced threshold is **90%** (lines/functions/branches/statements). Exclude the same non-testable leaves the config already excludes (pure re-export/index shells, provider factory glue) only if genuinely untestable - default is to test to 90%.

## Tasks

Order respects dependencies: core -> persistence -> hook -> tree resolver -> wiring per surface -> settings UI.

### Task 1: Registry
**Files:** Create `src/shortcuts/registry.ts` + `registry.test.ts`.
**Interfaces:**
- Produces: `type ShortcutActionId` (union of all ids in spec), `type ShortcutAction = {id; name; description; defaultHotkey}`, `type ShortcutOverrides = Partial<Record<ShortcutActionId,string[]>>`, `const SHORTCUT_ACTIONS: readonly ShortcutAction[]`.
- [ ] Failing test: every id unique; each has non-empty name/description; each default `safeNormalize`-valid (import from resolve once it exists - or inline a temporary assertion, tightened in Task 2). -> TC-001
- [ ] Green: fill registry from the spec tables.
- [ ] Commit `feat(shortcuts): AC-001 action registry`.

### Task 2: resolve (normalize / resolveShortcuts / findConflict)
**Files:** Create `src/shortcuts/resolve.ts` + `resolve.test.ts`.
**Interfaces:**
- Consumes: `SHORTCUT_ACTIONS`, `ShortcutActionId`, `ShortcutOverrides` (Task 1); `@tanstack/hotkeys` `normalizeHotkey`, `validateHotkey`.
- Produces: `safeNormalize(hotkey:string):string|null`, `resolveShortcuts(overrides:ShortcutOverrides):Record<ShortcutActionId,string[]>`, `findConflict(hotkey:string, forAction:ShortcutActionId, effective:Record<ShortcutActionId,string[]>):ShortcutActionId|null`.
- [ ] Failing tests: TC-002..TC-007 (default, override, disabled, invalid-dropped, conflict hit/miss/self).
- [ ] Green: port purerequest resolve.ts verbatim (swap import path).
- [ ] Retro-tighten Task 1's default-validity test to use `safeNormalize`.
- [ ] Commit `feat(shortcuts): AC-002 AC-003 resolve + conflict`.

### Task 3: hotkey recorder (pure eventToHotkey + React hook, split by test env)
**Files:** Create `src/shortcuts/record-hotkey.ts` (pure) + `record-hotkey.test.ts` (node env); `src/ui/shared/useRecordHotkey.ts` (hook) + `useRecordHotkey.test.tsx` (jsdom env).
**Interfaces:**
- Consumes: `@tanstack/hotkeys` (`PUNCTUATION_CODE_MAP`, `detectPlatform`, `isModifierKey`, `normalizeHotkeyFromParsed`, `normalizeKeyName`, `rawHotkeyToParsedHotkey`).
- Produces: `eventToHotkey(event:KeyEventLike, platform?):string|null` (record-hotkey.ts); `useRecordHotkey({onRecord,onCancel}):{isRecording,startRecording,cancelRecording}` (useRecordHotkey.ts, imports `eventToHotkey`).
- [ ] Failing tests: TC-031 - `eventToHotkey` unit (physical key from `event.code` for Option-composed; modifier-only -> null) in node env; hook render (Escape->onCancel, keydown->onRecord) in jsdom env.
- [ ] Green: port purerequest record-hotkey.ts, splitting the pure fn from the hook across the two files.
- [ ] Commit `feat(shortcuts): AC-012 event.code-aware recorder`.

### Task 4: persistence (schema + repository + provider)
**Files:** Create `src/shortcuts/schema.ts`, `src/shortcuts/storage.ts`, `src/ui/shared/ShortcutsProvider.tsx` + tests (`schema.test.ts`, `storage.test.ts`, `ShortcutsProvider.test.tsx`). Modify `src/shared/constants.ts`.
**Interfaces:**
- Consumes: `ShortcutOverrides`, `ShortcutActionId`, `SHORTCUT_ACTIONS` (Task 1); `safeNormalize`, `resolveShortcuts` (Task 2); `StorageArea` (`rules/storage.ts`); `browser.storage.local`.
- Produces: `shortcutOverridesSchema` (zod, `.catch({})`); `class ShortcutsRepository { getOverrides(): Promise<ShortcutOverrides>; save(o): Promise<void> }`; `ShortcutsProvider`, `useShortcutOverrides():ShortcutOverrides`, `useShortcutMutators():{addShortcut,removeShortcut,replaceShortcut,resetShortcut}` (or one combined `useShortcuts()`).
- [ ] Failing tests: TC-032 (schema round-trip + malformed->{}); mutator semantics (add normalizes+dedupes; remove-last leaves []; replace in place; reset drops key) - port purerequest settings-context mutator tests; TC-033 (storage.onChanged live sync) with a fake StorageArea + change emitter.
- [ ] Green: add constant; port schema/repo; write provider mirroring `useTheme`'s read/subscribe/write.
- [ ] Commit `feat(shortcuts): AC-011 override persistence + live sync`.

### Task 5: useActionHotkeys
**Files:** Create `src/ui/shared/useActionHotkeys.ts` + `useActionHotkeys.test.tsx`.
**Interfaces:**
- Consumes: `useShortcutOverrides` (Task 4), `resolveShortcuts` (Task 2), `ShortcutActionId` (Task 1); `@tanstack/react-hotkeys` `useHotkeys`,`UseHotkeyDefinition`; `@tanstack/hotkeys` `Hotkey`.
- Produces: `useActionHotkeys(handlers: Partial<Record<ShortcutActionId,()=>void>>): void`.
- [ ] Failing tests: TC-008 (fires), TC-009 (multi-binding), TC-010 (disabled no-fire). Render inside `HotkeysProvider`+`ShortcutsProvider` test harness; dispatch KeyboardEvents.
- [ ] Green: port purerequest use-action-hotkeys.ts (swap settings import for `useShortcutOverrides`).
- [ ] Commit `feat(shortcuts): AC-004 useActionHotkeys hook`.

### Task 6: tree-keyboard resolver
**Files:** Create `src/shortcuts/tree-keyboard.ts` + `tree-keyboard.test.ts`.
**Interfaces:**
- Consumes: `rules/tree.ts` (`findNode`,`nodeId`), `rules/tree-locate.ts` (`locateNode`), `rules/tree.ts` `MoveTarget`, `TreeNode`; `ShortcutActionId` (Task 1); `@tanstack/hotkeys` `matchesKeyboardEvent`,`Hotkey`.
- Produces: `type TreeKeyCommand` (ADT: focus|activate|toggle|expand|collapse|move|none), `treeMoveTarget(tree,id,dir):MoveTarget|null`, `expandedFolderIds(tree):Set<string>`, `flattenSelectable(tree,expandedIds):string[]`, `resolveTreeKey({tree,expandedIds,focusedId,event,bindings}):TreeKeyCommand`. (Drop `extend` - single-select.)
- [ ] Failing tests: TC-019..TC-022 at the resolver level (nav down/up/first/last; expand/descend + collapse/ascend; activate toggle vs open; move up/down/outdent/nest + impossible=none).
- [ ] Green: port purerequest tree-keyboard.ts; adapt `expandedIds` derivation (`collapsed===false`) and `childrenOf`; remove extend branches.
- [ ] Commit `feat(shortcuts): AC-007 tree-key resolver`.

### Task 7: tree-nav seam + TreeRow roving focus
**Files:** Create `src/ui/shared/tree-nav.tsx` + `tree-nav.test.tsx`. Modify `src/ui/shared/SidebarTree.tsx`, `src/ui/shared/TreeRow.tsx`.
**Interfaces:**
- Consumes: `resolveTreeKey`,`expandedFolderIds`,`flattenSelectable`,`TreeKeyCommand` (Task 6); `resolveShortcuts`+`useShortcutOverrides` (Tasks 2,4); `useRules` (`moveNode`,`toggleCollapse`); existing `onEdit`.
- Produces: `TreeNavProvider`, `useTreeNav():{rovingId,contextMenuBindings,registerRow,handleKeyDown}`, `openContextMenuOnKey(event,bindings):boolean`.
- [ ] Failing tests: TC-023 (Shift+F10 opens menu), roving tabIndex (only one row `tabIndex=0`), focus follows nav (rendered SidebarTree; press ArrowDown -> selection+focus move; Enter opens; Alt+Arrow reorders via moveNode spy). -> AC-007
- [ ] Green: port purerequest sidebar-tree keydown wiring + tree-nav.tsx; adapt puredevtools SidebarTree (its context menu is a custom `openMenu(node,x,y)`, so `openContextMenuOnKey` computes rect + calls `openMenu` directly instead of dispatching a DOM contextmenu event - adapt, keep behavior).
- [ ] Commit `feat(shortcuts): AC-007 roving-focus tree navigation`.

### Task 8: options workspace + shell wiring (contextual actions)
**Files:** Modify `src/ui/options/OptionsShell.tsx`, `src/ui/shared/OptionsWorkspace.tsx`, `src/ui/cookies/CookieSyncView.tsx`, `src/ui/options/main.tsx`. Tests: `OptionsShell.test.tsx` (extend), `OptionsWorkspace` shortcut tests, `CookieSyncView` shortcut test.
**Interfaces:**
- Consumes: `useActionHotkeys` (Task 5); workspace/cookie handlers.
- Produces: shell-level `useActionHotkeys` map wiring `toggle-theme`,`toggle-global`,`cycle-view`,`open-shortcuts`,`new-item`,`delete-item`,`save-rule`,`sync-mapping`,`new-folder`,`duplicate-rule`,`rename-node`,`close-tab`,`next-tab`,`prev-tab`,`import-rules`,`export-rules`,`collapse-all-folders`,`expand-all-folders`; contextual dispatch by `view`.
- [ ] Failing tests: TC-011..TC-018 (save, new-item Rules/Cookies, delete contextual, sync real, view cycle, tabs, import/export/collapse/expand). Includes AC-006 removal of fake CookieSync toast.
- [ ] Green: lift the needed imperative handlers up (or wire via callbacks passed down); implement contextual switch on active view; wrap options `App` in `ShortcutsProvider`; delete CookieSyncView fake `Mod+S`, add real `sync-mapping`.
- [ ] Commit `feat(shortcuts): AC-005 AC-006 options + contextual actions`.

### Task 9: popup + devtools wiring
**Files:** Modify `src/ui/popup/main.tsx`, `src/ui/popup/App.tsx`, `src/ui/devtools/main.tsx`. Tests: `popup/App` shortcut test, `devtools` panel shortcut test.
**Interfaces:**
- Consumes: `useActionHotkeys` (Task 5), `ShortcutsProvider`+`HotkeysProvider`.
- Produces: popup `{toggle-global,toggle-theme}` handlers; devtools `{clear-log,focus-filter}` handlers (+ filter input ref lifted into Panel/InterceptTable).
- [ ] Failing tests: TC-024 (popup toggles), TC-025 (devtools clear + focus-filter).
- [ ] Green: add providers to both roots; wire handlers; pass a filter-ref/onFocusFilter into InterceptTable or hoist filter state.
- [ ] Commit `feat(shortcuts): AC-008 AC-009 popup + devtools`.

### Task 10: settings UI (ShortcutsSection + ShortcutRow + view)
**Files:** Create `src/ui/shortcuts/ShortcutsSection.tsx`, `src/ui/shortcuts/ShortcutRow.tsx` + tests. Modify `src/ui/options/OptionsShell.tsx` (render Shortcuts view + button).
**Interfaces:**
- Consumes: `SHORTCUT_ACTIONS` (Task 1), `resolveShortcuts`+`findConflict` (Task 2), `useRecordHotkey` (Task 3), `useShortcuts` mutators (Task 4), `@tanstack/hotkeys` `formatForDisplay`.
- Produces: `ShortcutsSection`, `ShortcutRow`.
- [ ] Failing tests: TC-026 (list renders row per action), TC-027 (add persists), TC-028 (remove-last disables + stops firing), TC-029 (reset), TC-030 (conflict alert). -> AC-010, AC-011
- [ ] Green: port purerequest shortcuts-section.tsx + shortcut-row.tsx; render as third ViewSwitcher entry; wire `open-shortcuts`/`cycle-view` to it. Match design.md (no rounded, flush bars, font-mono chips).
- [ ] Commit `feat(shortcuts): AC-010 rebind settings view`.

### Task 11: browser-reserved-key guard + docs
**Files:** `src/shortcuts/registry.test.ts` (extend), docs.
**Interfaces:** none new.
- [ ] Failing test: TC-013 - assert no default is in a `RESERVED_COMBOS` blocklist (C1 set); assert `preventDefault` is called by `useActionHotkeys` path for a bound safe key (or verify via `@tanstack/react-hotkeys` default). -> AC-013
- [ ] Green: add the guard test + blocklist constant; adjust any offending default.
- [ ] Update README (usage: keyboard shortcuts + rebinding), CLAUDE.md (new `src/shortcuts/` subsystem invariant: in-page only, contextual generic ids), docs/glossary.md (roving focus, effective binding, override), docs/adr.md if warranted.
- [ ] Commit `docs(shortcuts): usage + conventions`.

## Edge cases (from spec + probing)

- Disabled action (`[]`): binds nothing, settings shows "(disabled)". (TC-010, TC-028)
- Invalid stored override entry: dropped by `resolveShortcuts`; malformed blob -> `{}` via schema `.catch`. (TC-005, TC-032)
- Conflict on record: alert, no persist. (TC-030)
- macOS Option glyph: physical-key recording. (TC-031)
- Tree move impossible (top/bottom sibling, root outdent, no preceding folder): `treeMoveTarget` -> null -> `none`. (TC-022)
- Focus target removed after delete/move: refocus falls back to roving default (`visibleIds[0]`).
- Typing in an input: `@tanstack/react-hotkeys` per-hotkey ignoreInputs - Mod/Escape fire, bare keys suppressed (don't hijack `ArrowDown` while typing in the search/filter box). Verify search input still types arrows.
- Contextual action when its view isn't mounted: handler simply absent from the active map -> no-op.
- Multiple options tabs open: storage.onChanged keeps overrides in sync. (TC-033)
- Bare-key tree nav must NOT fire when focus is in the rule form / search box - tree keydown is bound on the ROW (`onKeyDown`), not global, so it only fires with a row focused. Confirm.

## Tests summary

One test per AC minimum + every TC-001..TC-033. Core/resolver/recorder/schema = pure unit tests; provider/hook/wiring = RTL render + KeyboardEvent dispatch; settings = RTL interaction. jsdom has no layout engine but this feature is behavioral (focus, handler calls, persisted values), not visual - assert focus (`document.activeElement`), spy calls, and stored values, not className/layout. The settings view's visual conformance (design.md) is a light className check only.

## Risks

- `@tanstack/react-hotkeys` KeyboardEvent dispatch in jsdom may need `HotkeysProvider` + real `dispatchEvent`: mitigate by copying purerequest's test harness setup for the hook tests.
- Browser genuinely eating a "safe" default we misjudged: every key is rebindable + Task 11 blocklist guards defaults; manual verify in the real extension (build:chrome) at Phase 4.
- Roving-focus port touching TreeRow (shared by DnD) could regress drag: keep DnD attrs intact, add keyboard as an additive layer; existing SidebarTree DnD tests must stay green.
- Contextual `new-item`/`delete-item` mis-dispatch across views: covered by TC-012/013/014 asserting per-view behavior.

## Acceptance verification

- All 33 TCs green (`npm test`), lint + typecheck clean, coverage threshold: **90%** (lines/functions/branches/statements) - `npm run test:coverage` must stay green after adding new dirs to the `include` allowlist.
- Fresh verifier subagent (Phase 4) + real-extension smoke (`npm run build:chrome`, load unpacked, exercise a shortcut per surface + a rebind).
- AC -> test-name traceability table appended to the task file after green.
