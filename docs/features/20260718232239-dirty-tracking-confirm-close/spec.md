# Dirty-tracking + confirm-on-close for editor tabs

Backlog: F4 (`.pzielinski/todos.md`)

## Overview

The options-page editor saves a rule only on an explicit **Save**. Today two paths silently
discard unsaved edits:

1. **Close** - clicking a tab's `x` closes it with no guard (`OptionsWorkspace` `close`).
2. **Switch** - `OptionsWorkspace` mounts only the *active* `RuleForm` with `key={activeKey}`,
   so switching tabs remounts the form and drops the previous tab's in-progress edits.

There is no dirty indicator and no confirmation. This is a data-loss footgun.

This feature brings the editor to parity with the sibling `purerequest` tool:

- Edits **survive tab switching** (no data loss on switch).
- A tab with unsaved edits shows a **dirty indicator**.
- **Closing** a dirty tab opens a **confirm dialog** (Save / Discard / Cancel) instead of
  discarding.

## Why

README (line 30) and ADR 2026-07-10 deferred tab persistence/dirty-tracking to v1+. F3 added
open-tab persistence; F4 closes the remaining gap: unsaved edits are lost on switch and on close
with no warning.

## Approach (locked with user)

- **Guard scope:** same as `purerequest`. Switching tabs never prompts *because edits are
  preserved*; only **close** prompts (when dirty). The editor's explicit **Cancel** button is an
  intentional discard - it closes without a dialog.
- **Confirm mechanism:** a **custom dialog** (no Radix; the repo has none - toast was hand-rolled
  for the same reason). Mirror `purerequest`'s split: a reusable `Dialog` primitive in
  `components/ui` + a `CloseConfirmDialog` consumer in `shared`. Styled per `docs/design.md`
  (sharp corners, `bg-popover`, 1px border, no rounded).
- **State lift:** `RuleForm`'s editable fields move into a per-tab **draft store**
  (`useRuleDrafts`), keyed by tab key. Dirty = the tab's draft differs from its baseline (the
  saved rule's editable projection, or an empty draft for a new-rule tab). `RuleForm` becomes a
  controlled view of a `RuleDraft`.

## Domain / data

- **Rule draft** - the editable projection of a `Rule`: `{ name, pattern, kind, methods,
  responseOps, rewriteBody }`. The subset of a rule the form edits; excludes `id`/`enabled`
  (preserved from the baseline on save).
- **Baseline** - the draft a tab *would* have with no edits: `ruleToDraft(savedRule)` for an
  existing rule, `emptyDraft()` for the `new:draft` tab.
- **Dirty tab** - an open tab whose current draft differs from its baseline (`!draftsEqual`).
- **Pending close** - a tab whose close is awaiting the confirm dialog's outcome.

Ephemeral form state (the URL tester input, the active Match/Response sub-tab, the inline
validation error) stays local to `RuleForm` and is NOT part of the draft - losing it on switch is
not data loss.

## Acceptance criteria

- **AC-001**: Editing a tab's fields, switching to another open tab, and switching back preserves
  the edits (no data loss on switch).
- **AC-002**: A tab whose draft differs from its saved rule shows a dirty indicator; a clean tab
  shows none. Editing a field back to its saved value clears the indicator.
- **AC-003**: Clicking a dirty tab's close control opens a confirm dialog (Save / Discard /
  Cancel) instead of closing the tab.
- **AC-004**: The dialog's **Discard** closes the tab and drops its edits (no persist).
- **AC-005**: The dialog's **Cancel** leaves the tab open with its edits intact (no persist, no
  close).
- **AC-006**: The dialog's **Save** persists the edits, then closes the tab. When the draft is
  invalid (empty or invalid URL pattern), **Save is disabled** and a hint is shown; Discard and
  Cancel stay available.
- **AC-007**: Clicking a **clean** tab's close control closes it immediately, with no dialog.
- **AC-008**: The editor's explicit **Cancel** button discards the tab's edits and closes it with
  no confirm dialog (intentional discard).
- **AC-009**: A freshly opened `new:draft` tab is not dirty until a field is edited; closing an
  untouched draft closes immediately (no dialog).
- **AC-010**: The dialog is dismissable via **Escape** and **overlay click**, each equivalent to
  Cancel (tab stays open, edits intact).

## Test cases

- **TC-001** (AC-001, happy): open rule A, change its name, switch to rule B, switch back to A ->
  A's name still shows the edited value. Maps to: AC-001.
- **TC-002** (AC-002): open rule A (clean, no dot). Change the URL pattern -> dot appears. Restore
  the pattern to the saved value -> dot disappears. Maps to: AC-002.
- **TC-003** (AC-003, AC-005): edit rule A, click A's close `x` -> dialog appears; click Cancel ->
  dialog closes, A still open, edit intact, `updateRule` not called. Maps to: AC-003, AC-005.
- **TC-004** (AC-004): edit rule A, close A, click Discard -> A tab gone, `updateRule` not called;
  reopening A shows the saved (unedited) value. Maps to: AC-004.
- **TC-005** (AC-006, happy save-close): edit rule A's pattern to a valid value, close A, click
  Save -> `updateRule` called with the edit, A tab gone. Maps to: AC-006.
- **TC-006** (AC-006, invalid): open `new:draft`, type a name but leave the pattern empty, close
  the draft -> dialog Save is disabled, hint shown; Discard closes it. Maps to: AC-006, AC-009.
- **TC-007** (AC-007): open rule A, make no edits, close A -> closes immediately, no dialog. Maps
  to: AC-007.
- **TC-008** (AC-008): edit rule A, click the editor's **Cancel** button -> A closes with no
  dialog, `updateRule` not called. Maps to: AC-008.
- **TC-009** (AC-009): New rule -> empty draft; close it immediately -> no dialog. Then New rule,
  type into Name, close -> dialog appears. Maps to: AC-009.
- **TC-010** (AC-010): edit rule A, close A, press Escape -> dialog closes, A still open, edit
  intact. Repeat, click the overlay -> same. Maps to: AC-010.
- **TC-011** (AC-001, non-active save via dialog): open A and B, edit B, switch to A (B is now the
  inactive tab), close B -> dialog for B; Save persists B's edit even though A is the mounted
  editor. Maps to: AC-001, AC-006.

## UI states

| State                  | Behavior                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| Clean tab              | Tab label, close `x`, no dirty indicator.                                         |
| Dirty tab              | Tab label + a small **square** dirty mark (`aria-label="Unsaved changes"`).       |
| Dialog closed          | No overlay; workspace fully interactive.                                          |
| Dialog open (valid)    | Dimmed overlay + centered panel; Save enabled, Discard + Cancel enabled.          |
| Dialog open (invalid)  | Same panel; Save **disabled** + a "add a URL pattern to save, or discard" hint.   |

### Wireframes

Dirty indicator in the tab strip (dirty mark is a 1.5x1.5 **square**, not a dot - `docs/design.md`
bans rounded, same reason the switch is square):

```
+---------------------------------------------------------------+
| alpha rule  #  x | bravo rule  x | new rule  #  x |  +         |
+---------------------------------------------------------------+
              ^ dirty (alpha edited)          ^ dirty (draft typed)
```

Confirm dialog - valid draft (Save enabled):

```
        +----------------------------------------------------+
        |  Unsaved changes                                   |
        |                                                    |
        |  "alpha rule" has unsaved changes.                 |
        |                                                    |
        |            [ Save ]   [ Discard ]   [ Cancel ]     |
        +----------------------------------------------------+
```

Confirm dialog - invalid draft (Save disabled, hint shown):

```
        +----------------------------------------------------+
        |  Unsaved changes                                   |
        |                                                    |
        |  New rule has unsaved changes.                     |
        |  Add a URL pattern to save, or discard.            |
        |                                                    |
        |            [ Save ]   [ Discard ]   [ Cancel ]     |
        +----------------------------------------------------+
                        ^ disabled
```

## Edge cases

- **Revert-to-clean**: editing a field back to the saved value must clear dirty (value comparison,
  not a one-way "touched" flag). `methods` compared order-insensitively (toggle order must not
  read as dirty); `responseOps` compared in order (row order is user-meaningful).
- **Untouched new draft**: `new:draft` seeded empty is not dirty; closing it is a plain close.
- **Save of an invalid draft via the dialog**: Save disabled - the only exits are Discard/Cancel.
- **Closing a non-active dirty tab**: the dialog Save must persist that tab's draft from the store
  even though a different tab is the mounted editor (persist reads the draft store, not the form).
- **Deleting a rule with an open dirty tab**: the sidebar delete already confirms ("Delete X?");
  its tab + draft are pruned silently (the rule is gone - no second confirm).
- **Save-then-close of a new draft**: the dialog Save adds the rule then closes the draft tab (it
  does NOT swap-open a tab for the new rule - the user asked to close it). This differs from the
  editor's own Save button, which keeps/swaps the tab open.

## Dependencies

- Builds on F3's `useOpenTabs` / `TabsStore` (open-tab set + persistence) - unchanged here.
- No new npm dependency (custom dialog, no Radix). No manifest/permission change.
- Prior art mirrored: `purerequest` `close-confirm-dialog.tsx` + `workspace-context/editors.ts`
  (guard logic) + `components/ui/dialog.tsx` (primitive, minus Radix).

## Out of scope (YAGNI)

- Close-all / close-others (purerequest has them; puredevtools' tab strip has only per-tab close).
- `beforeunload` guard on full-page close/reload.
- Persisting drafts across sessions (drafts are in-memory; only the open-tab *set* persists, per
  F3). Reloading the options page still discards in-progress edits - unchanged from today.
- Migrating the existing native `window.confirm` delete/import prompts to the new dialog.
