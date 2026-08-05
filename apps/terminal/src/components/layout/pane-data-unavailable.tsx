// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

/**
 * Graceful empty state shown when a connector delivers no data for the active
 * pair within the timeout (`useCandleStream().noData`) — typically because the
 * pair isn't listed on that exchange. Replaces the old indefinite spinner.
 *
 * The CTA offers to switch to another connector that may carry the pair, which
 * is the common recovery path (e.g. BTC-USDT not on Coinbase → try OKX). We
 * don't claim a specific reason since connectors don't expose an authoritative
 * instrument list; "no data" is the honest, useful message.
 */
export function PaneDataUnavailable({
  pairKey,
  market,
  onSelectMarket,
}: {
  pairKey: string
  market: string
  onSelectMarket: (market: string) => void
}) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const current = markets.find((m) => m.value === market)
  // Skip venues this build cannot reach, or the recovery just moves the wall.
  const alternatives = markets
    .filter((m) => m.value !== market && !m.desktopOnly)
    .slice(0, 4)

  return (
    // `flex-1`, not just `h-full`: the parent is a flex ROW, so without it this
    // box is only as wide as its content and `justify-center` centers nothing —
    // the message sits pinned to the left edge of a wide pane.
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-xs text-center">
        <SearchX className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        {/* Two keys rather than English's " on {venue}" tail: word order and
            case around the venue differ per language, so the sentence has to
            be translated whole. */}
        <p className="text-sm font-medium text-foreground">
          {current
            ? t('layout.paneUnavailable.title', {
                pair: pairKey,
                venue: current.label,
              })
            : t('layout.paneUnavailable.titleAnyVenue', { pair: pairKey })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
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
                onClick={() => onSelectMarket(m.value)}
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
