// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TrendingUp } from 'lucide-react'

import { cn } from '@pairlens/ui'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pairlens/ui/components/ui/table'
import {
  usePluginFetch,
  usePluginHost,
  usePluginQuery,
} from '@pairlens/plugin-sdk'
import type { TopCoinsResponse } from '@pairlens/shared/instrument-types'

import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { formatCompactUsd, formatPrice } from '@/lib/format-price'
import { chartLinkProps } from '@/lib/market-ref/link'
import { formatRelativeTime } from '@/lib/format-time'
import { fetchTopCoinsWithFallback } from '@/lib/public-market-data'

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/** Resolve relative URLs (e.g. `/api/symbol-logo/btc`) against the App Server base */
function resolveLogoUrl(
  url: string | null,
  appServerUrl: string,
): string | null {
  if (!url) return null
  if (url.startsWith('/')) return `${appServerUrl}${url}`
  return url
}

export function TopCoinsPane() {
  const { t } = useTranslation()
  const host = usePluginHost()
  const appServerUrl = String(host.config['appServerUrl'] ?? '')
  const apiFetch = usePluginFetch()
  // The ranking is exchange-agnostic (CMC/CoinGecko), but a candle isn't —
  // trend lines are drawn from whichever crypto venue this build can reach.
  const cryptoMarket = usePreferredMarketResolver()('crypto')

  const { data, isLoading, error } = usePluginQuery<TopCoinsResponse>({
    queryKey: ['top-coins'],
    queryFn: async () => {
      const result = await fetchTopCoinsWithFallback(apiFetch)
      result.coins.forEach((c) => {
        c.logoUrl = resolveLogoUrl(c.logoUrl, appServerUrl) ?? null
      })
      return result
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const coins = data?.coins ?? []
  const updatedAt = data?.updatedAt ?? null

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: coins.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{t('topCoins.title')}</h2>
        {updatedAt && (
          <span className="text-xs text-muted-foreground">
            {t('common.updated', { time: formatRelativeTime(updatedAt) })}
          </span>
        )}
      </header>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto px-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-xs">#</TableHead>
                <TableHead className="text-xs">
                  {t('topCoins.colCoin')}
                </TableHead>
                <TableHead className="hidden w-10 @min-[352px]/pane:table-cell text-xs @md/pane:w-16">
                  {t('common.trend')}
                </TableHead>
                <TableHead className="text-right text-xs">
                  {t('topCoins.colPrice')}
                </TableHead>
                <TableHead className="text-right text-xs">
                  {t('topCoins.col24h')}
                </TableHead>
                <TableHead className="hidden @lg/pane:table-cell text-right text-xs">
                  {t('topCoins.colMktCap')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }, (_, i) => (
                <TableRow key={i} className="h-8">
                  <TableCell>
                    <div className="h-3 w-4 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                      <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden @min-[352px]/pane:table-cell">
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell>
                    <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell>
                    <div className="ml-auto h-3 w-12 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell className="hidden @lg/pane:table-cell">
                    <div className="ml-auto h-3 w-14 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : error || coins.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <TrendingUp className="mb-3 size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {error ? t('topCoins.failed') : t('topCoins.noData')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error ? t('topCoins.tryLater') : t('topCoins.willAppear')}
          </p>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-auto px-1"
        >
          <Table>
            {/* Column budget, measured rather than guessed: rank, coin, price
                and 24h need 348px together with a 40px trend line, so that is
                the breakpoint the trend column appears at — a narrower rail
                would push the 24h number off the edge instead. It widens at
                @md, and market cap waits for @lg. */}
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-xs">#</TableHead>
                <TableHead className="text-xs">
                  {t('topCoins.colCoin')}
                </TableHead>
                <TableHead className="hidden w-10 @min-[352px]/pane:table-cell text-xs @md/pane:w-16">
                  {t('common.trend')}
                </TableHead>
                <TableHead className="text-right text-xs">
                  {t('topCoins.colPrice')}
                </TableHead>
                <TableHead className="text-right text-xs">
                  {t('topCoins.col24h')}
                </TableHead>
                <TableHead className="hidden @lg/pane:table-cell text-right text-xs">
                  {t('topCoins.colMktCap')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const virtualItems = rowVirtualizer.getVirtualItems()
                const virtualPaddingTop = virtualItems[0]?.start ?? 0
                const virtualPaddingBottom =
                  virtualItems.length > 0
                    ? rowVirtualizer.getTotalSize() -
                      (virtualItems[virtualItems.length - 1]?.end ?? 0)
                    : 0
                return (
                  <>
                    {virtualPaddingTop > 0 && (
                      <tr>
                        <td style={{ height: virtualPaddingTop }} />
                      </tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                      const coin = coins[virtualRow.index]
                      const coinRef = {
                        cls: 'spot' as const,
                        market: cryptoMarket,
                        id: `${coin.symbol}-USDT`,
                      }
                      return (
                        <TableRow
                          key={coin.rank}
                          className="h-9 cursor-pointer hover:bg-accent/50"
                        >
                          <TableCell className="p-0">
                            <Link
                              {...chartLinkProps(coinRef)}
                              className="flex h-9 items-center px-2 text-xs text-muted-foreground"
                            >
                              {coin.rank}
                            </Link>
                          </TableCell>
                          <TableCell className="p-0">
                            <Link
                              {...chartLinkProps(coinRef)}
                              className="flex h-9 items-center gap-2 px-2"
                            >
                              <PairAvatar
                                base={coin.symbol}
                                logoUrl={coin.logoUrl}
                                size="sm"
                              />
                              {/* Capped and truncating: without it the full
                                  name ("UNUS SED LEO") sets the column's
                                  min-content width and pushes the 24h number
                                  off the edge of a docked rail. */}
                              <div className="flex min-w-0 flex-col">
                                <span className="text-xs font-bold">
                                  {coin.symbol}
                                </span>
                                <span
                                  className="max-w-20 truncate text-[10px] leading-tight text-muted-foreground @md/pane:max-w-32"
                                  title={coin.name}
                                >
                                  {coin.name}
                                </span>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell className="hidden @min-[352px]/pane:table-cell p-0">
                            <Link
                              {...chartLinkProps(coinRef)}
                              className="flex h-9 items-center px-2"
                            >
                              <MiniPriceChart
                                market={cryptoMarket}
                                pair={`${coin.symbol}-USDT`}
                                className="h-5 w-10 @md/pane:w-16"
                              />
                            </Link>
                          </TableCell>
                          <TableCell className="p-0">
                            <Link
                              {...chartLinkProps(coinRef)}
                              className="flex h-9 items-center justify-end px-2 text-xs"
                            >
                              {formatPrice(coin.price)}
                            </Link>
                          </TableCell>
                          <TableCell className="p-0">
                            <Link
                              {...chartLinkProps(coinRef)}
                              className={cn(
                                'flex h-9 items-center justify-end px-2 text-xs',
                                coin.percentChange24h >= 0
                                  ? 'text-green-500'
                                  : 'text-red-500',
                              )}
                            >
                              {formatPercent(coin.percentChange24h)}
                            </Link>
                          </TableCell>
                          <TableCell className="hidden @lg/pane:table-cell p-0">
                            <Link
                              {...chartLinkProps(coinRef)}
                              className="flex h-9 items-center justify-end px-2 text-xs text-muted-foreground"
                            >
                              {formatCompactUsd(coin.marketCap)}
                            </Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {virtualPaddingBottom > 0 && (
                      <tr>
                        <td style={{ height: virtualPaddingBottom }} />
                      </tr>
                    )}
                  </>
                )
              })()}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
