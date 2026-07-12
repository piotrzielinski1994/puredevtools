# ReqHook

A minimal cross-browser (Chrome MV3 + Firefox) WebExtension for overriding the **response headers and body** a page's `fetch`/`XHR` calls receive. One mechanism, identical behavior on both browsers.

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

Open the extension popup for a quick rule list and the global on/off switch, or the options page (`Manage rules…`) for the full editor. The options page is a master-detail workspace: the left sidebar always lists every rule, while the right area opens each rule you edit as a tab (open several at once, switch between them; open tabs are session-only). With no tab open it shows a "Select a rule to edit" hint. From here you can:

- Add, edit, delete, enable/disable, and reorder rules (priority).
- Each rule matches by URL (glob or regex) and HTTP method, then forwards the real request and overrides the response: `set`/`remove` response headers and/or rewrite the response body (optional content-type). The original status is preserved.
- Export all rules to a JSON file and import them back (replaces the current set).
- Rules persist in extension storage and survive browser restarts.

### ReqHook DevTools panel

Open DevTools (F12) and select the **ReqHook** tab for a Network-style table of **only the overridden** `fetch`/`XHR` requests for the inspected tab. Each row shows time, method, status, and URL; click a row to see the request headers, request body, and the served response body (JSON pretty-printed), with a Copy button for the response body. Filter by URL substring, or Clear the log. This is how you inspect what the UI actually received, since the native Network panel shows pre-interception wire bytes. The background buffers up to the last 100 intercepts per tab, so reports fired before you open the panel are flushed in when it connects.

## Architecture

A single manifest source (`src/manifest/index.ts`) generates both Chrome and Firefox variants. The rule model and UI are browser-agnostic, and there is a **single enforcement mechanism**:

- **Page layer** (cross-browser): a MAIN-world content script (`src/content/page-main.ts`) monkey-patches `window.fetch` and `XMLHttpRequest`. On a matching rule it forwards the real request, then applies the response-header ops and body rewrite before the page's `fetch`/XHR callback sees the response (the same mechanism MockExpress/Requestly use). An ISOLATED-world bridge (`src/content/bridge.ts`) syncs rules from storage into the page. Every override is logged to the page console as `[ReqHook] rewrote <method> <url> -> <status>` and forwarded to the **ReqHook DevTools panel**.
- **DevTools panel** (cross-browser): a `devtools_page` registers a "ReqHook" panel (`src/ui/devtools/`) that renders an intercept-only network table. Reports flow page sink -> bridge -> background relay (keyed by the inspected tab id) -> panel, so each panel shows only the traffic for the tab it inspects.

There is no network layer: `declarativeNetRequest`/`webRequest` are not used, and the only requested permission is `storage`.

## Platform limitations

- **Only `fetch`/`XHR` are overridden.** ReqHook patches `window.fetch` and `XMLHttpRequest`, so it overrides requests the page's JavaScript makes. It does **not** override main-frame document navigation (typing a URL in the address bar), sub-resource tags (`<img>`, `<script>`, `<link>`), or WebSocket traffic. This matches peer tools (MockExpress etc.); intercepting document navigation on Chrome would require `chrome.debugger` (a yellow "being debugged" banner) and has no cross-browser equivalent.
- **The request is always forwarded.** A rule issues the real request and then overrides the response headers/body; the original status is preserved. There is no canned/no-forward mock mode.
- **DevTools Network panel cannot show override output.** The native Network panel taps the wire (below the `fetch`/XHR patch), so its Response tab shows the original upstream bytes. To see what the UI received: read the rendered page, the `[ReqHook]` console log, or call the endpoint from the DevTools console (`fetch(url).then(r => r.text()).then(console.log)`).
- **Page patch lands slightly after `document_start`.** The MAIN-world fetch/XHR patch is loaded as an ES module, so a request fired in the first microtask of page load can bypass it. Inherent to MV3 module content scripts.
- **XHR support (page layer):** asynchronous XHR only; consumers using `xhr.addEventListener('load', ...)` instead of `xhr.onload` are not notified in v1; `responseType` json/blob, `responseURL`, and `statusText` are not emulated.
- **URL matching:** both glob (`*`, `?`) and regex are supported.
- **Rule precedence:** within a single request, the first enabled rule (by priority) that matches wins; overrides from later matching rules are not accumulated in v1.
