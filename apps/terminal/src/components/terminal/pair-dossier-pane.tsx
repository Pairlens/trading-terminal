// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The stats that decide a size, in the space the order book gave up.
 *
 * The research board drops the book and the depth pane, which is what makes it
 * viable to leave open all day. This is what fills that column, and it holds
 * to the same bargain: the chart's own candle buffer, the top-coins snapshot
 * discovery already fetched, and per-venue tickers that ride the provider's
 * `ticker:<venue>:<pair>` multiplex alongside the ladder and the multi-price
 * pane. No book, no depth, no second history fetch.
 *
 * Two consequences of that bargain are visible in what is NOT here. Distance
 * from the all-time high and correlation to BTC would each need a second
 * history fetch, so they are absent rather than approximated. And the venue
 * bars measure SPREAD, not depth: a ticker carries a price and no size, so the
 * dollars resting within one percent of the mid are not knowable from it and
 * are not invented — what the bars show is how tightly each venue quotes,
 * which is the part that actually decides where a modest order goes.
 *
 * A tile with no data is omitted, never rendered as a dash. A grid of dashes
 * reads as a broken pane; six tiles that all say something reads as a pane
 * that knows what it knows.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { usePanePair } from '@pairlens/plugin-sdk'
import { TIMEFRAME_TO_MS } from '@pairlens/shared/timeframe'

import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useVenueQuotes } from '@/hooks/use-venue-quotes'
import { useSectorMembership } from '@/hooks/use-sector-membership'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import {
  useOptionalCandleData,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import {
  candlesSince,
  summarizeRange,
  summarizeVolatility,
  venueSpreadBars,
} from '@/lib/pair-dossier-stats'
import { summarizeSectors } from '@/lib/sector-stats'
import { formatBookPrice, formatCompactUsd } from '@/lib/format-price'
import { splitPairAssets } from '@/lib/pairs'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'

const DAY_MS = 24 * 60 * 60 * 1000

export function PairDossierPane() {
  const activePair = usePanePair()

  if (!activePair) return <PanePairPicker />

  return (
    <PairDossierPaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
    />
  )
}

function PairDossierPaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const coins = useTopCoinsSnapshot()
  const membership = useSectorMembership()

  const { base } = useMemo(() => splitPairAssets(pairKey), [pairKey])
  const coin = coins.get(base.toUpperCase()) ?? null

  // Same comparable-venue rule as the ladder: quoting a Solana pool against a
  // Kraken book would put two different instruments on one bar chart.
  const comparable = useMemo(() => {
    const current = markets.find((m) => m.value === market)
    const classes = new Set(current?.assetClasses ?? [])
    if (classes.size === 0) return markets
    return markets.filter((m) =>
      m.assetClasses.some((assetClass) => classes.has(assetClass)),
    )
  }, [markets, market])

  const quotes = useVenueQuotes({ pairKey, markets: comparable })
  const labelFor = useMemo(() => {
    const labels = new Map(comparable.map((m) => [m.value, m.label]))
    return (venue: string) => labels.get(venue) ?? venue
  }, [comparable])

  const bars = useMemo(() => venueSpreadBars(quotes), [quotes])
  const quoting = useMemo(
    () => quotes.filter((q) => q.last !== null && q.status === 'live').length,
    [quotes],
  )

  const category = membership.categoriesOf.get(base.toUpperCase())?.[0] ?? null
  const sectorChange = useMemo(() => {
    if (!category) return null
    const found = summarizeSectors(membership.membersOf, coins, '24h').find(
      (s) => s.category === category,
    )
    return found?.changePct ?? null
  }, [category, membership.membersOf, coins])

  return (
    <div className="flex h-full min-h-0 @min-[42rem]/pane:flex-row flex-col overflow-auto">
      {/* Stat grid. Auto-flowing rather than a fixed 4×2 so a narrower pane
          drops to two columns instead of shredding the numbers. */}
      <div className="grid min-w-0 flex-1 auto-rows-fr grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] border-b @min-[42rem]/pane:border-b-0 @min-[42rem]/pane:border-r">
        {coin && (
          <Tile label={t('pairDossier.marketCap')}>
            <Value>{formatCompactUsd(coin.marketCap)}</Value>
            <Sub>{t('pairDossier.rank', { rank: coin.rank })}</Sub>
          </Tile>
        )}

        {coin && coin.volume24h > 0 && (
          <Tile label={t('pairDossier.volume24h')}>
            <Value>{formatCompactUsd(coin.volume24h)}</Value>
            {coin.marketCap > 0 && (
              <Sub>
                {t('pairDossier.turnover', {
                  pct: ((coin.volume24h / coin.marketCap) * 100).toFixed(1),
                })}
              </Sub>
            )}
          </Tile>
        )}

        <CandleTiles />

        {coin && (
          <Tile label={t('pairDossier.change7d')}>
            <Value
              className={coin.percentChange7d >= 0 ? 'text-up' : 'text-down'}
            >
              {coin.percentChange7d >= 0 ? '+' : ''}
              {coin.percentChange7d.toFixed(1)}%
            </Value>
            <Sub>{t('pairDossier.change7dSub')}</Sub>
          </Tile>
        )}

        {category && (
          <Tile label={t('pairDossier.sector')}>
            <Value className="text-[13px]">
              {t(`markets.category.${category}`)}
            </Value>
            {sectorChange !== null && (
              <Sub className={sectorChange >= 0 ? 'text-up' : 'text-down'}>
                {t('pairDossier.sectorMove', {
                  change: `${sectorChange >= 0 ? '+' : ''}${sectorChange.toFixed(1)}%`,
                })}
              </Sub>
            )}
          </Tile>
        )}

        {quotes.length > 0 && (
          <Tile label={t('pairDossier.quotedOn')}>
            <Value>{quoting}</Value>
            <Sub>{t('pairDossier.ofVenues', { total: quotes.length })}</Sub>
          </Tile>
        )}

        {bars[0] && (
          <Tile label={t('pairDossier.tightestSpread')}>
            <Value>
              {t('pairDossier.bps', { bps: bars[0].bps.toFixed(1) })}
            </Value>
            <Sub>{labelFor(bars[0].market)}</Sub>
          </Tile>
        )}
      </div>

      {/* Venue column */}
      <div className="flex w-full shrink-0 flex-col gap-2 px-3 py-2.5 @min-[42rem]/pane:w-[15rem]">
        <Tooltip>
          <TooltipTrigger
            render={<p className="text-[10.5px] text-muted-foreground" />}
          >
            {t('pairDossier.spreadByVenue')}
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            {t('pairDossier.spreadByVenueTooltip')}
          </TooltipContent>
        </Tooltip>

        {bars.length === 0 ? (
          <p className="text-[10.5px] leading-relaxed text-muted-foreground/70">
            {t('pairDossier.noBooks')}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {bars.map((bar) => (
                <div key={bar.market} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 truncate text-[11px]">
                    {labelFor(bar.market)}
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
                    <span
                      className="block h-full [background-color:var(--chart-3)]"
                      style={{ width: `${(bar.width * 100).toFixed(1)}%` }}
                    />
                  </span>
                  <span className="w-11 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">
                    {bar.bps.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              {bars.length > 1
                ? t('pairDossier.sizingNote', {
                    tight: labelFor(bars[0]!.market),
                    tightBps: bars[0]!.bps.toFixed(1),
                    wide: labelFor(bars[bars.length - 1]!.market),
                    wideBps: bars[bars.length - 1]!.bps.toFixed(1),
                  })
                : t('pairDossier.sizingNoteSingle', {
                    venue: labelFor(bars[0]!.market),
                    bps: bars[0]!.bps.toFixed(1),
                  })}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The two tiles that read the candle buffer, kept in their own component.
 *
 * The buffer publishes on every candle tick, so anything subscribed to it
 * re-renders a few times a second. Here that is two small tiles rather than
 * the whole dossier — and the arithmetic behind them is memoized on the bar
 * count and the forming bar's extremes, so a tick that neither closes a bar
 * nor sets a new high costs nothing but a repaint of two numbers.
 */
function CandleTiles() {
  const { t } = useTranslation()
  const candleData = useOptionalCandleData()
  const config = useOptionalChartConfig()

  const candles = candleData?.candles ?? []
  const timeframe = config?.timeframe ?? '1h'
  const barMs = TIMEFRAME_TO_MS[timeframe as keyof typeof TIMEFRAME_TO_MS] ?? 0

  const latest = candles[candles.length - 1]
  const latestTs = latest?.ts ?? 0
  const latestHigh = latest?.high ?? 0
  const latestLow = latest?.low ?? 0
  const latestClose = latest?.close ?? null

  const range = useMemo(
    () =>
      summarizeRange(candlesSince(candles, Date.now() - DAY_MS), latestClose),
    // The forming bar moves on every tick, but only its extremes change what
    // this measures. Deliberately not `candles`, whose identity changes on
    // every publish.

    [candles.length, latestTs, latestHigh, latestLow, latestClose],
  )

  const volatility = useMemo(
    () => summarizeVolatility(candles, barMs),

    [candles.length, latestTs, barMs],
  )

  return (
    <>
      {range && (
        <Tile label={t('pairDossier.range24h')}>
          <Value>{range.rangePct.toFixed(1)}%</Value>
          <Sub>
            {t('pairDossier.rangeLowHigh', {
              low: formatBookPrice(range.low),
              high: formatBookPrice(range.high),
            })}
          </Sub>
          {range.position !== null && (
            // Where the price sits in the day's range, drawn rather than
            // stated: the marker is read faster than "72% of range" and it
            // needs no unit.
            <span className="relative mt-1.5 block h-1 rounded-sm bg-muted">
              <span
                className="absolute top-0 h-1 w-0.5 -translate-x-1/2 rounded-sm bg-foreground"
                style={{ left: `${(range.position * 100).toFixed(1)}%` }}
              />
            </span>
          )}
        </Tile>
      )}

      {volatility && (
        <Tile label={t('pairDossier.volatility')}>
          <Value>{volatility.annualizedPct.toFixed(0)}%</Value>
          <Sub>
            {t('pairDossier.volatilityWindow', {
              span: formatSpan(volatility.spanMs),
              timeframe,
            })}
          </Sub>
        </Tile>
      )}
    </>
  )
}

/** A window length a trader reads at a glance: `21d`, `9h`. */
function formatSpan(ms: number): string {
  const days = Math.round(ms / DAY_MS)
  if (days >= 1) return `${days}d`
  return `${Math.max(1, Math.round(ms / (60 * 60 * 1000)))}h`
}

function Tile({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center border-b border-r border-border/50 px-3.5 py-2.5">
      <p className="truncate text-[10.5px] text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Value({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'mt-0.5 truncate font-mono text-[15px] font-semibold tabular-nums',
        className,
      )}
    >
      {children}
    </p>
  )
}

function Sub({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn('truncate text-[10.5px] text-muted-foreground', className)}
    >
      {children}
    </p>
  )
}
