// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeAll, describe, expect, it, mock } from 'bun:test'

const viaRust: Array<string> = []

// Installed before ../http resolves its dynamic import, so restFetch picks this
// up as the Rust-side transport.
beforeAll(() => {
  void mock.module('@tauri-apps/plugin-http', () => ({
    fetch: (input: string | URL | Request) => {
      viaRust.push(String(input))
      return Promise.resolve(new Response('{}'))
    },
  }))
})

const { restFetch } = await import('../http')

const g = globalThis as {
  window?: unknown
  fetch: typeof globalThis.fetch
}
const hadWindow = 'window' in g
const originalWindow = g.window
const originalFetch = g.fetch

afterEach(() => {
  if (hadWindow) g.window = originalWindow
  else delete g.window
  g.fetch = originalFetch
  viaRust.length = 0
})

function stubPlatformFetch() {
  const calls: Array<string> = []
  g.fetch = ((input: string | URL | Request) => {
    calls.push(String(input))
    return Promise.resolve(new Response('{}'))
  }) as unknown as typeof globalThis.fetch
  return calls
}

describe('restFetch', () => {
  it('uses the platform fetch in a browser', async () => {
    g.window = {}
    const calls = stubPlatformFetch()
    await restFetch('https://api.bitvavo.com/v2/BTC-EUR/candles')
    expect(calls).toEqual(['https://api.bitvavo.com/v2/BTC-EUR/candles'])
    expect(viaRust).toEqual([])
  })

  it('uses the platform fetch outside a document (CLI)', async () => {
    delete g.window
    const calls = stubPlatformFetch()
    await restFetch('https://api.bitvavo.com/v2/BTC-EUR/candles')
    expect(calls.length).toBe(1)
    expect(viaRust).toEqual([])
  })

  // In `tauri dev` the connectors emit Vite-proxy paths. Those MUST stay on the
  // webview fetch: the Rust client has no origin to resolve a relative path
  // against, and the proxy is what avoids CORS there in the first place.
  it('keeps relative proxy paths on the platform fetch even inside Tauri', async () => {
    g.window = { __TAURI_INTERNALS__: {} }
    const calls = stubPlatformFetch()
    await restFetch('/__okx-eu/api/v5/market/candles?instId=BTC-USDT')
    expect(calls).toEqual(['/__okx-eu/api/v5/market/candles?instId=BTC-USDT'])
    expect(viaRust).toEqual([])
  })

  // The whole point: a packaged desktop build emits absolute origins, and
  // several exchanges send no Access-Control-Allow-Origin, so these must not go
  // through the webview.
  it('routes absolute URLs through the Rust plugin inside Tauri', async () => {
    g.window = { __TAURI_INTERNALS__: {} }
    const calls = stubPlatformFetch()
    const res = await restFetch('https://eea.okx.com/api/v5/market/candles')
    expect(res.ok).toBe(true)
    expect(viaRust).toEqual(['https://eea.okx.com/api/v5/market/candles'])
    expect(calls).toEqual([])
  })

  it('accepts URL and Request inputs', async () => {
    g.window = { __TAURI_INTERNALS__: {} }
    stubPlatformFetch()
    await restFetch(new URL('https://api.kucoin.com/api/v1/market/candles'))
    expect(viaRust).toEqual(['https://api.kucoin.com/api/v1/market/candles'])
  })
})
