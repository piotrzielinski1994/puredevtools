# Request override - plan

Execution order: schema -> engine (decide, fetch, xhr) -> draft -> UI -> docs. TDD each task (RED via test-writer subagent, GREEN main). One commit per AC.

## Tasks

1. **RuleAction + schema (AC-001)** - `src/rules/model.ts`, `src/rules/schema.ts` (+ test). Add `modifyRequestHeaders` + `rewriteRequestBody` to the `RuleAction` union and the `ruleAction` zod `discriminatedUnion`. Verify strict parse still rejects unknown types.

2. **Interception + decide (AC-002, AC-006)** - `src/engine/page/types.ts`, `src/engine/page/decide.ts` (+ test). Extend override with `requestHeaderOps`/`requestBody`. `toInterception` reads `firstAction(rule, 'modifyRequestHeaders'|'rewriteRequestBody')`; return passthrough only when NO request AND no response action.

3. **patchFetch (AC-003, AC-006, AC-007)** - `src/engine/page/patchFetch.ts` (+ test). Build a modified `init` (clone headers via `Headers`, `applyHeaderOps` for request ops, replace `body` when `requestBody` defined) and forward it. When the interception has no response override, return the original response unchanged; otherwise `serveOverride`.

4. **patchXhr (AC-004, AC-006, AC-007)** - `src/engine/page/patchXhr.ts` (+ test). In `send`, after deciding: for each request header `set` op call `this.delegate.setRequestHeader`; `remove` -> no-op. If `requestBody` defined, send that body instead of the caller's. Keep the existing response wiring.

5. **ruleDraft (AC-005)** - `src/ui/shared/ruleDraft.ts` (+ test). Add `requestOps: OpRow[]` + `requestBody: string`. Update `emptyDraft`, `ruleToDraft` (read request actions), `buildActions` (emit request actions when non-empty), `draftsEqual`.

6. **RuleForm Request tab (AC-005)** - `src/ui/shared/RuleForm.tsx` (+ test). `FormTab` gains `'request'`; add tab button + tabpanel reusing `HeaderOpEditor` (legend "Modify request headers") + a "Rewrite request body" textarea bound to `requestOps`/`requestBody`.

7. **Docs** - README Platform limitations (request mutation, XHR remove no-op, GET/HEAD+body risk); `docs/adr.md` reversal ADR; this spec/plan.

## Acceptance verification

Fresh verifier subagent: per-AC test mapping, lint + typecheck + full `npm test`, adversarial edge-case probe (request-only, remove-absent, GET+body). Manual smoke of the Request tab via load-unpacked optional.
