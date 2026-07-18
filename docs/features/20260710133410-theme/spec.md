# Spec: Theme - requi Visual Language

**Version:** 0.1.0
**Created:** 2026-07-10
**Status:** Draft

## 1. Overview

Make puredevtools's UI look **exactly like `requi`**: same color tokens, zero rounded corners
everywhere, thin square scrollbars, restored pointer cursors, and an IDE-like dense layout
(flush bars, full-height bar buttons, monospace for data, status dots instead of card
chrome). Applies to **all three surfaces** - options page, popup, and DevTools panel.

Two layers of change:
- **Global (theme tokens + base CSS):** copy `requi`'s `index.css` into `src/ui/globals.css`
  - neutral `--primary` (not the current blue), `--radius: 0`, thin scrollbars, cursor
  rules, `height:100%`, `tw-animate-css`. Automatically re-skins every surface.
- **Per-component (density + sharp corners):** strip every `rounded-*`, rebuild toolbars as
  flush bars (no gap/padding, 1px dividers, `h-full` controls), use `font-mono` for
  URLs/methods/identifiers, and replace the enable-switch row card look with requi's flat
  rows + status dots.

### Reference

`requi`'s visual contract lives in `~/projects/private/requi/docs/design.md` and
`~/projects/private/requi/src/index.css`. This feature ports that contract; a local
`docs/design.md` is created so future puredevtools UI work follows it.

### User Story

As a user of both tools, I want puredevtools to share requi's exact visual language, so the two
feel like one product family instead of two unrelated extensions.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | `src/ui/globals.css` carries requi's token set: `:root` + `.dark` with neutral `--primary` (`oklch(0.205 0 0)` light / `oklch(0.922 0 0)` dark), and `--radius: 0rem` | Must |
| AC-002 | The `@theme inline` block pins `--radius-{sm,md,lg,xl}: 0rem` so every token-based `rounded-*` resolves to a square corner | Must |
| AC-003 | No `rounded-*` utility that produces a visible curve remains in `src/ui/**` - `rounded`, `rounded-sm/md/lg/xl/full`, `rounded-[..]` are stripped or replaced (token-based `rounded-{sm,md,lg}` tolerated only because they now resolve to 0) | Must |
| AC-004 | The switch/toggle renders **square** (no `rounded-full` on track or thumb) | Must |
| AC-005 | Global base CSS matches requi: thin square scrollbars (`scrollbar-width: thin` + `::-webkit-scrollbar` 8px), pointer-cursor restore for enabled interactive roles, `html/body/#root { height:100% }` | Must |
| AC-006 | `tw-animate-css` is a dependency and imported in `globals.css` (parity with requi) | Must |
| AC-007 | The `ui/*` primitives (button, input, select, textarea, card, accordion, switch, checkbox) match requi's variants/shape (sharp corners, requi button size/variant set) | Must |
| AC-008 | Options page toolbar + tab strip read as flush bars: no inter-control gap or bar padding, controls divided by 1px borders, bar height = control height | Must |
| AC-009 | Data (URL patterns, HTTP methods, identifiers) render in `font-mono`; UI chrome stays sans | Must |
| AC-010 | Rule rows use requi's flat treatment: a `size-2` status dot for enabled/disabled, no per-row card border/shadow/rounded | Must |
| AC-011 | Popup and DevTools panel inherit the same tokens + density (flush bars, mono data, sharp corners) - no surface left on the old blue/rounded look | Must |
| AC-012 | `docs/design.md` records the ported visual contract (corners, scrollbars, density, mono, status dots) | Must |
| AC-013 | Dark and light modes both render correctly under the new tokens (the existing theme toggle still flips them) | Must |

## 3. User Test Cases

### TC-001 (visual regression, options): sharp + neutral
**Precondition:** Options page loaded with a few rules, light mode.
**Steps:** Inspect the toolbar, sidebar rows, and an open rule editor.
**Expected:** No rounded corners anywhere; primary accent is neutral (not blue); toolbar controls sit flush divided by 1px lines; URLs/methods are monospace; rule rows show a square status dot, no card chrome.
**Maps to:** AC-001, AC-003, AC-008, AC-009, AC-010.

### TC-002 (switch shape): square toggle
**Precondition:** Any surface with a switch (global on/off).
**Steps:** Look at the toggle.
**Expected:** Rectangular track + rectangular thumb, no pill.
**Maps to:** AC-004.

### TC-003 (dark mode): token parity
**Precondition:** Toggle to dark mode.
**Steps:** Inspect all three surfaces.
**Expected:** requi's dark tokens applied (near-black background, light neutral primary); sharp corners hold; both modes legible.
**Maps to:** AC-013, AC-011.

### TC-004 (panel + popup): no surface left behind
**Precondition:** Open the popup and the DevTools panel.
**Steps:** Compare against the options page look.
**Expected:** Same tokens, sharp corners, mono data, flush bars - visually one family.
**Maps to:** AC-011.

## 4. UI States

No new states. This feature restyles existing loading/empty/error/success/editing states;
each must still render (assert existing tests stay green) and now use the requi look.

## 5. Data Model

None. Pure presentation. `--primary` moving from blue to neutral is a token change, not a
data change.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | `rounded-full` (switch, panel badge) | Tailwind hardcodes `rounded-full` to 9999px - the radius token does NOT zero it; must be removed explicitly (AC-004). |
| E-2 | A `rounded-[..]` arbitrary value | Not token-based; must be stripped by hand (AC-003). |
| E-3 | Existing tests asserting classNames / structure | Restyle must keep the roles/labels/text tests query; adjust only if a test asserts a specific rounded class (none found in the current suite). |
| E-4 | Popup fixed width (`w-90`) under new density | Keep the popup usable; density change must not overflow the popup viewport. |
| E-5 | DevTools panel `Type` badge uses `rounded` + `bg-primary/10` | Square it; keep the tone. |

## 7. Dependencies

Adds `tw-animate-css` (dev/style dep, parity with requi). Reuses all existing components +
`webextension-polyfill` theme persistence (`useTheme`). No functional libraries added.

## 8. Out of Scope

- No new theming behavior (custom user colors, more modes) - only light/dark as today.
- No layout/behavior change beyond visual density (the master-detail structure from the
  layout feature stays; this only restyles it).
- CodeMirror / editor theming (requi has it; puredevtools has no code editor yet).

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-10 | Initial draft - port requi visual language to all 3 surfaces |
