# Learnings

Project-specific conventions, gotchas, and constraints worth recording so future-you (human or agent) doesn't re-derive them. Append-only. For architectural trade-offs use [adr.md](adr.md) instead.

## Entries

<!-- Format: one bullet per learning. Date prefix optional. -->

- 2026-07-10: A visually-hidden (`sr-only`) checkbox with the visible track/thumb as *sibling* spans is not clickable - a real mouse click on the visuals never reaches the input, so `onChange` never fires. Wrap the input + spans in a `<label>` so clicks forward to the input. Testing-library `fireEvent.click(input)` hits the input directly and hides this bug; test the label click (`getByLabelText(...).closest('label')`) to catch it. Affected `Switch` (global + per-rule toggles).
- 2026-07-10: You cannot override a **main-frame document navigation** (URL typed in the address bar) with a `fetch`/`XHR` page-layer patch - the top-level HTML loads before any script runs. Overriding it on Chrome needs `chrome.debugger` (yellow "being debugged" banner) with no cross-browser equivalent. Peer tools (MockExpress, Requestly page layer) don't do it either; they override `fetch`/`XHR` the page's JS makes. Test overrides by calling `fetch(url)` from the console, not by loading the URL as a page.
- 2026-07-10: `zod.object({...})` is non-strict by default - it silently strips unknown keys, so a stored/imported rule carrying a removed matcher field (e.g. `resourceTypes`) would pass validation. Use `.strict()` on `matchers` when the point is to *reject* legacy shapes at the import boundary.
