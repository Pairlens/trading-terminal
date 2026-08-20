// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which instruments the Pair Info pane can ask about, and under what ticker.
 *
 * Pinned because the pane shipped reading the asset-class side table directly:
 * a pair that never passed through a picker had no entry, so MNT-USDT was
 * refused as an unsupported class and the pane rendered empty on every shared
 * link. The rule is now the class, and the class comes from the same resolver
 * the rest of the app navigates by.
 */
import { describe, expect, it } from 'bun:test'

import { tickerOverviewTarget } from '@/lib/ticker-overview'

describe('tickerOverviewTarget', () => {
  it('asks under the base leg of a spot pair', () => {
    expect(tickerOverviewTarget({ cls: 'spot', id: 'MNT-USDT' })).toEqual({
      ticker: 'X:MNTUSD',
      assetClass: 'crypto',
    })
  })

  it('treats a perp as the coin it tracks', () => {
    expect(tickerOverviewTarget({ cls: 'perp', id: 'ETH-USDT-USDT' })).toEqual({
      ticker: 'X:ETHUSD',
      assetClass: 'crypto',
    })
  })

  it('takes the bare ticker of an equity, however the connector spells it', () => {
    const bare = tickerOverviewTarget({ cls: 'stocks', id: 'AAPL' })
    expect(bare).toEqual({ ticker: 'AAPL', assetClass: 'stocks' })
    expect(tickerOverviewTarget({ cls: 'stocks', id: 'AAPL-USD' })).toEqual(
      bare,
    )
  })

  it('refuses a token: hundreds of them answer to one symbol', () => {
    expect(
      tickerOverviewTarget({
        cls: 'dex',
        market: 'base',
        id: '0xdac17f958d2ee523a2206206994597c13d831ec7-USDC',
      }),
    ).toBeNull()
  })

  it('refuses a prediction outcome: its name is a question', () => {
    expect(
      tickerOverviewTarget({
        cls: 'prediction',
        market: 'kalshi',
        id: 'KXBTCD-26AUG15-T53',
      }),
    ).toBeNull()
  })

  it('refuses an address that reached the pair arm by its dash', () => {
    expect(
      tickerOverviewTarget({
        cls: 'spot',
        id: '0xdac17f958d2ee523a2206206994597c13d831ec7-USDC',
      }),
    ).toBeNull()
  })
})
