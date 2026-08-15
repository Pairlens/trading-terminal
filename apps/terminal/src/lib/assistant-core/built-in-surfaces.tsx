// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The surfaces the terminal always has ─────────────────────────────
//
// Two registrations that need no cooperation from any route or pane:
// the address the user is at, and the chart they are looking at. Both
// are derivable from above the routed content, so adding the assistant
// cost the routes nothing.
//
// The address is worth more than it used to be. Every page that shows one
// record at a time now carries that record's id in a search param, so
// this floor already names the workflow, bot, alert or script on screen
// before any page-specific surface has a chance to mount.
//
// Anything richer than this a page or pane publishes for itself with
// `useAssistantSurface`.

import { useSyncExternalStore } from 'react'
import { useLocation } from '@tanstack/react-router'

import { CHART_SERVICE_NAME } from './chart-service'
import { useAssistantSurface } from './use-assistant-surface'
import type { ChartServiceHandle } from './chart-service'
import type { AssistantSuggestion } from './types'
import { useServiceRegistry } from '@/lib/service-registry-context'
import { TERMINAL_PAGES, pageForPath } from '@/lib/routing/pages'

// ── The page ─────────────────────────────────────────────────────────

/**
 * The address, read back through the page table. Every page that shows
 * one thing at a time carries that thing's id in a search param, so this
 * surface can name it — "the Workflows page, workflow wf-42 open" — even
 * before the page's own surface has mounted, and for the pages that never
 * publish one of their own.
 *
 * Lowest rank of anything mounted: a page that describes itself always
 * knows more than its URL does.
 */
function RouteSurface() {
  const { pathname, search, searchStr } = useLocation()
  const page = pageForPath(pathname)
  const entry = page ? TERMINAL_PAGES[page] : null
  const href = `${pathname}${searchStr}`

  const target =
    entry?.targetParam && typeof search === 'object' && search !== null
      ? (search as Record<string, unknown>)[entry.targetParam]
      : undefined
  const targetId = typeof target === 'string' ? target : null

  useAssistantSurface({
    id: 'route',
    getPriority: () => -100,
    revision: href,
    getContext: () => {
      if (!entry) return { summary: `The user is at ${href}.` }
      const naming =
        targetId && entry.targetNoun
          ? ` The address names the ${entry.targetNoun} "${targetId}", which is the one they are looking at.`
          : ''
      return {
        summary: `The user is on ${entry.screen} (${href}).${naming}`,
        detail: {
          url: href,
          page,
          ...(targetId && entry.targetParam
            ? { [entry.targetParam]: targetId }
            : {}),
        },
      }
    },
    getSuggestion: (): AssistantSuggestion | null =>
      entry ? { key: `assistantDock.suggest.${entry.suggestion}` } : null,
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
