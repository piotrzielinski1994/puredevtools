# Cookie sync - plan

Execution order: schema/model -> sync core (pure) -> storage repo -> gateway/provider -> UI (view switch + list + editor + Sync now) -> manifest -> docs. TDD each task (RED first, GREEN smallest). One commit per AC. Cookie sync is a **separate subsystem** under `src/cookies/` + `src/ui/cookies/`; it does NOT touch `src/rules/`, `src/engine/`, or the workspace tree.

## File Structure

- `src/cookies/model.ts` (C) - `CookieMapping`, `CookieSyncState`, `SyncResult`, `CookieApiPort` types.
- `src/cookies/schema.ts` (C) + `.test.ts` - zod `.strict()` `cookieMappingSchema` / `cookieSyncStateSchema`.
- `src/cookies/sync.ts` (C) + `.test.ts` - pure `syncMapping(mapping, port): Promise<SyncResult>`; owns filter/domain-omit/secure-drop/skip semantics.
- `src/cookies/storage.ts` (C) + `.test.ts` - `CookieSyncRepository` (`getAll`/`save`) over the injected `StorageArea` (reuse `src/rules/storage.ts` `StorageArea` type - import, don't redefine).
- `src/shared/constants.ts` (M) - add `cookieSync: 'puredevtools.cookieSync'` to `STORAGE_KEYS`.
- `src/manifest/index.ts` (M) - `permissions: ['storage', 'cookies']` both targets.
- `src/ui/cookies/CookieSyncView.tsx` (C) + `.test.tsx` - list + add/delete + Sync now, wired to a cookie gateway.
- `src/ui/cookies/CookieMappingForm.tsx` (C) + `.test.tsx` - edit one mapping (name, source URL, target URL, cookie names).
- `src/ui/cookies/createCookieGateway.ts` (C, coverage-excluded I/O) - repo + `browser.cookies` port wiring; mirrors `createGateway.ts`/`createTabsStore.ts`.
- `src/ui/cookies/cookieGateway.ts` (C) - `CookieGateway` port type (`getAll`/`save`/`sync`).
- `src/ui/options/App.tsx` (M) - host the top-level `Rules | Cookie sync` view switch.
- `src/ui/shared/OptionsWorkspace.tsx` (M, minimal) OR new `src/ui/options/OptionsShell.tsx` - owns the view toggle; keep rules workspace untouched inside its branch.
- docs: `README.md` (permissions + platform note + caveats), `docs/adr.md` (decision), `docs/glossary.md` ("Cookie sync", "Cookie mapping"), this spec/plan.

## Tasks

### Task 1: model + schema (AC-002)

**Files:** C `src/cookies/model.ts`, `src/cookies/schema.ts` + `schema.test.ts`.

**Interfaces:**
- Produces: `CookieMapping`, `CookieSyncState` types; `cookieMappingSchema`/`cookieSyncStateSchema` (`.strict()`).

- [ ] RED: valid mapping parses; extra key rejected; state array of mappings parses (TC-002).
- [ ] GREEN: types + zod `.strict()` objects (`cookieNames: z.array(z.string())`, URLs `z.string()`).
- [ ] Commit `feat: AC-002 cookie mapping model + strict schema`.

### Task 2: syncMapping core (AC-004, AC-005, AC-006, AC-007)

**Files:** C `src/cookies/sync.ts` + `.test.ts`.

**Interfaces:**
- Consumes: `CookieApiPort = { getAll(details): Promise<Cookie[]>; set(details): Promise<Cookie | null> }` (shapes from `webextension-polyfill` `Cookies` namespace).
- Produces: `syncMapping(mapping: CookieMapping, port: CookieApiPort): Promise<SyncResult>`.

- [ ] RED: TC-004 (copy only named), TC-005 (not-found skip), TC-006 (domain omitted + fields copied + url=target), TC-007 (http target -> secure false), TC-008 (https target -> secure preserved), TC-009 (set throws -> set-rejected, others continue), TC-010 (empty names -> nothing copied).
- [ ] GREEN: `getAll({url: sourceUrl})` -> filter by `cookieNames` -> map to set-details (omit `domain`, copy value/path/httpOnly/sameSite/expirationDate, `secure = new URL(targetUrl).protocol === 'https:' ? src.secure : false`, `url: targetUrl`) -> `await port.set` in try/catch, accumulate `copied`/`skipped`. Names with no source match -> `skipped: not-found`.
- [ ] Commit `feat: AC-004..007 syncMapping core semantics`.

### Task 3: storage repository (AC-003)

**Files:** C `src/cookies/storage.ts` + `.test.ts`.

**Interfaces:**
- Consumes: `StorageArea` (from `src/rules/storage.ts`), `STORAGE_KEYS.cookieSync`.
- Produces: `CookieSyncRepository { getAll(): Promise<CookieSyncState>; save(state): Promise<void> }`.

- [ ] RED: missing key -> `{mappings:[]}`; malformed (schema-fail) -> `{mappings:[]}`; valid -> parsed; `save` writes key (TC-003).
- [ ] GREEN: `area.get` -> `cookieSyncStateSchema.safeParse` -> fallback empty; `save` -> `area.set`. Add constant.
- [ ] Commit `feat: AC-003 cookie sync repository + storage key`.

### Task 4: manifest permission (AC-001)

**Files:** M `src/manifest/index.ts`; T `src/manifest/index.test.ts` (or existing manifest test).

- [ ] RED: `buildManifest('chrome')` + `('firefox')` include `'cookies'`; `host_permissions === ['<all_urls>']` (TC-001).
- [ ] GREEN: `permissions: ['storage', 'cookies']` in both `byTarget` entries.
- [ ] Commit `feat: AC-001 cookies manifest permission`.

### Task 5: cookie gateway + provider wiring

**Files:** C `src/ui/cookies/cookieGateway.ts`, `createCookieGateway.ts`.

**Interfaces:**
- Produces: `CookieGateway = { getAll(): Promise<CookieSyncState>; save(state): Promise<void>; sync(mapping): Promise<SyncResult> }`.
- `createCookieGateway` = `CookieSyncRepository(browser.storage.local)` + port `{ getAll: browser.cookies.getAll, set: browser.cookies.set }` -> `sync = (m) => syncMapping(m, port)`.

- [ ] No dedicated RED (I/O wiring; coverage-excluded like `createTabsStore.ts`). Covered indirectly by view tests with a mock gateway.
- [ ] Commit `feat: cookie gateway wiring`.

### Task 6: CookieSyncView + CookieMappingForm (AC-008, AC-010)

**Files:** C `src/ui/cookies/CookieSyncView.tsx`, `CookieMappingForm.tsx` + tests.

**Interfaces:**
- Consumes: injected `gateway: CookieGateway` (default `createCookieGateway()`), `ToastProvider`.
- Produces: list of mappings, add/edit/delete, Sync now per row.

- [ ] RED: renders mappings; add -> new row; delete -> removed (TC-011); edit target URL persists via gateway.save (TC-014).
- [ ] GREEN: `useState` mappings from `gateway.getAll()`; add appends blank mapping (uuid via existing id helper); form patches + `gateway.save`; delete filters + save. Cookie names input = comma/newline split -> `string[]`.
- [ ] Commit `feat: AC-008,010 cookie sync view + mapping editor`.

### Task 7: Sync now action + toast (AC-009)

**Files:** M `src/ui/cookies/CookieSyncView.tsx`; T same.

**Interfaces:**
- Consumes: `gateway.sync(mapping)`, `useToast`.

- [ ] RED: click Sync now -> `gateway.sync` called -> toast shows copied/skipped counts (TC-013); empty names -> "Copied 0" (TC-010 UI).
- [ ] GREEN: button per row -> `await gateway.sync(m)` -> toast `Copied {copied.length} cookie(s)` + `, skipped {skipped.length}` when >0. Disable when source/target URL empty.
- [ ] Commit `feat: AC-009 Sync now + result toast`.

### Task 8: options view switch (AC-008)

**Files:** M `src/ui/options/App.tsx` (+ new `OptionsShell.tsx` if cleaner); T.

**Interfaces:**
- Produces: top-level `Rules | Cookie sync` toggle; Rules branch renders existing `OptionsWorkspace` untouched, Cookie sync branch renders `CookieSyncView`.

- [ ] RED: toggle switches rendered view (TC-012).
- [ ] GREEN: `useState<'rules'|'cookies'>('rules')` + a small segmented control in a top bar; render branch. Keep `RulesProvider`/`ToastProvider` wrapping both.
- [ ] Commit `feat: AC-008 options Rules|Cookie sync view switch`.

### Task 9: docs

**Files:** M `README.md`, `docs/adr.md`, `docs/glossary.md`, spec/plan.

- [ ] README: new `cookies` permission (scope: reads all cookies on all sites with `<all_urls>`); Cookie sync usage; caveats (copied token may still be rejected server-side; Secure dropped on http target; names-only, manual only).
- [ ] ADR row (see Decision Log below).
- [ ] Glossary: "Cookie sync", "Cookie mapping".
- [ ] Commit `docs: cookie sync`.

## Approach & decisions

- **Separate subsystem, not a rule.** No entry in workspace tree / `flatten` / `decideInterception`. Preserves the flat-ordered `Rule[]` engine contract untouched.
- **No background code.** The options page is a privileged extension page - `browser.cookies.getAll/set` work directly there; no page sink -> bridge -> background relay hop (that path exists only for interception reports).
- **`syncMapping` takes an injected `CookieApiPort`** so all semantics (filter, domain-omit, secure-drop, skip-reasons) are unit-tested without a real browser, mirroring how `useOpenTabs` takes a `TabsStore`.
- **Resolve secure/domain in the pure core**, UI + gateway stay dumb - mirrors the "resolve in decide, patch layers dumb" rules precedent.
- **Manual trigger, names allow-list, drop-secure-on-http, separate options section** - the four spec decisions.

## Edge cases (from spec)

Leading-dot source domain -> domain omitted; session cookie -> no expirationDate; hostOnly reproduced by omitting domain; same name multiple paths -> one set each; empty/invalid URL -> Sync now disabled; Firefox parity via polyfill (no firstPartyDomain in v1).

## Tests

One TC per AC minimum (TC-001..014 in spec). Sync-core boundary TCs (TC-006/007/008/009) pinned with concrete expected `set` details.

## Coverage threshold: 90% (lines/functions/branches/statements, vitest.config.ts)

`createCookieGateway.ts` added to coverage exclude (pure I/O wiring), matching `createTabsStore.ts`.

## Risks

- **Server-side token rejection** (origin/CSRF-bound): documented, not solvable here - convenience tool.
- **`cookies.set` shape drift Chrome vs Firefox**: mitigated by omitting `domain` + not setting `firstPartyDomain`; polyfill normalizes the promise API.
- **Secret leakage**: never log/toast cookie values - names + counts only. Enforced in sync-core + toast copy.
- **Permission scope bump**: `cookies` + `<all_urls>` = read all cookies everywhere; documented in README, single ADR-tracked grant.
