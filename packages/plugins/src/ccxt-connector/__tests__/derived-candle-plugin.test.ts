// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The decorator has to satisfy the same streaming contract the shared shell
 * does — snapshot first, replay for late joiners, refcounted synchronous
 * release, refusals thrown synchronously — while its candles come from a
 * different capability than the one being subscribed. These are those cases,
 * driven against a fake connector so no socket and no ccxt are involved.
 */

import { describe, expect, it } from 'bun:test'
import { PlatformRestrictedError } from '@pairlens/market-engine/errors'
import { withDerivedCandles } from '../derived-candle-plugin'
import type { LiveCandleSource } from '../derived-candle-plugin'
import type { Candle } from '@pairlens/shared/types'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const BASE_TS = Date.UTC(2026, 7, 10, 12)

const context: PluginExecuteParams['context'] = {
  pair: 'BTC-USD',
  market: 'coinbase',
  timeframe: '1m',
  mode: 'paper',
  country: '',
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function bar(ts: number, close: number, volume = 1): Candle {
  return { ts, open: close, high: close, low: close, close, volume }
}

type FakeBase = {
  plugin: PluginInstance
  historyCalls: Array<Record<string, unknown>>
  subscribeCalls: Array<PluginExecuteParams>
  releases: number
  emit: (payload: unknown) => void
  history: (params: Record<string, unknown>) => Array<Candle>
}

function fakeBase(
  overrides: {
    history?: (params: Record<string, unknown>) => Array<Candle>
    onSubscribe?: (params: PluginExecuteParams) => void
  } = {},
): FakeBase {
  const state: FakeBase = {
    historyCalls: [],
    subscribeCalls: [],
    releases: 0,
    emit: () => {},
    history: overrides.history ?? (() => []),
    plugin: {} as PluginInstance,
  }

  state.plugin = {
    manifest: { id: 'fake' } as PluginInstance['manifest'],
    status: 'active',
    config: {},
    execute: async (params) => {
      if (params.capability !== 'market-data:history') return []
      state.historyCalls.push(params.params)
      return state.history(params.params)
    },
    subscribe: (params, callback) => {
      overrides.onSubscribe?.(params)
      state.subscribeCalls.push(params)
      state.emit = callback
      return () => {
        state.releases++
      }
    },
    destroy: async () => {},
  }
  return state
}

const tradesLive = (): LiveCandleSource => ({ kind: 'trades' })

describe('withDerivedCandles — trade-driven candles', () => {
  it('emits the REST snapshot first, then live updates', async () => {
    const base = fakeBase({ history: () => [bar(BASE_TS - MINUTE, 99, 5)] })
    const plugin = withDerivedCandles(base.plugin, {
      liveSource: tradesLive,
      rollCheckMs: 0,
      reconcileDelayMs: 0,
    })

    const frames: Array<{ type: string; candles: Array<Candle> }> = []
    plugin.subscribe?.(
      {
        capability: 'market-data:candles',
        params: { pair: 'BTC-USD', timeframe: '1m' },
        context,
      },
      (data) => frames.push(data as (typeof frames)[number]),
    )

    // The tape is live before the backfill resolves — the real ordering.
    base.emit({
      type: 'update',
      trades: [{ id: '1', price: 100, size: 2, side: 'buy', ts: BASE_TS }],
    })
    await flush()

    expect(base.subscribeCalls[0]?.capability).toBe('market-data:trades')
    expect(frames[0]?.type).toBe('update')
    expect(frames.some((f) => f.type === 'snapshot')).toBe(true)

    const snapshot = frames.find((f) => f.type === 'snapshot')
    // The backfilled bar and the bar the tape opened both survive the merge.
    expect(snapshot?.candles.map((c) => c.ts)).toEqual([
      BASE_TS - MINUTE,
      BASE_TS,
    ])
    expect(snapshot?.candles[1]?.close).toBe(100)
  })

  it('closes a bar when a print lands in the next bucket', async () => {
    const base = fakeBase()
    const plugin = withDerivedCandles(base.plugin, {
      liveSource: tradesLive,
      rollCheckMs: 0,
      reconcileDelayMs: 0,
    })
    const frames: Array<{ type: string; candles: Array<Candle> }> = []
    plugin.subscribe?.(
      {
        capability: 'market-data:candles',
        params: { pair: 'BTC-USD', timeframe: '1m' },
        context,
      },
      (data) => frames.push(data as (typeof frames)[number]),
    )
    await flush()

    base.emit({
      type: 'update',
      trades: [{ id: '1', price: 100, size: 1, side: 'buy', ts: BASE_TS }],
    })
    base.emit({
      type: 'update',
      trades: [
        { id: '2', price: 101, size: 1, side: 'sell', ts: BASE_TS + MINUTE },
      ],
    })

    const last = frames[frames.length - 1]
    expect(last?.candles.map((c) => c.ts)).toEqual([BASE_TS, BASE_TS + MINUTE])
    expect(last?.candles[1]?.open).toBe(101)
  })

  it('replays the snapshot to a late subscriber and refcounts the release', async () => {
    const base = fakeBase({ history: () => [bar(BASE_TS - MINUTE, 99)] })
    const plugin = withDerivedCandles(base.plugin, {
      liveSource: tradesLive,
      rollCheckMs: 0,
      reconcileDelayMs: 0,
    })
    const request: PluginExecuteParams = {
      capability: 'market-data:candles',
      params: { pair: 'BTC-USD', timeframe: '1m' },
      context,
    }
    const releaseFirst = plugin.subscribe?.(request, () => {})
    await flush()

    const late: Array<{ type: string }> = []
    const releaseLate = plugin.subscribe?.(request, (data) =>
      late.push(data as { type: string }),
    )
    expect(late[0]?.type).toBe('snapshot')
    // One underlying subscription for both callers.
    expect(base.subscribeCalls).toHaveLength(1)

    releaseFirst?.()
    releaseFirst?.()
    expect(base.releases).toBe(0)
    releaseLate?.()
    expect(base.releases).toBe(1)
  })

  it('re-reads a closed bar so the venue owns its volume, not the tape', async () => {
    let served: Array<Candle> = []
    const base = fakeBase({ history: () => served })
    const plugin = withDerivedCandles(base.plugin, {
      liveSource: tradesLive,
      rollCheckMs: 0,
      reconcileDelayMs: 1,
    })
    const frames: Array<{ type: string; candles: Array<Candle> }> = []
    plugin.subscribe?.(
      {
        capability: 'market-data:candles',
        params: { pair: 'BTC-USD', timeframe: '1m' },
        context,
      },
      (data) => frames.push(data as (typeof frames)[number]),
    )
    await flush()

    base.emit({
      type: 'update',
      trades: [{ id: '1', price: 100, size: 1, side: 'buy', ts: BASE_TS }],
    })
    // The venue counted 40 units in that minute; the tape only saw ours.
    served = [bar(BASE_TS, 100, 40)]
    base.emit({
      type: 'update',
      trades: [
        { id: '2', price: 101, size: 1, side: 'buy', ts: BASE_TS + MINUTE },
      ],
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    const repaired = frames
      .flatMap((f) => f.candles)
      .filter((c) => c.ts === BASE_TS)
      .pop()
    expect(repaired?.volume).toBe(40)
  })

  it('passes a refusal straight through, synchronously', () => {
    const base = fakeBase({
      onSubscribe: () => {
        throw new PlatformRestrictedError('Coinbase')
      },
    })
    const plugin = withDerivedCandles(base.plugin, {
      liveSource: tradesLive,
      rollCheckMs: 0,
    })
    expect(() =>
      plugin.subscribe?.(
        {
          capability: 'market-data:candles',
          params: { pair: 'BTC-USD', timeframe: '1m' },
          context,
        },
        () => {},
      ),
    ).toThrow('Coinbase is only available in the desktop app')
  })
})

describe('withDerivedCandles — folded timeframes', () => {
  it('builds 4h history out of chained 1h pages', async () => {
    const page = (params: Record<string, unknown>): Array<Candle> => {
      const endTs = (params['endTs'] as number | undefined) ?? BASE_TS + HOUR
      // 4 hourly bars per call, walking backwards from the cursor.
      return Array.from({ length: 4 }, (_, i) =>
        bar(endTs - (4 - i) * HOUR, 100 + i, 1),
      )
    }
    const base = fakeBase({ history: page })
    const plugin = withDerivedCandles(base.plugin, {
      historyFold: { '4h': '1h' },
      liveSource: tradesLive,
      maxSourcePages: 3,
      rollCheckMs: 0,
    })

    const rows = (await plugin.execute({
      capability: 'market-data:history',
      params: { pair: 'BTC-USD', timeframe: '4h', limit: 2 },
      context,
    })) as Array<Candle>

    expect(base.historyCalls.length).toBeGreaterThan(1)
    expect(base.historyCalls[0]?.['timeframe']).toBe('1h')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.ts % (4 * HOUR)).toBe(0)
  })

  it('stops paging when the venue replays its boundary bar', async () => {
    const base = fakeBase({ history: () => [bar(BASE_TS, 100)] })
    const plugin = withDerivedCandles(base.plugin, {
      historyFold: { '4h': '1h' },
      liveSource: tradesLive,
      maxSourcePages: 5,
      rollCheckMs: 0,
    })
    await plugin.execute({
      capability: 'market-data:history',
      params: { pair: 'BTC-USD', timeframe: '4h', limit: 100, endTs: BASE_TS },
      context,
    })
    expect(base.historyCalls).toHaveLength(1)
  })

  it('leaves a timeframe the venue serves itself alone', async () => {
    const base = fakeBase({ history: () => [bar(BASE_TS, 100)] })
    const plugin = withDerivedCandles(base.plugin, {
      historyFold: { '4h': '1h' },
      liveSource: (timeframe) =>
        timeframe === '4h'
          ? { kind: 'fold', source: '1h' }
          : { kind: 'passthrough' },
      rollCheckMs: 0,
    })
    plugin.subscribe?.(
      {
        capability: 'market-data:candles',
        params: { pair: 'BTC-USD', timeframe: '1h' },
        context,
      },
      () => {},
    )
    expect(base.subscribeCalls[0]?.capability).toBe('market-data:candles')
    expect(base.subscribeCalls[0]?.params['timeframe']).toBe('1h')

    await plugin.execute({
      capability: 'market-data:history',
      params: { pair: 'BTC-USD', timeframe: '1h', limit: 10 },
      context,
    })
    expect(base.historyCalls[0]?.['timeframe']).toBe('1h')
  })

  it('folds the underlying candle stream into the derived timeframe', async () => {
    const base = fakeBase()
    const plugin = withDerivedCandles(base.plugin, {
      historyFold: { '4h': '1h' },
      liveSource: () => ({ kind: 'fold', source: '1h' }),
      rollCheckMs: 0,
      reconcileDelayMs: 0,
    })
    const frames: Array<{ type: string; candles: Array<Candle> }> = []
    plugin.subscribe?.(
      {
        capability: 'market-data:candles',
        params: { pair: 'BTC-USD', timeframe: '4h' },
        context,
      },
      (data) => frames.push(data as (typeof frames)[number]),
    )
    await flush()

    expect(base.subscribeCalls[0]?.params['timeframe']).toBe('1h')
    const open = Date.UTC(2026, 7, 10, 8)
    base.emit({ type: 'update', candles: [bar(open, 100, 3)] })
    base.emit({ type: 'update', candles: [bar(open + HOUR, 110, 4)] })
    // The same hourly bar ticking again must replace its contribution.
    base.emit({ type: 'update', candles: [bar(open + HOUR, 120, 9)] })

    const last = frames[frames.length - 1]
    expect(last?.candles[0]).toEqual({
      ts: open,
      open: 100,
      high: 120,
      low: 100,
      close: 120,
      volume: 12,
    })
  })
})
