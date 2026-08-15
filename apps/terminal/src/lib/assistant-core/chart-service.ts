// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Chart service handle ─────────────────────────────────────────────
//
// The chart pane owns ChartTerminalContext, and that context lives BELOW
// the routed content area. Anything mounted above the outlet (the unified
// assistant dock) cannot read it, so the pane publishes this handle into
// the cross-pane ServiceRegistry instead, which PairlensProvider mounts
// above the outlet.
//
// One definition, two consumers: the pane copilot, which uses the four
// original fields and nothing else, and the assistant, which drives the
// whole surface.

import type { RefObject } from 'react'
import type {
  FastFinancialChartRef,
  IndicatorInstanceInput,
} from '@pairlens/fast-financial-charts/types'
import type { ChartActionsValue } from '@/lib/chart-terminal-context'
import type {
  CopilotChartSnapshot,
  CopilotMarketContext,
} from '@/lib/copilot/tool-deps'

/** The registry name the chart pane publishes under. */
export const CHART_SERVICE_NAME = 'chart-actions'

export type ChartServiceHandle = {
  /** The live engine, or null until the chart has mounted. */
  chartRef: RefObject<FastFinancialChartRef | null>
  addIndicator: (indicator: IndicatorInstanceInput) => void
  removeIndicator: (id: string) => void
  removeAllIndicators: () => void

  /** What the chart is showing right now. */
  market: string
  pair: string
  timeframe: string

  /** The pane's full action surface: drawings, view config, compare, replay. */
  chartActions: ChartActionsValue

  /**
   * Reads, both optional so a partial registration is still a valid handle.
   * A surface that cannot answer omits the field rather than reporting
   * empty data as if it were the truth.
   */
  getSnapshot?: () => CopilotChartSnapshot | null
  getMarketContext?: () => CopilotMarketContext | null
}
