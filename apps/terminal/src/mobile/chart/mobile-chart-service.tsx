// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chart handle the assistant drives, published from the phone.
 *
 * On desktop `components/terminal/chart-pane.tsx` registers `chart-actions`
 * into the ServiceRegistry, and that registration is the ONLY way the
 * assistant reaches a chart: it is mounted above the routed content, where
 * `ChartTerminalContext` does not reach. The phone never mounts that pane. Its
 * chart is `MobileChart`, a different component on the same context, so
 * without this every chart tool the assistant owns would resolve to null and
 * quietly do nothing. Same handle shape, same stable-object-plus-ref pattern,
 * so the two shells are interchangeable to everything downstream.
 *
 * It renders null on purpose. `getMarketContext` has to answer with live
 * candles, which means subscribing to the candle stream; a component with no
 * output is the one thing that may do that outside the sanctioned per-tick
 * readers, because the tick reaches this function, writes a ref and stops.
 *
 * Mounted once by `MobileSurface`, outside the chart band rather than inside
 * `MobileChart`, so the handle survives the states where the chart is replaced
 * by an empty state (sealed keychain, desktop-only venue, no data): the
 * assistant still knows which pair and venue the user is looking at, which is
 * what defaults every tool argument.
 */
import { useEffect, useMemo, useRef } from 'react'

import { useMobileFocus } from '../mobile-focus-context'
import type { ChartServiceHandle } from '@/lib/assistant-core/chart-service'
import type { CopilotMarketContext } from '@/lib/copilot/tool-deps'
import { CHART_SERVICE_NAME } from '@/lib/assistant-core/chart-service'
import { buildChartSnapshot } from '@/lib/assistant-core/client-tools'
import { useServiceRegistry } from '@/lib/service-registry-context'
import {
  useChartActions,
  useChartConfig,
  useOptionalCandleData,
} from '@/lib/chart-terminal-context'

/**
 * Who the registry attributes the handle to. Deliberately not a plugin id:
 * `unregisterAll` sweeps by owner when a plugin deactivates, and the phone's
 * chart must not disappear from the assistant because someone toggled a
 * connector in Settings.
 */
const OWNER = 'mobile-terminal'

export function MobileChartService() {
  const services = useServiceRegistry()
  const chartConfig = useChartConfig()
  const chartActions = useChartActions()
  const candleData = useOptionalCandleData()
  const { focusedPair } = useMobileFocus()

  // The per-tick half, kept in its own ref so the handle below never has to be
  // rebuilt. Candles and the latest signal only, exactly like the desktop
  // pane: the ticker is absent because nothing here should have to subscribe
  // to it to answer a question about candles.
  const marketContextRef = useRef<CopilotMarketContext>({})
  marketContextRef.current = {
    candles: candleData?.candles ?? [],
    signal: candleData?.latestSignal ?? undefined,
  }

  // Everything else is read through this ref for the same reason `register`
  // notifies every listener on each call, and the config below changes on
  // every venue, timeframe or tool change.
  const live = {
    chartRef: chartConfig.chartRef,
    chartActions,
    market: chartConfig.market,
    pair: focusedPair,
    timeframe: chartConfig.timeframe,
  }
  const liveRef = useRef(live)
  liveRef.current = live

  const chartService = useMemo<ChartServiceHandle>(
    () => ({
      get chartRef() {
        return liveRef.current.chartRef
      },
      get chartActions() {
        return liveRef.current.chartActions
      },
      get market() {
        return liveRef.current.market
      },
      get pair() {
        return liveRef.current.pair
      },
      get timeframe() {
        return liveRef.current.timeframe
      },
      addIndicator: (indicator) =>
        liveRef.current.chartActions.addIndicator(indicator),
      removeIndicator: (id) => liveRef.current.chartActions.removeIndicator(id),
      removeAllIndicators: () =>
        liveRef.current.chartActions.removeAllIndicators(),
      getSnapshot: () =>
        buildChartSnapshot(liveRef.current.chartRef.current ?? null),
      getMarketContext: () => marketContextRef.current,
    }),
    [],
  )

  // The registry instance is stable for the window's lifetime, but reading it
  // through a ref keeps it out of the effect's dependencies on principle: a
  // re-register notifies every listener, and nothing here has changed.
  const servicesRef = useRef(services)
  servicesRef.current = services

  useEffect(
    () => servicesRef.current.register(OWNER, CHART_SERVICE_NAME, chartService),
    [chartService],
  )

  return null
}
