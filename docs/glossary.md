# Glossary

Ubiquitous language for puredevtools. One concept = one word; rejected synonyms listed as `_Avoid_`. Domain terms only - not general programming concepts. Definitions say what a thing IS, not how it's implemented.

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
Replacing the response headers and/or body a page receives, after forwarding the real request. The only tampering puredevtools does; the original status is preserved.
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

### Rule draft
The editable projection of a rule the options-page editor works on: the field subset the form mutates (`name`, `pattern`, `kind`, `methods`, response header ops, rewrite body), excluding `id`/`enabled`. Lives per open tab, in memory only; becomes a `Rule` on save.
_Avoid_: form state, edit buffer, working copy

### Dirty tab
An open editor tab whose current rule draft differs (by value) from its baseline - the saved rule's projection, or the empty draft for a new-rule tab. Reverting a field to its saved value makes the tab clean again.
_Avoid_: unsaved tab, modified tab, touched tab

### Script
User-authored JavaScript a rule runs against the request or response, as the imperative counterpart to the declarative header/body ops. Runs in the page's own JS realm; sees a scoped `req`/`res`/`console` facade only.
_Avoid_: hook, handler, callback, plugin, macro

### Pre-script
The `Script` that runs after the declarative request ops and before the request is forwarded; it mutates the outgoing request (url, method, headers, body) via `req`.
_Avoid_: pre-request hook, request interceptor, before-send

### Post-script
The `Script` that runs after the declarative response override and before the page's callback sees the response; it mutates the returned response (headers, body) via `res`, but not the status.
_Avoid_: post-response hook, response interceptor, after-receive

### Request URL rewrite
A request-side rule action that redirects a matched request to a different URL before it is forwarded (e.g. prod API -> localhost). An origin-only target swaps scheme/host/port and keeps the original path/query/hash; a target with a path replaces the URL, preserving the original query/hash the target omits. The declarative counterpart to setting `req.url` in a pre-script.
_Avoid_: redirect (reserve for HTTP 3xx), proxy, map remote, host override
