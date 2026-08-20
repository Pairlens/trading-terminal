// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// What the assistant hands the chart when it adds an indicator. Two things
// went wrong here in one flow: a script-defined indicator arrived with no
// pane and no params, so it computed on the price axis and read as "did not
// render", and `addIndicator` is a toggle, so a second add of the same thing
// would have taken it back off.
import { afterEach, describe, expect, it } from 'bun:test'

import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { IndicatorInstanceInput } from '@pairlens/fast-financial-charts/types'
import type { ChartServiceHandle } from '@/lib/assistant-core/chart-service'
import type { CopilotChartSnapshot } from '@/lib/copilot/tool-deps'

const { customIndicatorRegistry } =
  await import('@/lib/indicators/custom-indicator-registry')
const { executeClientTool } = await import('@/lib/assistant-core/client-tools')

const PROVIDER = 'user-indicators'
const TYPE = `custom:${PROVIDER}:script_1`

const registerScript = () => {
  customIndicatorRegistry.setProviderIndicators(PROVIDER, [
    {
      meta: {
        id: 'script_1',
        title: 'Memecoin Pulse',
        pane: 'sub',
        inputs: [{ key: 'length', kind: 'int', label: 'Length', default: 14 }],
        series: [{ key: 'pulse', label: 'Pulse', kind: 'line' }],
      } as CustomIndicatorMeta,
      language: 'python',
      source: 'x = 1',
    },
  ])
}

type Added = Array<Omit<IndicatorInstanceInput, 'seriesId'>>

const fakeChart = (
  added: Added,
  active: CopilotChartSnapshot['indicators'] = [],
) =>
  ({
    chartRef: { current: null },
    addIndicator: (indicator) => added.push(indicator),
    removeIndicator: () => {},
    removeAllIndicators: () => {},
    market: 'okx',
    pair: 'PEPE-USDT',
    timeframe: '1h',
    chartActions: {} as ChartServiceHandle['chartActions'],
    getSnapshot: () => ({ indicators: active }) as CopilotChartSnapshot,
  }) as ChartServiceHandle

const run = (
  input: Record<string, unknown>,
  chart: ChartServiceHandle | null,
) =>
  executeClientTool('add_indicator', input, {
    chart,
    navigate: (() => {}) as never,
    resolveMarketRef: () => null,
  })

afterEach(() => {
  customIndicatorRegistry.removeProvider(PROVIDER)
})

describe('add_indicator', () => {
  it('sends a script-defined indicator to its own pane with its defaults', () => {
    registerScript()
    const added: Added = []
    run({ type: TYPE }, fakeChart(added))
    expect(added).toEqual([
      { type: TYPE, params: { length: 14 }, pane: 'separate' },
    ])
  })

  it('accepts the script title in place of the engine type', () => {
    registerScript()
    const added: Added = []
    run({ type: 'Memecoin Pulse' }, fakeChart(added))
    expect(added[0]?.type).toBe(TYPE)
  })

  it('resolves a built-in oscillator into a separate pane', () => {
    const added: Added = []
    run({ type: 'Stochastic' }, fakeChart(added))
    expect(added[0]?.pane).toBe('separate')
    expect(added[0]?.params).toEqual({ kPeriod: 14, dPeriod: 3, smooth: 3 })
  })

  it('does not toggle off an indicator that is already on the chart', () => {
    const added: Added = []
    run(
      { type: 'EMA', period: 20 },
      fakeChart(added, [{ id: 'a', type: 'EMA', params: { period: 20 } }]),
    )
    expect(added).toHaveLength(0)
  })

  it('still adds the same type with different params', () => {
    const added: Added = []
    run(
      { type: 'EMA', period: 200 },
      fakeChart(added, [{ id: 'a', type: 'EMA', params: { period: 20 } }]),
    )
    expect(added[0]?.params).toEqual({ period: 200 })
  })

  it('is a no-op with no chart rather than a throw', () => {
    expect(() => run({ type: 'EMA' }, null)).not.toThrow()
  })
})
