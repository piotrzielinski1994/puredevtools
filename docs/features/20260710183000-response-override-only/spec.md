# Response override only (cross-browser)

## Overview

Strip ReqHook down to a single, browser-agnostic capability: **match a request, forward it,
and override the response headers and/or body the page receives**. Everything that diverges
between Chrome and Firefox, or that isn't response-override, is removed.

The trigger: the current UI shows "Rewrite response body - Disabled - Firefox-only" and carries
request actions, mocking, status override, latency, and resource-type/header matchers. All of
that is either engine-specific, misleading, or out of scope. The user wants one thing that works
identically on both browsers.

## Why

- The network layer (`declarativeNetRequest` on Chrome, `webRequest` + `filterResponseData` on
  Firefox) is the source of every cross-browser asymmetry: no body rewrite on Chrome, no custom
  mock status/headers on Chrome, latency Firefox-only. Removing it removes the asymmetry.
- The **page layer** (patched `window.fetch` + `XMLHttpRequest`) already forwards the real request
  and can rewrite the response the page sees, on both browsers. It becomes the sole mechanism.
- Result: no `capabilities`, no `unsupported` diagnostics, no "Firefox-only" disabled controls.
  A rule does the same thing everywhere.

## Scope

A **rule** matches on **URL (glob/regex) + HTTP methods** and applies **response overrides**:

1. **Modify response headers** - ordered `set`/`remove` operations on the forwarded response's
   headers.
2. **Rewrite response body** - replace the forwarded response's body (optional `content-type`).

Both are delivered by the page layer: the real request is issued (forwarded), and the response
handed to the page is rewritten before the page's `fetch`/XHR callback sees it. The original
status is preserved.

### Explicitly removed

- **Request actions**: `modifyRequestHeaders`, `redirect`, `block`.
- **Mock** (canned response without forwarding) and everything it carried (mock status, mock
  headers, latency).
- **`setStatus`** (response status override).
- **Matchers**: `resourceTypes`, `requestHeaders`.
- **Whole network layer**: `RequestEngine`, `ChromeEngine`, `FirefoxEngine`, `selectEngine`,
  `translateToDnr`, `dnrTypes`, `dataUrl`, Firefox `handlers`/`filter`/`types`.
- **`Capabilities`** and **`ApplyDiagnostics`** and their message/UI plumbing
  (`getCapabilities`, `getDiagnostics`, `capabilityWarnings`, capability-gated controls).
- Manifest permissions: `declarativeNetRequest`, `declarativeNetRequestWithHostAccess`,
  `webRequest`, `webRequestBlocking`, `webRequestFilterResponse`.

### Deliberately out of scope (documented limitation)

- **Main-frame document navigation** (typing a URL in the address bar) is NOT overridden. The
  page layer patches `fetch`/`XHR` only; the top-level HTML document loads before any script
  runs. This matches peer tools (MockExpress etc.) and stays in README limitations.
- Non-`fetch`/non-XHR resource loads (images, scripts, stylesheets as raw tags) are not overridden.

## Data model

```
PatternKind = 'glob' | 'regex'
HttpMethod  = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

HeaderOp
  | { op: 'set'; name: string; value: string }
  | { op: 'remove'; name: string }

Matchers = {
  url: { pattern: string; kind: PatternKind }
  methods?: HttpMethod[]
}

RuleAction
  | { type: 'modifyResponseHeaders'; headers: HeaderOp[] }
  | { type: 'rewriteBody'; body: string; contentType?: string }

Rule = {
  id: string
  name: string
  enabled: boolean
  priority: number
  matchers: Matchers
  actions: RuleAction[]
}
```

`RequestDescriptor` loses `resourceType` and `requestHeaders` (matchers no longer use them).
Page-layer `Interception` becomes:

```
Interception
  | { kind: 'passthrough' }
  | { kind: 'override'; headerOps: HeaderOp[]; body?: string; contentType?: string }
```

An `override` is produced when a matching enabled rule carries `modifyResponseHeaders` and/or
`rewriteBody`. The page layer forwards the real request, then:
- applies `headerOps` to the response headers (`set`/`remove`), and
- if `body` is present, replaces the response body (and sets `content-type` when `contentType`
  given).

`InterceptReport.kind` collapses to a single value `'rewrite'` (mock kind removed).

## Acceptance criteria

- **AC-001**: A rule schema/model accepts only `matchers: { url, methods? }` and actions
  `modifyResponseHeaders` | `rewriteBody`. Parsing a rule with any removed action type
  (`mock`, `block`, `redirect`, `modifyRequestHeaders`, `setStatus`) or removed matcher
  (`resourceTypes`, `requestHeaders`) fails schema validation.
- **AC-002**: Page-layer `fetch` interception, for a matching rule with `rewriteBody`, forwards
  the real request and returns a Response whose body is the rule's body and whose status equals
  the original response status.
- **AC-003**: Page-layer `fetch` interception, for a matching rule with `modifyResponseHeaders`,
  forwards the real request and returns a Response whose headers reflect the `set`/`remove`
  operations applied to the original headers.
- **AC-004**: Page-layer `fetch` interception applies both `modifyResponseHeaders` and
  `rewriteBody` together when a rule carries both.
- **AC-005**: Page-layer XHR interception forwards the real request and rewrites `responseText`,
  `response`, and response headers per the rule before firing `onload`/`onreadystatechange`.
- **AC-006**: A request that matches no enabled rule (or when globally disabled) passes through
  untouched on both `fetch` and XHR.
- **AC-007**: The rule form shows only Match (name, URL, kind, test-URL, methods) and Response
  (modify response headers, rewrite response body). The body-rewrite control is always enabled -
  no "Firefox-only"/disabled state, no capability warning banner.
- **AC-008**: The extension builds for both `chrome` and `firefox` targets, and the emitted
  manifests contain only the `storage` permission (no DNR/webRequest permissions).
- **AC-009**: The DevTools panel logs an overridden request with kind `rewrite`; the whole page
  layer -> bridge -> background relay -> panel path still delivers the report.
- **AC-010**: Import/export round-trips a valid response-override rule through the schema; a
  portable file containing a removed action type fails import.

## User test cases

- **TC-001** (happy, body): Rule URL glob `https://api.test/*`, action rewrite body
  `{"mocked":true}`. On any page run `fetch('https://api.test/x').then(r=>r.json())` ->
  resolves `{mocked:true}`, real request was issued, status is the real status. Maps: AC-002.
- **TC-002** (happy, headers): Rule with `set X-Test: on` and `remove Set-Cookie`. Fetch a
  matching URL -> `response.headers.get('X-Test') === 'on'`, `Set-Cookie` absent. Maps: AC-003.
- **TC-003** (both): Rule with header set + body rewrite -> response has both applied. Maps: AC-004.
- **TC-004** (XHR): Same as TC-001 but via `XMLHttpRequest` -> `xhr.responseText` is the rewritten
  body; `xhr.getResponseHeader` reflects header ops. Maps: AC-005.
- **TC-005** (method filter): Rule methods `['POST']`; a GET to the URL is untouched, a POST is
  overridden. Maps: AC-006, AC-001.
- **TC-006** (passthrough): No rule matches -> original response reaches the page unchanged.
  Maps: AC-006.
- **TC-007** (schema reject): Import a file with a `mock` action -> import fails, existing rules
  unchanged. Maps: AC-010, AC-001.
- **TC-008** (build): `npm run build:chrome` and `build:firefox` succeed; grep emitted manifest ->
  permissions == `["storage"]`. Maps: AC-008.

## Edge cases

- Rule with an empty `headers` array and empty `body`: no-op override (forward, return original).
  Treated as passthrough-equivalent; must not throw.
- `remove` op for a header not present: no error.
- `set` `content-type` via header op vs `rewriteBody.contentType`: `rewriteBody.contentType`
  wins for the body's content-type when body is rewritten; otherwise header ops apply verbatim.
  (Keep deterministic: apply header ops first, then if body rewritten and `contentType` given,
  overwrite `content-type`.)
- Non-string XHR/fetch request body: forwarded as-is (we only rewrite the response).
- XHR consumer using `addEventListener('load')` instead of `onload`: unchanged v1 limitation
  (documented) - still only `onload`/`onreadystatechange` are driven.
- Global disable: page layer forwards everything untouched.
- Regex URL that is invalid: rule fails validation in the form (existing behavior kept).

## Dependencies

None new. Removes reliance on `declarativeNetRequest`/`webRequest`. No new libraries.

## Rollout / data migration

`RuleRepository.getAll` reads raw stored objects and casts them - it does NOT run the schema.
So stored rules from the old model are loaded verbatim; any removed action type
(`mock`/`block`/`redirect`/`modifyRequestHeaders`/`setStatus`) is simply ignored by the new page
layer (`decideInterception` only recognises `modifyResponseHeaders`/`rewriteBody`, everything else
-> passthrough). No crash, no migration needed. The schema still rejects removed types at the
import boundary (AC-010, matchers schema is `.strict()`). No automatic migration of old data.

## AC traceability (post-verification)

| AC | Proving test(s) |
| -- | --------------- |
| AC-001 | `schema` via `portable.test.ts` "should reject a portable file carrying a removed action type such as mock" / "removed matcher such as resourceTypes"; `decide.test.ts` "should not match when the method filter excludes the request method" |
| AC-002 | `patchFetch.test.ts` "should forward the real request once and replace the body while preserving the original status" |
| AC-003 | `patchFetch.test.ts` "should forward and apply set/remove header ops onto the original response headers" |
| AC-004 | `patchFetch.test.ts` "should apply both header ops and body rewrite when a rule carries both"; `decide.test.ts` "should combine header ops and body" |
| AC-005 | `patchXhr.test.ts` "should forward the real request and rewrite responseText/response..." + "should forward and apply set/remove header ops onto the real response headers" |
| AC-006 | `patchFetch.test.ts`/`patchXhr.test.ts` passthrough blocks (no match / global disabled); `decide.test.ts` passthrough cases |
| AC-007 | `RuleForm.test.tsx` "should render the essential create-form fields" / "...body-rewrite control enabled with no Firefox-only note" / "should NOT render removed request-action, mock, status or resource-type controls" |
| AC-008 | `manifest/index.test.ts` "should request only the storage permission on both engines"; emitted `dist/*/manifest.json` grep == `["storage"]` |
| AC-009 | `patchFetch.test.ts` "should report a served override once with kind rewrite..."; `patchXhr.test.ts` "should report a served override..."; `reportLog.test.ts`/`relay.test.ts` |
| AC-010 | `portable.test.ts` removed-action/removed-matcher rejection tests + round-trip test |

## Process note

This feature is a **reduction** (net -3462 lines, ~40 files touched/deleted). Because the whole
test tree stops compiling mid-deletion, a blind test-writer subagent could not run a clean suite
to prove RED. Instead the co-located tests were rewritten to the new spec by the implementer and
mechanical-fixture subagents, and the **fresh Phase-4 verifier** (no implementation context) is
the anti-bias gate. Page-layer units were driven red->green individually during implementation.
