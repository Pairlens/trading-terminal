// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The selected pool at a glance, one click from its chart.
 *
 * The stat list only shows what the provider published: turnover collapses
 * without a liquidity figure, the trade count collapses on a listing that
 * carries none, and the fee tier collapses on every venue that does not label
 * one. A grid of dashes would fill the same space and tell the reader nothing
 * about which gaps are the pool's and which are ours.
 *
 * Everything on it comes from three queries the board is already paying for.
 * The pool read fills the stats, and the same read carries the eight figures
 * that used to go unshown — the hour's move and volume, both reserves, FDV,
 * creation time, the 24h buy/sell split. The swap feed at the bottom is the
 * SAME one the flow pane beside it draws, at the same react-query key: one
 * poll, three surfaces. Adding them cost no request, and their absence was
 * what left a full-height column with eleven numbers in it.
 *
 * Two numbers here are computed rather than read, and both are deliberate. The
 * $10k price impact is a real aggregator quote at that size, not a curve
 * modelled off reserves. The hour's buy/sell pressure is summed from the swap
 * feed rather than taken from the 24h counts, because two numbers for the same
 * hour that disagreed by a rounding would read as one of the panes being
 * broken.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Info } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'
import type { PoolTrade } from '@pairlens/shared/instrument-types'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { PairLogo } from '@/components/pair-picker/pair-avatar'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import {
  DISCOVERY_POOL_LISTING,
  usePoolListing,
  usePoolStats,
  usePoolTrades,
} from '@/hooks/use-pool-stats'
import { usePriceImpactTiers } from '@/hooks/use-price-impact-tiers'
import { useDexDiscoveryStore } from '@/lib/dex/discovery-store'
import { dexChain, explorerAddressUrl } from '@/lib/dex/chain-catalog'
import {
  buyShare,
  impactTier,
  measurableReserveUsd,
  sumFlowSince,
  titleCaseVenue,
  truncateAddress,
  volumeToTvl,
} from '@/lib/dex/pool-math'
import { formatPoolAge } from '@/lib/dex/pool-age'
import { providerLabel } from '@/lib/dex/pool-stats-merge'
import { poolPairKey } from '@/lib/dex/pool-pair'
import { poolDetailView } from '@/lib/dex/pool-view'
import { chartLinkProps } from '@/lib/market-ref/link'
import {
  formatAmount,
  formatCompactUsd,
  formatPrice,
  formatTokenPrice,
} from '@/lib/format-price'

/** The one size this pane quotes. The three-size grid lives on the pool desk. */
const IMPACT_SIZES = [10_000] as const
const PRESSURE_WINDOW_MS = 60 * 60_000

/**
 * Swaps listed at the foot of the pane.
 *
 * Enough to fill a full-height discovery column and stop; the tape pane on the
 * pair board is where a reader goes to scroll two hundred of them. The list
 * takes whatever height is left after the stats, which is what keeps this pane
 * honest at both ends — three rows in a short cell, twelve in a tall one.
 */
const MAX_SWAP_ROWS = 12

/**
 * Dust floor for that list, in USD.
 *
 * Not a filter on the data, which is why it lives here and not in the query:
 * the pressure bar above still sums every swap, and the tape pane on the pair
 * board still lists every swap. It is a filter on TWELVE ROWS. A busy Solana
 * pool takes hundreds of sub-cent arbitrage probes a minute, and a window this
 * short filled up with rows reading "$0" while the trades that moved the price
 * scrolled past behind them.
 */
const MIN_SWAP_USD = 1

export function PoolDetailPane() {
  const { t } = useTranslation()
  const pool = useDexDiscoveryStore((s) => s.selectedPool)
  const chain = useDexDiscoveryStore((s) => s.chain)
  const pairKey = pool ? poolPairKey(pool) : undefined

  // The map's own listing, read at the identical key so this costs no request:
  // it is what decides whether "no pool selected" means "pick one" or "the map
  // beside you has not answered yet". Inviting a pick from a pane that is
  // still loading, or that the provider refused, is the board telling the
  // reader to do something it has made impossible.
  const listing = usePoolListing(chain, !pool, DISCOVERY_POOL_LISTING)

  // Pinned to the selected pool's own address, not re-resolved from the pair:
  // the map row already identified it, and the resolver would spend a request
  // to maybe pick a different pool for the same two tokens.
  const { stats, isLoading, error, throttled, retrying, filledBy } =
    usePoolStats(pool?.market, pairKey, true, pool?.address)

  // Identical arguments to the flow pane's call, which is the whole point: the
  // two panes share one react-query entry and this one costs no request.
  const { trades, error: swapsError } = usePoolTrades(pool?.market, pairKey, {
    enabled: Boolean(pool),
    poolAddress: pool?.address,
  })

  const [impact] = usePriceImpactTiers(
    pool?.market,
    pairKey,
    stats,
    Boolean(pool),
    IMPACT_SIZES,
  )

  const pressure = useMemo(() => {
    const { buyUsd, sellUsd } = sumFlowSince(
      trades,
      Date.now() - PRESSURE_WINDOW_MS,
    )
    const share = buyShare(buyUsd, sellUsd)
    return share === null ? null : { buyUsd, sellUsd, share }
  }, [trades])

  const swaps = useMemo(
    () =>
      trades
        .filter((trade) => trade.amountUsd >= MIN_SWAP_USD)
        .slice(0, MAX_SWAP_ROWS),
    [trades],
  )

  if (!pool) {
    if (listing.isLoading || listing.retrying) {
      return (
        <PaneEmpty
          icon={Info}
          title={t('poolDetail.waitingTitle')}
          body={t('poolDetail.waitingBody')}
        />
      )
    }
    return (
      <PaneEmpty
        icon={Info}
        title={
          listing.error
            ? t('poolDetail.unavailableTitle')
            : t('poolDetail.emptyTitle')
        }
        body={
          listing.error
            ? // Deliberately the pool map's sentence: the two panes are
              // describing the same refusal, and two wordings for it read as
              // two different problems.
              listing.throttled
              ? listing.error
              : t('poolMap.unavailableBody')
            : t('poolDetail.emptyBody')
        }
      />
    )
  }

  // Live pool state where we have it, the map row's own figures until then.
  // `live` is what the footer reads: the same six numbers mean different things
  // depending on whether a provider just measured the pool or the map listed it
  // five minutes ago, and only one of those is worth holding a spinner over.
  const view = poolDetailView(stats, pool.listed)

  const turnover = volumeToTvl(view.volume24hUsd, view.reserveUsd)
  const reserveUsd = measurableReserveUsd(view.reserveUsd)
  const change = view.change24hPct
  const change1h = view.change1hPct
  const venue = titleCaseVenue(pool.dexName)
  const chainName = dexChain(pool.market)?.displayName ?? null
  const impactPct = impact?.impact ?? null
  const tier = impactTier(impactPct)
  const age = formatPoolAge(view.createdAt, t)
  const baseSymbol = stats?.baseSymbol ?? pool.baseSymbol ?? ''
  const quoteSymbol = stats?.quoteSymbol ?? pool.quoteSymbol ?? ''
  const hasReserves = view.baseReserve !== null || view.quoteReserve !== null
  // Only where the quote is not a dollar. On a USDC pool the two prices are the
  // same number twice; on the SOL-quoted pools that fill a Solana map it is the
  // denominator every quote, chart and swap on that chain is actually in.
  const quotePrice =
    view.priceInQuote !== null &&
    quoteSymbol &&
    (view.quotePriceUsd === null || Math.abs(view.quotePriceUsd - 1) > 0.02)
      ? view.priceInQuote
      : null
  const poolUrl = explorerAddressUrl(pool.market, pool.address)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Identity, price, move, trend: one block separated from the stats by
          air. It used to be two ruled strips, which drew a second and a third
          line across a pane the board already frames. */}
      <div className="shrink-0 pb-2.5">
        <div className="flex items-center gap-2.5">
          {/* The two tokens, not a colour badge. The map row that selected this
              pool teaches the token directory what its base is called, so the
              address resolves to a ticker and the ticker to a logo — and where
              nothing publishes one, the avatar falls back to the same lettered
              mark every other pair in the terminal wears. */}
          <PairLogo
            base={pool.baseAddress ?? pool.baseSymbol ?? pool.name}
            quote={quoteSymbol}
            assetClass="dex"
            market={pool.market}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] font-semibold">
              {pool.name}
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {venue && chainName
                ? t('poolDetail.venueChain', { venue, chain: chainName })
                : (venue ?? chainName ?? '')}
            </p>
          </div>
        </div>
        <p className="mt-2.5 font-mono text-xl font-semibold [font-variant-numeric:tabular-nums]">
          {view.priceUsd != null ? formatPrice(view.priceUsd) : '—'}
        </p>
        {change !== null || change1h !== null ? (
          <div className="flex items-baseline gap-2.5 font-mono text-xs [font-variant-numeric:tabular-nums]">
            {change !== null ? (
              <span className={change >= 0 ? 'text-up' : 'text-down'}>
                {t('poolDetail.change24h', { value: signedPct(change) })}
              </span>
            ) : null}
            {/* The hour beside the day, and only from the live read: a listing
                row publishes no 1h move, so this is absent rather than zero
                until the pool read lands. */}
            {change1h !== null ? (
              <span className={change1h >= 0 ? 'text-up' : 'text-down'}>
                {t('poolDetail.change1h', { value: signedPct(change1h) })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The trend line pays for itself here: the pane is a decision surface,
          and the 24h number alone cannot tell a steady climb from a spike that
          already retraced. It fetches its own candles, viewport-gated.

          `allowWildcardProvider` is what makes it draw at all. No connector
          declares history for a chain, so the strict venue probe resolved
          nothing and every pool in the app settled on the flat "no history"
          line — which, stretched across a full-width slot, read as a stray
          rule under the price. */}
      <div className="shrink-0 pb-2.5">
        <MiniPriceChart
          market={pool.market}
          pair={pairKey}
          className="h-12 w-full"
          allowWildcardProvider
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <dl className="flex shrink-0 flex-col gap-2.5 text-[11.5px]">
          <StatLine
            label={t('poolDetail.liquidity')}
            value={reserveUsd !== null ? formatCompactUsd(reserveUsd) : null}
          />
          <StatLine
            label={t('poolDetail.volume24h')}
            value={
              view.volume24hUsd != null
                ? formatCompactUsd(view.volume24hUsd)
                : null
            }
          />
          {quotePrice !== null ? (
            <StatLine
              label={t('poolDetail.priceInQuote', { symbol: quoteSymbol })}
              value={formatTokenPrice(quotePrice)}
            />
          ) : null}
          {view.volume1hUsd != null ? (
            <StatLine
              label={t('poolDetail.volume1h')}
              value={formatCompactUsd(view.volume1hUsd)}
            />
          ) : null}
          <StatLine
            label={t('poolDetail.turnover')}
            value={
              turnover !== null
                ? t('poolDetail.turnoverValue', { value: turnover.toFixed(1) })
                : null
            }
          />
          {view.trades24h ? (
            <StatLine
              label={t('poolDetail.trades24h')}
              value={(
                view.trades24h.buys + view.trades24h.sells
              ).toLocaleString()}
              sub={t('poolDetail.tradesSplit', {
                buys: view.trades24h.buys.toLocaleString(),
                sells: view.trades24h.sells.toLocaleString(),
              })}
            />
          ) : null}
          <StatLine
            label={t('poolDetail.priceImpact10k')}
            value={
              impactPct !== null ? `${(impactPct * 100).toFixed(2)}%` : null
            }
            tone={
              tier === 'low'
                ? 'up'
                : tier === 'moderate'
                  ? 'caution'
                  : tier === 'high'
                    ? 'down'
                    : 'plain'
            }
          />
          {view.feeTier != null ? (
            <StatLine
              label={t('poolDetail.feeTier')}
              value={`${(view.feeTier * 100).toFixed(2)}%`}
            />
          ) : null}
          {view.fdvUsd != null ? (
            <StatLine
              label={t('poolDetail.fdv')}
              value={formatCompactUsd(view.fdvUsd)}
            />
          ) : null}
          {age ? (
            <StatLine label={t('poolDetail.poolAge')} value={age} />
          ) : null}
          {/* Both sides in token units, which is the figure an LP and a large
              taker actually size against. Only DexScreener publishes them in a
              browser, filled in behind the primary answer, so the cell is
              absent rather than dashed wherever nobody measured it. */}
          {hasReserves ? (
            <StatLine
              label={t('poolDetail.reserves')}
              value={
                view.baseReserve !== null
                  ? `${formatAmount(view.baseReserve)} ${baseSymbol}`.trim()
                  : null
              }
              sub={
                view.quoteReserve !== null
                  ? `${formatAmount(view.quoteReserve)} ${quoteSymbol}`.trim()
                  : null
              }
            />
          ) : null}
        </dl>

        {pressure ? (
          <div className="mt-3.5 shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {t('poolDetail.pressure1h')}
            </p>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
              <span
                className="bg-up"
                style={{ width: `${(pressure.share * 100).toFixed(1)}%` }}
              />
              <span className="flex-1 bg-down" />
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-[10.5px] text-muted-foreground [font-variant-numeric:tabular-nums]">
              <span className="truncate">
                {t('poolDetail.buysValue', {
                  value: formatCompactUsd(pressure.buyUsd),
                })}
              </span>
              <span className="truncate">
                {t('poolDetail.sellsValue', {
                  value: formatCompactUsd(pressure.sellUsd),
                })}
              </span>
            </div>
          </div>
        ) : null}

        {/* The day's split, where the provider publishes it. Not derived from
            the swap feed like the bar above: that window is an hour, and a 24h
            figure summed from a tape the provider truncates would be a smaller
            number wearing a bigger label. */}
        {view.buyVolume24hUsd != null && view.sellVolume24hUsd != null ? (
          <div className="mt-3 shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {t('poolDetail.flow24h')}
            </p>
            <div className="mt-1 flex justify-between gap-2 font-mono text-[10.5px] [font-variant-numeric:tabular-nums]">
              <span className="truncate text-up">
                {formatCompactUsd(view.buyVolume24hUsd)}
              </span>
              <span className="truncate text-down">
                {formatCompactUsd(view.sellVolume24hUsd)}
              </span>
            </div>
          </div>
        ) : null}

        {/* The swaps behind every number above. Last in the pane and last for a
            reason: it takes the height the stats did not, so the column reads
            as full at any size instead of ending halfway down.

            `min-h` and not `flex-1` alone: inside a scrolling column a flex
            child with nothing but `flex-1` collapses to nothing the moment the
            stats above it overflow, which on a short cell hid the list rather
            than shortening it. With a floor, the column scrolls to it. */}
        {swaps.length > 0 ? (
          <div className="mt-3.5 flex min-h-[68px] flex-1 flex-col">
            <p className="shrink-0 text-[10px] text-muted-foreground">
              {t('poolDetail.swaps')}
            </p>
            <div className="mt-1 min-h-0 flex-1 overflow-hidden">
              {swaps.map((trade) => (
                <SwapRow key={trade.id} trade={trade} market={pool.market} />
              ))}
            </div>
          </div>
        ) : swapsError ? (
          // The flow pane's own sentence, because it is the same refused read:
          // both panes are drawing this pool's swaps out of one query, and two
          // wordings for one outage read as two separate problems. Without it
          // the list just is not there, which reads as a pool nobody trades.
          <p className="mt-3.5 shrink-0 text-[10px] leading-relaxed text-muted-foreground">
            {t('liquidityFlow.swapsUnavailableTitle')}
          </p>
        ) : null}

        {filledBy ? (
          <p className="mt-3 shrink-0 text-[10px] text-muted-foreground">
            {t('poolDetail.filledBy', { provider: providerLabel(filledBy) })}
          </p>
        ) : null}

        {/* What the figures above are, when they are not the live pool read.
            Saying nothing here would present a listing snapshot as pool state
            and, on a rate-limited provider, keep saying "loading" forever. */}
        {/* Same ordering as the flow pane beside it: once a read has failed,
            say so and keep saying so. The retry that is already scheduled does
            not make "loading" the truer of the two sentences. */}
        {view.live ? null : error ? (
          <p className="mt-3 shrink-0 text-[10px] leading-relaxed text-muted-foreground">
            {throttled ? error : t('poolDetail.stateUnavailable')}
          </p>
        ) : isLoading || retrying ? (
          <p className="mt-3 shrink-0 text-[10px] text-muted-foreground">
            {t('poolDetail.loading')}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 pt-2.5">
        {/* The pool's own page on the chain explorer — the one thing on this
            pane that answers a question the providers cannot: who holds it,
            what else it has done, and whether the contract is what it claims.
            An address rather than a word, because that is what a reader
            compares against a scanner tab they already have open. */}
        {poolUrl ? (
          <a
            href={poolUrl}
            target="_blank"
            rel="noreferrer noopener"
            title={t('poolDetail.openPool')}
            className="mb-2 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {truncateAddress(pool.address, 4, 4)}
            <ExternalLink className="size-2.5 shrink-0" aria-hidden="true" />
          </a>
        ) : null}
        {pairKey ? (
          <Button
            size="sm"
            className="w-full"
            nativeButton={false}
            render={
              <Link
                {...chartLinkProps({
                  cls: 'dex',
                  market: pool.market,
                  id: normalizeInstrumentId('dex', pairKey),
                })}
              />
            }
          >
            {t('poolDetail.openChart')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** `+7.03%` / `-1.20%`, the sign always drawn so the two moves line up. */
function signedPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

/** A label/value row that renders a dash only for a value we asked for. */
function StatLine({
  label,
  value,
  sub,
  tone = 'plain',
}: {
  label: string
  value: string | null
  /** The second half of a figure that has two — the quote reserve, the split. */
  sub?: string | null
  tone?: 'plain' | 'up' | 'down' | 'caution'
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">
        <span
          className={cn(
            'block truncate font-mono [font-variant-numeric:tabular-nums]',
            value === null && 'text-muted-foreground',
            value !== null && tone === 'up' && 'text-up',
            value !== null && tone === 'down' && 'text-down',
            value !== null && tone === 'caution' && 'text-[var(--chart-4)]',
          )}
        >
          {value ?? '—'}
        </span>
        {sub ? (
          <span className="block truncate text-[10px] text-muted-foreground [font-variant-numeric:tabular-nums]">
            {sub}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

/**
 * One swap: when, which way, how much.
 *
 * No wallet column and no price column — this pane is a quarter of a board and
 * the tape pane carries both. The tint is the same up/down wash the pair
 * board's tape uses, so a reader moving between them is reading one object.
 */
function SwapRow({ trade, market }: { trade: PoolTrade; market: string }) {
  const { t } = useTranslation()
  const buy = trade.side === 'buy'
  const url = explorerAddressUrl(market, trade.wallet)

  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-[3px] font-mono text-[10.5px] [font-variant-numeric:tabular-nums]',
        buy ? 'bg-up/5' : 'bg-down/5',
      )}
    >
      <span className="shrink-0 text-muted-foreground">
        {clockTime(trade.ts)}
      </span>
      <span className={cn('shrink-0', buy ? 'text-up' : 'text-down')}>
        {buy ? t('onchainTrades.buy') : t('onchainTrades.sell')}
      </span>
      <span className="min-w-0 flex-1 truncate text-right">
        {formatCompactUsd(trade.amountUsd)}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={t('poolDetail.openWallet')}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-2.5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}

/** `14:32`, local. A tape this short never spans a day boundary usefully. */
function clockTime(ts: number): string {
  const date = new Date(ts)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
