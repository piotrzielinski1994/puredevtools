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
