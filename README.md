# puredevtools

A minimal cross-browser (Chrome MV3 + Firefox) WebExtension for overriding the **response headers
and body** a page's `fetch`/`XHR` calls receive. One mechanism, identical behavior on both browsers.

## Install (development build)

```bash
npm install
npm run build:chrome    # -> dist/chrome
npm run build:firefox   # -> dist/firefox
```

Load unpacked:

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `dist/chrome`.
- Firefox: `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on -> `dist/firefox/manifest.json`.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev:chrome` / `npm run dev:firefox` | Watch-mode dev build for the given browser. |
| `npm run build:chrome` / `npm run build:firefox` | Production build -> `dist/chrome` / `dist/firefox`. |

## Usage

The **popup** shows a read-only rule tree and the global on/off switch; the **options page** is the
full editor. A rule matches by URL (glob or regex) and HTTP method, and has four editor tabs:

- **Match** - URL / method.
- **Request** - rewrite the request URL, `set`/`remove` request headers, rewrite the request body.
- **Response** - `set`/`remove` response headers, rewrite the response body (optional content-type).
- **Scripts** - pre-request / post-response JavaScript with a `req`/`res` object API and a `console`.

Rules live in nested folders and reorder by drag-and-drop; precedence follows the top-to-bottom
tree order. The real request is always forwarded and the original status preserved. Export/import
all rules to a JSON file. **Cookie sync** (a separate view) copies named cookies from a source URL
to a target URL on demand - manual only, `HttpOnly`-safe. The **puredevtools DevTools panel** logs
only the overridden requests for the inspected tab. Every surface is keyboard-driven with rebindable
shortcuts (options page Shortcuts view, Cmd/Ctrl+Shift+K).

**Limitations:** only `fetch`/`XHR` from page JavaScript are intercepted - not main-frame
navigation, sub-resource tags (`<img>`, `<script>`, `<link>`), or WebSocket traffic. Scripts run as
`AsyncFunction` in the page's context, so a page whose CSP omits `'unsafe-eval'` skips them
(graceful degrade; the declarative ops still apply).