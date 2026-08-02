// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it } from 'bun:test'
import {
  isBrowserRuntime,
  isDevProxyAvailable,
  isTauriRuntime,
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
