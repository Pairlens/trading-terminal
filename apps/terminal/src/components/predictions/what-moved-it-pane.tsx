// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * When this question changed its mind, and by how much.
 *
 * The timeline is built from the probability history the chart is already
 * streaming — no second subscription — and it always works: every row states a
 * date, a signed move in cents, the levels it moved between, and the contracts
 * that traded while it did.
 *
 * The headline column is the honest half. The news feed is keyed by ticker and
 * a prediction question usually names none ("Will the Fed cut rates at the
 * September FOMC meeting?"), so headlines attach only where the question names
 * an instrument the feed indexes. When they do attach, the match is by TIME —
 * the last headline published while the market was repricing — which is a
 * correlation the reader can check rather than a claim about cause. The footer
 * says exactly that, so an empty column is never mistaken for a quiet week.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { usePluginFetch } from '@pairlens/plugin-sdk'
import { useQuery } from '@tanstack/react-query'
import type { NewsFeedResponse } from '@pairlens/shared/instrument-types'

import type { ProbabilityMove } from '@/lib/predictions/moves'
import { PaneEmpty, PaneFootnote, Th } from '@/components/panes/pane-primitives'
import { fetchNewsPage } from '@/components/news/news-shared'
import { usePanePair } from '@/lib/layout/pane-context'
import { useOptionalCandleData } from '@/lib/chart-terminal-context'
import { usePredictionOutcome } from '@/stores/prediction-directory-store'
import { predictionQuestionOf } from '@/components/pair-picker/pair-picker-data'
import {
  candleSpacingMs,
  detectProbabilityMoves,
  movesWindowBars,
} from '@/lib/predictions/moves'
import { headlineDuring, newsTickerFor } from '@/lib/predictions/news-match'
import { formatPredictionPrice } from '@/lib/format-price'

/** Smallest move worth a row. Below this it is book noise, not a repricing. */
const MIN_DELTA_CENTS = 3

/** Rows the strip has room for. */
const MAX_MOVES = 8

export function WhatMovedItPane() {
  const { t } = useTranslation()
  const pane = usePanePair()
  const candleData = useOptionalCandleData()
  const pinned = usePredictionOutcome(pane?.pairKey ?? '')

  const candles = candleData?.candles ?? []
  const moves = useMemo(() => {
    if (candles.length < 4) return []
    const spacing = candleSpacingMs(candles)
    return detectProbabilityMoves(candles, {
      windowBars: movesWindowBars(spacing, candles.length),
      minDeltaCents: MIN_DELTA_CENTS,
      limit: MAX_MOVES,
    })
  }, [candles])

  const subject = pinned
    ? `${pinned.eventTitle ?? ''} ${predictionQuestionOf(pinned)}`
    : (pane?.pairKey ?? '')
  const ticker = newsTickerFor(subject)
  const articles = useNewsForTicker(ticker, moves.length > 0)

  if (!pane) {
    return (
      <PaneEmpty
        body={t('whatMovedIt.noPairBody')}
        icon={History}
        title={t('whatMovedIt.noPairTitle')}
      />
    )
  }

  if (moves.length === 0) {
    const loading = candleData?.status === 'connecting' || candles.length === 0
    return (
      <PaneEmpty
        body={
          loading ? t('whatMovedIt.loadingBody') : t('whatMovedIt.flatBody')
        }
        icon={History}
        title={
          loading ? t('whatMovedIt.loadingTitle') : t('whatMovedIt.flatTitle')
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full table-fixed text-[11px]">
          <colgroup>
            <col className="w-[86px]" />
            <col className="w-[78px]" />
            <col />
            <col className="w-[150px]" />
          </colgroup>
          {/* Paints the column's own card surface, not the page's: a
              sticky bg-background thead reads as a hole once the pane sits
              on a --card column. */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              <Th>{t('whatMovedIt.columns.when')}</Th>
              <Th>{t('whatMovedIt.columns.move')}</Th>
              <Th>{t('whatMovedIt.columns.what')}</Th>
              <Th align="right">{t('whatMovedIt.columns.traded')}</Th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move) => (
              <MoveRow
                article={
                  articles
                    ? headlineDuring(articles, move.startTs, move.endTs)
                    : null
                }
                key={move.endTs}
                move={move}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaneFootnote className="leading-relaxed">
        {ticker
          ? t('whatMovedIt.footerMatched', { ticker })
          : t('whatMovedIt.footerNoTicker')}
      </PaneFootnote>
    </div>
  )
}

function MoveRow({
  move,
  article,
}: {
  move: ProbabilityMove
  article: ReturnType<typeof headlineDuring>
}) {
  const { t } = useTranslation()
  const up = move.deltaCents > 0

  return (
    <tr className="border-b border-border/40 last:border-0 align-middle">
      <td className="py-1.5 pr-3 font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatMoveDate(move.endTs)}
      </td>
      <td className="py-1.5 pr-3">
        <span
          className={cn(
            'inline-flex rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums',
            up ? 'bg-up/20 text-up' : 'bg-down/20 text-down',
          )}
        >
          {up ? '+' : '−'}
          {formatPredictionPrice(Math.abs(move.deltaCents) / 100)}
        </span>
      </td>
      <td className="min-w-0 py-1.5 pr-3">
        {article ? (
          <a
            className="line-clamp-2 text-[11.5px] leading-snug hover:underline"
            href={article.url}
            rel="noreferrer noopener"
            target="_blank"
          >
            {article.title}
          </a>
        ) : (
          <span className="text-[11.5px] leading-snug text-muted-foreground">
            {t('whatMovedIt.movedFromTo', {
              from: formatPredictionPrice(move.from),
              to: formatPredictionPrice(move.to),
            })}
          </span>
        )}
      </td>
      <td className="py-1.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {article ? (
          <span className="font-sans">{article.source}</span>
        ) : move.volume > 0 ? (
          t('whatMovedIt.contracts', {
            count: Math.round(move.volume),
          })
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

/**
 * Headlines for the instrument the question names, or null when it names none.
 *
 * Deliberately one page and no paging: this is a garnish on a timeline that
 * stands on its own, and an infinite feed behind it would be a second news
 * pane nobody asked for. A provider outage resolves to null and the timeline
 * carries on.
 */
function useNewsForTicker(
  ticker: string | null,
  enabled: boolean,
): NewsFeedResponse['articles'] | null {
  const apiFetch = usePluginFetch()
  const { data } = useQuery({
    queryKey: ['prediction-news', ticker],
    queryFn: () =>
      fetchNewsPage(
        apiFetch,
        new URLSearchParams({ tickers: ticker! }).toString(),
      ),
    enabled: Boolean(ticker) && enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  })
  return data?.articles ?? null
}

/** `Aug 14` — the day is the resolution a repricing is remembered at. */
function formatMoveDate(ts: number): string {
  const date = new Date(ts)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
