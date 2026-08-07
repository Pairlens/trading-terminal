// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { queryInstruments } from '../catalog'

describe('bundled instrument catalog', () => {
  it('serves stocks under the bare ticker, like the App Server catalog', () => {
    // Both catalogs must agree on the key, or a watchlist built online turns
    // up empty the moment this offline fallback takes over.
    const page = queryInstruments('alpaca', {
      assetClass: 'stocks',
      limit: 200,
    })
    const symbols = page.items.map((i) => i.symbol)

    expect(symbols).toContain('AAPL')
    expect(symbols).toContain('SPY')
    expect(symbols.some((s) => s.endsWith('-USD'))).toBe(false)
    expect(page.items[0]?.quote).toBe('USD')
  })

  it('resolves a mixed symbol list for the watchlist pane', () => {
    const page = queryInstruments('okx', { symbols: 'BTC-USDT,AAPL,TSLA' })
    expect(page.items.map((i) => i.symbol).sort()).toEqual([
      'AAPL',
      'BTC-USDT',
      'TSLA',
    ])
  })
})
