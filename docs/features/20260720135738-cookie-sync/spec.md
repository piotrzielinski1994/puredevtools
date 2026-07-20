# Cookie sync - spec

## Overview

Add a **Cookie sync** subsystem: copy named cookies from a **source** URL/domain to a **target** URL/domain on demand ("Sync now"). Solves "prod is logged in, I want the same auth session on `http://localhost:3000`". Managed from a dedicated **Cookie sync** section in the options page (top-level `Rules | Cookie sync` switch), stored under its own `browser.storage.local` key, executed via the WebExtension `cookies` API from the extension page.

This is **orthogonal to the rules/interception model** - it does not touch the workspace tree, `decideInterception`, or the page-layer `fetch`/`XHR` patch. A cookie mapping is not a `Rule` and never enters `flatten(workspace)`.

## Why

The page layer cannot do this: it patches `fetch`/`XHR` but (a) cannot read HttpOnly cookies (`document.cookie` hides them) and (b) cannot set the `Cookie` request header (forbidden header, stripped by the browser). Auth cookies are almost always HttpOnly + set by the server via `Set-Cookie`. The only mechanism that reads/writes HttpOnly cookies cross-domain is `browser.cookies.getAll` / `browser.cookies.set`, which requires the `cookies` permission and host access to both domains. Peer tools (Requestly, EditThisCookie) expose exactly this.

## Manifest changes

- Add `"cookies"` to `permissions` for **both** targets in `src/manifest/index.ts` (`byTarget.chrome.permissions`, `byTarget.firefox.permissions`).
- `host_permissions` is already `<all_urls>` - covers arbitrary source/target domains, no change needed.
- No new host permission prompt beyond what `<all_urls>` already grants; the `cookies` permission is the only new grant.

## Data model

New module `src/cookies/model.ts` + `src/cookies/schema.ts` (zod, `.strict()`, mirroring `src/rules/`):

```
type CookieMapping = {
  id: string;              // uuid
  name: string;            // user label, e.g. "prod auth -> localhost"
  enabled: boolean;        // reserved for future auto-sync; gates manual sync eligibility in list
  sourceUrl: string;       // absolute URL, e.g. "https://app.prod.com" - used as cookies.getAll filter + as the store's cookie context
  targetUrl: string;       // absolute URL, e.g. "http://localhost:3000" - the `url` passed to cookies.set
  cookieNames: string[];   // explicit allow-list of cookie names to copy (non-empty to sync anything)
};

type CookieSyncState = { mappings: CookieMapping[] };   // stored flat array, no tree
```

- Stored key: `puredevtools.cookieSync` in `browser.storage.local` (distinct from rules + `puredevtools.openTabs`).
- Import/export round-trips through the same `.strict()` schema (out of scope for v1 UI wiring, but the schema is authored so a future export includes it; **not** merged into the rules `portableSchema`).
- Repository `CookieSyncRepository` (`getAll`/`save`, mirroring `RuleRepository`) behind a zod-validated gateway; malformed/missing storage -> empty `{ mappings: [] }`.

## Sync semantics

`syncMapping(mapping, deps)` (pure-ish core in `src/cookies/sync.ts`, `deps` = injected `{ getAll, set }` cookie API port so it is unit-testable without a browser):

1. `const source = await deps.getAll({ url: mapping.sourceUrl })` - read all cookies visible at the source URL.
2. Filter to `mapping.cookieNames` (exact name match). A name with no matching source cookie is **skipped + reported** (not an error).
3. For each matched cookie, build a `cookies.set` details object targeting `mapping.targetUrl`:
   - `url: mapping.targetUrl`
   - `name`, `value` copied verbatim.
   - `path`, `httpOnly`, `sameSite` copied from source.
   - `expirationDate` copied when present (session cookie when absent).
   - **`domain` is NOT copied** - omitted so the cookie is scoped to the target host from `url` (copying the source `.prod.com` domain would make `cookies.set` reject it for a `localhost` url).
   - **`secure` handling (decided): drop `secure` when the target URL scheme is `http:`** (e.g. `http://localhost`), copy it verbatim when target is `https:`. A `Secure` cookie cannot be written to an `http://` url - without this the cookie silently fails to set.
4. `await deps.set(details)` per cookie. A per-cookie failure (throw / null return) is caught, recorded as skipped-with-reason, and does not abort the remaining cookies.
5. Return a `SyncResult`: `{ copied: string[]; skipped: { name: string; reason: 'not-found' | 'set-rejected' }[] }`.

## Trigger

- **Manual only (decided).** No `cookies.onChanged` listener, no background auto-mirror in v1. Sync runs when the user clicks **Sync now** on a mapping (or a "Sync all" affordance for enabled mappings).
- Runs in the options page context (extension page -> privileged `browser.cookies` access directly; no background relay).
- Result surfaced via the existing `ToastProvider` (e.g. "Copied 2 cookies, skipped 1 (session not found)").

## Acceptance criteria

- AC-001: `"cookies"` is present in `permissions` for both the Chrome and Firefox manifests emitted by `buildManifest`; `host_permissions` stays `['<all_urls>']`; no other permission added.
- AC-002: `cookieMappingSchema` / `cookieSyncStateSchema` are `.strict()` - a stored/imported mapping with an unknown key fails parse; a valid mapping round-trips.
- AC-003: `CookieSyncRepository.getAll()` returns `{ mappings: [] }` for missing or malformed storage, and the parsed state otherwise; `save` persists under `puredevtools.cookieSync`.
- AC-004: `syncMapping` reads source cookies via the injected `getAll`, copies **only** the names in `cookieNames`, and returns each requested-but-absent name in `skipped` with reason `not-found`.
- AC-005: `syncMapping` omits `domain` and copies `name`/`value`/`path`/`httpOnly`/`sameSite`/`expirationDate` into the `cookies.set` details targeting `targetUrl`.
- AC-006: When `targetUrl` scheme is `http:`, `syncMapping` sets `secure: false` (or omits `secure`) regardless of the source cookie's `secure`; when `https:`, it preserves the source `secure`.
- AC-007: A per-cookie `set` failure is caught and reported in `skipped` with reason `set-rejected`; remaining cookies are still processed (no early abort).
- AC-008: Options page has a top-level `Rules | Cookie sync` view switch; the Cookie sync view lists mappings, supports add/edit/delete, and each mapping has a **Sync now** action.
- AC-009: `Sync now` invokes `syncMapping` and shows a toast summarizing copied + skipped counts; a mapping with an empty `cookieNames` copies nothing (and says so).
- AC-010: Editing a mapping (name / source / target / cookie names) persists through the repository and survives an options-page reload.

## Test Cases

- TC-001 (manifest, AC-001): `buildManifest('chrome')` and `buildManifest('firefox')` both include `"cookies"` in `permissions`; `host_permissions === ['<all_urls>']`. Maps to: AC-001
- TC-002 (schema, AC-002): valid mapping parses; mapping with extra key rejected; state with duplicate-shaped but valid mappings parses. Maps to: AC-002
- TC-003 (repo, AC-003): missing key -> `{ mappings: [] }`; malformed JSON -> `{ mappings: [] }`; valid -> parsed; `save` writes the key. Maps to: AC-003
- TC-004 (sync, AC-004): source has `auth`,`sid`,`ga`; `cookieNames=['auth','sid']` -> copies `auth`+`sid`, `ga` not copied. Maps to: AC-004
- TC-005 (sync, AC-004): `cookieNames=['auth','missing']`, source lacks `missing` -> `skipped` contains `{name:'missing',reason:'not-found'}`. Maps to: AC-004
- TC-006 (sync, AC-005): copied details omit `domain`, carry `value`/`path`/`httpOnly`/`sameSite`/`expirationDate` from source and `url=targetUrl`. Maps to: AC-005
- TC-007 (sync, AC-006): `targetUrl='http://localhost:3000'` + source `secure:true` -> details `secure:false`. Maps to: AC-006
- TC-008 (sync, AC-006): `targetUrl='https://staging.x.com'` + source `secure:true` -> details `secure:true`. Maps to: AC-006
- TC-009 (sync, AC-007): `set` throws for one cookie -> that name in `skipped` reason `set-rejected`, the other cookie still `set` + in `copied`. Maps to: AC-007
- TC-010 (sync, AC-009): `cookieNames=[]` -> `getAll` may run but nothing copied; `copied` empty. Maps to: AC-009
- TC-011 (ui, AC-008): Cookie sync view renders mappings; add creates a new mapping row; delete removes it. Maps to: AC-008
- TC-012 (ui, AC-008): top-level switch toggles between Rules workspace and Cookie sync view. Maps to: AC-008
- TC-013 (ui, AC-009): clicking Sync now calls the sync core and renders a toast with copied/skipped counts. Maps to: AC-009
- TC-014 (ui, AC-010): edit a mapping's target URL -> persisted via repository (mock gateway assertion). Maps to: AC-010

## UI States

| State   | Behavior                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------- |
| Empty   | No mappings -> empty-state prompt + "Add mapping" button                                           |
| Success | Sync copies >=1 cookie -> toast "Copied N cookie(s)" (+ skipped count if any)                      |
| Partial | Some names not found / set-rejected -> toast lists copied N, skipped M with reasons                |
| Error   | `getAll`/`set` unavailable (permission missing) or throws globally -> toast error, mapping unchanged |

## Security / caveats (call out in README + toast copy, NOT in code comments)

- Copying an auth cookie **does not guarantee a valid session**: server tokens can be bound to origin/domain/IP/user-agent/CSRF, so a copied cookie may still be rejected by the backend. This is a convenience tool, not a session-transfer guarantee.
- `Secure` is dropped for `http://` targets (see AC-006) - the copied cookie is intentionally less strict than the source on localhost.
- `SameSite` / `path` scope is preserved; a source `SameSite=Strict` cookie still behaves per its flag on the target host.
- Never log cookie **values** (secrets hygiene) - toasts + any logging use cookie **names** and counts only.
- The `cookies` permission grants read of all cookies on all sites (paired with `<all_urls>`); document this scope bump in README platform/permissions notes.

## Edge cases

- Source cookie has a leading-dot `domain` (`.prod.com`) -> `domain` omitted on set; target host from `url` governs scope.
- Session cookie (no `expirationDate`) -> `expirationDate` omitted, target cookie is also session-scoped.
- `hostOnly` source cookie -> naturally reproduced by omitting `domain`.
- Duplicate requested name resolving to multiple source cookies (same name, different path) -> each source match produces its own `set` (path distinguishes them).
- Empty/invalid `sourceUrl` or `targetUrl` -> mapping is not syncable; UI disables Sync now (v1: no inline URL validation error beyond disabling).
- Firefox `cookies.getAll`/`set` parity: both engines expose the same promise-based API via `webextension-polyfill`; `sameSite`/`firstPartyDomain` differences are left at API defaults (v1 does not set `firstPartyDomain`).

## Dependencies

- New: `cookies` manifest permission (both engines).
- No new npm packages. Pure in-repo TypeScript + React + existing zod / `webextension-polyfill` / `ToastProvider`.

## Out of scope (v1)

- Auto-sync on `cookies.onChanged` (live mirror) - deferred; `enabled` field reserved for it.
- Copy-all-cookies-from-domain (no name allow-list) - v1 requires explicit names.
- Bidirectional / target->source sync.
- Deleting target cookies that no longer exist on source (no reconciliation, only additive set).
- Import/export UI wiring for mappings (schema authored, UI deferred).
- Cross-window live state sync.
