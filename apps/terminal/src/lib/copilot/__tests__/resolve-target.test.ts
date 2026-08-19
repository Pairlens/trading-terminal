// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What "this pair" resolves to when nobody said.
 *
 * Every market tool defaults its arguments through here, so the fallback at
 * the bottom of it is the difference between "I read the market you are on"
 * and "I read BTC-USDT and did not mention it". It cannot be removed without
 * breaking every tool's optional arguments, so it is flagged instead, and the
 * one caller where a wrong instrument is not merely wrong refuses outright.
 */
import { describe, expect, test } from 'bun:test'

import { resolveTarget } from '../tool-deps'
import { buildTradingTools } from '../trading-tools'
import type { CopilotContextInfo, CopilotToolDeps } from '../tool-deps'

function deps(focus: CopilotContextInfo): CopilotToolDeps {
  return {
    getCtx: () => null,
    getContextInfo: () => focus,
    getMarketData: () => null,
    pluginManager: {} as CopilotToolDeps['pluginManager'],
    getChartSnapshot: () => null,
  }
}

const call = (tool: unknown, args: unknown) =>
  (
    tool as {
      execute: (a: unknown, o: unknown) => Promise<Record<string, unknown>>
    }
  ).execute(args, { toolCallId: 't', messages: [] } as never)

describe('resolveTarget', () => {
  test('takes the instrument on screen when the model names none', () => {
    const target = resolveTarget(
      deps({ market: 'polymarket', pair: 'AOC-YES' }),
      {},
    )
    expect(target).toEqual({
      market: 'polymarket',
      pair: 'AOC-YES',
      timeframe: '1h',
    })
    // A real instrument is never flagged, whatever asset class it belongs to.
    expect(target.assumed).toBeUndefined()
  })

  test('an explicit pair wins over the screen', () => {
    const target = resolveTarget(deps({ market: 'okx', pair: 'BTC-USDT' }), {
      pair: 'eth/usdt',
      market: 'BINANCE',
    })
    expect(target.market).toBe('binance')
    expect(target.pair).toBe('ETH-USDT')
    expect(target.assumed).toBeUndefined()
  })

  test('flags the fallback when nothing names an instrument', () => {
    const target = resolveTarget(deps({}), {})
    // The tools still work: the fallback is what keeps every pair argument
    // optional. But it travels with a flag, so an answer about BTC can be
    // told apart from an answer about what the user is looking at.
    expect(target.pair).toBe('BTC-USDT')
    expect(target.assumed).toBe(true)
  })

  test('a venue with no leg yet is still a fallback pair', () => {
    // A prediction desk mid-resolve: the venue is known, the tradeable leg
    // is not. Half a target is not a target.
    expect(resolveTarget(deps({ market: 'kalshi' }), {}).assumed).toBe(true)
  })
})

describe('trading on an assumed target', () => {
  test('place_order refuses rather than proposing BTC-USDT', async () => {
    const tools = buildTradingTools(deps({}))
    const result = await call(tools.place_order, { side: 'buy', size: 1 })

    // One click from live is the wrong place to guess an instrument.
    expect(result.status).toBe('invalid')
    expect(String(result.error)).toContain('nothing on screen names one')
    expect(result.order).toBeUndefined()
  })

  test('place_order proposes normally once something names the pair', async () => {
    const tools = buildTradingTools(deps({ market: 'okx', pair: 'BTC-USDT' }))
    const result = await call(tools.place_order, { side: 'buy', size: 1 })

    expect(result.status).toBe('awaiting_confirmation')
    expect((result.order as Record<string, unknown>).pair).toBe('BTC-USDT')
  })

  test('cancel_order refuses the same way', async () => {
    const tools = buildTradingTools(deps({}))
    const result = await call(tools.cancel_order, { orderId: 'abc' })

    expect(result.status).toBe('invalid')
    expect(result.cancel).toBeUndefined()
  })
})
