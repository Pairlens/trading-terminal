// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Where the assistant plugs into the terminal ──────────────────────
//
// Mounted above the routed content, so it survives every navigation and
// the desktop/mobile shell swap. Surfaces below it register themselves
// on mount; handles that only exist below it (the chart, the workbench)
// arrive through the ServiceRegistry, which is mounted higher still.
//
// It holds no chat state on purpose. A streaming conversation in a
// provider this high would re-render the whole terminal on every token,
// and the render budget here is spent on prices. The chat lives in the
// dock, which is a leaf.

import { useCallback, useMemo, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { toMarketDataHandle } from './client-tools'
import { BuiltInAssistantSurfaces } from './built-in-surfaces'
import { CHART_SERVICE_NAME } from './chart-service'
import { WORKBENCH_SERVICE_NAME } from './workbench-service'
import {
  AssistantSurfaceRegistry,
  AssistantSurfaceRegistryContext,
  useAssistantSurfaceRegistry,
} from './surface-registry'
import type { AssistantDeps, AssistantFocus } from './tool-deps'
import type { ChartServiceHandle } from './chart-service'
import type { AssistantWorkbenchBridge } from '@/lib/assistant/assistant-tools'
import type { ReactNode } from 'react'
import { useServiceRegistry } from '@/lib/service-registry-context'
import { usePluginManager } from '@/lib/pairlens-provider'
import { useMarketData } from '@/lib/market-data-provider'

export function AssistantProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => new AssistantSurfaceRegistry(), [])

  return (
    <AssistantSurfaceRegistryContext.Provider value={registry}>
      <BuiltInAssistantSurfaces />
      {children}
    </AssistantSurfaceRegistryContext.Provider>
  )
}

/**
 * Assembles the dependency contract the tools run against. Every field
 * is a getter, so the object itself is stable for the lifetime of the
 * dock while what it resolves to tracks the live terminal.
 */
export function useAssistantDeps(options?: {
  scheduleCheck?: (minutes: number, instruction: string) => void
}): AssistantDeps {
  const pluginManager = usePluginManager()
  const marketData = useMarketData()
  const services = useServiceRegistry()
  const navigate = useNavigate()
  const registry = useAssistantSurfaceRegistry()

  // Read through refs so the deps object never has to be rebuilt when a
  // provider above re-renders; a rebuilt object would restart the chat
  // transport mid-conversation.
  const marketDataRef = useRef(marketData)
  marketDataRef.current = marketData
  const scheduleCheckRef = useRef(options?.scheduleCheck)
  scheduleCheckRef.current = options?.scheduleCheck

  const getChart = useCallback(
    () => services.get<ChartServiceHandle>(CHART_SERVICE_NAME),
    [services],
  )

  const getFocus = useCallback((): AssistantFocus => {
    const chart = getChart()
    if (!chart) return {}
    return {
      market: chart.market,
      pair: chart.pair,
      timeframe: chart.timeframe,
    }
  }, [getChart])

  return useMemo(
    () => ({
      pluginManager,
      getMarketData: () => toMarketDataHandle(marketDataRef.current),
      getChart,
      getWorkbench: () =>
        services.get<AssistantWorkbenchBridge>(WORKBENCH_SERVICE_NAME),
      getFocus,
      navigate: (to: string) => {
        void navigate({ to })
      },
      registry,
      scheduleCheck: (minutes: number, instruction: string) =>
        scheduleCheckRef.current?.(minutes, instruction),
    }),
    [pluginManager, getChart, getFocus, services, navigate, registry],
  )
}
