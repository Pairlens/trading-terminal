// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bridge from a Python indicator's `alert.condition(...)` outputs to the
 * notification runtime.
 *
 * A condition is evaluated on the last **closed** bar only — the forming bar
 * changes with every tick, and firing off it is how alerts end up crying wolf.
 * Within a bar, a condition fires once on its 0 → true edge, so a state that
 * simply stays true does not re-notify.
 */
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import { notificationRuntime } from '@/lib/notifications/notification-runtime'

/** Last bar each condition fired on, so an edge only fires once. */
const lastFired = new Map<string, number>()
/** Value the condition held on the previously evaluated closed bar. */
const lastValue = new Map<string, number>()

/**
 * Timeframe is part of the key: the same condition on the same pair is a
 * different series per timeframe, and the chart and the headless notification
 * runner can watch two of them at once. Sharing one slot let a 4h evaluation
 * overwrite the 1h edge state and swallow the next alert.
 */
const stateKey = (
  indicatorType: string,
  alertKey: string,
  market: string,
  pair: string,
  timeframe: string,
): string => `${indicatorType}|${alertKey}|${market}|${pair}|${timeframe}`

/** Expand the `{{...}}` placeholders a script may put in its alert message. */
export function formatAlertMessage(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? values[name] : match,
  )
}

const isTruthy = (value: number | undefined): boolean =>
  value !== undefined && Number.isFinite(value) && value !== 0

/**
 * Evaluate a computed indicator's alert conditions and push an event for each
 * one that just turned true.
 *
 * `outputs` are the raw per-bar arrays from the Python runtime; `bars` is the
 * window they were computed over, whose final entry is assumed to still be
 * forming.
 */
export function evaluateIndicatorAlerts(options: {
  indicatorType: string
  meta: CustomIndicatorMeta
  bars: Array<ChartBar>
  outputs: Record<string, Float64Array>
  market: string
  pair: string
  timeframe: string
}): void {
  const { indicatorType, meta, bars, outputs, market, pair, timeframe } =
    options
  const alerts = meta.alerts
  if (!alerts || alerts.length === 0) return
  // Need a closed bar (the last entry is forming) plus one before it to see
  // an edge.
  if (bars.length < 2) return

  const closedIndex = bars.length - 2
  const closedBar = bars[closedIndex]

  for (const alert of alerts) {
    const series = outputs[alert.key]
    if (!series || closedIndex >= series.length) continue

    const key = stateKey(indicatorType, alert.key, market, pair, timeframe)
    const current = series[closedIndex]
    const previousBar = closedIndex > 0 ? series[closedIndex - 1] : Number.NaN
    // Prefer the value we recorded last time we looked at this condition;
    // fall back to the bar before, which covers a freshly-added indicator.
    const previous = lastValue.get(key) ?? previousBar
    lastValue.set(key, Number.isFinite(current) ? current : 0)

    if (!isTruthy(current)) continue
    if (isTruthy(previous)) continue
    if (lastFired.get(key) === closedBar.ts) continue
    lastFired.set(key, closedBar.ts)

    const message = formatAlertMessage(
      alert.message ?? '{{title}} on {{pair}} ({{timeframe}})',
      {
        title: alert.title,
        indicator: meta.title,
        pair,
        market,
        timeframe,
        value: String(current),
        price: String(closedBar.close),
      },
    )

    const payload: NotificationEventPayload = {
      eventType: 'indicator-alert',
      timestamp: closedBar.ts,
      pair,
      market,
      price: closedBar.close,
      data: {
        indicator: indicatorType,
        indicatorTitle: meta.title,
        condition: alert.key,
        conditionTitle: alert.title,
        message,
        value: current,
        timeframe,
      },
    }
    void notificationRuntime.handleEvent(payload)
  }
}
