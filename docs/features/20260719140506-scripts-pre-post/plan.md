# Scripts (pre/post) - plan

Execution order: schema/model -> engine (decide, runner, facades, fetch, xhr) -> UI (draft, editor helpers, ScriptEditor, RuleForm tab) -> deps -> docs. TDD each task (RED via test-writer subagent, GREEN main). One commit per AC group.

## Decision Log

Append-only. Every decision, weight aside.

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-07-19 | Design gate: evaluated pz-ddd, pz-archetypes, pz-codebase-design. Invoked pz-codebase-design only. | pz-ddd/pz-archetypes: dev tooling, no domain model (consistent with every prior ADR verdict). pz-codebase-design applies: the script engine gets a new deep module (`runScript` + facades) with a narrow seam behind which `AsyncFunction`, the re-entrancy guard, and the mutable req/res model are hidden. |
| 2026-07-19 | Execute scripts via `AsyncFunction` in the page MAIN world, not QuickJS-WASM. | req/res already live in MAIN; no round-trip. purerequest's QuickJS works only because Tauri sets `csp:null`; injected into arbitrary pages QuickJS needs page `wasm-unsafe-eval` and degrades on the same strict sites as `AsyncFunction`, with far more weight. Scripts are the user's own (trusted). |
| 2026-07-19 | Scoped `req`/`res` API only; no `getVar`/`setVar`/env. | No variable/environment subsystem exists in puredevtools; building one is a separate feature (YAGNI). |
| 2026-07-19 | Attach scripts per-rule (a `RuleAction` variant), not per-folder/workspace with inheritance. | Folders here are organizational only (glossary). Mirrors the 2026-07-19 Request-tab precedent. |
| 2026-07-19 | Console + errors -> page DevTools (F12) only, `[puredevtools script]`-prefixed. | No new message/panel plumbing; devs already watch F12. |
| 2026-07-19 | Error handling: log + continue (skip only the failing script's effect). | A script typo or CSP-blocked construction never breaks the page under test; declarative ops still apply. Matches the CSP-degrade philosophy. |
| 2026-07-19 | Ordering: declarative ops first, script last. | Script is the escape hatch; sees and can override the already-mutated request/response. |
| 2026-07-19 | `res.getStatus` is read-only (no setter). | Preserves the "original status is preserved" invariant (glossary: Response override). |
| 2026-07-19 | Re-entrancy: a single module-level guard makes fetch/XHR issued while a script runs pass through un-intercepted. | Prevents infinite recursion when a script calls `fetch`. Known limitation: an unrelated page request issued during a script's `await` window is also passed through (global flag) - documented risk, acceptable for a devtool v1. |
| 2026-07-19 | `ScriptEditor.tsx` (CodeMirror React wrapper) excluded from coverage; the 3 pure helpers (eslint/lint/autocomplete) live in `src/ui/shared/script/` and ARE covered. | jsdom CM rendering is flaky/low-value to cover; mirrors how other thin shells (createGateway, main.tsx) are excluded. The lint/autocomplete logic is pure and unit-tested. |
| 2026-07-19 | No wall-clock timeout / infinite-loop interruption in v1. | `AsyncFunction` has no interrupt hook (QuickJS's does not port). Script runs in the page event loop as page code already can. Documented risk. |

## File Structure

### Create

- `src/engine/page/script/runScript.ts` - the script runner + re-entrancy guard.
  - `type ScriptOutcome = { ok: true } | { ok: false; error: string }`
  - `runScript(source: string, bindings: Record<string, unknown>): Promise<ScriptOutcome>` - builds `new AsyncFunction(...names, source)`, `await fn(...values)`, guard set around it; catches construction (CSP) + runtime throws -> `{ ok: false, error }`.
  - `isScriptRunning(): boolean` - reads the module guard.
- `src/engine/page/script/runScript.test.ts`
- `src/engine/page/script/facades.ts` - the mutable models + facades.
  - `type MutableRequest = { url: string; method: string; headers: Headers; body: string | undefined }`
  - `type MutableResponse = { readonly status: number; headers: Headers; body: string }`
  - `createRequestFacade(req: MutableRequest)` -> the pre `req` object (getUrl/setUrl/getMethod/setMethod/getHeader/setHeader/removeHeader/getHeaders/getBody/setBody).
  - `createResponseFacade(res: MutableResponse)` -> the post `res` object (getStatus/getHeader/setHeader/removeHeader/getHeaders/getBody/setBody/getJson).
  - `createConsoleFacade(sink?)` -> `{ log, info, warn, error }` forwarding `[puredevtools script]`-prefixed to the page console.
- `src/engine/page/script/facades.test.ts`
- `src/ui/shared/script/model.ts` - `export type ScriptStage = 'pre' | 'post'` (local; replaces purerequest's import).
- `src/ui/shared/script/script-lint.ts` - ported verbatim (Lezer syntax linter).
- `src/ui/shared/script/script-lint.test.ts`
- `src/ui/shared/script/script-eslint.ts` - ported; `globalsFor` rewritten for our namespaces (`req`+`console` both stages, `res` post only; drop `purerequest`/`bru`).
- `src/ui/shared/script/script-eslint.test.ts`
- `src/ui/shared/script/script-api-complete.ts` - ported; `apiMembers` rewritten for our facade members; top-level `[req, res, console]`.
- `src/ui/shared/script/script-api-complete.test.ts`
- `src/ui/shared/ScriptEditor.tsx` - CodeMirror wrapper (via `@uiw/react-codemirror`), minimal extension set (javascript + closeBrackets + autocompletion + linter + lintGutter + aria-label). No theming/find port. Coverage-excluded.
- `docs/features/20260719140506-scripts-pre-post/{spec.md,plan.md}` (this).

### Modify

- `src/rules/model.ts` - add `preScript`/`postScript` to `RuleAction`.
- `src/rules/schema.ts` - add both to the `ruleAction` discriminatedUnion.
- `src/engine/page/types.ts` - `Interception` override gains `preScript?: string; postScript?: string`.
- `src/engine/page/decide.ts` - `toInterception` reads `firstAction(rule,'preScript'|'postScript')`; passthrough only when NO action of any kind.
- `src/engine/page/patchFetch.ts` - run pre-script after `forwardInitOf`, before forward; run post-script after `serveOverride`, before return; when only a post-script (no header/body response override) still take the serve path so the script sees the response.
- `src/engine/page/patchXhr.ts` - run pre-script in `send` after `applyRequestOverride`, before `delegate.send` (setUrl/setMethod re-open the delegate); run post-script on DONE in `applyOverride` before firing the caller callback.
- `src/ui/shared/ruleDraft.ts` - `RuleDraft` gains `preScript`/`postScript`; thread through `emptyDraft`, `ruleToDraft`, `buildActions`, `draftToRule`, `draftsEqual`.
- `src/ui/shared/RuleForm.tsx` - `FormTab` gains `'scripts'`; new tabpanel with Pre/Post sub-tabs, each a `ScriptEditor`.
- `vitest.config.ts` - coverage `include` gains `src/engine/page/script/**` + `src/ui/shared/script/**`; `exclude` gains `src/ui/shared/ScriptEditor.tsx`.
- `package.json` / `package-lock.json` - new editor deps.
- `README.md` - Platform limitations: scripts, CSP degrade, no timeout, XHR re-open, re-entrancy.
- `docs/adr.md` - ADR entry (imperative escape hatch; AsyncFunction over QuickJS; CSP degrade).
- `docs/glossary.md` - `Script`, `Pre-script`, `Post-script` terms.

## Tasks

### Task 1: RuleAction + schema (AC-001)

**Files:** Modify `src/rules/model.ts`, `src/rules/schema.ts`; Test `src/rules/schema.test.ts` (extend).

**Produces:** `RuleAction` union with `{ type:'preScript'; source:string }` + `{ type:'postScript'; source:string }`; `ruleSchema` round-trips them; `.strict()` still rejects unknown `type`.

- [ ] RED test: preScript/postScript actions parse; unknown type rejected; export/import round-trip preserves source.
- [ ] GREEN: add union members + zod objects.
- [ ] Commit `feat: AC-001 preScript/postScript rule actions + schema`.

### Task 2: Interception + decide (AC-002)

**Files:** Modify `src/engine/page/types.ts`, `src/engine/page/decide.ts`; Test `src/engine/page/decide.test.ts`.

**Consumes:** the new actions. **Produces:** `Interception` override with `preScript?`/`postScript?`; `toInterception` populates them; a script-only rule -> override (not passthrough).

- [ ] RED: script-only rule -> `override` with `preScript`/`postScript` set; rule with nothing -> passthrough.
- [ ] GREEN: extend type + `toInterception`; passthrough guard tests all four + two script fields.
- [ ] Commit `feat: AC-002 decide maps scripts into interception`.

### Task 3: runScript + re-entrancy guard (AC-003, AC-009, AC-010)

**Files:** Create `src/engine/page/script/runScript.ts` (+ test).

**Produces:** `runScript(source, bindings): Promise<ScriptOutcome>`, `isScriptRunning()`, `type ScriptOutcome`.

- [ ] RED: resolves `{ok:true}` for a valid script that mutates a binding; `await` inside works; throwing script -> `{ok:false, error}` and never throws; a source that fails construction -> `{ok:false}`; `isScriptRunning()` is true DURING the run (assert via a binding that reads it) and false after; a throw still resets the guard.
- [ ] GREEN: `AsyncFunction` via `Object.getPrototypeOf(async()=>{}).constructor`; try/catch around construct + await; `try { running=true; ... } finally { running=false }`.
- [ ] Commit `feat: AC-003/009/010 script runner + re-entrancy guard`.

### Task 4: Facades + console (AC-004, AC-005, AC-011)

**Files:** Create `src/engine/page/script/facades.ts` (+ test).

**Consumes:** nothing. **Produces:** `MutableRequest`, `MutableResponse`, `createRequestFacade`, `createResponseFacade`, `createConsoleFacade`.

- [ ] RED: request facade getters reflect prior sets in the same run; header ops case-insensitive; removeHeader; body set/get. Response facade: getStatus read-only (no setter present), header ops, getJson valid+invalid (`undefined`). Console facade: log/warn/error forward prefixed (assert against an injected sink/spy).
- [ ] GREEN: thin wrappers over `Headers` + the mutable objects; `getJson` = try/parse.
- [ ] Commit `feat: AC-004/005/011 script req/res/console facades`.

### Task 5: patchFetch integration (AC-006, AC-007, AC-013, AC-009-fetch, AC-010)

**Files:** Modify `src/engine/page/patchFetch.ts`; Test `src/engine/page/patchFetch.test.ts`.

**Consumes:** runScript, facades, Interception fields.

- [ ] RED: pre-script mutates url/method/headers/body of the forwarded request (assert against a spy `originalFetch`), running AFTER declarative request ops (AC-013). post-script mutates returned headers/body, status preserved (AC-007). post-script-only rule (no response override) still serves so `res` sees the body. A fetch issued INSIDE a script passes through un-intercepted (AC-009). A throwing script forwards/returns unaffected + logs (AC-010).
- [ ] GREEN: early-return `originalFetch` when `isScriptRunning()`. Build `MutableRequest` from `input`/forwardInit after `forwardInitOf`; run pre; rebuild the fetch call. After forward, if `postScript` present force the serve path; build `MutableResponse` from the (possibly overridden) response; run post; rebuild `Response`. `{ok:false}` -> log + skip.
- [ ] Commit `feat: AC-006/007/013 patchFetch runs pre/post scripts`.

### Task 6: patchXhr integration (AC-008, AC-009-xhr, AC-010)

**Files:** Modify `src/engine/page/patchXhr.ts`; Test `src/engine/page/patchXhr.test.ts`.

**Consumes:** runScript, facades.

- [ ] RED: pre-script header/body mutations reach the delegate before send; `setUrl`/`setMethod` re-open the delegate then re-apply headers; post-script mutates `responseText`/headers on DONE before the caller's `onreadystatechange`/`onload`; inner XHR/fetch during a script not intercepted; throwing script -> unaffected + log.
- [ ] GREEN: guard early-return in `send`; run pre after `applyRequestOverride`, fold `MutableRequest` back (re-open on url/method change); run post in `applyOverride` before sink/callback.
- [ ] Commit `feat: AC-008 patchXhr runs pre/post scripts`.

### Task 7: ruleDraft (part of AC-012)

**Files:** Modify `src/ui/shared/ruleDraft.ts`; Test `src/ui/shared/ruleDraft.test.ts`.

**Produces:** `RuleDraft.preScript`/`postScript`.

- [ ] RED: `ruleToDraft` reads preScript/postScript actions; `buildActions` emits them only when non-empty (trim); `draftsEqual` compares them; `emptyDraft` blanks them; round-trip.
- [ ] GREEN: add fields + thread through the five functions.
- [ ] Commit `feat: AC-012a ruleDraft carries pre/post scripts`.

### Task 8: Editor helpers port (part of AC-012)

**Files:** Create `src/ui/shared/script/{model,script-lint,script-eslint,script-api-complete}.ts` (+ tests).

**Produces:** `ScriptStage`, `jsSyntaxLinter`, `jsUndefLinter(stage)`, `scriptApiCompletion(stage)`, `apiMembers`.

- [ ] RED: `apiMembers('req','pre')` = full set, `('req','post')` = read-only, `('res','post')` = RES getters, `('res','pre')` = []; `globalsFor('pre')` has `req`+`console` no `res`, `('post')` adds `res`; `jsUndefLinter('pre')` flags `res.x` usage; empty code -> no diagnostics.
- [ ] GREEN: port the three files, swap `ScriptStage` import to local, rewrite namespace lists for our facades (drop `purerequest`/`bru`; `req` read-only in post; `res` post only; console log/info/warn/error - no `clear`).
- [ ] Commit `feat: AC-012b script editor lint + autocomplete helpers`.

### Task 9: Deps + ScriptEditor.tsx + RuleForm Scripts tab (AC-012)

**Files:** Modify `package.json` (deps), `vitest.config.ts` (coverage), `src/ui/shared/RuleForm.tsx`; Create `src/ui/shared/ScriptEditor.tsx`; Test `src/ui/shared/RuleForm.test.tsx` (extend).

**Consumes:** ruleDraft fields, editor helpers.

- [ ] Install deps: `@uiw/react-codemirror@^4.25.10 @codemirror/lang-javascript@^6.2.5 @codemirror/autocomplete@^6.20.3 @codemirror/lint@^6.9.7 @codemirror/view@^6.43.1 @codemirror/state@^6.6.0 @codemirror/language@^6.12.3 eslint-linter-browserify@^10.5.0`.
- [ ] RED: RuleForm shows a Scripts tab; clicking it reveals Pre/Post sub-tabs; each renders an editor (`getByLabelText('Pre-request script'|'Post-response script')`); typing updates the draft (dirty). (Assert on the aria-labelled content node; CM internals not asserted.)
- [ ] GREEN: `ScriptEditor.tsx` minimal wrapper; `FormTab` gains `'scripts'`; tabpanel with a Pre/Post toggle bound to `draft.preScript`/`draft.postScript`; add `ScriptEditor.tsx` to coverage exclude + the two script dirs to include.
- [ ] Commit `feat: AC-012 Scripts editor tab (pre/post)`.

### Task 10: Docs (README + ADR + glossary)

**Files:** Modify `README.md`, `docs/adr.md`, `docs/glossary.md`.

- [ ] README Platform limitations: scripts run as `AsyncFunction` in MAIN world; CSP without `unsafe-eval` -> script skipped (degrade); no timeout (infinite loop hangs the page as page code would); XHR re-open on url/method change; re-entrancy passthrough + its global-flag caveat.
- [ ] ADR entry (see Decision Log rationale).
- [ ] Glossary: `Script`, `Pre-script`, `Post-script`.
- [ ] Commit `docs: AC scripts feature (README, ADR, glossary)`.

## Cross-cutting notes

- **Approach:** extend the single page-layer mechanism exactly as the 2026-07-19 Request tab did (new RuleAction variants -> flat Interception fields -> apply in patchFetch/patchXhr -> new RuleDraft fields -> new inner FormTab). New seam: the `src/engine/page/script/` deep module (runScript + facades) hiding AsyncFunction, the guard, and the mutable model.
- **Edge cases (from spec):** empty script -> no action; XHR setUrl re-open; re-entrancy; strict CSP degrade; getJson on non-JSON; infinite loop (unguarded, documented); GET/HEAD + setBody; post-script-only forces the fetch serve path.
- **Tests:** >=1 per AC (mapping table filled in Phase 4); edge-case TCs for CSP-fail, throwing script, re-entrancy, getJson-invalid, empty-field emit-none.
- Coverage threshold: **90%** (lines/functions/branches/statements). New pure modules must clear it; the CM React wrapper is excluded.

## Acceptance verification

Fresh verifier subagent: per-AC test mapping; `npm run lint` + `npm run typecheck` + full `npm test` + `npm run test:coverage` (>=90%); adversarial edge probe (CSP-fail path, throwing script, re-entrancy, getJson-invalid, post-only serve path, XHR re-open); manual load-unpacked smoke of the Scripts tab optional. Build (`npm run build:chrome`) before handing over.

## Status: COMPLETE (verified 2026-07-19)

Two verifier passes (fresh context each). Pass 1 found 1 correctness bug + 4 test gaps; all fixed. Pass 2 confirmed all RESOLVED, all gates green.

Gates: `eslint .` exit 0; `tsc --noEmit` exit 0; `vitest run` 43 files / 523 tests pass; `vitest run --coverage` exit 0 (All files 97.67% stmts / 92.68 branch / 92.4 funcs / 97.67 lines, gate 90); `TARGET=chrome vite build` succeeds.

### AC -> test traceability

| AC | Proving test(s) |
| --- | --- |
| AC-001 | schema.test.ts: "should parse a rule carrying preScript and postScript actions", "...round-trip...through portable state", "should reject a preScript action missing its source field", "should still reject an unknown action type after adding the script variants" |
| AC-002 | decide.test.ts: "should map a preScript-only rule to an override...", "should map a postScript-only rule...", "should carry both script sources alongside declarative ops...", "should return passthrough for a rule carrying zero actions" |
| AC-003 | runScript.test.ts (14): ok-completion, binding-in-scope, mutate-object, await, bound-async, throw->{ok:false}, async-reject->{ok:false}, construction-fail->{ok:false}, effect-kept-before-throw |
| AC-004 | facades.test.ts createRequestFacade (getUrl/setUrl, method, header case-insensitive, remove, getHeaders, getBody '' , setBody readback + underlying) |
| AC-005 | facades.test.ts createResponseFacade: getStatus, "should not expose a setStatus member", header ops, getBody/setBody, getJson parse + "...undefined (not throw)...non-JSON" |
| AC-006 | patchFetch.test.ts: "should forward the request carrying the pre-script url/method/header/body mutations", "should run the pre-script after declarative request header ops..." |
| AC-007 | patchFetch.test.ts: "should apply post-script body and header mutations...", "should preserve the original status while the post-script reads it via getStatus", "should force the serve path for a post-script-only rule" |
| AC-008 | patchXhr.test.ts: "...header and body mutations to the delegate before send", "should re-open the delegate with the pre-script url and method before send", "should re-apply a pre-script header after a setUrl re-open", "...on DONE before the caller onload fires" |
| AC-009 | patchFetch.test.ts "should pass an inner fetch call through un-intercepted...", patchXhr.test.ts "should pass an inner XHR...without re-running the rule", runScript.test.ts isScriptRunning true-during/false-after(-throw) |
| AC-010 | patchFetch.test.ts "should skip a throwing pre-script but still forward...", "should still serve the response when the post-script throws...", "should log a prefixed error to the console when a pre-script throws"; patchXhr.test.ts "should discard a throwing post-script header mutation, not just its body" |
| AC-011 | facades.test.ts createConsoleFacade (log/info/warn/error -> sink prefixed); patchFetch.test.ts "should route a script console.log through to the page console prefixed" |
| AC-012 | ruleDraft.test.ts (round-trip, emit-when-nonempty, omit-whitespace, draftsEqual); script-eslint.test.ts (stage-aware no-undef); script-lint.test.ts (syntax); script-api-complete.test.ts (apiMembers + real scriptApiCompletion behavior); RuleForm.test.tsx "should reveal Pre-request and Post-response script editors when the Scripts tab is selected", "should call onDraftChange with the new preScript when the pre-request editor is edited" |
| AC-013 | patchFetch.test.ts "should let the post-script observe the declarative body override" + pre-after-header-ops (both fetch + xhr) |

### Post-implementation decisions

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-07-19 | XHR post-script mutates a `scriptHeaders` clone; sync back to real headers only on `outcome.ok` (mirror fetch path). | Verifier pass 1 found a throwing post-script leaked partial header mutations on the XHR path (headers were mutated by reference while body was correctly reverted). Regression test (`should discard a throwing post-script header mutation`) proven red-green. |
| 2026-07-19 | Shim `Range.prototype.getClientRects`/`getBoundingClientRect` in `src/ui/test-setup.ts`. | CodeMirror 6 throws an uncaught `textRange(...).getClientRects is not a function` during layout in jsdom, failing the whole run (coverage exit 1) even with passing assertions. Empty-rect stubs let the editor mount + accept `userEvent.type`. |
