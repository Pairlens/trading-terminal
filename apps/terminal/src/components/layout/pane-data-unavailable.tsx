// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { RotateCw, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { alternativeVenuesFor } from '@/lib/market-ref/resolve'
import { usePredictionOutcome } from '@/stores/prediction-directory-store'
import { usePairAvailabilityStore } from '@/stores/pair-availability-store'
import { predictionQuestionOf } from '@/components/pair-picker/pair-picker-data'
import { isOpaqueTitle, shortenId } from '@/lib/predictions/event-labels'

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
 *
 * That recovery is WRONG for a prediction outcome and is suppressed for one.
 * `BTC-USDT` is the same asset on fifteen venues; `KXBTCD-26AUG15-T53` is one
 * contract on one venue, so offering "try OKX / Binance" is not a lesser
 * suggestion, it is a nonsensical one — no other venue has ever heard of that
 * key. What replaces it is what the user can actually act on: the question
 * they picked, the venue it lives on, and a retry, since a single refused
 * request is the likeliest reason an outcome that exists reported no data.
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
  const clearVerdict = usePairAvailabilityStore((s) => s.clear)
  const current = markets.find((m) => m.value === market)

  // The pin, then the venue's own asset class: a shared link arrives with no
  // pin, and the venue still knows what it trades.
  const pinned = usePredictionOutcome(pairKey)
  const isPrediction =
    pinned !== null || (current?.assetClasses.includes('prediction') ?? false)

  // An NFT collection with no candles is almost never an unlisted collection.
  // It is the OpenSea key not being configured, and "try another connector
  // that lists it" sends someone hunting for a venue when the fix is a field
  // in the Plugin Store.
  const isNft = current?.assetClasses.includes('nft') ?? false

  // Same class only, and skip venues this build cannot reach, or the recovery
  // just moves the wall: "AAPL is not on Alpaca, try Binance" was offered, and
  // it is another dead pane one click away. An outcome has no alternatives at
  // all — see the header, and `alternativeVenuesFor` says so for every
  // venue-bound class rather than only for the pinned ones.
  const alternatives =
    onSelectMarket && !isPrediction && !isNft
      ? alternativeVenuesFor(current, markets).slice(0, 4)
      : []

  // A venue this build cannot reach is a platform statement, not a listing
  // one, and it has its own card. Compact panes keep the sentence instead:
  // the chart beside them is already carrying the download CTA.
  if (isPrediction && current?.desktopOnly && !compact) {
    return (
      <PaneDesktopOnly
        descriptionKey="layout.paneUnavailable.desktopOnlyDescription"
        titleKey="layout.paneUnavailable.desktopOnlyTitle"
      />
    )
  }

  // What the user picked, not the routing key they never typed. The event
  // heading is the backstop for a pin made before the label rules landed, or
  // by a venue that publishes no question at all.
  const label = pinned
    ? readablePinLabel(predictionQuestionOf(pinned), pinned.eventTitle)
    : pairKey

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
                pair: label,
                venue: current.label,
              })
            : t('layout.paneUnavailable.titleAnyVenue', { pair: label })}
        </p>
        <p
          className={cn(
            'mt-1 text-muted-foreground',
            compact ? 'text-[10px] leading-snug' : 'text-xs',
          )}
        >
          {isPrediction
            ? t('layout.paneUnavailable.predictionDescription')
            : isNft
              ? t('layout.paneUnavailable.nftDescription')
              : t('layout.paneUnavailable.description')}
        </p>

        {/* Retry, not "try another venue": dropping this session's verdict is
            what makes the stream probe the venue again. Only where the pane
            has room for a control — compact panes carry no CTA by design. */}
        {isPrediction && !compact && (
          <Button
            className="mt-4 h-7 gap-1.5 px-2 text-xs"
            onClick={() => clearVerdict(market, pairKey)}
            size="sm"
            variant="outline"
          >
            <RotateCw className="size-3.5" />
            {t('layout.paneUnavailable.retry')}
          </Button>
        )}

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

/** Prefer the question; fall back to the event heading; shorten a bare id. */
function readablePinLabel(question: string, eventTitle?: string): string {
  if (!isOpaqueTitle(question)) return question
  return eventTitle || shortenId(question)
}
