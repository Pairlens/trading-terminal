// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The futures order path, where every mistake spends money.
 *
 * The rejections carry as much weight as the successes: a size the venue would
 * reinterpret, a reduce-only flag that got dropped, or a leverage that never
 * reached the account are all silent in a mock and expensive live.
 */

import { describe, expect, it } from 'bun:test'
import { normalizeCcxtOrder } from '../../ccxt-connector/orders'
import { fromFuturesSymbol } from '../futures-symbols'
import {
  buildCcxtFuturesOrderCall,
  normalizeCcxtPositions,
} from '../futures-orders'
import type { OrderParams } from '@pairlens/market-engine/types'

const VENUE = { displayName: 'Binance Futures' } as const

/** ccxt's `has` for a fully capable USD-M class. */
const FULL_HAS: Record<string, unknown> = {
  createTriggerOrder: true,
  createStopLossOrder: true,
  createTakeProfitOrder: true,
  createStopMarketOrder: true,
  setLeverage: true,
}

function order(over: Partial<OrderParams> = {}): OrderParams {
  return {
    market: 'binance-futures',
    pair: 'BTC-USDT-USDT',
    side: 'buy',
    type: 'market',
    size: '3',
    mode: 'live',
    ...over,
  }
}

describe('buildCcxtFuturesOrderCall', () => {
  it('addresses the perp symbol, settle leg included', () => {
    const call = buildCcxtFuturesOrderCall(order(), FULL_HAS, VENUE)
    expect(call).toMatchObject({ kind: 'order', symbol: 'BTC/USDT:USDT' })
  })

  it('passes the size through as a CONTRACT COUNT, untouched', () => {
    // Contracts, not base units — the terminal converts for display with
    // `contractSize`, and this number is what the venue receives.
    const call = buildCcxtFuturesOrderCall(
      order({ size: '17' }),
      FULL_HAS,
      VENUE,
    )
    expect(call).toMatchObject({ kind: 'order', amount: 17 })
  })

  it('refuses a quote-denominated order instead of reinterpreting the size', () => {
    // ccxt has no createMarketBuyOrderWithCost on a contract market, so the
    // number would otherwise ride through as a contract count meaning dollars.
    const call = buildCcxtFuturesOrderCall(
      order({ tgtCcy: 'quote_ccy' }),
      FULL_HAS,
      VENUE,
    )
    expect(call.kind).toBe('reject')
    expect(call.kind === 'reject' && call.error).toContain('contracts')
  })

  it('sets reduceOnly only when asked', () => {
    const plain = buildCcxtFuturesOrderCall(order(), FULL_HAS, VENUE)
    expect(plain.kind === 'order' && plain.params['reduceOnly']).toBeUndefined()

    const reducing = buildCcxtFuturesOrderCall(
      order({ side: 'sell', reduceOnly: true }),
      FULL_HAS,
      VENUE,
    )
    expect(reducing.kind === 'order' && reducing.params['reduceOnly']).toBe(
      true,
    )

    // An explicit false is not the same request as no flag on venues that
    // validate the field, so it is still omitted.
    const explicitFalse = buildCcxtFuturesOrderCall(
      order({ reduceOnly: false }),
      FULL_HAS,
      VENUE,
    )
    expect(
      explicitFalse.kind === 'order' && explicitFalse.params['reduceOnly'],
    ).toBeUndefined()
  })

  it('never carries leverage in the order payload — it is account state', () => {
    const call = buildCcxtFuturesOrderCall(
      order({ leverage: 20 }),
      FULL_HAS,
      VENUE,
    )
    expect(call.kind === 'order' && call.params['leverage']).toBeUndefined()
  })

  it('rejects a non-positive size and a priceless limit order', () => {
    expect(
      buildCcxtFuturesOrderCall(order({ size: '0' }), FULL_HAS, VENUE).kind,
    ).toBe('reject')
    expect(
      buildCcxtFuturesOrderCall(order({ size: 'abc' }), FULL_HAS, VENUE).kind,
    ).toBe('reject')
    expect(
      buildCcxtFuturesOrderCall(order({ type: 'limit' }), FULL_HAS, VENUE).kind,
    ).toBe('reject')
  })

  it('keeps the tp/sl semantic rather than collapsing it to a generic trigger', () => {
    // The generic `triggerPrice` becomes the venue's conditional-order default,
    // which on Binance inverts a take-profit's direction and is rejected live
    // with "would trigger immediately".
    const tp = buildCcxtFuturesOrderCall(
      order({
        type: 'limit',
        price: '70000',
        trigger: { triggerPrice: '71000', triggerType: 'tp' },
      }),
      FULL_HAS,
      VENUE,
    )
    expect(tp.kind === 'order' && tp.params['takeProfitPrice']).toBe(71000)

    const sl = buildCcxtFuturesOrderCall(
      order({
        type: 'limit',
        price: '60000',
        trigger: { triggerPrice: '59000', triggerType: 'sl' },
      }),
      FULL_HAS,
      VENUE,
    )
    expect(sl.kind === 'order' && sl.params['stopLossPrice']).toBe(59000)
  })

  it('refuses a trigger on a venue that has none, and a stop-market where unsupported', () => {
    const noTriggers = buildCcxtFuturesOrderCall(
      order({ trigger: { triggerPrice: '1', triggerType: 'sl' } }),
      {},
      VENUE,
    )
    expect(noTriggers.kind).toBe('reject')

    const noStopMarket = buildCcxtFuturesOrderCall(
      order({ trigger: { triggerPrice: '1', triggerType: 'sl' } }),
      { ...FULL_HAS, createStopMarketOrder: false },
      VENUE,
    )
    expect(noStopMarket.kind).toBe('reject')
    expect(noStopMarket.kind === 'reject' && noStopMarket.error).toContain(
      'limit price',
    )
  })

  it('carries the venue params and the idempotency key', () => {
    const call = buildCcxtFuturesOrderCall(
      order({ clientOrderId: 'pl-1' }),
      FULL_HAS,
      { ...VENUE, orderParams: { positionSide: 'BOTH' } },
    )
    expect(call.kind === 'order' && call.params).toMatchObject({
      positionSide: 'BOTH',
      clientOrderId: 'pl-1',
    })
  })
})

describe('normalizeCcxtOrder with the futures symbol mapper', () => {
  const raw = {
    id: '99',
    symbol: 'BTC/USDT:USDT',
    side: 'sell',
    type: 'limit',
    amount: 4,
    price: 65000,
    filled: 1,
    average: 65010,
    status: 'open',
    timestamp: 1_700_000_000_000,
  }

  const perp = (
    row: Record<string, unknown> = raw,
    fallbackPair = '',
  ): ReturnType<typeof normalizeCcxtOrder> =>
    normalizeCcxtOrder(row, fallbackPair, fromFuturesSymbol)

  it('keeps the settle leg, so a perp fill cannot land in the spot ledger slot', () => {
    expect(perp().pair).toBe('BTC-USDT-USDT')
    // The DEFAULT mapping is what the futures runtime must never inherit.
    expect(normalizeCcxtOrder(raw).pair).toBe('BTC-USDT')
  })

  it('keeps every other field on the shared mapping', () => {
    // The mapper is the only fork; the rest of the row must stay byte-identical
    // to the spot normalizer's, or the two drift silently.
    const { pair: _perpPair, ...rest } = perp()
    const { pair: _spotPair, ...spotRest } = normalizeCcxtOrder(raw)
    expect(rest).toEqual(spotRest)
  })

  it('splits open on fill progress, the way the position ledger reads it', () => {
    expect(perp().status).toBe('partially_filled')
    expect(perp({ ...raw, filled: 0 }).status).toBe('live')
    expect(perp({ ...raw, status: 'closed' }).status).toBe('filled')
  })

  it('treats a zero trigger price as no trigger', () => {
    expect(perp({ ...raw, triggerPrice: '0' }).triggerOrder).toBeUndefined()
    expect(perp({ ...raw, triggerPrice: '64000' }).triggerOrder).toBe(true)
  })

  it('falls back to the slot pair when the row carries no symbol', () => {
    expect(perp({ id: '1' }, 'ETH-USDT-USDT').pair).toBe('ETH-USDT-USDT')
  })
})

describe('normalizeCcxtPositions', () => {
  it('maps a ccxt position onto the terminal row, keyed three segments', () => {
    const [position] = normalizeCcxtPositions([
      {
        symbol: 'BTC/USDT:USDT',
        contracts: 3,
        contractSize: 0.001,
        side: 'long',
        entryPrice: 64000,
        markPrice: 64500,
        liquidationPrice: 32000,
        leverage: 10,
        unrealizedPnl: 1.5,
        notional: 193.5,
        marginMode: 'cross',
        timestamp: 1_700_000_000_000,
      },
    ])
    expect(position).toEqual({
      pair: 'BTC-USDT-USDT',
      side: 'long',
      contracts: 3,
      contractSize: 0.001,
      entryPrice: 64000,
      markPrice: 64500,
      liquidationPrice: 32000,
      leverage: 10,
      unrealizedPnl: 1.5,
      notionalUsd: 193.5,
      marginMode: 'cross',
      timestamp: 1_700_000_000_000,
    })
  })

  it('drops flat rows — venues answer with every symbol ever touched', () => {
    expect(
      normalizeCcxtPositions([
        { symbol: 'BTC/USDT:USDT', contracts: 0 },
        { symbol: 'ETH/USDT:USDT' },
      ]),
    ).toHaveLength(0)
  })

  it('reads the direction off `side`, and off the sign when a venue omits it', () => {
    const [signed] = normalizeCcxtPositions([
      { symbol: 'ETH/USDT:USDT', contracts: -8 },
    ])
    expect(signed).toMatchObject({ side: 'short', contracts: 8 })

    // `side` wins: a venue can report a positive count with an explicit short.
    const [declared] = normalizeCcxtPositions([
      { symbol: 'ETH/USDT:USDT', contracts: 8, side: 'short' },
    ])
    expect(declared).toMatchObject({ side: 'short', contracts: 8 })
  })

  it('omits fields the venue did not send rather than reporting them as zero', () => {
    const [sparse] = normalizeCcxtPositions([
      { symbol: 'SOL/USDT:USDT', contracts: 2 },
    ])
    expect(sparse).toEqual({
      pair: 'SOL-USDT-USDT',
      side: 'long',
      contracts: 2,
    })
  })

  it('ignores a margin mode it does not recognise', () => {
    const [row] = normalizeCcxtPositions([
      { symbol: 'SOL/USDT:USDT', contracts: 2, marginMode: 'portfolio' },
    ])
    expect(row?.marginMode).toBeUndefined()
  })
})
