# Plan: Response override only (cross-browser)

## Approach

Delete the entire network layer and its cross-browser plumbing; make the **page layer** the sole
interception mechanism. A rule forwards the real request and overrides the response headers/body
the page sees. Same behavior on Chrome and Firefox. No capabilities, no diagnostics, no mock.

TDD throughout: RED (fresh test-writer subagent from spec) -> GREEN -> REFACTOR -> fresh verifier.

## Task breakdown (execution order)

### 1. Data model + schema (AC-001, AC-010)
- `src/rules/model.ts`: `Matchers` = `{ url, methods? }`. `RuleAction` = `modifyResponseHeaders |
  rewriteBody`. Delete `RequestAction`, `MockAction`, `ResponseAction` (`setStatus` gone),
  `ResourceType`, `HeaderMatcher`. `RequestDescriptor` = `{ url, method }`.
- `src/rules/schema.ts`: mirror model. Drop `resourceType`, `headerMatcher`, `requestAction`,
  `mockAction`, `setStatus`, request-header matchers. `ruleAction` union = the two response
  actions. Keep `portableSchema` + duplicate-id refine.

### 2. Matching (AC-006, TC-005)
- `src/rules/match.ts`: drop `matchesResourceType`, `matchesHeaders`, `HeaderMatcher` import.
  Keep URL + methods. `matchesRequest(rule, { url, method })`.

### 3. Page-layer decide + types (AC-002..006)
- `src/engine/page/types.ts`: `Interception = { kind:'passthrough' } | { kind:'override';
  headerOps: HeaderOp[]; body?: string; contentType?: string }`. `InterceptReport.kind = 'rewrite'`
  (single literal). Drop `latencyMs`, mock.
- `src/engine/page/decide.ts`: build `override` from a matched rule's `modifyResponseHeaders`
  (headerOps) + `rewriteBody` (body/contentType). No match / disabled / neither action ->
  passthrough.

### 4. Page-layer fetch (AC-002, AC-003, AC-004, AC-006)
- `src/engine/page/patchFetch.ts`: remove `serveMock`. Single path: on `override`, `await
  originalFetch`, then build a new `Response` with the original status/statusText, headers =
  original headers with `headerOps` applied (`set`/`remove`), body = `override.body ?? original
  body`; when body rewritten and `contentType` given, set `content-type` last. Passthrough
  otherwise. Sink report kind `'rewrite'` with final status/body. Drop `RESOURCE_TYPE`,
  `delay`/latency.

### 5. Page-layer XHR (AC-005, TC-004)
- `src/engine/page/patchXhr.ts`: always create the delegate and forward (no mock branch). On
  `DONE`, if `override`, rewrite `responseText`/`response` from `override.body` (fallback to real),
  and expose overridden headers via `getResponseHeader`/`getAllResponseHeaders` (apply headerOps
  to the delegate's real headers). Fire `onreadystatechange`/`onload`. Drop `delay`, mockHeaders
  branch that skipped the network call.

### 6. page-main wiring
- `src/content/page-main.ts`: drop `delay`. Sink label always `rewrote`. Report `kind:'rewrite'`.

### 7. Delete network layer + engine abstraction (AC-008)
- Delete dirs/files: `src/engine/RequestEngine.ts`, `src/engine/chrome/*`,
  `src/engine/firefox/*`, `src/background/controller.ts`, `src/background/controller.test.ts`,
  `src/background/selectEngine.ts`, `src/background/selectEngine.test.ts`.
- `src/background/index.ts`: keep only the report relay + panel connect/disconnect wiring. Remove
  engine construction, `selectEngine`, controller, `getCapabilities`/`getDiagnostics`/`reapply`
  message handling, `onStartup`/`onInstalled` reapply.

### 8. Messages + shared (AC-008)
- `src/shared/messages.ts`: remove capabilities/diagnostics/reapply. If no runtime messages remain
  besides the report envelope, keep the report path only and delete `Message`/`MessageResponse`
  (adjust importers).

### 9. Manifest (AC-008, TC-008)
- `src/manifest/index.ts`: `chrome.permissions = ['storage']`, `firefox.permissions = ['storage']`.
  Remove DNR/webRequest permissions. Keep content scripts, devtools, options, popup.

### 10. Gateway (AC-007)
- `src/ui/shared/gateway.ts`: drop `getCapabilities`/`getDiagnostics` from `UiGateway`.
- `src/ui/shared/createGateway.ts`: remove those two methods + `DISABLED_CAPABILITIES` + message
  imports.
- `src/ui/shared/RulesProvider.tsx`: remove `capabilities`/`diagnostics` state, `getCapabilities`/
  `getDiagnostics` calls; context value loses them.

### 11. RuleForm (AC-007, TC-005)
- `src/ui/shared/RuleForm.tsx`: Match section = name, URL, kind, test-URL, **methods only**
  (drop resource types + header-matcher editor). Response section = Modify response headers +
  Rewrite response body (**always enabled**, no disabled/Firefox-only note). Delete Request-actions
  and Mock-response accordions, `capabilityWarnings` + its export/warning banner, all mock/status/
  block/redirect/request-op state. `buildActions` emits only the two response actions.
- Delete `src/ui/shared/capabilityWarnings.test.ts`.

### 12. Remaining UI + DevTools
- `src/ui/shared/OptionsWorkspace.tsx`: remove diagnostics banner + capability usage.
- `src/ui/devtools/InterceptTable.tsx`: `kind` badge now always `rewrite`; drop mock-specific
  copy. `actionSummary` in RuleList: reflect the two action types only.
- `src/ui/shared/RuleList.tsx`: `actionSummary` -> `rewrite`/`headers` labels.

### 13. Tests updated/added by test-writer
- Update every test referencing removed types/actions. New/kept tests map to ACs (see spec TCs).

### 14. Docs
- `README.md`: rewrite architecture (page layer only), collapse "Platform limitations" to the
  main-frame/document caveat + fetch/XHR-only. Remove DNR/webRequest/mock/latency copy.
- `CLAUDE.md`: update the cross-browser section (engine abstraction removed; page layer is the
  single mechanism).
- `docs/adr.md`: append ADR (see below).
- `docs/glossary.md`: add "response override" if not present; retire "mock" if defined.
- Flip `.pzielinski/todos.md` / update `.pzielinski/backlog.md` as needed.

## Key decisions

- **Remove network layer entirely** rather than keep it for real-response header edits. User
  directive: "jedno podejscie, jedno rozwiazanie". Page layer forwards + overrides on both
  browsers; the network layer only added asymmetry.
- **Forward, don't mock.** User: "po co wysylac request do serwera, skoro bede je podmienial" ->
  resolved to: always forward the real request, then override. No canned/no-forward mode.
- **Status preserved, not overridden.** `setStatus` removed; the page sees the real status.

## Edge cases (from spec)
- Empty header ops + empty body -> forward + return original (no throw).
- `remove` of absent header -> no-op.
- `contentType` precedence: header ops first, then body's `contentType` overwrites `content-type`.
- Global disable -> forward everything.
- Invalid regex -> form validation (kept).

## Domain-modeling gate
- Evaluated `pz-ddd` and `pz-archetypes`. **Neither applies** - this is a tooling/plumbing
  reduction (delete engines, shrink schema, adjust UI), no domain aggregates, no recurring domain
  shape. Recorded in task Decision Log.

## ADR (to append)
> **Single-mechanism response override (page layer only).** Context: the network-layer engines
> (`declarativeNetRequest`/`webRequest`+`filterResponseData`) were the sole source of Chrome/Firefox
> asymmetry (no Chrome body rewrite, no custom mock status/headers, Firefox-only latency).
> Decision: delete the network layer and the `RequestEngine` abstraction; the page layer (patched
> `fetch`/`XHR`) forwards the real request and overrides response headers/body on both browsers.
> Why: identical behavior everywhere, far less code, no capability/diagnostic plumbing. Cost:
> main-frame document navigation can no longer be intercepted (documented limitation), matching
> peer tools.

## Risks
- **Broad blast radius (~40 files):** mitigate with TDD + full-suite verifier gate before done.
- **XHR forward+override regression:** the old XHR mock path skipped the network call; the new path
  always forwards - cover with TC-004 asserting real forward + rewritten body/headers.
- **Stored old rules:** loaded verbatim, removed action types ignored by decide -> passthrough
  (no crash). Covered by AC-006-style test with a legacy-shaped rule object.

## Acceptance verification
- Per-AC test mapping filled after verifier passes (task file AC traceability table).
- Gates: `npm run lint`, `npm run typecheck`, `npm test` (full suite), `npm run build:chrome`,
  `npm run build:firefox`. Manifest permission grep == `["storage"]`.
