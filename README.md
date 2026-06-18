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

### ReqHook DevTools panel

Open DevTools (F12) and select the **ReqHook** tab for a Network-style table of **only the intercepted** `fetch`/`XHR` requests for the inspected tab. Each row shows type (mock/rewrite), method, status, and URL; click a row to see the request headers, request body, and the served response body (JSON pretty-printed). Filter by URL substring, or Clear the log. This is how you inspect what the UI actually received, since the native Network panel shows pre-interception wire bytes. The background buffers up to the last 100 intercepts per tab, so reports fired before you open the panel are flushed in when it connects.

## Architecture

A single manifest source (`src/manifest/index.ts`) generates both Chrome and Firefox variants. The rule model and UI are browser-agnostic; enforcement happens at two layers:

- **Network layer** (per browser): `ChromeEngine` - `declarativeNetRequest` (headers, redirect, block, mock-via-redirect); `FirefoxEngine` - `webRequest` + `filterResponseData` (adds in-flight response-body rewrite).
- **Page layer** (cross-browser): a MAIN-world content script (`src/content/page-main.ts`) monkey-patches `window.fetch` and `XMLHttpRequest` so that **the running UI actually receives the mocked/rewritten body** (the same mechanism Requestly's extension uses). An ISOLATED-world bridge (`src/content/bridge.ts`) syncs rules from storage into the page. Every served mock/rewrite is logged to the page console as `[ReqHook] mocked GET <url> -> <status>` and forwarded to the **ReqHook DevTools panel**.
- **DevTools panel** (cross-browser): a `devtools_page` registers a "ReqHook" panel (`src/ui/devtools/`) that renders an intercept-only network table. Reports flow page sink -> bridge -> background relay (keyed by the inspected tab id) -> panel, so each panel shows only the traffic for the tab it inspects.

## Platform limitations

- **Response-body rewrite is Firefox-only.** Chrome MV3 `declarativeNetRequest` cannot modify a response body, so on Chrome the body-rewrite action is shown **disabled** in the UI. Chrome can still mock a full response by redirecting to a `data:` URL.
- **Mock fidelity differs per browser.**
  - **Firefox** mocks the response in-flight via `filterResponseData`: the original URL is preserved, the real body is discarded, and the mock's body, content-type, custom status code, custom response headers, and artificial latency are all honored. The origin request is still issued, but its body never reaches the page.
  - **Chrome** can only mock by redirecting to a `data:` URL, which changes the address bar, always resolves as HTTP 200, and carries no custom response headers. The body and content-type are honored; custom status, response headers, and latency are surfaced as `unsupported` (`mockStatus`, `mockHeaders`, `latency`) rather than dropped silently.
- **DevTools Network panel cannot show interception output.** The native Network panel taps the wire (below `filterResponseData` and below the `fetch`/XHR patch), so its Response tab shows the original upstream bytes - no browser extension can repaint it (Firefox has no `chrome.debugger`/CDP equivalent). To see what the UI received: read the rendered page, the `[ReqHook]` console log, or call the endpoint from the DevTools console (`fetch(url).then(r => r.text()).then(console.log)`).
- **Page patch lands slightly after `document_start`.** The MAIN-world fetch/XHR patch is loaded as an ES module, so a request fired in the first microtask of page load can bypass it. Inherent to MV3 module content scripts.
- **XHR mock support (page layer):** asynchronous XHR only; consumers using `xhr.addEventListener('load', ...)` instead of `xhr.onload` are not notified for mocks in v1; `responseType` json/blob, `responseURL`, and `statusText` are not emulated.
- **DNR dynamic-rule cap (Chrome):** dynamic rules are capped (`declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES`). Rule counts beyond the cap are surfaced as an error rather than silently dropped.
- **URL matching:** both glob (`*`, `?`) and regex are supported for v1.
- **Rule precedence:** within a single request, the first enabled rule (by priority) that matches wins; header modifications from later matching rules are not accumulated in v1.
