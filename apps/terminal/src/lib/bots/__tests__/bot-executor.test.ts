// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it } from 'bun:test'

import {
  executeBotOrder,
  realizedPnl,
  simulatePaperFill,
} from '../bot-executor'
import { setBotOrderSource } from '../bot-order-source'
import type { BotOrderIntent } from '@pairlens/bot-engine/types'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorStrategySpec } from '@pairlens/shared/plugin-types'
import type { OrderResult } from '@pairlens/market-engine/types'
import { runBacktest } from '@/lib/indicators/backtest'

const START = 1_700_000_000_000
const MINUTE = 60_000

const makeBars = (opens: Array<number>): Array<ChartBar> =>
  opens.map((open, i) => ({
    ts: START + i * MINUTE,
    open,
    high: open,
    low: open,
    close: open,
    volume: 1,
  }))

const spec: CustomIndicatorStrategySpec = {
  initialCapital: 10_000,
  positionSize: 1,
  fee: 0.001,
  slippage: 0.002,
  allowShort: false,
}

const intent = (over: Partial<BotOrderIntent> = {}): BotOrderIntent => ({
  kind: 'enter',
  side: 'buy',
  targetSide: 'long',
  reason: 'signal-entry',
  barIndex: 0,
  ...over,
})

afterEach(() => {
  setBotOrderSource(null)
})

describe('simulatePaperFill', () => {
  it('moves the price against the order and charges the notional fee', () => {
    const buy = simulatePaperFill(100, 'buy', 2, spec)
    expect(buy.price).toBeCloseTo(100.2, 10)
    expect(buy.fee).toBeCloseTo(2 * 100.2 * 0.001, 10)

    const sell = simulatePaperFill(100, 'sell', 2, spec)
    expect(sell.price).toBeCloseTo(99.8, 10)
    expect(sell.fee).toBeCloseTo(2 * 99.8 * 0.001, 10)
  })

  it('treats a zero fee/slippage spec as a fill at the reference price', () => {
    const flat = { fee: 0, slippage: 0 }
    expect(simulatePaperFill(100, 'buy', 1, flat)).toEqual({
      price: 100,
      fee: 0,
    })
  })
})

describe('paper fills agree with runBacktest', () => {
  // The claim the whole feature rests on: a paper bot and the Strategy Tester
  // book the same round trip identically. Anything else and "backtested +12%"
  // stops meaning anything about the bot the user actually ran.
  it('books the same P&L for the same round trip', async () => {
    const bars = makeBars([100, 110, 120, 130])
    // Long on bar 0 and 1, flat after: the tester enters at bars[1].open and
    // exits at bars[3].open — signal on bar i, fill on bar i+1.
    const result = runBacktest(
      bars,
      { position: Float64Array.from([1, 1, 0, 0]) },
      spec,
    )
    const trade = result.trades[0]
    expect(trade.exitIndex).toBe(3)

    const entry = await executeBotOrder({
      botId: 'b1',
      mode: 'paper',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: trade.quantity,
      referencePrice: bars[1].open,
      spec,
    })
    const exit = await executeBotOrder({
      botId: 'b1',
      mode: 'paper',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent({ kind: 'exit', side: 'sell', targetSide: null }),
      quantity: trade.quantity,
      referencePrice: bars[3].open,
      spec,
    })
    if (!entry.ok || !exit.ok) throw new Error('paper fills must succeed')

    expect(entry.price).toBeCloseTo(trade.entryPrice, 10)
    expect(exit.price).toBeCloseTo(trade.exitPrice ?? 0, 10)

    const pnl = realizedPnl({
      direction: 1,
      entryPrice: entry.price,
      exitPrice: exit.price,
      quantity: trade.quantity,
      entryFee: entry.fee,
      exitFee: exit.fee,
    })
    expect(pnl).toBeCloseTo(trade.pnl, 8)
  })

  it('matches a short round trip too', async () => {
    const bars = makeBars([100, 90, 80, 70])
    const shortSpec = { ...spec, allowShort: true }
    const result = runBacktest(
      bars,
      { position: Float64Array.from([-1, -1, 0, 0]) },
      shortSpec,
    )
    const trade = result.trades[0]
    expect(trade.direction).toBe('short')

    const entry = await executeBotOrder({
      botId: 'b1',
      mode: 'paper',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent({ side: 'sell', targetSide: 'short' }),
      quantity: trade.quantity,
      referencePrice: bars[1].open,
      spec: shortSpec,
    })
    const exit = await executeBotOrder({
      botId: 'b1',
      mode: 'paper',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent({ kind: 'exit', side: 'buy', targetSide: null }),
      quantity: trade.quantity,
      referencePrice: bars[3].open,
      spec: shortSpec,
    })
    if (!entry.ok || !exit.ok) throw new Error('paper fills must succeed')

    const pnl = realizedPnl({
      direction: -1,
      entryPrice: entry.price,
      exitPrice: exit.price,
      quantity: trade.quantity,
      entryFee: entry.fee,
      exitFee: exit.fee,
    })
    expect(pnl).toBeCloseTo(trade.pnl, 8)
  })
})

describe('executeBotOrder refusals', () => {
  it('refuses a zero size and a missing price without touching the venue', async () => {
    let calls = 0
    setBotOrderSource({
      placeOrder: async () => {
        calls += 1
        return { success: true }
      },
      fetchHistory: async () => [],
      getLastPrice: () => null,
    })

    const zero = await executeBotOrder({
      botId: 'b1',
      mode: 'live',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 0,
      referencePrice: 100,
      spec,
      credentialId: 'cred-1',
    })
    const priceless = await executeBotOrder({
      botId: 'b1',
      mode: 'live',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 1,
      referencePrice: 0,
      spec,
      credentialId: 'cred-1',
    })

    expect(zero.ok).toBe(false)
    expect(priceless.ok).toBe(false)
    expect(calls).toBe(0)
  })

  it('refuses live without a credential, and paper needs none', async () => {
    setBotOrderSource({
      placeOrder: async () => ({ success: true }),
      fetchHistory: async () => [],
      getLastPrice: () => null,
    })
    const live = await executeBotOrder({
      botId: 'b1',
      mode: 'live',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 1,
      referencePrice: 100,
      spec,
    })
    expect(live).toEqual({ ok: false, error: 'No credential for this venue' })

    const paper = await executeBotOrder({
      botId: 'b1',
      mode: 'paper',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 1,
      referencePrice: 100,
      spec,
    })
    expect(paper.ok).toBe(true)
  })

  it('reports a venue rejection and a thrown risk-guard lock the same way', async () => {
    setBotOrderSource({
      placeOrder: async (params) =>
        params.side === 'buy'
          ? { success: false, error: 'insufficient balance' }
          : Promise.reject(new Error('Orders are locked')),
      fetchHistory: async () => [],
      getLastPrice: () => null,
    })

    const rejected = await executeBotOrder({
      botId: 'b1',
      mode: 'live',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 1,
      referencePrice: 100,
      spec,
      credentialId: 'cred-1',
    })
    const thrown = await executeBotOrder({
      botId: 'b1',
      mode: 'live',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent({ side: 'sell', kind: 'exit', targetSide: null }),
      quantity: 1,
      referencePrice: 100,
      spec,
      credentialId: 'cred-1',
    })

    expect(rejected).toEqual({ ok: false, error: 'insufficient balance' })
    expect(thrown).toEqual({ ok: false, error: 'Orders are locked' })
  })
})

describe('live order serialization', () => {
  // pluginManager.setContext() is global state set immediately before
  // execute(). Two bots submitting at once would interleave those statements
  // and route one order to the other's venue, so live submissions must never
  // overlap — whatever else is in flight.
  it('never overlaps two live submissions, and preserves their order', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const seen: Array<string> = []

    setBotOrderSource({
      placeOrder: async (params): Promise<OrderResult> => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        seen.push(String(params.market))
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return { success: true, orderId: `o-${seen.length}` }
      },
      fetchHistory: async () => [],
      getLastPrice: () => null,
    })

    const submit = (market: string) =>
      executeBotOrder({
        botId: market,
        mode: 'live',
        market,
        pair: 'BTC-USDT',
        intent: intent(),
        quantity: 1,
        referencePrice: 100,
        spec,
        credentialId: 'cred-1',
      })

    const results = await Promise.all([
      submit('okx'),
      submit('binance'),
      submit('kraken'),
    ])

    expect(maxInFlight).toBe(1)
    expect(seen).toEqual(['okx', 'binance', 'kraken'])
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('keeps the chain alive after a failure', async () => {
    let call = 0
    setBotOrderSource({
      placeOrder: async () => {
        call += 1
        if (call === 1) throw new Error('venue exploded')
        return { success: true, orderId: 'o-2' }
      },
      fetchHistory: async () => [],
      getLastPrice: () => null,
    })

    const submit = () =>
      executeBotOrder({
        botId: 'b1',
        mode: 'live',
        market: 'okx',
        pair: 'BTC-USDT',
        intent: intent(),
        quantity: 1,
        referencePrice: 100,
        spec,
        credentialId: 'cred-1',
      })

    const [first, second] = await Promise.all([submit(), submit()])
    expect(first).toEqual({ ok: false, error: 'venue exploded' })
    expect(second.ok).toBe(true)
  })

  it('does not queue paper fills behind a slow live order', async () => {
    let released = () => {}
    const gate = new Promise<void>((resolve) => {
      released = resolve
    })
    setBotOrderSource({
      placeOrder: async () => {
        await gate
        return { success: true, orderId: 'o-1' }
      },
      fetchHistory: async () => [],
      getLastPrice: () => null,
    })

    const live = executeBotOrder({
      botId: 'live',
      mode: 'live',
      market: 'okx',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 1,
      referencePrice: 100,
      spec,
      credentialId: 'cred-1',
    })
    // Resolves while the live order is still blocked on the gate.
    const paper = await executeBotOrder({
      botId: 'paper',
      mode: 'paper',
      market: 'binance',
      pair: 'BTC-USDT',
      intent: intent(),
      quantity: 1,
      referencePrice: 100,
      spec,
    })
    expect(paper.ok).toBe(true)

    released()
    expect((await live).ok).toBe(true)
  })
})
