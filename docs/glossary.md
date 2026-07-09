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
Catching a request or response in flight so it can be inspected or changed before it reaches its destination (server or page).
_Avoid_: capture (reserve for read-only observation), proxying

### Tamper
Editing an intercepted request or response - its method, URL, headers, or body - before it continues.
_Avoid_: mutate, patch, override (override = stub)

### Stub
Short-circuiting a request with a canned response so the real network call never happens.
_Avoid_: mock, fake, override
