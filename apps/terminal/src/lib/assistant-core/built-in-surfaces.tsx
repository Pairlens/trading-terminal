// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The surfaces the terminal always has ─────────────────────────────
//
// Two registrations that need no cooperation from any route or pane:
// the page the user is on, and the chart they are looking at. Both are
// derivable from above the routed content, so adding the assistant cost
// the routes nothing.
//
// Anything richer than this a pane publishes for itself with
// `useAssistantSurface`.

import { useSyncExternalStore } from 'react'
import { useLocation } from '@tanstack/react-router'

import { CHART_SERVICE_NAME } from './chart-service'
import { useAssistantSurface } from './use-assistant-surface'
import type { ChartServiceHandle } from './chart-service'
import type { AssistantSuggestion } from './types'
import { useServiceRegistry } from '@/lib/service-registry-context'

// ── The page ─────────────────────────────────────────────────────────

/**
 * Route prefix to what the assistant should offer there. Longest match
 * wins, so `/workspace-store` is not swallowed by `/workspace`.
 */
const ROUTE_SURFACES: Array<{
  prefix: string
  page: string
  suggestion: string
}> = [
  {
    prefix: '/workspace-store',
    page: 'the Workspace Store',
    suggestion: 'workspaceStore',
  },
  {
    prefix: '/notifications',
    page: 'the alerts and notifications page',
    suggestion: 'notifications',
  },
  {
    prefix: '/indicators',
    page: 'the indicator and strategy workbench',
    suggestion: 'indicators',
  },
  { prefix: '/workflows', page: 'the workflows page', suggestion: 'workflows' },
  {
    prefix: '/accounts',
    page: 'the accounts page, where venues and wallets are connected',
    suggestion: 'accounts',
  },
  { prefix: '/plugins', page: 'the Plugin Store', suggestion: 'plugins' },
  { prefix: '/bots', page: 'the bots page', suggestion: 'bots' },
]

const DISCOVERY = {
  page: 'the discovery board: markets, movers and news',
  suggestion: 'discovery',
}

function routeSurfaceFor(pathname: string) {
  const match = ROUTE_SURFACES.find((entry) =>
    pathname.startsWith(entry.prefix),
  )
  if (match) return match
  if (pathname === '/') return { prefix: '/', ...DISCOVERY }
  return null
}

function RouteSurface() {
  const { pathname } = useLocation()
  const match = routeSurfaceFor(pathname)

  useAssistantSurface({
    id: 'route',
    // Lowest rank: any pane that describes itself is more specific than
    // the page it sits on.
    getPriority: () => -100,
    revision: pathname,
    getContext: () => ({
      summary: match
        ? `The user is on ${match.page} (${pathname}).`
        : `The user is on ${pathname}.`,
    }),
    getSuggestion: (): AssistantSuggestion | null =>
      match ? { key: `assistantDock.suggest.${match.suggestion}` } : null,
  })

  return null
}

// ── The chart ────────────────────────────────────────────────────────

function useChartService(): ChartServiceHandle | null {
  const services = useServiceRegistry()
  return useSyncExternalStore(
    (listener) => services.onChange(CHART_SERVICE_NAME, listener),
    () => services.get<ChartServiceHandle>(CHART_SERVICE_NAME),
  )
}

function ChartSurface() {
  const chart = useChartService()
  const revision = chart
    ? `${chart.market}:${chart.pair}:${chart.timeframe}`
    : 'none'

  useAssistantSurface({
    id: 'chart',
    // Above the page, below anything a pane publishes about itself: the
    // chart is usually what "this" means, but not always.
    getPriority: () => (chart ? 50 : -1000),
    revision,
    getContext: () => {
      if (!chart) return null
      const snapshot = chart.getSnapshot?.()
      return {
        summary: `A chart is open showing ${chart.pair} on ${chart.market}, ${chart.timeframe} candles.`,
        detail: snapshot
          ? {
              chartType: snapshot.chartType,
              priceScale: snapshot.priceScaleMode,
              indicators: snapshot.indicators?.map(
                (indicator) => indicator.type,
              ),
              drawings: snapshot.drawings?.length ?? 0,
              compareSymbols: snapshot.compareSymbols,
            }
          : undefined,
      }
    },
    getSuggestion: (): AssistantSuggestion | null =>
      chart
        ? {
            key: 'assistantDock.suggest.chart',
            values: { pair: chart.pair.replace('-', '/') },
          }
        : null,
  })

  return null
}

/** Mounted once by the provider. Renders nothing. */
export function BuiltInAssistantSurfaces() {
  return (
    <>
      <RouteSurface />
      <ChartSurface />
    </>
  )
}
