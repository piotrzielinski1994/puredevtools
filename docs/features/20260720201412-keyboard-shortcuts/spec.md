# Keyboard shortcuts (everything)

Bring a first-class, rebindable keyboard-shortcut system to puredevtools, mirroring the `purerequest` architecture (registry + `resolveShortcuts` + single `useActionHotkeys` hook + hotkey recorder + rebind settings UI). All three surfaces (options, popup, DevTools panel) get shortcuts.

## Why

purerequest already solved this cleanly: key strings are decoupled from handlers via a central action registry, users can rebind every action (multi-binding + conflict detection + disable), and the settings list doubles as the discoverability surface. puredevtools has only scattered `useHotkeys` calls today (RuleForm `Mod+S` real; CookieSyncView `Mod+S` a fake placeholder toast). This ports the whole triad.

## Reference

`~/projects/private/purerequest/src/lib/shortcuts/*` (registry.ts, resolve.ts, use-action-hotkeys.ts, record-hotkey.ts) + `src/lib/workspace/tree-keyboard.ts`, `src/components/workspace/tree-nav.tsx`, `src/components/settings/shortcut-row.tsx`, `shortcuts-section.tsx`. purerequest is Tauri; mechanism ports verbatim, key strings do not (see Constraint C1).

## Constraints

- **C1 - Browser-reserved keys.** puredevtools runs in browser tabs (options `open_in_tab`), the action popup, and the DevTools panel. Chrome/Firefox intercept `Cmd/Ctrl+T`, `+W`, `+N`, `+Shift+N/T/W`, `+Shift+A` (tab search), `+Shift+I/J/C/M` (devtools), `+1..9` / `Ctrl+Tab` / `Ctrl+PageUp/Down` (tab switch), `Cmd+L`, zoom keys - `preventDefault` in a page-level `keydown` listener does NOT stop them. Defaults MUST avoid these. Overridable page-level keys (safe to bind + `preventDefault`): `Cmd+S`, `Cmd+F`, `Cmd+O`, `Cmd+P`, `Enter`, `F2`, arrows, `Home/End`, `Shift+F10`, and the `Mod+Alt+*` / `Mod+Shift+<safe-letter>` / `Alt+*` families.
- **C2 - No manifest `commands`.** In-page JS listeners only (`@tanstack/react-hotkeys`). No new permission, no ADR. (User decision.)
- **C3 - Three isolated React roots.** popup / options / devtools each mount their own tree; `HotkeysProvider` + `useActionHotkeys` wire per-root. Overrides are shared (one storage key), read by all roots.
- **C4 - Contextual generic actions.** Options has 3 mutually-exclusive views (Rules | Cookie sync | Shortcuts); only one mounts its handlers at a time. Parallel CRUD actions (`new-item`, `delete-item`) are single registry ids whose bound handler depends on the active view - avoids per-view id/key duplication and false conflict flags.
- **C5 - No comments in code** (project rule). All rationale lives here / in commits.

## Data model

Overrides persist under a new storage key `puredevtools.shortcuts` (add to `STORAGE_KEYS`), value = `ShortcutOverrides` = `Partial<Record<ShortcutActionId, string[]>>`. Zod-validated on read (`.catch({})`); absent action → registry default; `[]` → deliberately disabled; missing key → no override. Mirrors purerequest's `settings.shortcuts` slot but stored standalone (puredevtools has no settings blob).

- `safeNormalize(hotkey): string | null` - validate + normalize via `@tanstack/hotkeys`, drop unknown keys.
- `resolveShortcuts(overrides): Record<ShortcutActionId, string[]>` - overlay over defaults.
- `findConflict(hotkey, forAction, effective): ShortcutActionId | null`.
- A React `ShortcutsProvider` (context) exposes `{ overrides, addShortcut, removeShortcut, replaceShortcut, resetShortcut }`, persisting to `browser.storage.local` and live-syncing across roots via `storage.onChanged` (same pattern as `useTheme`).

## Action registry (defaults - all rebindable)

`Mod` = Cmd(mac)/Ctrl(win/linux). Keys chosen browser-safe per C1.

### App-wide (options + popup)
| id | default | action |
| -- | ------- | ------ |
| `toggle-theme` | `Mod+Shift+L` | Toggle light/dark |
| `toggle-global` | `Mod+Shift+G` | Enable/disable all rules (global switch) |

### Options - view + workspace
| id | default | action |
| -- | ------- | ------ |
| `cycle-view` | `Mod+Shift+V` | Cycle Rules -> Cookie sync -> Shortcuts |
| `open-shortcuts` | `Mod+Shift+K` | Jump to the Shortcuts (settings) view |
| `new-item` | `Mod+Alt+N` | New rule (Rules) / new mapping (Cookie sync) |
| `delete-item` | `Mod+Backspace` | Delete active rule/node (Rules) / mapping (Cookie sync) |
| `save-rule` | `Mod+S` | Save the active rule form (Rules) |
| `sync-mapping` | `Mod+Enter` | Sync the selected cookie mapping (Cookie sync) |
| `new-folder` | `Mod+Alt+F` | New folder (Rules) |
| `duplicate-rule` | `Alt+D` | Duplicate the focused rule (Rules) |
| `rename-node` | `F2` | Rename the focused folder (Rules) |
| `close-tab` | `Alt+W` | Close the active rule tab |
| `next-tab` | `Mod+Alt+ArrowRight` | Activate next rule tab |
| `prev-tab` | `Mod+Alt+ArrowLeft` | Activate previous rule tab |
| `import-rules` | `Alt+I` | Import rules JSON |
| `export-rules` | `Alt+E` | Export rules JSON |
| `collapse-all-folders` | `Mod+Shift+[` | Collapse every folder |
| `expand-all-folders` | `Mod+Shift+]` | Expand every folder |

### Options sidebar tree - roving-focus navigation
| id | default | action |
| -- | ------- | ------ |
| `tree-nav-down` | `ArrowDown` | Focus next visible row |
| `tree-nav-up` | `ArrowUp` | Focus previous visible row |
| `tree-nav-first` | `Home` | Focus first row |
| `tree-nav-last` | `End` | Focus last row |
| `tree-expand` | `ArrowRight` | Expand folder / descend to first child |
| `tree-collapse` | `ArrowLeft` | Collapse folder / ascend to parent |
| `tree-activate` | `Enter` | Open focused rule / toggle focused folder |
| `tree-move-down` | `Alt+ArrowDown` | Reorder focused node down among siblings |
| `tree-move-up` | `Alt+ArrowUp` | Reorder focused node up among siblings |
| `tree-outdent` | `Alt+ArrowLeft` | Move focused node out to parent level |
| `tree-nest` | `Alt+ArrowRight` | Nest focused node into preceding sibling folder |
| `open-context-menu` | `Shift+F10` | Open the focused row's context menu |

### DevTools panel
| id | default | action |
| -- | ------- | ------ |
| `clear-log` | `Alt+C` | Clear the intercept log |
| `focus-filter` | `Alt+F` | Focus the URL filter input |

(Dropped vs purerequest: multi-select `tree-extend-*` - puredevtools tree is single-select; import/export-per-format, quick-open, command-palette, console/panel-resize, close-other/all - not present in puredevtools.)

## Acceptance criteria

- AC-001: A central `SHORTCUT_ACTIONS` registry is the single source of truth for every action id, name, description, and default hotkey; `ShortcutActionId` is a string-literal union covering all rows above.
- AC-002: `resolveShortcuts(overrides)` returns, per action, the default when no override exists, the normalized override list when one does, and `[]` (disabled) for an explicit empty array; invalid override entries are dropped.
- AC-003: `findConflict` reports the owning action id when a candidate hotkey (normalized) is already bound to a different action, else `null`.
- AC-004: A single `useActionHotkeys(handlers)` hook binds every provided handler to all of its effective bindings (multi-binding fires on any); a disabled action (empty list) binds nothing; only the surface's provided handlers are active.
- AC-005: Options page: every App-wide + Options-workspace action fires its real handler via its default hotkey (theme toggles, global toggles, view cycles, rule created/saved/duplicated/deleted/renamed, tabs close/switch, import/export triggered, folders collapse/expand all).
- AC-006: `new-item` / `delete-item` dispatch to the Rules handler when the Rules view is active and to the Cookie-sync handler when the Cookie-sync view is active (contextual, C4). The stale CookieSyncView fake-`Mod+S` toast is removed; `sync-mapping` (`Mod+Enter`) syncs the selected mapping for real.
- AC-007: Sidebar tree supports full roving-tabindex keyboard navigation: one row in the Tab order at a time, arrows move focus + selection, Right/Left expand/collapse or descend/ascend, Enter opens/toggles, Alt+arrows reorder/outdent/nest, Shift+F10 opens the row context menu. Focus follows the moved/navigated row after re-render.
- AC-008: Popup: `toggle-global` and `toggle-theme` fire via their default hotkeys.
- AC-009: DevTools panel: `clear-log` clears the log and `focus-filter` focuses the filter input via their default hotkeys.
- AC-010: A Shortcuts settings view (third entry in the options ViewSwitcher, reachable by a button + `open-shortcuts`) lists every action with its current bindings; each row supports Add (record a combo), Edit-in-place, Remove (× - removing the last binding disables the action), and Reset (only shown when an override exists). Escape cancels recording and can never be assigned.
- AC-011: Recording a combo that another action already uses shows an inline "<action> already uses that shortcut" alert and does not persist. A valid combo persists to `puredevtools.shortcuts` and takes effect without reload; a second options root reflects the change live (storage.onChanged).
- AC-012: macOS Option-composed combos record by physical key (`event.code`-aware `eventToHotkey`), so e.g. `Mod+Alt+N` records as `Mod+Alt+N`, not the composed glyph.
- AC-013: Defaults contain no browser-reserved combo from C1; binding a safe default and pressing it in the options tab does not trigger the browser's native behavior (`preventDefault` applied).

## Test cases

- TC-001 (happy): registry has a unique id per row; every id has non-empty name + description + a `safeNormalize`-valid default. -> AC-001, AC-013
- TC-002 (resolve default): `resolveShortcuts({})` yields each action's `[default]`. -> AC-002
- TC-003 (resolve override): override `{ 'save-rule': ['Mod+E'] }` yields `['Mod+E']` for it, defaults elsewhere. -> AC-002
- TC-004 (resolve disabled): override `{ 'save-rule': [] }` yields `[]`. -> AC-002
- TC-005 (resolve invalid): override with a garbage entry drops it. -> AC-002
- TC-006 (conflict hit): `findConflict('Mod+S', 'delete-item', effective)` returns `'save-rule'`. -> AC-003
- TC-007 (conflict miss / self): unbound combo -> `null`; same action -> `null`. -> AC-003
- TC-008 (hook fires): `useActionHotkeys({ 'toggle-theme': spy })` + dispatch `Mod+Shift+L` -> spy called. -> AC-004
- TC-009 (hook multi-binding): override adds a 2nd binding; both fire the handler. -> AC-004
- TC-010 (hook disabled): disabled action's key press -> handler NOT called. -> AC-004
- TC-011 (options save): render options, focus a rule form, press `Mod+S` -> rule persisted. -> AC-005
- TC-012 (options new-item Rules): Rules view active, `Mod+Alt+N` -> a draft/new-rule tab opens. -> AC-005, AC-006
- TC-013 (options new-item Cookies): Cookie-sync view active, `Mod+Alt+N` -> a new mapping added. -> AC-006
- TC-014 (options delete contextual): delete-item removes the active rule in Rules view and the selected mapping in Cookie-sync view. -> AC-006
- TC-015 (sync real): `Mod+Enter` in Cookie-sync view calls the gateway sync for the selected mapping and toasts the real result (no fake "Saved"). -> AC-006
- TC-016 (view cycle): `Mod+Shift+V` cycles Rules->Cookies->Shortcuts->Rules. -> AC-005
- TC-017 (tabs): open 3 rule tabs; `next-tab`/`prev-tab` move the active tab, `close-tab` closes it. -> AC-005
- TC-018 (import/export/collapse/expand): each fires its handler. -> AC-005
- TC-019 (tree nav down/up): ArrowDown/Up move focus + selection across visible rows. -> AC-007
- TC-020 (tree expand/collapse): ArrowRight expands a collapsed folder then descends; ArrowLeft collapses then ascends. -> AC-007
- TC-021 (tree activate): Enter opens a focused rule tab / toggles a focused folder. -> AC-007
- TC-022 (tree reorder): Alt+ArrowUp/Down reorder; Alt+ArrowLeft outdents; Alt+ArrowRight nests into preceding folder; impossible moves are no-ops. -> AC-007
- TC-023 (context menu key): Shift+F10 on a focused row opens its context menu. -> AC-007
- TC-024 (popup): `Mod+Shift+G` toggles global, `Mod+Shift+L` toggles theme in the popup root. -> AC-008
- TC-025 (devtools): `Alt+C` clears the log, `Alt+F` focuses the filter. -> AC-009
- TC-026 (settings list): Shortcuts view renders a row per registry action with its current binding chips. -> AC-010
- TC-027 (settings add): record a combo on an action -> new chip appears + persists. -> AC-010, AC-011
- TC-028 (settings remove-last disables): removing the only binding shows "(disabled)" and the action stops firing. -> AC-010, AC-004
- TC-029 (settings reset): Reset removes the override; default returns; Reset button hides. -> AC-010
- TC-030 (settings conflict): recording an in-use combo shows the conflict alert and does not persist. -> AC-011
- TC-031 (recorder physical key): `eventToHotkey` for a macOS Option-composed press records the physical key, not the glyph; Escape -> onCancel, modifier-only -> null. -> AC-012
- TC-032 (persistence schema): stored overrides round-trip through the zod schema; a malformed stored value falls back to `{}`. -> AC-011
- TC-033 (live sync): a change written by one root is picked up by another via storage.onChanged. -> AC-011

## UI States (Shortcuts settings view)

| State | Behavior |
| ----- | -------- |
| Default | Row shows name + current binding chip(s); Add button; Reset hidden (no override). |
| Recording | Chip/placeholder reads "Press keys…"; Cancel button; Escape aborts. |
| Conflict | Inline `role=alert` "<action> already uses that shortcut"; nothing persisted. |
| Overridden | Reset button visible; chips reflect override. |
| Disabled | No chips; "(disabled)" text; action binds nothing. |
