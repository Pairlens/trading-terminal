// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Runtime detection for connector transport selection.
 *
 * Two DIFFERENT questions live here; conflating them is what broke connectors
 * on desktop, twice, in opposite directions:
 *
 * 1. "Can I reach the exchange through a Vite dev proxy?" — answered by
 *    `isDevProxyAvailable()`. The `/__okx-eu`, `/__bitvavo`, ... prefixes are
 *    declared in apps/terminal/vite.config.ts and therefore exist ONLY while
 *    the Vite dev server is serving the app. That is true in browser dev AND in
 *    `tauri dev` (the desktop webview loads from the dev server's URL), and
 *    false in every production build.
 * 2. "Am I inside the Tauri webview?" — answered by `isTauriRuntime()`, used
 *    for genuinely platform-specific behavior (WS transport choice).
 *
 * The proxy question is NOT the Tauri question. Connectors used to ask #2 as a
 * proxy for #1, via `!('__TAURI__' in window)` — a global Tauri never injects
 * here (`withGlobalTauri: false`, and tauri-codegen only emits the global API
 * bundle when that flag is true). That was wrong-but-harmless in `tauri dev`,
 * where the answer it accidentally produced (`true` → use the proxy) happens to
 * be correct, and wrong-and-fatal in a production desktop build, where it aimed
 * REST at a proxy path that resolves against `tauri://localhost`.
 *
 * Fixing the global to `__TAURI_INTERNALS__` corrected production but regressed
 * `tauri dev`: it started sending REST straight at exchange origins, and the
 * webview enforces CORS exactly like a browser. (`fetch` in a Tauri webview is
 * NOT CORS-exempt — only the Rust-side HTTP plugin is.) Several bundled venues
 * send no `Access-Control-Allow-Origin` at all — eea.okx.com, api.coinbase.com,
 * api.kucoin.com, api.bitfinex.com — so their history requests were blocked.
 *
 * Asking #1 directly is correct in all four environments: browser dev and
 * `tauri dev` get the proxy, production desktop and the CLI go direct.
 */

/** True inside the Tauri desktop webview (dev or production). */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** True in a real browser tab — i.e. not Tauri, not a worker, not node/bun. */
export function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && !isTauriRuntime()
}

/**
 * True when the app is served by the Vite dev server, so the `/__*` REST proxy
 * prefixes resolve. Connectors MUST use this — not `isBrowserRuntime()` — to
 * choose between a proxy prefix and the exchange origin.
 *
 * `import.meta.env` is absent outside Vite (the CLI runs under bun), hence the
 * defensive read; a document context is required because the proxy is served by
 * the same origin as the page.
 */
export function isDevProxyAvailable(): boolean {
  if (typeof window === 'undefined') return false
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env
  return env?.DEV === true
}
