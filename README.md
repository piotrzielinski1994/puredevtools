# puredevtools

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

Open the extension popup for a quick rule tree and the global on/off switch, or the options page (`Manage rules…`) for the full editor. The options page is a master-detail workspace: the left sidebar shows a folder tree of every rule, while the right area opens each rule you edit as a tab (open several at once, switch between them - in-progress edits are kept per tab, and a tab with unsaved edits shows a dot and asks to Save/Discard/Cancel before closing; open tabs persist across reloads/restarts, the unsaved "New rule" draft does not). Save the open editor with **Cmd/Ctrl+S** (there is no Save button); close a tab (X) to discard - a dirty tab prompts first. With no tab open it shows a "Select a rule to edit" hint. From here you can:

- Add, edit, delete, and enable/disable rules.
- Organize rules into **folders** (nested arbitrarily; rules and folders can also sit at the root) and **reorder by drag-and-drop** - drag a rule or folder to reorder among siblings, drop it into or out of a folder. Right-click a folder for New folder / Rename / Delete (delete removes the whole subtree); collapse/expand persists. Rule precedence follows the visible top-to-bottom order of the tree.
- The popup shows the same folder tree read-only (collapse/expand + toggle), with organizing done on the options page.
- Each rule matches by URL (glob or regex) and HTTP method. The editor has four tabs: **Match** (URL/method), **Request** (rewrite the request URL to redirect it elsewhere, `set`/`remove` request headers and/or rewrite the request body, applied before the request is forwarded), **Response** (`set`/`remove` response headers and/or rewrite the response body with an optional content-type, applied to the forwarded response), and **Scripts** (**Pre-request** / **Post-response** JavaScript run against the request/response). The real request is always forwarded and the original status preserved.
- **Scripts** are the imperative escape hatch beside the declarative header/body ops. A **pre-request** script gets a `req` object (`getUrl/setUrl`, `getMethod/setMethod`, `getHeader/setHeader/removeHeader/getHeaders`, `getBody/setBody`) and can reshape the outgoing request; a **post-response** script gets a `res` object (`getStatus` read-only, `getHeader/setHeader/removeHeader/getHeaders`, `getBody/setBody`, `getJson`) and can reshape the returned response. Both get a `console` (log/info/warn/error) that prints to the page DevTools console prefixed `[puredevtools script]`. `await` is supported. Declarative ops run first, then the script observes and can override the result.
- Export all rules (folders included) to a JSON file and import them back (replaces the current set).
- Rules persist in extension storage and survive browser restarts.

### puredevtools DevTools panel

Open DevTools (F12) and select the **puredevtools** tab for a Network-style table of **only the overridden** `fetch`/`XHR` requests for the inspected tab. Each row shows time, method, status, and URL; click a row to see the request headers, request body, and the served response body (JSON pretty-printed), with a Copy button for the response body. Filter by URL substring, or Clear the log. This is how you inspect what the UI actually received, since the native Network panel shows pre-interception wire bytes. The background buffers up to the last 100 intercepts per tab, so reports fired before you open the panel are flushed in when it connects.

## Architecture

A single manifest source (`src/manifest/index.ts`) generates both Chrome and Firefox variants. The rule model and UI are browser-agnostic, and there is a **single enforcement mechanism**:

- **Page layer** (cross-browser): a MAIN-world content script (`src/content/page-main.ts`) monkey-patches `window.fetch` and `XMLHttpRequest`. On a matching rule it rewrites the request URL, applies the request-header ops + body rewrite, runs the pre-request script, forwards the real request, then applies the response-header ops + body rewrite, runs the post-response script, before the page's `fetch`/XHR callback sees the response (the same mechanism MockExpress/Requestly use). Scripts run via `AsyncFunction` in the page context (`src/engine/page/script/`), gated by a re-entrancy guard. An ISOLATED-world bridge (`src/content/bridge.ts`) syncs rules from storage into the page. Every override is logged to the page console as `[puredevtools] rewrote <method> <url> -> <status>` and forwarded to the **puredevtools DevTools panel**.
- **DevTools panel** (cross-browser): a `devtools_page` registers a "puredevtools" panel (`src/ui/devtools/`) that renders an intercept-only network table. Reports flow page sink -> bridge -> background relay (keyed by the inspected tab id) -> panel, so each panel shows only the traffic for the tab it inspects.

There is no network layer: `declarativeNetRequest`/`webRequest` are not used, and the only requested permission is `storage`.

## Platform limitations

- **Only `fetch`/`XHR` are overridden.** puredevtools patches `window.fetch` and `XMLHttpRequest`, so it overrides requests the page's JavaScript makes. It does **not** override main-frame document navigation (typing a URL in the address bar), sub-resource tags (`<img>`, `<script>`, `<link>`), or WebSocket traffic. This matches peer tools (MockExpress etc.); intercepting document navigation on Chrome would require `chrome.debugger` (a yellow "being debugged" banner) and has no cross-browser equivalent.
- **The request is always forwarded.** A rule issues the real request and then overrides the response headers/body; the original status is preserved. There is no canned/no-forward mock mode.
- **Request mutation.** A rule can also modify the outgoing request before it is forwarded: rewrite the request URL, set/remove request headers, and replace the request body (the "Request" editor tab). Set the request `Content-Type` via a header row. Caveats: a request body attached to a `GET`/`HEAD` request is applied as-is and may cause `fetch` to throw (same as page code doing it); on XHR, request-header **`remove`** is a no-op (there is no XHR API to unset a header) and the browser-controlled headers (`Cookie`, `User-Agent`, `Host`, …) cannot be set or removed.
- **Request URL rewrite.** Redirect a matched request to another URL (e.g. prod API -> `localhost`). The target is auto-detected: an **origin-only** target (`http://localhost:3000`, trailing slash allowed) swaps only scheme/host/port and keeps the original path/query/hash; a target with an explicit **path** (`http://localhost:3000/mock`) replaces the URL but preserves the original query/hash the target omits. Root-relative (`/mock`) and protocol-relative (`//host`) targets resolve against the original request. An empty or unparseable target is a no-op. The declarative rewrite runs before any pre-request script, so a script's `setUrl` still wins. Like all interception it applies to `fetch`/`XHR` only, not document navigation.
- **Scripts run as `AsyncFunction` in the page's MAIN world.** A pre/post script is compiled with the `Function` constructor and executed in the page context, so it is subject to the **visited page's Content-Security-Policy**: on a site whose `script-src` omits `'unsafe-eval'` the script fails to construct and is **skipped** (a `[puredevtools script]` error is logged and the request/response proceeds with the declarative ops still applied) - a graceful degrade, not a crash. A script that **throws** at runtime is likewise skipped (its partial effect discarded). There is **no execution timeout**: an infinite loop in a script hangs the page exactly as page-authored code would (no QuickJS-style interrupt is available for `AsyncFunction`). Scripts are your own code, run with full page access - treat them as trusted. A `fetch`/`XHR` issued from inside a script is **not** re-intercepted (a re-entrancy guard prevents recursion); note the guard is global, so an unrelated request fired during a script's `await` window is also passed through. On the XHR path a pre-script `setUrl`/`setMethod` re-opens the delegate before send.
- **DevTools Network panel cannot show override output.** The native Network panel taps the wire (below the `fetch`/XHR patch), so its Response tab shows the original upstream bytes. To see what the UI received: read the rendered page, the `[puredevtools]` console log, or call the endpoint from the DevTools console (`fetch(url).then(r => r.text()).then(console.log)`).
- **Page patch lands slightly after `document_start`.** The MAIN-world fetch/XHR patch is loaded as an ES module, so a request fired in the first microtask of page load can bypass it. Inherent to MV3 module content scripts.
- **XHR support (page layer):** asynchronous XHR only; consumers using `xhr.addEventListener('load', ...)` instead of `xhr.onload` are not notified in v1; `responseType` json/blob, `responseURL`, and `statusText` are not emulated.
- **URL matching:** both glob (`*`, `?`) and regex are supported. Relative request URLs (e.g. a page fetching `/base/api?x=1`) are resolved against the page origin before matching, so a rule can use the full `https://host/...` URL regardless of how the page calls `fetch`/XHR.
- **Rule precedence:** within a single request, the first enabled rule that matches wins; overrides from later matching rules are not accumulated in v1. Precedence is the depth-first, top-to-bottom order of the sidebar tree (a folder's rules occupy the folder's slot), so reordering or moving a rule between folders changes which rule wins.
