// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

/**
 * Graceful empty state shown when a connector carries no data for the active
 * pair — typically because the pair isn't listed on that exchange (BTC-USDT on
 * Bitvavo, which quotes in EUR). Replaces the indefinite spinner every
 * market-data pane used to sit on.
 *
 * Every pane bound to the pair shows it, so the terminal says one thing rather
 * than the chart giving up while the book keeps rendering the last venue's
 * depth. `compact` is the version for the narrow panes: same sentence, no
 * recovery buttons, because the chart pane beside them already carries the CTA
 * and four copies of it would be noise.
 *
 * The CTA offers to switch to another connector that may carry the pair, which
 * is the common recovery path (e.g. BTC-USDT not on Coinbase → try OKX). We
 * don't claim a specific reason since connectors don't expose an authoritative
 * instrument list; "no data" is the honest, useful message.
 */
export function PaneDataUnavailable({
  pairKey,
  market,
  compact = false,
  onSelectMarket,
}: {
  pairKey: string
  market: string
  /** Narrow-pane layout: tighter type, no venue-switch buttons. */
  compact?: boolean
  /** Omit to render without a recovery CTA. */
  onSelectMarket?: (market: string) => void
}) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const current = markets.find((m) => m.value === market)
  // Skip venues this build cannot reach, or the recovery just moves the wall.
  const alternatives = onSelectMarket
    ? markets.filter((m) => m.value !== market && !m.desktopOnly).slice(0, 4)
    : []

  return (
    // `flex-1`, not just `h-full`: the parent is a flex ROW, so without it this
    // box is only as wide as its content and `justify-center` centers nothing —
    // the message sits pinned to the left edge of a wide pane.
    <div
      className={cn(
        'flex min-h-0 flex-1 items-center justify-center',
        compact ? 'h-full p-3' : 'p-6',
      )}
    >
      <div
        className={cn('text-center', compact ? 'max-w-[15rem]' : 'max-w-xs')}
      >
        <SearchX
          className={cn(
            'mx-auto text-muted-foreground/40',
            compact ? 'mb-2 size-5' : 'mb-3 size-8',
          )}
        />
        {/* Two keys rather than English's " on {venue}" tail: word order and
            case around the venue differ per language, so the sentence has to
            be translated whole. */}
        <p
          className={cn(
            'font-medium text-foreground',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {current
            ? t('layout.paneUnavailable.title', {
                pair: pairKey,
                venue: current.label,
              })
            : t('layout.paneUnavailable.titleAnyVenue', { pair: pairKey })}
        </p>
        <p
          className={cn(
            'mt-1 text-muted-foreground',
            compact ? 'text-[10px] leading-snug' : 'text-xs',
          )}
        >
          {t('layout.paneUnavailable.description')}
        </p>

        {alternatives.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {alternatives.map((m) => (
              <Button
                key={m.value}
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => onSelectMarket?.(m.value)}
              >
                {m.iconUrl && (
                  <img
                    src={m.iconUrl}
                    alt=""
                    className="size-3.5 rounded-full"
                  />
                )}
                {m.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
