// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it } from 'bun:test'
import {
  isBrowserRuntime,
  isCorsConstrained,
  isDevProxyAvailable,
  isTauriRuntime,
  isVenueRestBlocked,
} from '../platform'

const g = globalThis as { window?: unknown }
const hadWindow = 'window' in g
const originalWindow = g.window

afterEach(() => {
  if (hadWindow) g.window = originalWindow
  else delete g.window
})

describe('isTauriRuntime', () => {
  it('is false when there is no window (CLI / worker)', () => {
    delete g.window
    expect(isTauriRuntime()).toBe(false)
    expect(isBrowserRuntime()).toBe(false)
  })

  it('detects the desktop webview from __TAURI_INTERNALS__', () => {
    g.window = { __TAURI_INTERNALS__: {} }
    expect(isTauriRuntime()).toBe(true)
    expect(isBrowserRuntime()).toBe(false)
  })

  // Regression: the app sets withGlobalTauri=false, so Tauri never injects
  // window.__TAURI__. Detecting on it made connectors treat the desktop app as
  // a browser.
  it('detects the desktop webview even without the __TAURI__ global bundle', () => {
    g.window = { __TAURI_INTERNALS__: {} }
    expect('__TAURI__' in (g.window as object)).toBe(false)
    expect(isBrowserRuntime()).toBe(false)
  })

  it('treats a plain browser window as browser', () => {
    g.window = {}
    expect(isTauriRuntime()).toBe(false)
    expect(isBrowserRuntime()).toBe(true)
  })
})

describe('isDevProxyAvailable', () => {
  it('is false without a document — the CLI has no dev server to proxy through', () => {
    delete g.window
    expect(isDevProxyAvailable()).toBe(false)
  })

  // Regression: the Vite `/__*` proxy prefixes exist whenever the dev server
  // serves the app — including `tauri dev`, where the webview loads from the
  // dev server URL. Keying the proxy decision off "am I in Tauri" sent desktop
  // dev straight at exchange origins, and the webview enforces CORS: eea.okx
  // .com, api.coinbase.com, api.kucoin.com and api.bitfinex.com send no
  // Access-Control-Allow-Origin, so history requests were blocked.
  it('does not depend on whether the runtime is Tauri', () => {
    g.window = {}
    const inBrowser = isDevProxyAvailable()
    g.window = { __TAURI_INTERNALS__: {} }
    expect(isDevProxyAvailable()).toBe(inBrowser)
  })
})

// `import.meta.env.DEV` is undefined under bun, so these run as PRODUCTION
// builds — which is the environment matrix the hosted web terminal broke in.
describe('isCorsConstrained', () => {
  // Regression: the hosted web terminal is a production browser build with no
  // dev proxy and no Rust-side fetch, so plain `fetch` is subject to CORS.
  // eea.okx.com, us.okx.com, api.coinbase.com, api.kucoin.com, api.gateio.ws,
  // api-pub.bitfinex.com and api.mexc.com send no Access-Control-Allow-Origin,
  // so every REST call to them was blocked. That killed the candle backfill
  // while the CORS-exempt WS feeds kept streaming: the chart hung on
  // "Switching to OKX…" and settled on a single live candle.
  it('is true in a production browser build', () => {
    g.window = {}
    expect(isDevProxyAvailable()).toBe(false)
    expect(isCorsConstrained()).toBe(true)
  })

  // Desktop reaches exchanges through the Rust HTTP plugin, which is exempt.
  it('is false in a production desktop build', () => {
    g.window = { __TAURI_INTERNALS__: {} }
    expect(isCorsConstrained()).toBe(false)
  })

  it('is false without a document — no origin, so no CORS (CLI / worker)', () => {
    delete g.window
    expect(isCorsConstrained()).toBe(false)
  })

  // The dev server proxies `/__*` straight through, so dev is never
  // constrained — in either browser dev or `tauri dev`.
  it('is false wherever the dev proxy is available', () => {
    for (const win of [{}, { __TAURI_INTERNALS__: {} }]) {
      g.window = win
      if (isDevProxyAvailable()) expect(isCorsConstrained()).toBe(false)
    }
  })
})

describe('isVenueRestBlocked', () => {
  /**
   * The regression, and the only cell of the matrix `isCorsConstrained()` gets
   * wrong: browser dev, where a proxy exists for SOME venue. KuCoin Futures,
   * Kraken Futures and Kalshi have no `/__*` prefix of their own, so the gate
   * fell open and the funding matrix, the open-interest pane and the events
   * board each showed a bare `fetch failed` per venue.
   */
  it('blocks a proxy-less venue in browser dev, where a proxied one is fine', () => {
    g.window = {}
    expect(isVenueRestBlocked(true, true)).toBe(false)
    expect(isVenueRestBlocked(false, true)).toBe(true)
  })

  it('blocks both in a production browser build — no proxy exists at all', () => {
    g.window = {}
    expect(isVenueRestBlocked(true, false)).toBe(true)
    expect(isVenueRestBlocked(false, false)).toBe(true)
  })

  // Desktop reaches every venue through the Rust HTTP client, proxy or not.
  it('blocks nothing in the desktop webview', () => {
    g.window = { __TAURI_INTERNALS__: {} }
    expect(isVenueRestBlocked(false, false)).toBe(false)
    expect(isVenueRestBlocked(false, true)).toBe(false)
  })

  it('blocks nothing without a document — the CLI has no origin', () => {
    delete g.window
    expect(isVenueRestBlocked(false, false)).toBe(false)
  })

  // The proxied case is exactly the old question, so the fourteen spot venues
  // keep the behavior they were tuned against.
  it('agrees with isCorsConstrained for a proxied venue', () => {
    for (const win of [{}, { __TAURI_INTERNALS__: {} }]) {
      g.window = win
      expect(isVenueRestBlocked(true)).toBe(isCorsConstrained())
    }
  })
})
