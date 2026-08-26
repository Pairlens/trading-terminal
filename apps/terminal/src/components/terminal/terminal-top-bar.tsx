// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { MarketOption } from '@/hooks/use-available-markets'
import { LayoutToolbar } from '@/components/layout/layout-toolbar'
import { HEADER_GROUP, HEADER_ICON } from '@/components/chrome/header-chrome'
import { PageHeader } from '@/components/page-header'
import { ConnectionIndicator } from '@/components/terminal/connection-indicator'
import { LatencyIndicator } from '@/components/terminal/latency-indicator'
import { MarketPicker } from '@/components/terminal/market-picker'
import { WalletSelector } from '@/components/terminal/wallet-selector'
import { AlertBell } from '@/components/notifications/alert-bell'
import { MarketAssetClassBadge } from '@/components/asset-class/market-asset-class-badge'
import { PairSwitcher } from '@/components/pair-picker/pair-switcher'
import { formatPredictionPrice, formatPrice } from '@/lib/format-price'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import { useOptionalTickerData } from '@/lib/chart-terminal-context'

type TerminalTopBarProps = {
  marketOptions: Array<MarketOption>
  /** The instrument's own identity: what the switcher names and the star saves. */
  pairKey: string
  /**
   * What is actually streaming, when that is not the same thing.
   *
   * A prediction pair is an EVENT and an event has no book, so the readouts
   * that need one (the latency probe's trade subscription, an alert's binding)
   * take the selected answer instead. Everything else in the bar stays on the
   * event, because that is what the user opened. Defaults to `pairKey` for
   * every class where the two coincide.
   */
  streamPairKey?: string
  assetClass?: InstrumentClass
  isWatched: boolean
  onStarClick: () => void
  market: string
  onMarketChange: (market: string) => void
  /** Speculative pre-connect when a venue in the dropdown is hovered/focused. */
  onMarketHover?: (market: string) => void
  /** Speculative pre-connect when a pair result is dwelled on in the switcher. */
  onPairHover?: (pair: string) => void
  workspacesOpen?: boolean
  onWorkspacesOpenChange?: (open: boolean) => void
}

export function TerminalTopBar({
  marketOptions,
  pairKey,
  streamPairKey,
  assetClass,
  isWatched,
  onStarClick,
  market,
  onMarketChange,
  onMarketHover,
  onPairHover,
  workspacesOpen,
  onWorkspacesOpenChange,
}: TerminalTopBarProps) {
  const { t } = useTranslation()
  // A probability quote reads in cents everywhere else on the screen; the one
  // readout still saying $0.229 would be the odd number out.
  const predictionPrices = useIsPredictionPair(pairKey, market)
  const streamKey = streamPairKey ?? pairKey

  return (
    <PageHeader
      actions={
        <LayoutToolbar
          open={workspacesOpen}
          onOpenChange={onWorkspacesOpenChange}
        />
      }
    >
      {/* Three groups, held apart by space rather than by rules: what you are
          looking at, where you are trading it, and what it costs right now. */}
      <div className={HEADER_GROUP}>
        <PairSwitcher
          pairKey={pairKey}
          assetClass={assetClass}
          onPairHover={onPairHover}
        />
        {/* Which kind of market this is, before anything else in the header
          claims a number. The class is what decides whether an order settles
          in seconds or at the opening auction, and it used to be readable only
          from the shape of the symbol.

          Compact and collapsible, because this row is exactly full at 1280px
          and the pair symbol is the only element on it that shrinks: below
          1400px the badge is its class icon in the class colour, and the words
          come back when the window can afford them. */}
        {assetClass ? (
          <MarketAssetClassBadge
            cls={assetClass}
            market={market}
            pairKey={pairKey}
            size="xs"
            collapsible
          />
        ) : null}
        <button
          type="button"
          className={HEADER_ICON}
          onClick={onStarClick}
          aria-label={t('terminal.manageWatchlists')}
        >
          <Star
            className={cn(
              'size-3.5',
              isWatched && 'fill-amber-400 text-amber-400',
            )}
          />
        </button>
        <AlertBell pairKey={streamKey} market={market} />
      </div>

      {/* Market + Wallet — grouped as a trading context pair. The picker is
          scoped to what is being charted: a venue that cannot serve this
          class is not a choice, it is a dark terminal one click away. The
          exception it makes is the perpetual of a spot pair (and the reverse),
          which is the same asset under another id — it gets its own section
          rather than being hidden. */}
      <div className={HEADER_GROUP}>
        <MarketPicker
          market={market}
          marketOptions={marketOptions}
          assetClass={assetClass}
          instrumentId={pairKey}
          onMarketChange={onMarketChange}
          onMarketHover={onMarketHover}
          aria-label={t('terminal.market')}
        />
        <WalletSelector market={market} />
      </div>

      {/* The one group that gives way. Under 1024px the bar cannot hold the
          quote, the link light and the latency as well as everything left of
          them, and the price is the only one of the three that is also on the
          chart a few pixels below. */}
      <div className={cn(HEADER_GROUP, 'max-lg:hidden')}>
        <LivePriceTicker prediction={predictionPrices} />
        <ConnectionIndicator />
        <LatencyIndicator
          market={market}
          pairKey={streamKey}
          venueLabel={marketOptions.find((m) => m.value === market)?.label}
        />
      </div>
    </PageHeader>
  )
}

// ── Live price ticker ─────────────────────────────────────────────────
//
// Isolated in its own component so per-tick ticker context updates only
// re-render this small readout — not the whole top bar (market dropdown,
// layout toolbar, wallet selector, ...).
function LivePriceTicker({ prediction }: { prediction: boolean }) {
  const tickerData = useOptionalTickerData()
  const format = prediction ? formatPredictionPrice : formatPrice
  const bestBid = tickerData?.bestBid ?? null
  const bestAsk = tickerData?.bestAsk ?? null
  const spread = tickerData?.spread ?? null

  if (bestBid == null || bestAsk == null) return null

  return (
    // `--up` / `--down`, not raw greens and reds: these two colours mean the
    // same thing everywhere in the terminal and a theme repaints them together.
    <div className="flex items-center gap-[5px] font-mono text-xs tabular-nums">
      <span className="text-up">{format(bestBid)}</span>
      <span className="text-muted-foreground/60">/</span>
      <span className="text-down">{format(bestAsk)}</span>
      {spread != null && (
        <span className="text-muted-foreground">({format(spread)})</span>
      )}
    </div>
  )
}
