# Request override - spec

## Overview

Add a "Request" editor tab (third, after Match + Response) letting a rule mutate the outgoing request before it is forwarded: set/remove request headers and replace the request body. Mirrors the Response tab. Reverses the response-only decision (ADR 2026-07-10); a new ADR records the reversal.

## Why

The extension can already override the response a page receives. Users also need to change what the page SENDS (auth headers, env switches, payload tweaks) without touching page code - the standard job of ModHeader/Requestly-class tools.

## Acceptance criteria

- AC-001: `modifyRequestHeaders` (set/remove `HeaderOp[]`) + `rewriteRequestBody` (string) actions round-trip through `ruleSchema` and import/export.
- AC-002: `decideInterception` maps request-side actions into the `override` interception even with no response action.
- AC-003: `createPatchedFetch` applies request header ops + body replacement before forwarding.
- AC-004: `createPatchedXhr` applies request header `set` ops (`setRequestHeader`) + body replacement before forwarding; `remove` is a documented no-op on XHR.
- AC-005: RuleForm shows a "Request" tab (header ops editor + request-body textarea) mirroring the Response tab; edits round-trip draft <-> rule.
- AC-006: A request-only rule forwards through the patched path, mutates the request, returns the original response unchanged.
- AC-007: A rule with both request + response actions applies request mods first, then serves the response override.

## Data model

Two new `RuleAction` variants (discriminated on `type`):

- `{ type: 'modifyRequestHeaders'; headers: HeaderOp[] }`
- `{ type: 'rewriteRequestBody'; body: string }`

`Interception` override extended: `requestHeaderOps: HeaderOp[]`, `requestBody?: string` (flat, beside existing response `headerOps`/`body`).

## Edge cases

- Request-only rule -> override, not passthrough.
- `remove` request header absent -> no throw (fetch `Headers.delete`); XHR remove -> no-op.
- GET/HEAD + request body -> applied anyway (may throw; documented).
- Empty request fields -> no request action emitted.

## Dependencies

None new. Pure in-repo TypeScript + React.
