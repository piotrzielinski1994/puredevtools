# ReqHook

A minimal cross-browser (Chrome MV3 + Firefox) WebExtension for intercepting, tampering, and stubbing HTTP traffic directly in a browser.

## Build

```bash
npm install
npm run build:chrome    # -> dist/chrome
npm run build:firefox   # -> dist/firefox
```

Load unpacked:

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `dist/chrome`.
- Firefox: `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on -> `dist/firefox/manifest.json`.

## Dev

```bash
npm run dev:chrome
npm run dev:firefox
npm run typecheck
npm run lint
npm test
```

## Usage

Open the extension popup for a quick rule list and the global on/off switch, or the options page (`Manage rules…`) for the full editor:

- Add, edit, delete, enable/disable, and reorder rules (priority).
- Each rule matches by URL (glob or regex), method, resource type, and optional request-header matchers, then applies request/response header changes, redirect, block, response-body rewrite, status override, or a full mock response.
- Export all rules to a JSON file and import them back (replaces the current set).
- Rules persist in extension storage and survive browser restarts.

## Architecture

A single manifest source (`src/manifest/index.ts`) generates both Chrome and Firefox variants. The rule model and UI are browser-agnostic; only the enforcement layer (`RequestEngine`) differs per browser:

- `ChromeEngine` - `declarativeNetRequest` (headers, redirect, block, mock-via-redirect).
- `FirefoxEngine` - `webRequest` + `filterResponseData` (adds in-flight response-body rewrite).

## Platform limitations

- **Response-body rewrite is Firefox-only.** Chrome MV3 `declarativeNetRequest` cannot modify a response body, so on Chrome the body-rewrite action is shown **disabled** in the UI. Chrome can still mock a full response by redirecting to a `data:` URL.
- **Mock fidelity differs per browser.**
  - **Firefox** mocks the response in-flight via `filterResponseData`: the original URL is preserved, the real body is discarded, and the mock's body, content-type, custom status code, custom response headers, and artificial latency are all honored. The origin request is still issued, but its body never reaches the page.
  - **Chrome** can only mock by redirecting to a `data:` URL, which changes the address bar, always resolves as HTTP 200, and carries no custom response headers. The body and content-type are honored; custom status, response headers, and latency are surfaced as `unsupported` (`mockStatus`, `mockHeaders`, `latency`) rather than dropped silently.
- **DNR dynamic-rule cap (Chrome):** dynamic rules are capped (`declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES`). Rule counts beyond the cap are surfaced as an error rather than silently dropped.
- **URL matching:** both glob (`*`, `?`) and regex are supported for v1.
- **Rule precedence:** within a single request, the first enabled rule (by priority) that matches wins; header modifications from later matching rules are not accumulated in v1.
