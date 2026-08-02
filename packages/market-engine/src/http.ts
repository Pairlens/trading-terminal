// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * REST transport for connectors.
 *
 * A Tauri webview enforces CORS exactly like a browser — only the Rust side is
 * exempt. Several bundled exchanges send no `Access-Control-Allow-Origin` at
 * all (OKX EEA, Coinbase Advanced Trade, KuCoin, Bitfinex, MEXC, Gate, HTX), so
 * from a packaged desktop build their history/trading endpoints are unreachable
 * over webview `fetch`. `restFetch` routes those calls through
 * `@tauri-apps/plugin-http`, which performs the request in Rust.
 *
 * Only ABSOLUTE http(s) URLs are re-routed. In `tauri dev` the connectors emit
 * relative Vite-proxy paths (`/__okx-eu/...`) which must stay on webview fetch
 * so the dev server proxies them — the Rust client has no origin to resolve a
 * relative path against. See ./platform for how that choice is made.
 *
 * Reachable hosts are pinned by the `http:default` scope in the desktop app's
 * capabilities/default.json — this is not an open egress hole. The plugin
 * sandbox worker has no Tauri IPC at all, so sandboxed third-party plugins
 * cannot reach this path and remain bound by the document CSP.
 *
 * Connector REST modules consume it as a drop-in, keeping call sites unchanged:
 *   import { restFetch as fetch } from '@pairlens/market-engine/http'
 */

import { isTauriRuntime } from './platform'

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

/** Resolved once and reused; null means the plugin is unavailable. */
let tauriFetch: Promise<FetchLike | null> | null = null

function loadTauriFetch(): Promise<FetchLike | null> {
  return import('@tauri-apps/plugin-http')
    .then((mod) => (mod.fetch as FetchLike | undefined) ?? null)
    .catch(() => null)
}

function isAbsoluteHttpUrl(input: string | URL | Request): boolean {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  return /^https?:\/\//i.test(url)
}

/**
 * `fetch` that goes through the Tauri HTTP plugin on desktop for absolute
 * URLs, and through the platform `fetch` everywhere else. Falls back to the
 * platform `fetch` if the plugin cannot be loaded, so a missing/denied plugin
 * degrades to today's behavior rather than failing the request outright.
 */
export const restFetch: FetchLike = async (input, init) => {
  if (!isTauriRuntime() || !isAbsoluteHttpUrl(input)) {
    return globalThis.fetch(input as RequestInfo, init)
  }
  tauriFetch ??= loadTauriFetch()
  const viaRust = await tauriFetch
  if (!viaRust) return globalThis.fetch(input as RequestInfo, init)
  return viaRust(input, init)
}
