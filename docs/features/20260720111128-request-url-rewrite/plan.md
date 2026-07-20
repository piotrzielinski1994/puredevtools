# Request URL rewrite - plan

Execution order: schema/model -> rewriteUrl (pure) -> decide -> patchFetch -> patchXhr -> ruleDraft -> RuleForm -> docs. TDD each task (RED via test-writer subagent, GREEN main). One commit per AC.

## File Structure

- `src/rules/model.ts` (M) - add `rewriteRequestUrl` to `RuleAction` union.
- `src/rules/schema.ts` (M) - add variant to `ruleAction` discriminatedUnion.
- `src/engine/page/rewriteUrl.ts` (C) + `.test.ts` - pure `resolveRewrite(originalUrl, target)`; owns all origin-swap / full-replace / preserve-query semantics.
- `src/engine/page/types.ts` (M) - `Interception` override gains `requestUrl?: string` (resolved).
- `src/engine/page/decide.ts` (M) - map `rewriteRequestUrl` -> resolved `requestUrl`.
- `src/engine/page/patchFetch.ts` (M) - forward to rewritten URL (string + `Request` input), before pre-script.
- `src/engine/page/patchXhr.ts` (M) - re-open delegate to rewritten URL, re-apply recorded headers.
- `src/ui/shared/ruleDraft.ts` (M) - `requestUrl: string` field; empty/toDraft/buildActions/draftsEqual.
- `src/ui/shared/RuleForm.tsx` (M) - "Rewrite request URL" input on the Request tab.
- docs: `README.md` (limitations), `docs/adr.md` (decision), `docs/glossary.md` (term), this spec/plan.

## Tasks

### Task 1: RuleAction + schema (AC-001)

**Files:** M `src/rules/model.ts`, `src/rules/schema.ts`; T `src/rules/schema.test.ts`.

**Interfaces:**
- Produces: `{ type: 'rewriteRequestUrl'; target: string }` member of `RuleAction`; `ruleAction` zod union accepts it.

- [ ] RED: rule with `rewriteRequestUrl` parses; unknown extra key rejected (TC-007).
- [ ] GREEN: add union member + `z.object({ type: z.literal('rewriteRequestUrl'), target: z.string() })`.
- [ ] Commit `feat: AC-001 rewriteRequestUrl action + schema`.

### Task 2: resolveRewrite (AC-002)

**Files:** C `src/engine/page/rewriteUrl.ts` + `.test.ts`.

**Interfaces:**
- Produces: `resolveRewrite(originalUrl: string, target: string): string`.

- [ ] RED: TC-001..006 (origin swap, full replace, trailing-slash origin, target-query-wins, empty/unparseable no-op, root-relative).
- [ ] GREEN: `new URL(target, originalUrl)`; if `pathname === '/' && !search && !hash` -> origin swap (splice original path/query/hash); else full replace, backfill original `search`/`hash` when target lacks them. try/catch -> return original.
- [ ] Commit `feat: AC-002 resolveRewrite semantics`.

### Task 3: Interception + decide (AC-003)

**Files:** M `src/engine/page/types.ts`, `decide.ts`; T `decide.test.ts`.

**Interfaces:**
- Consumes: `resolveRewrite`, `firstAction(rule, 'rewriteRequestUrl')`.
- Produces: override carries `requestUrl?: string` (resolved from `descriptor.url` + target).

- [ ] RED: rewrite-only rule -> override with resolved `requestUrl` (TC-008).
- [ ] GREEN: read action, `requestUrl = resolveRewrite(descriptor.url, target)`; include in the no-action passthrough guard.
- [ ] Commit `feat: AC-003 decide maps rewriteRequestUrl`.

### Task 4: patchFetch (AC-004, AC-006, AC-008)

**Files:** M `src/engine/page/patchFetch.ts`; T `patchFetch.test.ts`.

**Interfaces:**
- Consumes: `interception.requestUrl`.
- Produces: forwarded input uses rewritten URL.

- [ ] RED: rewrite-only forwards to new URL, returns original response (TC-009); `Request`-input preserves method/headers/body (TC-010); rewrite+preScript -> preScript URL wins (TC-011); compose w/ header+response (TC-015).
- [ ] GREEN: before `applyPreScript`, if `requestUrl` set, replace `input` - string/URL input -> `requestUrl`; `Request` input -> `new Request(requestUrl, input)`. Keep `forwardInitOf` for headers/body.
- [ ] Commit `feat: AC-004 patchFetch forwards rewritten URL`.

### Task 5: patchXhr (AC-005, AC-006)

**Files:** M `src/engine/page/patchXhr.ts`; T `patchXhr.test.ts`.

**Interfaces:**
- Consumes: `interception.requestUrl`.

- [ ] RED: rewrite-only XHR re-opens delegate to new URL, preserves recorded headers, returns original response (TC-012).
- [ ] GREEN: in `applyRequestOverride` (non-prescript path) + `sendWithPreScript`, when `requestUrl` set, `this.url = requestUrl`, `delegate.open(method, requestUrl)`, re-apply `this.requestHeaders` then request-header set ops. (preScript path already re-opens; feed it the rewritten url as its start `mutable.url`.)
- [ ] Commit `feat: AC-005 patchXhr re-opens rewritten URL`.

### Task 6: ruleDraft (AC-007)

**Files:** M `src/ui/shared/ruleDraft.ts`; T `ruleDraft.test.ts`.

**Interfaces:**
- Produces: `RuleDraft.requestUrl: string`.

- [ ] RED: toDraft reads target; buildActions emits only when non-empty; draftsEqual compares (TC-013).
- [ ] GREEN: add field to `emptyDraft`, `ruleToDraft` (`firstAction(rule,'rewriteRequestUrl')?.target ?? ''`), `buildActions` (push when `.trim() !== ''`), `draftsEqual`.
- [ ] Commit `feat: AC-007 ruleDraft rewriteRequestUrl round-trip`.

### Task 7: RuleForm Request tab (AC-007)

**Files:** M `src/ui/shared/RuleForm.tsx`; T `RuleForm.test.tsx`.

**Interfaces:**
- Consumes: `draft.requestUrl`, `patch({ requestUrl })`.

- [ ] RED: typing in "Rewrite request URL" input patches draft; renders from draft (TC-014).
- [ ] GREEN: add labelled `Input` (font-mono, placeholder `http://localhost:3000`) to the request tabpanel, above header ops.
- [ ] Commit `feat: AC-007 RuleForm rewrite-request-URL input`.

### Task 8: Docs

**Files:** M `README.md`, `docs/adr.md`, `docs/glossary.md`, spec/plan.

- [ ] README limitations: URL rewrite is `fetch`/`XHR` only (no doc navigation); origin-swap vs full-replace note.
- [ ] ADR row (see Decision Log).
- [ ] Glossary term "Request URL rewrite".
- [ ] Commit `docs: request URL rewrite`.

## Approach & decisions

- **Resolution in `decideInterception`, patch layers dumb.** `requestUrl` on the override is the final absolute URL, computed once. Mirrors how header/body ops are pre-resolved. Keeps fetch/XHR identical + trivially testable.
- **Auto-detect origin-swap vs full-replace** (chosen over separate mode enum) - one input field, `new URL` parse decides. Matches user's "both" answer; no UI mode toggle (YAGNI).
- **Declarative action beside existing request ops**, not a new tab - it IS a request-side mutation.
- Pre-script runs after declarative rewrite (existing order: declarative -> script), so a script can still override `req.url`.

## Edge cases (from spec)

Empty/unparseable target no-op; trailing-slash origin = swap; target-query wins over original; root-relative target; `Request`-object input preservation; XHR delegate header re-apply after re-open.

## Tests

One TC per AC minimum (TC-001..015 in spec), plus the boundary TCs (TC-003/004/005/006 for `resolveRewrite`, TC-010/011 for fetch input+script-order).

## Coverage threshold: 90% (lines/functions/branches/statements, vitest.config.ts)

## Risks

- XHR re-open resets delegate state (headers): mitigated by re-applying `this.requestHeaders` after `delegate.open`. Covered by TC-012.
- Origin-swap vs full-replace boundary ambiguity: pinned by TC-001/002/003/006 with concrete expected strings.
