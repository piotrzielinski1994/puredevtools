# Scripts (pre/post) - spec

## Overview

Add a "Scripts" editor tab (4th, after Match / Request / Response) letting a rule run user-authored JavaScript against a matched request/response:

- **Pre** script runs before the request is forwarded and can mutate the outgoing request (url, method, headers, body).
- **Post** script runs after the response is received and can mutate the returned response (headers, body) - the status is preserved.

Mirrors the Scripts feature in the `purerequest` repo, adapted to this extension's single page-layer mechanism. Scripts are the imperative escape hatch that complements the declarative Request/Response header+body ops.

## Why

Declarative set/remove header ops and whole-body replacement cover the common cases. Scripts cover what data cannot: conditional logic ("only add this header when the body has field X"), computed values (timestamp, signed token, counter), and response reshaping (rewrite one JSON field, not the whole body). This is the standard power-user tier of ModHeader/Requestly-class tools.

## Key decisions (see Decision Log in this folder's plan is N/A; decisions live in this file + docs/adr.md)

- **Execution: `AsyncFunction` in the page MAIN world.** The `req`/`res` objects already live there; no cross-context round-trip. Scripts are the user's own (trusted). On a site whose CSP forbids `eval`/`Function` (no `unsafe-eval`), script construction throws - caught and treated as a skipped script (graceful degrade), exactly like the existing documented main-frame-navigation limitation. NOT QuickJS-WASM (purerequest can use it only because Tauri sets `csp: null`; injected into arbitrary pages it would need page `wasm-unsafe-eval`, so it degrades on the same strict sites as `AsyncFunction` but with far more weight).
- **API scope: direct req/res only.** No `getVar`/`setVar`/`getProcessEnv` - puredevtools has no variable/environment subsystem to back them, and building one is a separate feature. Scripts read/write the request and response directly.
- **Attach per-rule** (a `RuleAction` variant), not per-folder/workspace with inheritance - puredevtools folders are organizational only (glossary: "carries no matching or override behavior"). Mirrors the 2026-07-19 Request-tab precedent.
- **Console: page DevTools (F12) only**, `[puredevtools script]`-prefixed. No new panel/message plumbing.
- **Error handling: log + continue.** A throwing pre/post script (or CSP-blocked construction) logs to console and is skipped; the request/response proceeds with declarative ops still applied. A script typo never breaks the page under test.
- **Editor: CodeMirror + in-browser ESLint (`no-undef`) + stage-aware autocomplete**, ported from purerequest. First code editor in this repo (today only plain `Textarea`).
- **Ordering: declarative ops first, script last.** The pre-script sees the request after request header/body ops; the post-script sees the response after response header/body override. The script is the final word.

## Acceptance criteria

- AC-001: `preScript` (`{ type: 'preScript'; source: string }`) and `postScript` (`{ type: 'postScript'; source: string }`) `RuleAction` variants round-trip through `ruleSchema` and import/export; `.strict()` still rejects unknown action types.
- AC-002: `decideInterception` maps `preScript`/`postScript` actions into the `override` interception (new `preScript?: string` / `postScript?: string` fields) even when no header/body action is present.
- AC-003: `runScript(source, bindings)` executes the source via `AsyncFunction`, awaiting completion, returning an ADT `{ ok: true } | { ok: false; error: string }`; a throwing script or a construction failure (CSP) returns `{ ok: false }` and never throws to the host; `await` inside the script works.
- AC-004: the pre-script `req` facade exposes `getUrl/setUrl`, `getMethod/setMethod`, `getHeader/setHeader/removeHeader/getHeaders`, `getBody/setBody`; each getter reflects prior sets within the same run; mutations are read back after the run.
- AC-005: the post-script `res` facade exposes `getStatus` (read-only, no setter), `getHeader/setHeader/removeHeader/getHeaders`, `getBody/setBody`, and `getJson` (`JSON.parse(body)`, `undefined` on parse failure).
- AC-006: `createPatchedFetch` runs the pre-script AFTER applying declarative request ops and BEFORE forwarding; `req` mutations to url/method/headers/body change the forwarded request.
- AC-007: `createPatchedFetch` runs the post-script AFTER applying the declarative response override and BEFORE returning; `res` mutations to headers/body change the returned `Response`; the original status is preserved.
- AC-008: `createPatchedXhr` runs the pre-script before `send` (header + body mutations applied to the delegate; url/method changes applied by re-opening the delegate before send) and the post-script on `DONE` before the caller's `onreadystatechange`/`onload` fire.
- AC-009: a `fetch`/`XHR` call made from INSIDE a running script is not re-intercepted (re-entrancy guard) - no infinite recursion; the inner request completes as a normal request.
- AC-010: a script that throws, or whose construction fails under a strict page CSP, logs `[puredevtools script] error: ...` to the page console, skips only that script's effect, and lets the request/response proceed (declarative ops still applied).
- AC-011: `console.log/info/warn/error` inside a script surface to the page DevTools console prefixed `[puredevtools script]`.
- AC-012: `RuleForm` shows a "Scripts" tab with Pre / Post sub-tabs; each is a CodeMirror editor with JS syntax highlighting, a `no-undef` ESLint gutter (stage-aware globals: `req`+`console` for pre, `res`+`console` for post), and member autocomplete for the stage's facade; edits round-trip draft <-> rule and drive the dirty dot.
- AC-013: for a rule carrying both declarative ops and scripts, the declarative request/response mutation is applied first and the script observes and can override the already-mutated request/response.

## Data model

Two new `RuleAction` variants (discriminated on `type`), added to `src/rules/model.ts` and the `ruleAction` zod `discriminatedUnion` in `src/rules/schema.ts`:

```ts
| { type: 'preScript'; source: string }
| { type: 'postScript'; source: string }
```

`Interception` override (`src/engine/page/types.ts`) gains flat fields beside the existing request/response ones:

```ts
preScript?: string;
postScript?: string;
```

`RuleDraft` (`src/ui/shared/ruleDraft.ts`) gains:

```ts
preScript: string;   // '' when none
postScript: string;
```

Stored verbatim (a source string); no body-codec transform (unlike `rewriteBody`).

### Script API (the only globals a script sees)

Pre (`req` + `console`):

| Member | Signature | Notes |
| ------ | --------- | ----- |
| `req.getUrl` | `() => string` | resolved absolute url |
| `req.setUrl` | `(url: string) => void` | fetch: re-targets; XHR: re-opens delegate |
| `req.getMethod` | `() => string` | |
| `req.setMethod` | `(m: string) => void` | XHR: re-opens delegate |
| `req.getHeader` | `(name: string) => string \| null` | case-insensitive |
| `req.setHeader` | `(name, value) => void` | |
| `req.removeHeader` | `(name) => void` | |
| `req.getHeaders` | `() => Record<string,string>` | |
| `req.getBody` | `() => string` | `''` when no string body |
| `req.setBody` | `(body: string) => void` | |

Post (`res` + `console`):

| Member | Signature | Notes |
| ------ | --------- | ----- |
| `res.getStatus` | `() => number` | read-only (preserves the "original status preserved" invariant) |
| `res.getHeader` | `(name) => string \| null` | |
| `res.setHeader` | `(name, value) => void` | |
| `res.removeHeader` | `(name) => void` | |
| `res.getHeaders` | `() => Record<string,string>` | |
| `res.getBody` | `() => string` | |
| `res.setBody` | `(body: string) => void` | |
| `res.getJson` | `() => unknown` | `JSON.parse(body)`, `undefined` on failure |

`console.log/info/warn/error` forward `[puredevtools script]`-prefixed to the page console.

## UI States

| State | Behavior |
| ----- | -------- |
| Empty | Pre/Post editors empty; no `preScript`/`postScript` action emitted; rule behaves as before. |
| Editing | Per-keystroke draft update (dirty dot lights); ESLint gutter marks `no-undef` and syntax errors live. |
| Saved | Source persisted verbatim in the rule; survives export/import round-trip. |
| Runtime skip | Non-matching request: scripts never run. |
| Runtime error | Throwing/CSP-blocked script: `[puredevtools script] error:` in F12; request/response unaffected by the script. |

## Edge cases

- Script field empty / whitespace-only -> no action emitted (parallels the existing body/header-op emptiness rule).
- Pre-script `setUrl` on the XHR path -> delegate re-opened before send (headers re-applied, body preserved); if re-open is not possible it is a documented no-op.
- Pre-script calls `fetch`/`XMLHttpRequest` (e.g. to fetch a token) -> re-entrancy guard makes the inner call pass through un-intercepted so it completes normally and does not recurse.
- Strict page CSP (no `'unsafe-eval'`) -> `new AsyncFunction` throws at construction -> caught, logged, script skipped (graceful degrade). Documented in README limitations.
- Post-script `getJson` on non-JSON body -> returns `undefined`, no throw.
- Async script that never resolves / infinite loop -> NOT guarded in v1 (no wall-clock interrupt available for `AsyncFunction`; QuickJS's interrupt handler has no `AsyncFunction` equivalent). Documented risk; the script runs in the page's own event loop as page code already can.
- GET/HEAD + pre-script `setBody` -> body applied as-is (may throw at fetch; documented, same as the existing `rewriteRequestBody` behavior).
- A rule with only a post-script and no response header/body override -> the fetch path must still read + serve the response so the post-script can see it (today a request-only rule returns `original` untouched; a post-script forces the serve path).

## Dependencies

New npm deps for the editor (CodeMirror + browser ESLint), versions matched to `purerequest` (filled in the plan once confirmed). No runtime deps for the engine (pure in-repo TS using the platform `AsyncFunction`).

## Out of scope (YAGNI)

- Variables / environments / `{{interpolation}}` (`getVar`/`setVar`/env) - separate feature.
- Per-folder / per-workspace script inheritance.
- Streaming script console output to the puredevtools DevTools panel.
- QuickJS-WASM sandbox.
- Wall-clock timeout / infinite-loop interruption.
- `pm`/`bru` Postman/Bruno compatibility aliases.
