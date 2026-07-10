# Spec: Layout - Options Page Master-Detail Shell

**Version:** 0.1.0
**Created:** 2026-07-10
**Status:** Draft

## 1. Overview

Restructure the **options page** from a single centered column (where the rule editor
**replaces** the rule list) into a **master-detail workspace**: a top toolbar, a left
sidebar showing the full rule list at all times, and a right work area with a strip of
open rule tabs above the editor. Mirrors the `requi` workspace shell (dense, IDE-like).

This is a **layout-only** feature: it re-parents existing behavior into a new shape. It
adds **no** new persistence and does **not** change rule editing, matching, or storage.
Open tabs live in session memory only.

Out of scope (deferred, tracked in `.pzielinski/backlog.md`): persisting open tabs across
reloads, and dirty-tracking / confirm-on-close.

### User Story

As a developer managing intercept rules, I want the options page to keep the full rule
list visible while I edit one or more rules in tabs, so I can navigate between rules
without losing my place - instead of the editor swallowing the whole page.

### Approved layout (ASCII)

```
+-----------------------------------------------------------------------+
| + Rule | Import | Export |                        | theme | ON/OFF   |   <- top bar
+---------------------+-------------------------------------------------+
|                     | api mock  x | block ads  x | cors x |          |   <- tab strip
| [•] api mock        +-------------------------------------------------+
| [•] block ads   ◀── | Match                                          |
| [ ] cors header     |   GET  *.doubleclick.net/*                      |
| [•] redirect cdn    | Request actions                                |
|                     |   block ✓                                      |   <- editor
|                     | Response actions                               |
|                     | Mock response                                  |
|  (sidebar: full     |                                                |
|   rule list, all    |                     [ Save ]  [ Cancel ]        |
|   controls)         |                                                |
+---------------------+-------------------------------------------------+
```

Empty right area (no tabs open):

```
+---------------------+-------------------------------------------------+
| [•] api mock        |                                                 |
| [•] block ads       |              Select a rule to edit              |
| [ ] cors header     |                 [ + New rule ]                  |
+---------------------+-------------------------------------------------+
```

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | The options page renders a full-height master-detail shell: a top toolbar (Add rule, Import, Export, theme toggle, global on/off), a left sidebar, and a right work area | Must |
| AC-002 | The sidebar shows the complete rule list at all times - it is no longer replaced when a rule is being edited | Must |
| AC-003 | Opening a rule from the sidebar shows it in the right work area as an open tab and makes that tab active | Must |
| AC-004 | The right work area shows a tab strip of currently-open rules; clicking a tab makes that rule's editor active | Must |
| AC-005 | "Add rule" opens a new empty-draft editor as an active tab | Must |
| AC-006 | Opening a rule that is already open activates its existing tab instead of creating a duplicate | Must |
| AC-007 | Each open tab has a close control; closing the active tab activates an adjacent tab, closing a non-active tab leaves the active tab unchanged | Must |
| AC-008 | When no tabs are open, the right work area shows an empty-state hint plus a "New rule" action | Must |
| AC-009 | Saving or cancelling in an open editor closes that tab | Must |
| AC-010 | Deleting a rule that is currently open closes its tab (you cannot keep editing a deleted rule) | Must |
| AC-011 | Open tabs and the active tab are session-only; a reload starts with no tabs open (no persistence) | Must |
| AC-012 | Existing sidebar rule operations still work: enable toggle, reorder, duplicate, delete, and name/URL filter | Must |

## 3. User Test Cases

### TC-001 (happy path): Open two rules, switch between them
**Precondition:** Options page with >=2 rules, no tabs open.
**Steps:** Click rule A in sidebar; click rule B in sidebar; click rule A's tab.
**Expected:** Two tabs open (A, B); after clicking A's tab, A's editor is shown and A's tab is active. Sidebar still lists all rules.
**Maps to:** AC-002, AC-003, AC-004.

### TC-002 (dedupe): Re-open an already-open rule
**Precondition:** Rule A already open + active.
**Steps:** Click rule A in the sidebar again.
**Expected:** Still one tab for A (no duplicate); A stays active.
**Maps to:** AC-006.

### TC-003 (draft): Add rule
**Precondition:** No tabs open.
**Steps:** Click "Add rule".
**Expected:** A draft tab opens active with an empty editor (no name/URL prefilled).
**Maps to:** AC-005.

### TC-004 (close active): Close the active tab
**Precondition:** Tabs [A, B, C] open, B active.
**Steps:** Close B.
**Expected:** Tabs [A, C] remain; an adjacent tab (A or C) becomes active.
**Maps to:** AC-007.

### TC-005 (empty state): Close the last tab
**Precondition:** One tab open.
**Steps:** Close it.
**Expected:** Right area shows "Select a rule to edit" + "New rule" button.
**Maps to:** AC-008.

### TC-006 (save closes tab): Save an edit
**Precondition:** Rule A open + active, edited.
**Steps:** Click Save.
**Expected:** Rule persisted (gateway.update called); A's tab closes.
**Maps to:** AC-009.

### TC-007 (delete prunes tab): Delete an open rule
**Precondition:** Rules A, B open; both tabs present.
**Steps:** Delete rule A from the sidebar (confirm).
**Expected:** A removed from the list; A's tab closes; B's tab stays. If A was active, B becomes active.
**Maps to:** AC-010.

### TC-008 (no persistence): Reload
**Precondition:** Tabs open.
**Steps:** Remount the page (fresh render).
**Expected:** No tabs open; empty state shown.
**Maps to:** AC-011.

## 4. UI States

| State | Behavior |
| ----- | -------- |
| Loading | "Loading rules…" (unchanged from today) while the gateway resolves. |
| Empty (no rules) | Sidebar shows the existing "No rules yet" empty state; right area shows the "Select a rule" hint; Add rule still opens a draft. |
| Error | The existing "Failed to load rules" alert (unchanged). |
| No tabs open | Right area shows "Select a rule to edit" + "New rule". |
| Editing | Right area shows the tab strip + the active rule's `RuleForm`. |

## 5. Data Model

No domain/storage model change. One new **presentation-only** structure:

- `OpenTabsState` = `{ openKeys: string[]; activeKey: string | null }`, where a tab key is
  a rule id, or the sentinel `"new:draft"` for the single unsaved-draft tab. Held in React
  state only; never persisted.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | Add rule while a draft tab is already open | Re-activates the existing draft tab; no second draft. |
| E-2 | Delete the active open rule | Its tab is pruned; an adjacent tab becomes active (or empty state if none left). |
| E-3 | Reorder/duplicate/filter while tabs are open | Sidebar operations work unchanged; open tabs are unaffected (a filtered-out rule keeps its tab). |
| E-4 | Many tabs exceed the strip width | Tab strip scrolls horizontally; no wrap. |
| E-5 | Rename a rule (via Save) that is open in a tab | After save the tab closes (AC-009), so no stale label question arises. |
| E-6 | 0 rules | Sidebar empty state + right empty hint coexist; Add rule opens a draft. |

## 7. Dependencies

Reuses existing `RulesProvider`/`useRules`, `RuleList`, `RuleForm`, `GlobalSwitch`,
`ThemeSwitch`, `ImportExport`, and the `ui/*` primitives. No new libraries.

## 8. Out of Scope

See `.pzielinski/backlog.md` - persisting open tabs across reloads, and dirty-tracking /
confirm-on-close. Also out: any change to the popup or the DevTools panel.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-10 | Initial draft from the approved brainstorm |
