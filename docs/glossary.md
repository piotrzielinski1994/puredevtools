# Glossary

Ubiquitous language for ReqHook. One concept = one word; rejected synonyms listed as `_Avoid_`. Domain terms only - not general programming concepts. Definitions say what a thing IS, not how it's implemented.

`pz-implement` and normal sessions append here as terms get sharpened.

## Terms

<!-- Format:
### Term
One-or-two-sentence definition (what it IS).
_Avoid_: alias1, alias2
-->

### Rule
A user-defined, serializable declaration that some traffic matching a condition should be modified. The unit the UI edits and the engine applies.
_Avoid_: filter, hook, config entry, modifier

### Interception
Catching a `fetch`/`XHR` response in flight so it can be changed before the page's callback sees it. The real request is always forwarded first.
_Avoid_: capture (reserve for read-only observation), proxying

### Response override
Replacing the response headers and/or body a page receives, after forwarding the real request. The only tampering ReqHook does; the original status is preserved.
_Avoid_: mock, stub, tamper (rewrite = the body-only sub-action of an override)

### Workspace
The ordered tree of nodes that holds all rules - the single source of truth the UI edits and storage persists. A mix of folders and loose rules at the root, nested arbitrarily deep.
_Avoid_: rule list, ruleset, collection (reserve "list" for the flattened form)

### Tree node
One entry in the workspace: either a Folder node or a Rule node (discriminated on `kind`).
_Avoid_: item, entry, element

### Folder
A named, collapsible tree node that groups other tree nodes (rules and subfolders). Organizational only - it carries no matching or override behavior of its own.
_Avoid_: group, directory, category, bucket

### Flatten
Producing the ordered `Rule[]` the engine matches against by walking the workspace depth-first, pre-order. A folder contributes its rules in its own slot, recursively; collapsed state does not affect the result. Flatten order = match precedence (first enabled match wins).
_Avoid_: serialize, resolve, expand
