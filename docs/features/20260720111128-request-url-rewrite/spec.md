# Request URL rewrite - spec

## Overview

Add a declarative `rewriteRequestUrl` rule action: when a rule matches, redirect the outgoing request to a different URL (another domain, or `localhost`) before it is forwarded. Lives on the existing Request tab, beside request header ops + body. Reuses the single page-layer mechanism (patched `fetch`/`XHR`); no network layer reintroduced.

## Why

Users need to point matched traffic at a different backend without touching page code - the classic "map prod API to localhost" / host-redirect job (Requestly "Redirect", Charles "Map Remote"). Pre-scripts can already set `req.url` imperatively, but that is the power-user tier; a first-class declarative field is the common case and needs no JS.

## Rewrite semantics (auto-detected from the target)

Given the original absolute request URL and a user `target`:

- **Origin swap** - when `target` is origin-only (parsed `pathname === '/'`, no query, no hash): keep the original `path + query + hash`, replace only scheme/host/port. `https://api.prod.com/users/1?x=2` + `http://localhost:3000` -> `http://localhost:3000/users/1?x=2`. A trailing-slash origin (`http://localhost:3000/`) is still origin-swap.
- **Full replace** - when `target` carries an explicit non-root path: use the target literally, but **preserve the original `query`/`hash` when the target omits them**. `https://api.prod.com/users/1?x=2` + `http://localhost:3000/mock` -> `http://localhost:3000/mock?x=2`.
- Target is resolved with `new URL(target, originalUrl)`, so absolute, protocol-relative (`//host`), and root-relative (`/path`) targets all work. An empty/unparseable target leaves the URL unchanged (no-op).

## Acceptance criteria

- AC-001: `rewriteRequestUrl` action (`{ type: 'rewriteRequestUrl'; target: string }`) round-trips through `ruleSchema` and import/export; the `.strict()` schema still rejects unknown fields/types.
- AC-002: `resolveRewrite(originalUrl, target)` implements the semantics above - origin swap (keep original path/query/hash), full replace (preserve original query/hash when target omits them), and returns the original URL unchanged for empty/unparseable target.
- AC-003: `decideInterception` maps `rewriteRequestUrl` into the `override` interception as a **resolved** `requestUrl`, even when it is the only action; passthrough only when the rule carries no action at all.
- AC-004: `createPatchedFetch` forwards the request to the rewritten URL, preserving the caller's method/headers/body (including when the input is a `Request` object); the declarative URL rewrite is applied **before** any pre-script (a pre-script can further mutate `req.url`).
- AC-005: `createPatchedXhr` re-opens the delegate to the rewritten URL, re-applies the recorded request headers plus request-header `set` ops, then forwards; the response wiring is unchanged.
- AC-006: A URL-rewrite-only rule forwards to the new URL and returns the original response unchanged.
- AC-007: The RuleForm Request tab shows a "Rewrite request URL" input; edits round-trip draft <-> rule (`ruleToDraft`/`buildActions`/`draftsEqual`).
- AC-008: URL rewrite composes with request header ops, request body, and response override in one rule - URL is rewritten first, then request headers/body applied, then the response override served.

## Test Cases

- TC-001 (happy, AC-002): origin-only target -> origin swap keeps path+query+hash. Maps to: AC-002
- TC-002 (happy, AC-002): target with path -> full replace, original query/hash preserved when target omits them. Maps to: AC-002
- TC-003 (edge, AC-002): trailing-slash origin (`http://h:3000/`) -> origin swap, not full replace. Maps to: AC-002
- TC-004 (edge, AC-002): target already has its own query -> target query wins, original query dropped. Maps to: AC-002
- TC-005 (edge, AC-002): empty target -> original URL unchanged; unparseable target -> unchanged. Maps to: AC-002
- TC-006 (edge, AC-002): root-relative target (`/mock`) -> full replace on same origin. Maps to: AC-002
- TC-007 (schema, AC-001): rule with `rewriteRequestUrl` parses; unknown extra key rejected. Maps to: AC-001
- TC-008 (decide, AC-003): rewrite-only rule -> override with resolved `requestUrl`, no other ops. Maps to: AC-003
- TC-009 (fetch, AC-004/AC-006): rewrite-only fetch forwards to new URL, returns original response body/status. Maps to: AC-004, AC-006
- TC-010 (fetch, AC-004): `Request`-object input -> method + headers + body preserved after rewrite. Maps to: AC-004
- TC-011 (fetch, AC-004): rule with rewriteRequestUrl + preScript that sets `req.url` -> preScript URL wins (runs after). Maps to: AC-004
- TC-012 (xhr, AC-005/AC-006): rewrite-only XHR re-opens delegate to new URL, preserves recorded headers, returns original response. Maps to: AC-005, AC-006
- TC-013 (draft, AC-007): `ruleToDraft` reads target; `buildActions` emits action only when target non-empty; `draftsEqual` compares it. Maps to: AC-007
- TC-014 (form, AC-007): typing in the Rewrite request URL input patches the draft; value renders from draft. Maps to: AC-007
- TC-015 (compose, AC-008): rule with URL rewrite + request header set + response header set -> forwards to new URL with the header, serves the response override. Maps to: AC-008

## UI States

| State   | Behavior                                                                                     |
| ------- | -------------------------------------------------------------------------------------------- |
| Empty   | Rewrite-request-URL input blank -> no `rewriteRequestUrl` action emitted; request forwarded as-is |
| Success | Non-empty target -> action emitted; on match, request redirected per the semantics above     |
| Error   | Invalid/unparseable target is a runtime no-op (URL unchanged); no form-level validation error in v1 |

## Data model

One new `RuleAction` variant (discriminated on `type`):

- `{ type: 'rewriteRequestUrl'; target: string }`

`Interception` override extended with a flat `requestUrl?: string` holding the **already-resolved** final URL (resolution runs in `decideInterception`, so the patch layers stay dumb). New pure module `src/engine/page/rewriteUrl.ts` exports `resolveRewrite(originalUrl: string, target: string): string`.

## Edge cases

- Empty target -> `buildActions` emits no action; `resolveRewrite` returns original unchanged (defense in depth).
- Unparseable target -> `resolveRewrite` returns original (no throw).
- Origin-swap preserves original query + hash; full-replace preserves them only when target omits them.
- `Request`-object fetch input -> rewrite via `new Request(target, input)` so method/headers/body survive.
- XHR re-open after `open()` already ran resets delegate headers -> recorded request headers re-applied.
- URL-rewrite-only rule -> `override`, forwards, returns original response (fetch path does not report to the sink for request-only overrides; XHR path does - matches existing request-override behavior).
- Rewrite + preScript both present -> declarative rewrite first, preScript's `req.url` can override.

## Dependencies

None new. Pure in-repo TypeScript + React.
