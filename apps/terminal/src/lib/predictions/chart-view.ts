// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Lines or bands, and where that choice is remembered.
 *
 * Shared by both shells for the same reason the span is: how you read a race
 * is a habit, not a property of the device you are holding. Switching to bands
 * on the laptop and finding lines on the phone would be the one place in the
 * product where the same contract reads as two charts.
 *
 * Deliberately not per-pair and not per-event: a contract expires, so a view
 * remembered against one would be remembered for nothing.
 */
export type PredictionChartView = 'lines' | 'stacked'

/** The key both shells write. Same store, same habit. */
export const PREDICTION_CHART_VIEW_KEY = 'predictions.chartView'

/**
 * Bands first, because the pane's hard case is a race and a race is what the
 * fixed axis crushes. A field that is not a partition cannot be stacked at all
 * and falls back to lines on its own, so the default costs those events
 * nothing.
 */
export const DEFAULT_PREDICTION_CHART_VIEW: PredictionChartView = 'stacked'

export const PREDICTION_CHART_VIEWS: ReadonlyArray<{
  id: PredictionChartView
  labelKey: string
}> = [
  { id: 'lines', labelKey: 'predictionChart.view.lines' },
  { id: 'stacked', labelKey: 'predictionChart.view.stacked' },
]
