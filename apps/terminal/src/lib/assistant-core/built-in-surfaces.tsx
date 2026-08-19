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
// The instrument routes are read the same way. `/{class}/{venue}/{id}`
// carries the asset class, the tape and the id in the address itself, so
// this floor names the exact thing being charted on every one of the five
// classes without any of them cooperating — and, just as importantly, it
// is what the market tools DEFAULT TO. Without it a board whose chart is
// not a candle chart (a prediction event, whose chart is a probability
// chart) left the tools with no instrument at all, and their fallback
// answered about BTC-USDT on okx.
//
// Anything richer than this a page or pane publishes for itself with
// `useAssistantSurface`.

import { useSyncExternalStore } from 'react'
import { useLocation } from '@tanstack/react-router'

import { parseMarketRefPath } from '@pairlens/shared/market-ref'

import { CHART_SERVICE_NAME } from './chart-service'
import { useAssistantSurface } from './use-assistant-surface'
import type { MarketRef } from '@pairlens/shared/market-ref'
import type { ChartServiceHandle } from './chart-service'
import type { AssistantSuggestion, AssistantSurfaceFocus } from './types'
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
/** Model-facing asset-class names. The i18n labels are for humans. */
const CLASS_NAMES: Record<MarketRef['cls'], string> = {
  spot: 'spot crypto',
  perp: 'perpetual futures',
  dex: 'on-chain DEX',
  stocks: 'US equities',
  prediction: 'prediction market',
}

function RouteSurface() {
  const { pathname, search, searchStr } = useLocation()
  const page = pageForPath(pathname)
  const entry = page ? TERMINAL_PAGES[page] : null
  const href = `${pathname}${searchStr}`

  // The instrument routes are not in the page table — they are not pages,
  // they are addresses of one instrument each — so they are parsed rather
  // than looked up. `?o=` is read alongside, because on a prediction event
  // it names the leg the book, the tape and the ticket are pointed at.
  const ref = page ? null : parseMarketRefPath(pathname)
  const outcome =
    typeof search === 'object' && search !== null
      ? (search as Record<string, unknown>)['o']
      : undefined
  const selectedLeg = typeof outcome === 'string' ? outcome : null

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
      if (ref) {
        const leg = selectedLeg
          ? ` The selected outcome is "${selectedLeg}" — that is the leg with a book, a tape and a ticket.`
          : ''
        return {
          summary: `The user is on the ${CLASS_NAMES[ref.cls]} terminal for "${ref.id}" on ${ref.market} (${href}).${leg}`,
          detail: {
            url: href,
            assetClass: ref.cls,
            venue: ref.market,
            instrument: ref.id,
            ...(selectedLeg ? { selectedOutcome: selectedLeg } : {}),
          },
        }
      }
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
    // The floor under every instrument route. A prediction desk or a chart
    // pane outranks it and names something more precise; with neither
    // mounted this is still a real venue and a real id, which is the whole
    // difference between reading the market the user is on and guessing.
    getFocus: (): AssistantSurfaceFocus | null =>
      ref ? { market: ref.market, pair: selectedLeg ?? ref.id } : null,
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
    // A mounted candle chart IS the instrument, so it outranks the address
    // it sits on: the address of a prediction event names the question,
    // and only the chart knows which leg is being streamed.
    getFocus: (): AssistantSurfaceFocus | null =>
      chart
        ? {
            market: chart.market,
            pair: chart.pair,
            timeframe: chart.timeframe,
          }
        : null,
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
