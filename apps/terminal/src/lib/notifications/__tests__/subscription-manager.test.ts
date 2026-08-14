// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The subscription manager decides WHEN a notification event exists. It had no
// tests, which is how three bugs shipped together: candle rules fired on the
// stream snapshot instead of a close (and `CandleUpdate.type` has no 'close'
// member, so they never fired on a real one), `signal-generated` was emitted
// unconditionally with no strategy attached, and a rule's timeframe was used to
// pick a subscription but never checked when matching.
//
// These run the real evaluator and the real strategy engine — only the plugin
// manager is faked — so a regression in any of those layers surfaces here.
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import {
  clearRegistry,
  registerStepTypes,
} from '@pairlens/notification-engine/step-registry'
import type {
  NotificationBinding,
  NotificationRuleDSL,
} from '@pairlens/notification-engine/types'
import type { Candle } from '@pairlens/shared/types'
import type { PluginManager } from '@pairlens/plugin-system'
import type { NotificationLogEntry } from '../notification-runtime'

// Full localStorage backing, installed before the modules under test read it —
// region-settings and the cooldown store both touch it at import/call time.
const backing = new Map<string, string>()
const previousStorage = globalThis.localStorage as Storage | undefined
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

// The headless runner reaches into Pyodide; here we only care that the manager
// invokes it on a close, with the filters the rules asked for.
const headlessRuns: Array<{
  pair: string
  timeframe: string
  indicatorFilters: Array<string>
  barCount: number
}> = []

// `mock.module` is process-global and bun runs test files one after another in
// the same process, so the stub below becomes every later file's copy of this
// module. headless-indicator-alerts.test.ts is one of those files, and it
// tests exactly this module: left in place, its subject is silently replaced
// by a recorder that computes nothing. Worse, bun MERGES the stub into an
// already-loaded namespace, so that suite keeps a real
// resetHeadlessIndicatorAlertState and only loses runHeadlessIndicatorAlerts —
// no import error, just every assertion about work done coming back empty.
// Capture the genuine module first and put it back when this file is done.
const realHeadlessAlerts = {
  ...(await import('@/lib/indicators/headless-indicator-alerts')),
}
afterAll(() => {
  void mock.module(
    '@/lib/indicators/headless-indicator-alerts',
    () => realHeadlessAlerts,
  )
})

void mock.module('@/lib/indicators/headless-indicator-alerts', () => ({
  runHeadlessIndicatorAlerts: (run: {
    pair: string
    timeframe: string
    indicatorFilters: Array<string>
    bars: Array<Candle>
  }) => {
    headlessRuns.push({
      pair: run.pair,
      timeframe: run.timeframe,
      indicatorFilters: run.indicatorFilters,
      barCount: run.bars.length,
    })
    return Promise.resolve()
  },
}))

const { NotificationSubscriptionManager } =
  await import('../subscription-manager')
const { notificationRuntime } = await import('../notification-runtime')
const { useNotificationStore } = await import('@/stores/notification-store')

afterAll(() => {
  if (previousStorage) globalThis.localStorage = previousStorage
})

// ── Harness ──────────────────────────────────────────────────────────

const MINUTE = 60_000

/** Rule with one event step wired straight to a toast channel. */
function ruleWith(
  id: string,
  type: string,
  data: Record<string, unknown>,
): NotificationRuleDSL {
  return {
    version: 1,
    id,
    name: `rule-${id}`,
    steps: [
      { id: `${id}-event`, type, position: { x: 0, y: 0 }, data },
      { id: `${id}-toast`, type: 'local-toast', position: { x: 1, y: 0 } },
    ],
    edges: [{ id: `${id}-e`, source: `${id}-event`, target: `${id}-toast` }],
    createdAt: 0,
    updatedAt: 0,
  } as NotificationRuleDSL
}

function bindingFor(rule: NotificationRuleDSL): NotificationBinding {
  return {
    id: `bind-${rule.id}`,
    ruleId: rule.id,
    pair: 'BTC-USDT',
    market: 'okx',
    enabled: true,
    createdAt: 0,
  }
}

function candle(ts: number, open: number, close: number): Candle {
  return {
    ts,
    open,
    high: Math.max(open, close) * 1.001,
    low: Math.min(open, close) * 0.999,
    close,
    volume: 100,
  }
}

/** Flat, featureless history — enough bars for the engine, no signal in it. */
function flatSeries(count: number, price = 100): Array<Candle> {
  return Array.from({ length: count }, (_, i) =>
    candle(i * MINUTE, price, price),
  )
}

type Harness = {
  manager: NotificationSubscriptionManager
  /** Push a stream message to the subscription opened for `timeframe`. */
  emit: (timeframe: string, update: unknown) => void
  log: Array<NotificationLogEntry>
  /** Let the runtime's async dispatch + log append settle. */
  settle: () => Promise<void>
}

function start(rules: Array<NotificationRuleDSL>): Harness {
  const bindings = rules.map(bindingFor)
  const log: Array<NotificationLogEntry> = []
  const callbacks = new Map<string, (data: unknown) => void>()

  useNotificationStore.setState({ rules, bindings, loaded: true })
  notificationRuntime.start(
    () => rules,
    () => bindings,
    (entry) => log.push(entry),
  )

  const fakeManager = {
    setContext: () => {},
    subscribe: (
      capability: string,
      params: Record<string, unknown>,
      cb: (data: unknown) => void,
    ) => {
      const tf = String(params.timeframe ?? '')
      callbacks.set(`${capability}:${tf}`, cb)
      return () => callbacks.delete(`${capability}:${tf}`)
    },
  }

  const manager = new NotificationSubscriptionManager()
  manager.start(fakeManager as unknown as PluginManager)

  return {
    manager,
    log,
    emit: (timeframe, update) => {
      const cb = callbacks.get(`market-data:candles:${timeframe}`)
      if (!cb) throw new Error(`no subscription opened for ${timeframe}`)
      cb(update)
    },
    settle: async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    },
  }
}

let harness: Harness | null = null

beforeEach(() => {
  clearRegistry()
  registerStepTypes(CORE_NOTIFICATION_STEPS)
  localStorage.removeItem('pairlens:notification-cooldowns')
  headlessRuns.length = 0
})

afterEach(() => {
  harness?.manager.stop()
  harness = null
  notificationRuntime.stop()
  useNotificationStore.setState({ rules: [], bindings: [], loaded: false })
  clearRegistry()
})

// ── Bar-close detection ──────────────────────────────────────────────

describe('candle event sourcing', () => {
  it('does not fire on the stream snapshot', async () => {
    harness = start([ruleWith('r1', 'candle-close', { timeframe: '1h' })])

    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })
    await harness.settle()

    // The snapshot is history, not a close. Firing here is what made every
    // candle rule notify seconds after launch and on every reconnect.
    expect(harness.log).toHaveLength(0)
  })

  it('does not fire while the forming bar keeps ticking', async () => {
    harness = start([ruleWith('r1', 'candle-close', { timeframe: '1h' })])
    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })

    const formingTs = 49 * MINUTE
    harness.emit('1h', {
      type: 'update',
      candles: [candle(formingTs, 100, 101)],
    })
    harness.emit('1h', {
      type: 'update',
      candles: [candle(formingTs, 100, 102)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(0)
  })

  it('fires exactly once when the forming bar rolls over', async () => {
    harness = start([ruleWith('r1', 'candle-close', { timeframe: '1h' })])
    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })

    // A new bar appearing is the only evidence the previous one is final —
    // the stream never says so itself.
    harness.emit('1h', {
      type: 'update',
      candles: [candle(50 * MINUTE, 100, 100)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(1)
    expect(harness.log[0].title).toBe('Candle Close')
  })

  it('reports the closed bar, not the newly opened one', async () => {
    harness = start([ruleWith('r1', 'candle-close', { timeframe: '1h' })])
    const history = flatSeries(50)
    harness.emit('1h', { type: 'snapshot', candles: history })

    harness.emit('1h', {
      type: 'update',
      candles: [candle(50 * MINUTE, 777, 777)],
    })
    await harness.settle()

    expect(harness.log[0].body).toContain('1h candle closed on BTC-USDT')
  })

  it('ignores updates that arrive before any snapshot', async () => {
    harness = start([ruleWith('r1', 'candle-close', { timeframe: '1h' })])

    harness.emit('1h', { type: 'update', candles: [candle(MINUTE, 100, 100)] })
    harness.emit('1h', {
      type: 'update',
      candles: [candle(2 * MINUTE, 100, 100)],
    })
    await harness.settle()

    // With no history there is nothing to close against, and inventing one
    // would fire an alert off a single bar.
    expect(harness.log).toHaveLength(0)
  })
})

// ── Timeframe isolation ──────────────────────────────────────────────

describe('timeframe matching', () => {
  it('does not fire a 1d rule on the 1h subscription another rule opened', async () => {
    const hourly = ruleWith('hourly', 'candle-close', { timeframe: '1h' })
    const daily = ruleWith('daily', 'candle-close', { timeframe: '1d' })
    harness = start([hourly, daily])

    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })
    harness.emit('1h', {
      type: 'update',
      candles: [candle(50 * MINUTE, 100, 100)],
    })
    await harness.settle()

    // One candle subscription is shared per pair+timeframe, so without a
    // filter the daily rule saw hourly closes and claimed a daily one.
    expect(harness.log.map((e) => e.ruleName)).toEqual(['rule-hourly'])
  })

  it('opens a separate subscription per timeframe', async () => {
    const hourly = ruleWith('hourly', 'candle-close', { timeframe: '1h' })
    const daily = ruleWith('daily', 'candle-close', { timeframe: '1d' })
    harness = start([hourly, daily])

    expect(() =>
      harness!.emit('1h', { type: 'snapshot', candles: [] }),
    ).not.toThrow()
    expect(() =>
      harness!.emit('1d', { type: 'snapshot', candles: [] }),
    ).not.toThrow()
  })
})

// ── Signals ──────────────────────────────────────────────────────────

describe('signal-generated', () => {
  it('stays silent on a close with no signal in the history', async () => {
    const signal = ruleWith('sig', 'signal-generated', { timeframe: '1h' })
    const close = ruleWith('close', 'candle-close', { timeframe: '1h' })
    harness = start([signal, close])

    harness.emit('1h', { type: 'snapshot', candles: flatSeries(60) })
    harness.emit('1h', {
      type: 'update',
      candles: [candle(60 * MINUTE, 100, 100)],
    })
    await harness.settle()

    // It used to be emitted unconditionally next to candle-close, with no
    // strategy attached — an exact alias for "a candle closed".
    expect(harness.log.map((e) => e.ruleName)).toEqual(['rule-close'])
  })

  it('runs the headless indicator pass on a close, not on the snapshot', async () => {
    harness = start([
      ruleWith('ind', 'indicator-alert', {
        timeframe: '1h',
        indicator: '',
        condition: '',
      }),
    ])

    // An indicator-alert rule has no upstream event source of its own — the
    // manager has to open a candle stream and run the scripts itself.
    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })
    await harness.settle()
    expect(headlessRuns).toHaveLength(0)

    harness.emit('1h', {
      type: 'update',
      candles: [candle(50 * MINUTE, 100, 100)],
    })
    await harness.settle()

    expect(headlessRuns).toHaveLength(1)
    expect(headlessRuns[0].pair).toBe('BTC-USDT')
    expect(headlessRuns[0].timeframe).toBe('1h')
    expect(headlessRuns[0].indicatorFilters).toEqual([''])
    expect(headlessRuns[0].barCount).toBeGreaterThan(2)
  })

  it('does not run the headless pass for rules that never asked for it', async () => {
    harness = start([ruleWith('r1', 'candle-close', { timeframe: '1h' })])
    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })
    harness.emit('1h', {
      type: 'update',
      candles: [candle(50 * MINUTE, 100, 100)],
    })
    await harness.settle()

    expect(headlessRuns).toHaveLength(0)
  })

  it('picks up an indicator rule added to an existing candle subscription', async () => {
    // A candle-close rule already holds the 1h stream, so adding an indicator
    // rule on the same pair+timeframe does NOT resubscribe. The callback has
    // to read the live spec or the new filter never reaches the runner.
    const closeRule = ruleWith('close', 'candle-close', { timeframe: '1h' })
    harness = start([closeRule])
    harness.emit('1h', { type: 'snapshot', candles: flatSeries(50) })

    const indicatorRule = ruleWith('ind', 'indicator-alert', {
      timeframe: '1h',
      indicator: 'My Script',
      condition: '',
    })
    useNotificationStore.setState({
      rules: [closeRule, indicatorRule],
      bindings: [bindingFor(closeRule), bindingFor(indicatorRule)],
      loaded: true,
    })
    await harness.settle()

    harness.emit('1h', {
      type: 'update',
      candles: [candle(50 * MINUTE, 100, 100)],
    })
    await harness.settle()

    expect(headlessRuns).toHaveLength(1)
    expect(headlessRuns[0].indicatorFilters).toEqual(['My Script'])
  })

  it('does not open a candle subscription for a disabled rule', () => {
    const rule = {
      ...ruleWith('r1', 'candle-close', { timeframe: '1h' }),
      enabled: false,
    }
    harness = start([rule])

    expect(() =>
      harness!.emit('1h', { type: 'snapshot', candles: [] }),
    ).toThrow()
  })
})

// ── Rolling percent moves ────────────────────────────────────────────
// The window is measured HERE — the step only carries a threshold — so this
// is the layer that decides whether "5% in an hour" ever becomes an event.

/** `count` bars at `price`, spaced by `stepMinutes`, oldest first. */
function series(count: number, price: number, stepMinutes: number) {
  return Array.from({ length: count }, (_, i) =>
    candle(i * stepMinutes * MINUTE, price, price),
  )
}

describe('percent-move windows', () => {
  const moveRule = (percent: number, direction: string, window: string) =>
    ruleWith('mv', 'percent-move', { percent, direction, window })

  /** A 1h window rides 5m bars: 20 of them span 95 minutes. */
  const seedHour = (h: Harness) => {
    h.emit('5m', { type: 'snapshot', candles: series(20, 100, 5) })
  }

  it('measures the window on the base timeframe, not the window itself', () => {
    harness = start([moveRule(5, 'either', '1h')])
    // Subscribing on '1h' bars would notice an hourly move an hour late.
    expect(() =>
      harness!.emit('1h', { type: 'snapshot', candles: [] }),
    ).toThrow()
    expect(() => seedHour(harness!)).not.toThrow()
  })

  it('says nothing on the snapshot — that is history, not a move', async () => {
    harness = start([moveRule(5, 'either', '1h')])
    harness.emit('5m', {
      type: 'snapshot',
      candles: [...series(19, 100, 5), candle(19 * 5 * MINUTE, 100, 80)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(0)
  })

  it('fires when the trailing move crosses the threshold', async () => {
    harness = start([moveRule(5, 'either', '1h')])
    seedHour(harness)
    // The forming bar drops 6% below where the price was an hour ago.
    harness.emit('5m', {
      type: 'update',
      candles: [candle(19 * 5 * MINUTE, 100, 94)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(1)
    expect(harness.log[0].body).toContain('6.00%')
  })

  it('does not re-fire while the move stays past the threshold', async () => {
    harness = start([moveRule(5, 'either', '1h')])
    seedHour(harness)
    harness.emit('5m', {
      type: 'update',
      candles: [candle(19 * 5 * MINUTE, 100, 94)],
    })
    await harness.settle()
    harness.emit('5m', {
      type: 'update',
      candles: [candle(19 * 5 * MINUTE, 100, 93.5)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(1)
  })

  it('ignores a move in the direction the rule does not watch', async () => {
    harness = start([moveRule(5, 'up', '1h')])
    seedHour(harness)
    harness.emit('5m', {
      type: 'update',
      candles: [candle(19 * 5 * MINUTE, 100, 90)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(0)
  })

  it('waits until the history reaches back across the window', async () => {
    harness = start([moveRule(5, 'either', '24h')])
    // 1h bars, but only six of them — no honest 24h baseline exists yet, and
    // measuring against the oldest bar we happen to have would invent one.
    harness.emit('1h', { type: 'snapshot', candles: series(6, 100, 60) })
    harness.emit('1h', {
      type: 'update',
      candles: [candle(5 * 60 * MINUTE, 100, 50)],
    })
    await harness.settle()

    expect(harness.log).toHaveLength(0)
  })

  it('serves two windows off one subscription without crossing them', async () => {
    // 5m and 15m both ride 1m bars. The 15m rule must not fire on the 5m
    // reading that shares its stream.
    const fast = ruleWith('fast', 'percent-move', {
      percent: 3,
      direction: 'either',
      window: '5m',
    })
    const slow = ruleWith('slow', 'percent-move', {
      percent: 20,
      direction: 'either',
      window: '15m',
    })
    harness = start([fast, slow])
    harness.emit('1m', { type: 'snapshot', candles: series(30, 100, 1) })
    harness.emit('1m', {
      type: 'update',
      candles: [candle(29 * MINUTE, 100, 95)],
    })
    await harness.settle()

    // -5%: past the 5m rule's 3%, nowhere near the 15m rule's 20%.
    expect(harness.log.map((e) => e.ruleName)).toEqual(['rule-fast'])
  })
})
