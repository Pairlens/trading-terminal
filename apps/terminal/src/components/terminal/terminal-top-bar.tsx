// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { Separator } from '@pairlens/ui/components/ui/separator'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { MarketOption } from '@/hooks/use-available-markets'
import { LayoutToolbar } from '@/components/layout/layout-toolbar'
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
      <Button
        size="icon-xs"
        variant="ghost"
        className="size-6"
        onClick={onStarClick}
        aria-label={t('terminal.manageWatchlists')}
      >
        <Star
          className={cn(
            'size-3.5',
            isWatched
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground',
          )}
        />
      </Button>
      <AlertBell pairKey={streamKey} market={market} />

      <Separator orientation="vertical" className="mx-1 self-stretch" />

      {/* Market + Wallet — grouped as a trading context pair. The picker is
          scoped to what is being charted: a venue that cannot serve this
          class is not a choice, it is a dark terminal one click away. */}
      <MarketPicker
        market={market}
        marketOptions={marketOptions}
        assetClass={assetClass}
        onMarketChange={onMarketChange}
        onMarketHover={onMarketHover}
        aria-label={t('terminal.market')}
      />

      <WalletSelector market={market} />

      <LivePriceTicker prediction={predictionPrices} />

      <ConnectionIndicator />

      <LatencyIndicator
        market={market}
        pairKey={streamKey}
        venueLabel={marketOptions.find((m) => m.value === market)?.label}
      />
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
    <>
      <Separator orientation="vertical" className="mx-1 self-stretch" />
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="text-green-400">{format(bestBid)}</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-red-400">{format(bestAsk)}</span>
        {spread != null && (
          <span className="text-muted-foreground/60">({format(spread)})</span>
        )}
      </div>
    </>
  )
}
