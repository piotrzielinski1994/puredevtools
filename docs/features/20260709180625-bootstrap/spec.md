# Spec: Bootstrap - Dual-Browser WebExtension Scaffold

**Version:** 0.1.0
**Created:** 2026-07-09
**Status:** Implemented (as-built; documents the scaffold already merged on `main`)

## 1. Overview

Stand up an empty, runnable browser extension that will become an HTTP-traffic
interceptor/tamperer (a Requestly-style devtool). This feature delivers **scaffold only** -
no interception, no rules, no product UI. The goal is a clean, conventionally-structured
project that future features build on without re-litigating the tooling and the
cross-browser build.

One codebase targets **Chromium (MV3)** and **Firefox** from a single manifest source.

Stack:
- **Manifest V3** browser extension
- **Vite 5** + **`@crxjs/vite-plugin`** - build + dev, `TARGET=chrome|firefox` selects the variant
- **React 18 + TypeScript (strict, no `any`)** - popup + options page skeletons
- **`webextension-polyfill`** - promise-based cross-browser WebExtension API
- **`zod`** - present as a dependency for later boundary validation (not exercised by the scaffold)
- **Vitest** (+ `@testing-library/react`, jsdom) - the only test layer
- **ESLint** (flat config) - lint
- **npm** - package manager; Node via **mise** (`mise.toml` pins node 22)

### User Story

As a developer on this project, I want a runnable Chrome+Firefox MV3 extension scaffold
with a single manifest source, a React popup/options skeleton, strict TypeScript, and
Vitest wired up, so that future features (rules, engines, interception, DevTools panel)
start from a consistent, dual-browser foundation instead of boilerplate setup.

## 2. Acceptance Criteria

| ID | Criterion | Priority | Status |
|----|-----------|----------|--------|
| AC-001 | `npm install` succeeds from a clean checkout with no peer-dependency errors | Must | Met |
| AC-002 | `npm run build:chrome` emits a loadable unpacked MV3 extension to `dist/chrome` | Must | Met |
| AC-003 | `npm run build:firefox` emits a loadable extension to `dist/firefox` | Must | Met |
| AC-004 | One manifest source (`src/manifest/index.ts`) emits both variants: Chrome uses `background.service_worker`; Firefox uses `background.scripts` + `browser_specific_settings.gecko` (id + `strict_min_version`) | Must | Met |
| AC-005 | Each variant declares the engine-appropriate permissions (Chrome: `declarativeNetRequest*` + `storage`; Firefox: `webRequest*` + `storage`) and `<all_urls>` host access | Must | Met |
| AC-006 | Loading the unpacked build shows a working **popup** (toolbar action) and an **options page** that render React | Must | Met |
| AC-007 | An unknown `TARGET` fails the build fast with a clear error (not a silent default that ships the wrong manifest) | Should | Met |
| AC-008 | `npm run typecheck` (`tsc --noEmit`, strict, no `any`), `npm run lint`, and `npm test` all exit 0 | Must | Met |
| AC-009 | `dev:chrome` / `dev:firefox` run Vite with `@crxjs` HMR for the selected target | Should | Met |

## 3. User Test Cases

### TC-001 (happy path): Load unpacked in Chromium

**Precondition:** Clean checkout, `npm install` + `npm run build:chrome` done.
**Steps:**
1. `chrome://extensions` -> enable Developer mode -> "Load unpacked" -> pick `dist/chrome`.
2. Click the ReqHook toolbar icon.
3. Open the extension's options page.
**Expected:** Extension loads with no manifest error; the popup renders its React skeleton; the options page renders its React skeleton.
**Maps to:** AC-002, AC-004, AC-005, AC-006.

### TC-002 (happy path): Load unpacked in Firefox

**Precondition:** `npm run build:firefox` done.
**Steps:**
1. `about:debugging#/runtime/this-firefox` -> "Load Temporary Add-on" -> pick `dist/firefox/manifest.json`.
2. Open the popup and the options page.
**Expected:** Firefox accepts the manifest (gecko id + `strict_min_version` present); popup + options render.
**Maps to:** AC-003, AC-004, AC-006.

### TC-003 (edge/error): Unknown build target

**Precondition:** Clean checkout.
**Steps:**
1. Run the build with `TARGET=safari`.
**Expected:** Build throws `Unknown TARGET "safari". Use "chrome" or "firefox".` and produces no `dist/` output.
**Maps to:** AC-007.

## 4. UI States

The scaffold's popup and options pages are **skeletons** - a minimal React render each, no
product controls. Real states (loading/empty/error/success) arrive with the feature that
puts content in them.

## 5. Data Model

No domain entities in this feature. The manifest shape is the only typed structure:

- `Manifest` - MV3 manifest type with a `background` union (`{ service_worker }` for Chrome,
  `{ scripts }` for Firefox) and an optional `browser_specific_settings.gecko`.
- `Target` - `"chrome" | "firefox"`, with an `isTarget` guard used by the build to reject
  unknown values.

Rule/interception data models are out of scope.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | Unknown `TARGET` env value | Build throws with a clear message; no `dist/` written (AC-007). |
| E-2 | `dist/<target>` already populated from a prior build | `build.emptyOutDir` clears it before writing. |
| E-3 | Missing Node / wrong version | `mise` (node 22 pinned in `mise.toml`) provides the toolchain; run under mise. |

## 7. Dependencies

New (all first introduced by this scaffold): Vite, `@crxjs/vite-plugin`, `@vitejs/plugin-react`,
React 18 + React DOM, `webextension-polyfill`, `zod`, TypeScript, ESLint (+ `typescript-eslint`,
`@eslint/js`), Vitest (+ `@testing-library/react`, `@testing-library/jest-dom`, jsdom),
`@types/*`. No external services.

## 8. Out of Scope

Deferred to their own later feature folders - **not** part of bootstrap:

- Rule model + `zod` schema, storage, import/export.
- `RequestEngine` interface and the Chrome (`declarativeNetRequest`) / Firefox
  (`webRequest` + `filterResponseData`) engines.
- MAIN-world `fetch`/`XHR` page patch and the content-script bridge.
- ReqHook DevTools panel and its intercept table.
- Popup / options **product** UI, Tailwind v4, and shadcn-style component primitives.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-09 | Initial as-built spec documenting the merged scaffold |
