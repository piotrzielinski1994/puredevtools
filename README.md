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

## Architecture

A single manifest source (`src/manifest/index.ts`) generates both Chrome and Firefox variants. The rule model and UI are browser-agnostic; only the enforcement layer (`RequestEngine`) differs per browser:

- `ChromeEngine` - `declarativeNetRequest` (headers, redirect, block, mock-via-redirect).
- `FirefoxEngine` - `webRequest` + `filterResponseData` (adds in-flight response-body rewrite).

## Platform limitations

- **Response-body rewrite is Firefox-only.** Chrome MV3 `declarativeNetRequest` cannot modify a response body, so on Chrome the body-rewrite action is shown **disabled** in the UI. Chrome can still mock a full response by redirecting to a `data:` URL.
- **Chrome mock fidelity.** A `data:` URL redirect always resolves as HTTP 200 and carries no custom response headers, so a mock's custom status code, response headers, and artificial latency are not enforceable on Chrome. The engine surfaces these as `unsupported` (`mockStatus`, `mockHeaders`, `latency`) rather than dropping them silently; the body and content-type are honored. Firefox enforces all of them.
- **DNR dynamic-rule cap (Chrome):** dynamic rules are capped (`declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES`). Rule counts beyond the cap are surfaced as an error rather than silently dropped.
- **URL matching:** both glob (`*`, `?`) and regex are supported for v1.
