// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { parsePoolTrade, parsePoolTrades } from '../pool-trades-client'
import type { RawGeckoTrade } from '../pool-trades-client'

/** A live `kind: 'sell'` print: base leaves the taker, quote comes back. */
const SELL: RawGeckoTrade = {
  id: 'solana_439663917_22uH9k_80_1786892650',
  attributes: {
    block_number: 439663917,
    tx_hash: '22uH9k',
    tx_from_address: 'FNwGAp3qvxhX8FBkZcDZ9FmdDCFpXpLjJt7gVtBbujTd',
    from_token_amount: '1276096.72241',
    to_token_amount: '0.863354804',
    price_from_in_usd: '0.000051013',
    price_to_in_usd: '75.402087',
    block_timestamp: '2026-08-16T15:04:05Z',
    kind: 'sell',
    volume_in_usd: '65.0987',
  },
}

const BUY: RawGeckoTrade = {
  id: 'solana_439663918_66ai6L_80_1786892657',
  attributes: {
    block_number: 439663918,
    tx_hash: '66ai6L',
    tx_from_address: 'G4YoD5w6katdxav3DLYb3qqVinYSaHo1TvwdUiToMXHN',
    from_token_amount: '6.00267017',
    to_token_amount: '8844947.91756',
    price_from_in_usd: '75.402087',
    price_to_in_usd: '0.0000511',
    block_timestamp: '2026-08-16T15:05:05Z',
    kind: 'buy',
    volume_in_usd: '452.6138',
  },
}

describe('parsePoolTrade', () => {
  it('reads a sell with the base leg on the FROM side', () => {
    const trade = parsePoolTrade(SELL)!
    expect(trade.side).toBe('sell')
    expect(trade.baseAmount).toBe(1276096.72241)
    expect(trade.quoteAmount).toBe(0.863354804)
    expect(trade.priceUsd).toBe(0.000051013)
    expect(trade.amountUsd).toBe(65.0987)
    expect(trade.wallet).toBe('FNwGAp3qvxhX8FBkZcDZ9FmdDCFpXpLjJt7gVtBbujTd')
    expect(trade.ts).toBe(Date.parse('2026-08-16T15:04:05Z'))
  })

  it('flips the legs on a buy', () => {
    // The whole reason this is tested: reading `from_token_amount` as the base
    // on both sides puts a quote amount in the size column on every buy, which
    // on a memecoin pair is off by six orders of magnitude and still plausible.
    const trade = parsePoolTrade(BUY)!
    expect(trade.side).toBe('buy')
    expect(trade.baseAmount).toBe(8844947.91756)
    expect(trade.quoteAmount).toBe(6.00267017)
    expect(trade.priceUsd).toBe(0.0000511)
  })

  it('drops a print with no timestamp or no notional', () => {
    expect(parsePoolTrade({ id: 'x', attributes: { kind: 'buy' } })).toBeNull()
    expect(parsePoolTrade({ attributes: SELL.attributes })).toBeNull()
  })
})

describe('parsePoolTrades', () => {
  it('sorts newest first', () => {
    const trades = parsePoolTrades([SELL, BUY])
    expect(trades.map((t) => t.id)).toEqual([BUY.id!, SELL.id!])
  })

  it('skips malformed rows instead of rendering blanks', () => {
    expect(parsePoolTrades([SELL, { id: 'broken' }]).length).toBe(1)
    expect(parsePoolTrades(undefined)).toEqual([])
  })
})
