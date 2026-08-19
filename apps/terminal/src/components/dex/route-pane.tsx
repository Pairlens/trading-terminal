// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How the aggregator would split the swap, so the slippage on the ticket has
 * a stated cause.
 *
 * The size is a PROBE, not the ticket's. The ticket owns its own amount and
 * this pane deliberately does not reach into it: `trade-entry-pane` publishes
 * no intent, and coupling a pane to another pane's internals is the kind of
 * seam that breaks the first time the ticket is refactored. So the pane quotes
 * a stated notional, says which one, and lets the reader change it. Wiring the
 * live ticket amount in is an integration follow-up (see the report), and when
 * it lands the only change here is where `sizeUsd` comes from.
 *
 * Everything shown is a real quote through the same `getRoute`/`quote`
 * endpoint an order would take. Nothing on this path signs.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Waypoints } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { SwapRouteLeg } from '@pairlens/market-engine/types'

import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { ShareBar } from '@/components/dex/dex-pane-primitives'
import { usePoolStats } from '@/hooks/use-pool-stats'
import { useSwapRoute } from '@/hooks/use-swap-route'
import { dexChain } from '@/lib/dex/chain-catalog'
import { impactTier, usdToQuoteUnits } from '@/lib/dex/pool-math'
import { formatAmount, formatCompactUsd } from '@/lib/format-price'

/** Probe sizes the pane offers. The first is the default. */
const PROBE_USD = [1_000, 10_000, 100_000] as const

export function RoutePane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return (
    <RoutePaneInner market={activePair.market} pairKey={activePair.pairKey} />
  )
}

function RoutePaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const chain = dexChain(market)
  const [sizeUsd, setSizeUsd] = useState<number>(PROBE_USD[0])

  // The pool's own quote-leg price is what turns a dollar probe into units of
  // the token being spent. Without it there is no honest size to quote.
  const { stats } = usePoolStats(market, pairKey, Boolean(chain))
  const size = usdToQuoteUnits(sizeUsd, stats?.quotePriceUsd ?? null)

  const { quote, isLoading, noRoute, error } = useSwapRoute(
    { market, pairKey, side: 'buy', size },
    Boolean(chain),
  )

  const legs = useMemo(() => quote?.legs ?? [], [quote])
  const level = impactTier(quote?.priceImpact ?? null)

  if (!chain) {
    return (
      <PaneEmpty
        icon={Waypoints}
        title={t('swapRoute.notOnChainTitle')}
        body={t('swapRoute.notOnChainBody')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5">
        <span className="truncate text-[10px] text-muted-foreground">
          {t('swapRoute.probeLabel')}
        </span>
        <div className="flex shrink-0 gap-1">
          {PROBE_USD.map((usd) => (
            <button
              key={usd}
              type="button"
              onClick={() => setSizeUsd(usd)}
              aria-pressed={usd === sizeUsd}
              className={cn(
                'rounded-md px-1.5 py-0.5 font-mono text-[10.5px] transition-colors',
                usd === sizeUsd
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {formatCompactUsd(usd)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="pt-2">
          <PaneErrorBanner venue={chain.displayName} message={error} />
        </div>
      ) : null}

      {legs.length === 0 ? (
        <PaneEmpty
          icon={Waypoints}
          title={
            isLoading
              ? t('swapRoute.loadingTitle')
              : noRoute || size === null
                ? t('swapRoute.noRouteTitle')
                : t('swapRoute.emptyTitle')
          }
          body={
            isLoading
              ? t('swapRoute.loadingBody')
              : size === null
                ? t('swapRoute.noQuotePriceBody')
                : t('swapRoute.noRouteBody')
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto py-1.5">
          {legs.map((leg, index) => (
            <RouteLegRow
              key={`${leg.venue}-${index}`}
              leg={leg}
              outputSymbol={quote?.outputSymbol ?? ''}
              tone={index === 0 ? 'accent' : index === 1 ? 'up' : 'caution'}
            />
          ))}
        </div>
      )}

      {quote ? (
        <div className="shrink-0 pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {t('swapRoute.youReceive')}
            </span>
            <span className="font-mono text-[11.5px] [font-variant-numeric:tabular-nums]">
              {formatAmount(quote.amountOut)} {quote.outputSymbol}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {t('swapRoute.priceImpact')}
            </span>
            <span
              className={cn(
                'font-mono text-[11.5px] [font-variant-numeric:tabular-nums]',
                level === 'high' && 'text-down',
                level === 'moderate' && 'text-[var(--chart-4)]',
                level === 'low' && 'text-up',
              )}
            >
              {quote.priceImpact === null
                ? '—'
                : `${(quote.priceImpact * 100).toFixed(2)}%`}
            </span>
          </div>
          {quote.gasUsd !== null ? (
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {t('swapRoute.networkFee')}
              </span>
              <span className="font-mono text-[11.5px] [font-variant-numeric:tabular-nums]">
                {formatCompactUsd(quote.gasUsd)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RouteLegRow({
  leg,
  outputSymbol,
  tone,
}: {
  leg: SwapRouteLeg
  outputSymbol: string
  tone: 'accent' | 'up' | 'caution'
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ShareBar fraction={leg.share} tone={tone} />
        </div>
        <span className="w-9 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground [font-variant-numeric:tabular-nums]">
          {`${Math.round(leg.share * 100)}%`}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate">{leg.venue}</span>
        <span className="shrink-0 font-mono text-muted-foreground [font-variant-numeric:tabular-nums]">
          {leg.amountOut === null
            ? ''
            : `${formatAmount(leg.amountOut)} ${outputSymbol}`}
        </span>
      </div>
    </div>
  )
}
