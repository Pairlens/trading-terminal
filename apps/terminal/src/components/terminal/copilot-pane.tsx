// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'

import { usePanePair, usePluginService } from '@pairlens/plugin-sdk'
import type {
  FastFinancialChartRef,
  IndicatorInstanceInput,
} from '@pairlens/fast-financial-charts/types'

import {
  useOptionalChartActions,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { CopilotPanel } from '@/components/copilot/copilot-panel'

type ChartPaneHandle = {
  chartRef: React.RefObject<FastFinancialChartRef | null>
  addIndicator: (indicator: IndicatorInstanceInput) => void
  removeIndicator: (id: string) => void
  removeAllIndicators: () => void
}

const NULL_REF: React.RefObject<FastFinancialChartRef | null> = {
  current: null,
}

export function CopilotPane() {
  const activePair = usePanePair()
  const chartConfig = useOptionalChartConfig()
  const chartActions = useOptionalChartActions()
  const chartHandle = usePluginService<ChartPaneHandle>('chart-actions')

  if (!activePair || !chartConfig || !chartActions) {
    return <PanePairPicker />
  }

  return (
    <CopilotPaneInner
      pairKey={activePair.pairKey}
      chartConfig={chartConfig}
      chartActions={chartActions}
      chartHandle={chartHandle}
    />
  )
}

function CopilotPaneInner({
  pairKey,
  chartConfig,
  chartActions,
  chartHandle,
}: {
  pairKey: string
  chartConfig: NonNullable<ReturnType<typeof useOptionalChartConfig>>
  chartActions: NonNullable<ReturnType<typeof useOptionalChartActions>>
  chartHandle: ChartPaneHandle | null
}) {
  const { market, timeframe } = chartConfig

  // Prefer service registry handle (cross-pane); fall back to own context (same-provider)
  const chartRef = chartHandle?.chartRef ?? chartConfig.chartRef ?? NULL_REF
  const indicatorActions = useMemo(() => {
    if (chartHandle) {
      return {
        add: chartHandle.addIndicator,
        remove: chartHandle.removeIndicator,
        removeAll: chartHandle.removeAllIndicators,
      }
    }
    return {
      add: chartActions.addIndicator,
      remove: chartActions.removeIndicator,
      removeAll: chartActions.removeAllIndicators,
    }
  }, [
    chartHandle,
    chartActions.addIndicator,
    chartActions.removeIndicator,
    chartActions.removeAllIndicators,
  ])

  return (
    <CopilotPanel
      pairKey={pairKey}
      market={market}
      timeframe={timeframe}
      chartRef={chartRef}
      indicatorActions={indicatorActions}
      chartActions={chartActions}
    />
  )
}
