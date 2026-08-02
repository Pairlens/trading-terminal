// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'

import type { CandleArrays } from '@/lib/python/python-runtime'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'

type ComputeCall = {
  id: string
  candles: CandleArrays
  params: Record<string, unknown>
}

type RegisterCall = { id: string; source: string }

const registerCalls: Array<RegisterCall> = []
const computeCalls: Array<ComputeCall> = []
let computeImpl: (
  call: ComputeCall,
) => Promise<Record<string, Float64Array>> = async () => ({
  position: new Float64Array(0),
})

class FakePythonScriptError extends Error {}

const fakeRuntime = {
  registerScript: async (id: string, source: string) => {
    registerCalls.push({ id, source })
    return {}
  },
  compute: async (
    id: string,
    candles: CandleArrays,
    params: Record<string, unknown>,
  ) => {
    const call = { id, candles, params }
    computeCalls.push(call)
    return { outputs: await computeImpl(call), palettes: {}, durationMs: 1 }
  },
  disposeScript: async () => {},
}

mock.module('@/lib/python/python-runtime', () => ({
  getPythonRuntime: () => fakeRuntime,
  PythonScriptError: FakePythonScriptError,
}))

const {
  BOT_WINDOW_BARS,
  BotComputeBusyError,
  botScriptKey,
  computeBotOutputs,
  resetBotPythonState,
} = await import('../bot-python')

const START = 1_700_000_000_000
const MINUTE = 60_000

const makeBars = (count: number): Array<ChartBar> =>
  Array.from({ length: count }, (_, i) => ({
    ts: START + i * MINUTE,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1,
  }))

const request = (over: Partial<Parameters<typeof computeBotOutputs>[0]> = {}) =>
  ({
    botId: 'bot-1',
    source: 'meta = 1',
    modules: [],
    bars: makeBars(10),
    params: { length: 14 },
    pair: 'BTC-USDT',
    timeframe: '1h',
    ...over,
  }) as Parameters<typeof computeBotOutputs>[0]

afterEach(() => {
  resetBotPythonState()
  registerCalls.length = 0
  computeCalls.length = 0
  computeImpl = async () => ({ position: new Float64Array(0) })
})

describe('computeBotOutputs', () => {
  it('registers once per source and reuses the registration', async () => {
    await computeBotOutputs(request())
    await computeBotOutputs(request())
    expect(registerCalls).toHaveLength(1)
    expect(registerCalls[0].id).toBe(botScriptKey('bot-1'))
    expect(computeCalls).toHaveLength(2)
  })

  it('re-registers when the script source or a helper module changes', async () => {
    await computeBotOutputs(request())
    await computeBotOutputs(request({ source: 'meta = 2' }))
    await computeBotOutputs(
      request({
        source: 'meta = 2',
        modules: [{ path: 'helpers.py', source: 'x = 1' }],
      }),
    )
    expect(registerCalls).toHaveLength(3)
  })

  it('bounds the window it hands to Python', async () => {
    await computeBotOutputs(request({ bars: makeBars(BOT_WINDOW_BARS + 120) }))
    expect(computeCalls[0].candles.close).toHaveLength(BOT_WINDOW_BARS)
    // The newest bars survive the trim — a bot decides on the recent past.
    const bars = makeBars(BOT_WINDOW_BARS + 120)
    expect(computeCalls[0].candles.time[BOT_WINDOW_BARS - 1]).toBe(
      bars[bars.length - 1].ts,
    )
  })

  it('builds fresh transferable buffers on every call', async () => {
    // The runtime TRANSFERS these arrays, detaching ours. Reusing a buffer
    // would send an empty window on the second bar close.
    await computeBotOutputs(request())
    await computeBotOutputs(request())
    expect(computeCalls[0].candles.close).not.toBe(
      computeCalls[1].candles.close,
    )
  })

  it('refuses a second compute while one is in flight for the same bot', async () => {
    let release = () => {}
    computeImpl = async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { position: Float64Array.from([1]) }
    }
    const first = computeBotOutputs(request())
    // Give the queue a turn so the first call is really inside compute().
    await Promise.resolve()
    await Promise.resolve()
    await expect(computeBotOutputs(request())).rejects.toBeInstanceOf(
      BotComputeBusyError,
    )
    release()
    await first
  })

  it('queues a second bot behind the first rather than fanning out', async () => {
    // There is one Pyodide worker per window and it runs calls one at a time
    // anyway. Queuing here keeps a burst of bots closing the same 1m bar from
    // turning into a burst of parallel round-trips over the workbench's head.
    const order: Array<string> = []
    let release = () => {}
    const started = new Promise<void>((resolve) => {
      release = resolve
    })
    computeImpl = async (call) => {
      order.push(`start:${call.id}`)
      if (call.id === botScriptKey('bot-1')) await started
      order.push(`end:${call.id}`)
      return { position: Float64Array.from([1]) }
    }

    const first = computeBotOutputs(request())
    const second = computeBotOutputs(request({ botId: 'bot-2' }))
    // bot-2 must not have started while bot-1 holds the worker.
    await Promise.resolve()
    expect(order).not.toContain(`start:${botScriptKey('bot-2')}`)

    release()
    await Promise.all([first, second])
    expect(order).toEqual([
      `start:${botScriptKey('bot-1')}`,
      `end:${botScriptKey('bot-1')}`,
      `start:${botScriptKey('bot-2')}`,
      `end:${botScriptKey('bot-2')}`,
    ])
  })

  it('surfaces a script failure as a plain single-line error', async () => {
    computeImpl = async () => {
      throw new FakePythonScriptError('NameError: ema\n  File "main.py"')
    }
    await expect(computeBotOutputs(request())).rejects.toThrow('NameError: ema')
    // A failed run forgets its registration, so the next bar re-registers
    // rather than computing against a worker that may have been respawned.
    computeImpl = async () => ({ position: Float64Array.from([0]) })
    await computeBotOutputs(request())
    expect(registerCalls).toHaveLength(2)
  })

  it('gives up on a compute that never returns', async () => {
    // Python is synchronous inside the worker: a runaway loop wedges its
    // message loop, and without this the bot's bar-close handler would stay
    // pending forever and the bot would stop trading in silence.
    computeImpl = () => new Promise(() => {})
    await expect(computeBotOutputs(request({ timeoutMs: 20 }))).rejects.toThrow(
      /timed out/,
    )
  })
})
