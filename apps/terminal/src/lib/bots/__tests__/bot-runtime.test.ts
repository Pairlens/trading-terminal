// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import type { BotDefinition } from '@pairlens/bot-engine/types'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { PluginManager } from '@pairlens/plugin-system'

// Minimal localStorage backing — the stores and the region setting read it
// lazily, so installing it before the runtime imports is enough.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

// ── Python is mocked: the real runtime needs a browser and a Pyodide worker ──

type ComputeCall = { botId: string; bars: Array<ChartBar> }

const computeCalls: Array<ComputeCall> = []
/** Target the fake script reports for the LAST bar of whatever window it gets. */
let lastBarTarget = 0
let computeFails: string | null = null
let computeDelay: Promise<void> | null = null

class FakeBusyError extends Error {}

mock.module('../bot-python', () => ({
  BOT_WINDOW_BARS: 500,
  BOT_COMPUTE_TIMEOUT_MS: 10_000,
  BotComputeBusyError: FakeBusyError,
  botScriptKey: (botId: string) => `bot:${botId}`,
  disposeBotScript: async () => {},
  resetBotPythonState: () => {},
  computeBotOutputs: async (request: {
    botId: string
    bars: Array<ChartBar>
  }) => {
    computeCalls.push({ botId: request.botId, bars: request.bars.slice() })
    if (computeDelay) await computeDelay
    if (computeFails) throw new Error(computeFails)
    const position = new Float64Array(request.bars.length)
    if (position.length > 0) position[position.length - 1] = lastBarTarget
    return { position }
  },
}))

const { BotRuntime } = await import('../bot-runtime')
const { setBotOrderSource } = await import('../bot-order-source')
const { useBotRunsStore } = await import('@/stores/bot-runs-store')
const { useBotsStore } = await import('@/stores/bots-store')
const { useCredentialsStore } = await import('@/stores/credentials-store')
const { useIndicatorScriptsStore } =
  await import('@/stores/indicator-scripts-store')

const START = 1_700_000_000_000
const HOUR = 3_600_000
const BOT_ID = 'bot-1'

const bar = (index: number, price: number): ChartBar => ({
  ts: START + index * HOUR,
  open: price,
  high: price + 1,
  low: price - 1,
  close: price,
  volume: 1,
})

const meta: CustomIndicatorMeta = {
  id: 'test-strategy',
  title: 'Test Strategy',
  pane: 'overlay',
  inputs: [],
  series: [],
  strategy: {
    initialCapital: 10_000,
    positionSize: 1,
    fee: 0,
    slippage: 0,
    allowShort: false,
  },
}

const definition = (over: Partial<BotDefinition> = {}): BotDefinition => ({
  id: BOT_ID,
  name: 'Test bot',
  scriptId: 'script-1',
  params: {},
  market: 'okx',
  pair: 'BTC-USDT',
  timeframe: '1h',
  mode: 'paper',
  sizing: { kind: 'percent-equity', value: 0.1 },
  guards: {},
  enabled: true,
  createdAt: START,
  updatedAt: START,
  ...over,
})

let feed: ((data: unknown) => void) | null = null
let unsubscribed = 0

const manager = {
  setContext: () => {},
  subscribe: (
    _capability: string,
    _params: Record<string, unknown>,
    callback: (data: unknown) => void,
  ) => {
    feed = callback
    return () => {
      unsubscribed += 1
    }
  },
} as unknown as PluginManager

/** Let the runtime's async bar-close pipeline settle. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const push = async (type: string, candles: Array<ChartBar>): Promise<void> => {
  feed?.({ type, candles })
  await flush()
}

const run = () => useBotRunsStore.getState().getRun(BOT_ID)

let runtime: InstanceType<typeof BotRuntime>

beforeEach(() => {
  computeCalls.length = 0
  lastBarTarget = 0
  computeFails = null
  computeDelay = null
  feed = null
  unsubscribed = 0

  useIndicatorScriptsStore.setState({
    scripts: [
      {
        id: 'script-1',
        name: 'Test Strategy',
        source: 'meta = strategy()',
        meta,
        metaError: null,
        createdAt: START,
        updatedAt: START,
      },
    ],
    loaded: true,
  })
  useBotsStore.setState({ bots: [definition()], loaded: true })
  useBotRunsStore.setState({ runs: {}, loaded: true })
  useCredentialsStore.setState({ credentials: [], loaded: true })

  setBotOrderSource({
    placeOrder: async () => ({ success: true, orderId: 'o-1' }),
    fetchHistory: async () => [],
    getLastPrice: () => null,
  })

  runtime = new BotRuntime()
})

afterEach(() => {
  runtime.stop()
  setBotOrderSource(null)
})

describe('subscription reconciliation', () => {
  it('subscribes enabled bots and drops them when disabled', async () => {
    runtime.start(manager)
    expect(feed).not.toBeNull()
    expect(run().status).toBe('warming-up')

    useBotsStore.getState().setEnabled(BOT_ID, false)
    await flush()
    expect(unsubscribed).toBe(1)
    expect(run().status).toBe('stopped')
  })

  it('never starts a bot that is waiting to be re-armed', () => {
    useBotsStore.setState({
      bots: [definition({ enabled: true, needsRearm: true })],
      loaded: true,
    })
    runtime.start(manager)
    expect(feed).toBeNull()
  })

  it('refuses to run live without a credential for the venue', () => {
    useBotsStore.setState({
      bots: [definition({ mode: 'live' })],
      loaded: true,
    })
    runtime.start(manager)
    expect(feed).toBeNull()
    expect(run().status).toBe('error')
    expect(run().statusDetail).toContain('No live credential')
    // Halting must also disarm, so nothing resurrects it on the next reconcile.
    expect(useBotsStore.getState().bots[0].enabled).toBe(false)
  })

  it('resubscribes when the deployment moves to another market', async () => {
    runtime.start(manager)
    const first = feed
    useBotsStore.getState().updateBot(BOT_ID, { market: 'binance' })
    await flush()
    expect(unsubscribed).toBe(1)
    expect(feed).not.toBe(first)
  })
})

describe('bar-close gating', () => {
  it('seeds from a snapshot without deciding anything', async () => {
    runtime.start(manager)
    lastBarTarget = 1
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])

    // Every bar in a snapshot is history. Replaying it as signals would fire a
    // burst of orders at today's price for bars that closed days ago.
    expect(computeCalls).toHaveLength(0)
    expect(run().status).toBe('running')
    expect(run().position).toBeNull()
  })

  it('ignores ticks on the forming bar', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    await push('update', [{ ...bar(2, 102), close: 105 }])
    await push('update', [{ ...bar(2, 102), close: 107 }])
    expect(computeCalls).toHaveLength(0)
  })

  it('decides once, on the bar that just closed', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 1
    // A bar with a newer timestamp is the only "close" a connector gives us.
    await push('update', [bar(3, 110)])

    expect(computeCalls).toHaveLength(1)
    const window = computeCalls[0].bars
    // The window ends at the bar that closed; the forming bar is never in it.
    expect(window[window.length - 1].ts).toBe(bar(2, 102).ts)
    expect(window.some((b) => b.ts === bar(3, 110).ts)).toBe(false)
  })

  it('acts on the newest close only when a reconnect replays a gap', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101)])
    lastBarTarget = 0
    await push('snapshot', [bar(1, 101), bar(2, 102), bar(3, 103), bar(4, 104)])

    // Three bars closed at once; the older two are answers to prices that have
    // already moved on.
    expect(computeCalls).toHaveLength(1)
    const window = computeCalls[0].bars
    expect(window[window.length - 1].ts).toBe(bar(3, 103).ts)
  })

  it('skips a bar close while the previous one is still being evaluated', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101)])

    let release = () => {}
    computeDelay = new Promise<void>((resolve) => {
      release = resolve
    })
    feed?.({ type: 'update', candles: [bar(2, 102)] })
    await Promise.resolve()
    feed?.({ type: 'update', candles: [bar(3, 103)] })
    await Promise.resolve()
    release()
    await flush()

    expect(computeCalls).toHaveLength(1)
    expect(
      run().events.some((e) => e.message.includes('Skipped a bar close')),
    ).toBe(true)
  })
})

describe('decisions', () => {
  it('opens a paper position sized off the strategy equity', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 1
    await push('update', [bar(3, 110)])

    const position = run().position
    expect(position).not.toBeNull()
    expect(position?.side).toBe('long')
    // Fills at the NEXT bar's open — the first price that existed once the
    // signal did — and commits 10% of the 10,000 starting equity.
    expect(position?.entryPrice).toBe(110)
    expect(position?.quantity).toBeCloseTo(1000 / 110, 8)
    expect(run().trades).toHaveLength(1)
  })

  it('closes the position and books P&L when the target goes flat', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 1
    await push('update', [bar(3, 100)])
    lastBarTarget = 0
    await push('update', [bar(4, 120)])

    expect(run().position).toBeNull()
    const trade = run().trades[0]
    expect(trade.exitPrice).toBe(120)
    // 10 quote per unit gained, on 1000/100 units, no fees in this spec.
    expect(trade.pnl).toBeCloseTo((120 - 100) * (1000 / 100), 8)
    expect(run().realizedPnl).toBeCloseTo(trade.pnl ?? 0, 8)
    expect(run().guards.tradesToday).toBe(1)
  })

  it('does nothing when the target has not changed', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 0
    await push('update', [bar(3, 110)])
    expect(run().position).toBeNull()
    expect(run().trades).toHaveLength(0)
  })

  it('halts loudly when the script fails to compute', async () => {
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    computeFails = 'NameError: ema'
    await push('update', [bar(3, 110)])

    expect(run().status).toBe('error')
    expect(run().statusDetail).toContain('NameError')
    expect(useBotsStore.getState().bots[0].enabled).toBe(false)
    expect(unsubscribed).toBe(1)
  })
})

describe('guards', () => {
  it('stops the bot on a halting guard and says which one', async () => {
    useBotsStore.setState({
      bots: [definition({ guards: { maxConsecutiveLosses: 1 } })],
      loaded: true,
    })
    useBotRunsStore.getState().patchRun(BOT_ID, {
      guards: {
        realizedToday: -50,
        dayStartEquity: 10_000,
        tradesToday: 1,
        consecutiveLosses: 1,
        lastLossBarIndex: null,
      },
    })
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 1
    await push('update', [bar(3, 110)])

    expect(run().status).toBe('halted')
    expect(run().position).toBeNull()
    expect(run().events.some((e) => e.kind === 'guard-blocked')).toBe(true)
    expect(useBotsStore.getState().bots[0].enabled).toBe(false)
  })

  it('skips one signal — and keeps running — on a non-halting guard', async () => {
    useBotsStore.setState({
      bots: [definition({ guards: { maxTradesPerDay: 1 } })],
      loaded: true,
    })
    useBotRunsStore.getState().patchRun(BOT_ID, {
      guards: {
        realizedToday: 0,
        dayStartEquity: 10_000,
        tradesToday: 1,
        consecutiveLosses: 0,
        lastLossBarIndex: null,
      },
    })
    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 1
    await push('update', [bar(3, 110)])

    expect(run().status).toBe('running')
    expect(run().position).toBeNull()
    const blocked = run().events.find((e) => e.kind === 'guard-blocked')
    expect(blocked?.detail).toContain('trade-cap')
  })
})

describe('risk exits', () => {
  it('takes a protective exit before consulting the strategy', async () => {
    const stopMeta: CustomIndicatorMeta = {
      ...meta,
      strategy: { ...meta.strategy!, risk: { stopLoss: 0.05 } },
    }
    useIndicatorScriptsStore.setState({
      scripts: [
        {
          id: 'script-1',
          name: 'Test Strategy',
          source: 'meta = strategy()',
          meta: stopMeta,
          metaError: null,
          createdAt: START,
          updatedAt: START,
        },
      ],
      loaded: true,
    })

    runtime.start(manager)
    await push('snapshot', [bar(0, 100), bar(1, 101), bar(2, 102)])
    lastBarTarget = 1
    await push('update', [bar(3, 100)])
    expect(run().position?.entryPrice).toBe(100)

    // Bar 4 trades down through the 95 stop while the strategy still wants long.
    await push('update', [{ ...bar(4, 96), low: 90 }])
    const computesBefore = computeCalls.length
    // Bar 5 exists only to close bar 4, which is the bar the stop fired on.
    await push('update', [bar(5, 96)])

    expect(run().position).toBeNull()
    const trade = run().trades[0]
    expect(trade.exitReason).toBe('stop-loss')
    // Paper fills at the trigger level: a stop that filled at the close would
    // flatter every gap.
    expect(trade.exitPrice).toBeCloseTo(95, 8)
    // The strategy was never asked on the bar the stop fired.
    expect(computeCalls.length).toBe(computesBefore)
  })
})
