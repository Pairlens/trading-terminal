// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The questions that changed their mind in the last day.
 *
 * The move is stated the way a prediction market reads it: in POINTS, not in
 * percent and not in cents. A contract going from 64 to 78 moved fourteen
 * points; calling that "+21.9%" is arithmetically true and useless, because
 * the thing being measured is a probability and probabilities are compared by
 * subtraction. The cents live on the board's tradeable chips, where a price is
 * what you pay rather than what the market believes.
 *
 * Every row leads with its EVENT. A rail titled from the market printed
 * "Harry Kane", "December 31" and "↓ 65,000" — three true strings, none of
 * which names a question — so the market's own label now rides along as a
 * muted qualifier and only when it adds something.
 *
 * Venues that do not publish a 24h move are excluded and NAMED in the footer.
 * Leaving them in silently would make a venue that publishes nothing look like
 * a venue where nothing happened, which is the one wrong answer this pane can
 * give.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp } from 'lucide-react'

import { cn } from '@pairlens/ui'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  usePredictionEvents,
  usePredictionVenues,
} from '@/hooks/use-prediction-events'
import { collectOddsMovers, formatMovePoints } from '@/lib/predictions/movers'
import { useDiscoveryCategory } from '@/lib/predictions/discovery-filter-store'
import { usePredictionSelect } from '@/lib/predictions/navigate'

/** Rows before the rail stops being a summary. */
const MAX_ROWS = 20

export function OddsMoversPane() {
  const { t } = useTranslation()
  const venues = usePredictionVenues()
  const category = useDiscoveryCategory()
  const select = usePredictionSelect()

  const { data, isLoading } = usePredictionEvents({
    venues,
    query: '',
    category: null,
  })

  const { rows, venuesWithoutChange } = useMemo(
    () => collectOddsMovers(data, { category, limit: MAX_ROWS }),
    [data, category],
  )

  if (venues.length === 0) {
    return (
      <PaneEmpty
        body={t('events.noVenuesBody')}
        icon={TrendingUp}
        title={t('events.noVenuesTitle')}
      />
    )
  }

  const footer =
    venuesWithoutChange.length > 0 ? (
      <p className="border-t px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {t('oddsMovers.noChangeFrom', {
          venues: venuesWithoutChange.join(', '),
        })}
      </p>
    ) : null

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <PaneEmpty
            body={
              isLoading
                ? t('oddsMovers.loadingBody')
                : t('oddsMovers.emptyBody')
            }
            icon={TrendingUp}
            title={
              isLoading
                ? t('oddsMovers.loadingTitle')
                : t('oddsMovers.emptyTitle')
            }
          />
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <p className="shrink-0 border-b px-3 py-2 text-[11px] text-muted-foreground">
        {t('oddsMovers.subtitle')}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => {
          const up = row.change > 0
          return (
            <button
              className="flex w-full flex-col gap-1.5 border-b border-border/50 px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent/40"
              key={row.key}
              onClick={() =>
                select.select({
                  venue: row.market,
                  event: row.event,
                  market: row.marketSummary,
                  pairKey: row.outcome.pairKey,
                  label: row.outcome.label,
                })
              }
              type="button"
            >
              <span className="line-clamp-2 text-[11.5px] leading-snug">
                {row.title}
                {row.qualifier && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {row.qualifier}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {/* The bar is the CURRENT probability, so the row reads as a
                    level with a move on it rather than as a move alone. */}
                <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      up ? 'bg-up' : 'bg-down',
                    )}
                    style={{ width: `${Math.round(row.price * 100)}%` }}
                  />
                </span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-[11px] tabular-nums',
                    up ? 'text-up' : 'text-down',
                  )}
                >
                  {formatMovePoints(row.previous, row.price)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {footer}
    </div>
  )
}
