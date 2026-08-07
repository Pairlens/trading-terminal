// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Indicator alerts used to be reachable only from the chart's compute path, so
// a rule bound to a pair the user was not looking at could never fire. These
// cover the headless replacement: which scripts it selects, that it skips the
// ones that can never raise an alert, and that a condition turning true
// actually reaches the notification runtime.
//
// The Pyodide runtime is stubbed — Python execution is not what is under test
// here, and booting a real WASM interpreter per case would be minutes of test
// time for no extra coverage.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test'

import type {
  CustomIndicatorDescriptor,
  CustomIndicatorMeta,
} from '@pairlens/shared/plugin-types'
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'

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

// Every specifier here is the '@/' one the subject itself uses, and that
// matters more than tidiness. This suite works by writing to module singletons
// (the registry below, the runtime further down) and then asserting on what
// the subject read back. That only holds while the test and the subject share
// one instance of each module — and a relative specifier and an alias pointing
// at the same file are only guaranteed to collapse to one module record if the
// resolver says so. Where they do not, every write lands in a second copy
// nobody reads: the registry looks empty from inside, the subject returns
// before it touches Python, and the assertions come back with nothing having
// happened. Matching the subject's specifiers removes the question.
const { customIndicatorRegistry } =
  await import('@/lib/indicators/custom-indicator-registry')
const { notificationRuntime } =
  await import('@/lib/notifications/notification-runtime')
const { getPythonRuntime } = await import('@/lib/python/python-runtime')
const { runHeadlessIndicatorAlerts, resetHeadlessIndicatorAlertState } =
  await import('@/lib/indicators/headless-indicator-alerts')

// Patch the singletons rather than the modules: bun's mock.module is
// process-wide and would leak into every other suite in the run.
const events: Array<NotificationEventPayload> = []
const realHandleEvent = notificationRuntime.handleEvent
notificationRuntime.handleEvent = (payload: NotificationEventPayload) => {
  events.push(payload)
  return Promise.resolve()
}

const runtime = getPythonRuntime() as unknown as Record<string, unknown>
const realRegister = runtime.registerScript
const realCompute = runtime.compute

/** compute() output per indicator type, set by each test. */
const outputs = new Map<string, Float64Array>()
const computeCalls: Array<{ id: string; pair: string; timeframe: string }> = []

runtime.registerScript = () => Promise.resolve({} as CustomIndicatorMeta)
runtime.compute = (
  id: string,
  _candles: unknown,
  _params: unknown,
  pair: string,
  timeframe: string,
) => {
  computeCalls.push({ id, pair, timeframe })
  return Promise.resolve({
    outputs: { fired: outputs.get(id) ?? Float64Array.from([0, 0, 0, 0]) },
    palettes: {},
  })
}

afterAll(() => {
  notificationRuntime.handleEvent = realHandleEvent
  runtime.registerScript = realRegister
  runtime.compute = realCompute
  if (previousStorage) globalThis.localStorage = previousStorage
})

// ── Fixtures ─────────────────────────────────────────────────────────

function descriptor(
  id: string,
  title: string,
  withAlert: boolean,
): CustomIndicatorDescriptor {
  const meta: CustomIndicatorMeta = {
    id,
    title,
    pane: 'sub',
    inputs: [],
    series: [{ key: 'fired', style: 'line' }],
    ...(withAlert
      ? { alerts: [{ key: 'fired', title: 'Fired', message: '{{title}}' }] }
      : {}),
  }
  return { meta, language: 'python', source: `# ${id}` }
}

const bars = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    ts: i * 60_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }))

const run = (filters: Array<string>, timeframe = '1h') =>
  runHeadlessIndicatorAlerts({
    market: 'okx',
    pair: 'BTC-USDT',
    timeframe,
    bars: bars(10),
    indicatorFilters: filters,
  })

beforeEach(() => {
  events.length = 0
  computeCalls.length = 0
  outputs.clear()
  resetHeadlessIndicatorAlertState()
})

afterEach(() => {
  customIndicatorRegistry.setProviderIndicators('user-indicators', [])
})

// ── Selection ────────────────────────────────────────────────────────

describe('headless indicator alerts', () => {
  it('skips scripts that declare no alert condition', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('plain', 'Plain', false),
      descriptor('raises', 'Raises', true),
    ])

    await run([''])

    // Nothing to raise, so Python is never touched — this is what keeps the
    // blank "any indicator" default from costing a run per script per bar.
    //
    // The alert-declaring script is here as a live control rather than for
    // coverage. Asserting only that 'plain' was skipped is an assertion that
    // nothing happened, which stays true when the subject is not running at
    // all — a wiring break (a leaked module mock, a forked module instance)
    // used to leave this case green while it took the rest of the file down,
    // reading as one odd failure instead of a dead suite.
    expect(computeCalls.map((c) => c.id)).toEqual([
      'custom:user-indicators:raises',
    ])
  })

  it('runs every alert-declaring script when the rule says "any"', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
      descriptor('b', 'Beta', true),
      descriptor('plain', 'Plain', false),
    ])

    await run([''])

    expect(computeCalls.map((c) => c.id).sort()).toEqual([
      'custom:user-indicators:a',
      'custom:user-indicators:b',
    ])
  })

  it('runs only the named script when the rule names one', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
      descriptor('b', 'Beta', true),
    ])

    await run(['Beta'])

    expect(computeCalls.map((c) => c.id)).toEqual(['custom:user-indicators:b'])
  })

  it('matches a rule that names the engine type instead of the title', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
    ])

    await run(['custom:user-indicators:a'])

    expect(computeCalls).toHaveLength(1)
  })

  it('passes the rule’s pair and timeframe to the script', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
    ])

    await run([''], '4h')

    expect(computeCalls[0]).toEqual({
      id: 'custom:user-indicators:a',
      pair: 'BTC-USDT',
      timeframe: '4h',
    })
  })
})

// ── Firing ───────────────────────────────────────────────────────────

describe('headless alert firing', () => {
  it('raises a notification event when a condition turns true on the closed bar', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
    ])
    // 10 bars; index 8 is the last closed one (9 is still forming).
    const series = new Float64Array(10)
    series[8] = 1
    outputs.set('custom:user-indicators:a', series)

    await run([''])

    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('indicator-alert')
    expect(events[0].pair).toBe('BTC-USDT')
    expect(events[0].data.indicatorTitle).toBe('Alpha')
    expect(events[0].data.conditionTitle).toBe('Fired')
  })

  it('stays silent when the condition never turns true', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
    ])
    outputs.set('custom:user-indicators:a', new Float64Array(10))

    await run([''])

    expect(events).toHaveLength(0)
  })

  it('does nothing without enough bars to see an edge', async () => {
    customIndicatorRegistry.setProviderIndicators('user-indicators', [
      descriptor('a', 'Alpha', true),
    ])

    await runHeadlessIndicatorAlerts({
      market: 'okx',
      pair: 'BTC-USDT',
      timeframe: '1h',
      bars: bars(2),
      indicatorFilters: [''],
    })

    expect(computeCalls).toHaveLength(0)
    expect(events).toHaveLength(0)
  })
})
