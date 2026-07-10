# Design

UI design rules for ReqHook. About *visual language and interaction*, not domain logic.
Read this before any UI change. Ported from the `requi` visual contract so the two tools
read as one product family; the token source is `src/ui/globals.css`.

## Corners

- **No rounded corners. Anywhere.** Sharp edges only. `--radius` and every `--radius-{sm,md,lg,xl}` are pinned to `0rem` in `globals.css` - never raise them.
- Do not add `rounded-full`, `rounded-xl`, or `rounded-[..]` utilities. A token-based `rounded-{sm,md,lg}` is tolerated only because it resolves to 0, but prefer stripping it.
- `rounded-full` and arbitrary `rounded-[..]` do NOT read the radius token (Tailwind hardcodes them) - they must be removed by hand. Treat any visible curve as a defect.
- The switch/toggle is **square** (no pill) - a deliberate divergence from requi's rounded switch, chosen to honor "no rounded anywhere" strictly.

## Color & tokens

- Theme via CSS tokens (`bg-background`, `bg-muted/30`, `text-foreground`, `border-border`), never hard-coded hex, so light/dark both work. Tokens are the requi set: **neutral `--primary`** (not a blue accent).
- User-selectable light / dark via the theme toggle; `.dark` class on `<html>` (managed by `useTheme`). Both modes must render legibly.
- Status colors: success green (`text-emerald-600`), error/destructive red (`text-destructive` / `text-red-600`), warning amber (`text-amber-600`).

## Density & typography

- Compact, keyboard-first, IDE-like. Rows and controls are single-line and tight (`py-1`/`py-1.5`, `text-xs`/`text-sm`).
- **Monospace (`font-mono`) for data:** URL patterns, HTTP methods, headers, identifiers, response bodies. UI chrome (labels, buttons, tab titles, section headings) uses the default sans stack.
- Muted foreground (`text-muted-foreground`) for secondary text (hints, timestamps, the URL/action subline); full foreground for primary content.

## Bars (toolbars, tab strips, sub-bars)

- **No spacing inside a bar.** A horizontal control strip has zero inter-control gap and zero outer padding. Controls sit flush, each `h-full` (or a fixed bar height with `items-stretch`), separated only by a 1px border (`border-r border-r-border`). The bar height is the control height.
- Canonical bar: `flex h-9/h-10 items-stretch border-b bg-muted/30`; a control inside it is `... border-r border-r-border` with its own horizontal padding, `hover:bg-accent`.
- Forbidden in a bar: `gap-*`, `p-*` on the bar container, floating "chip" controls with their own rounded box.

## Borders & dividers

- Dividers are 1px, `border-border`. Never thicken or colour on hover. Rows separate with a single `border-b border-b-border` (last row `last:border-b-0`), not a card border + gap.
- Don't introduce heavier borders for emphasis - use background/weight/spacing.

## Lists & rows

- A rule row is **flat**: 1px bottom divider, `hover:bg-accent/40`, no per-row card border/shadow/rounded. The enable state reads from the row's switch (and struck-through muted name when disabled).
- Empty states: a dashed-border block (`border border-dashed`, no rounded) with a short hint.

## Scrollbars

- Thin, square, semi-transparent (the requi treatment): `scrollbar-width: thin` + an 8px `::-webkit-scrollbar` with a `--foreground`-derived thumb, transparent track, square (no rounding). Defined once in `globals.css`.

## Cursors

- `globals.css` restores `cursor: pointer` for enabled interactive roles (button, `[role=tab|button|switch|checkbox|option|menuitem]`, `a[href]`, `label[for]`); disabled/`aria-disabled` fall back to the default arrow. Text inputs keep the caret.

## Surfaces

- The three surfaces (options page, popup, DevTools panel) share these rules - same tokens, sharp corners, flush bars, mono data. A restyle that leaves one surface on the old look is a defect.
