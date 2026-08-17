// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The rest of this pair's sector, with the pair itself pinned on top.
 *
 * The question it answers is the one a chart cannot: whether today is about
 * this asset or about everything that looks like it. Pinning the active pair
 * first and ranking the rest against it is the whole design — the row above
 * the fold is the comparison, and scrolling is for the tail.
 *
 * Peers are priced from the bulk snapshots and the top-coins feed, both of
 * which other panes already fetch, and each row's trend line is gated on being
 * on screen. So a rail of twenty peers costs no sockets and at most a handful
 * of cached candle reads.
 */
import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Boxes } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { usePanePair } from '@pairlens/plugin-sdk'

import type { TopCoin } from '@pairlens/shared/instrument-types'
import type { BulkQuote } from '@/hooks/use-bulk-ticker-quotes'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { useSectorMembership } from '@/hooks/use-sector-membership'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { chartLinkProps } from '@/lib/market-ref/link'
import { splitPairAssets } from '@/lib/pairs'

/** Enough to show rotation inside a sector; past this it is a scanner. */
const PEER_LIMIT = 24

type PeerRow = {
  base: string
  symbol: string
  changePct: number | null
  logoUrl: string | null
  isActive: boolean
}

export function SectorPeersPane() {
  const activePair = usePanePair()

  if (!activePair) return <PanePairPicker />

  return (
    <SectorPeersPaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
    />
  )
}

function SectorPeersPaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const membership = useSectorMembership()
  const coins = useTopCoinsSnapshot()
  const quotes = useBulkTickerQuotes()

  const { base, quote } = useMemo(() => splitPairAssets(pairKey), [pairKey])
  const category = membership.categoriesOf.get(base.toUpperCase())?.[0] ?? null

  const rows = useMemo((): Array<PeerRow> => {
    if (!category) return []
    const activeBase = base.toUpperCase()
    const members = membership.membersOf.get(category) ?? []

    const peers: Array<PeerRow> = []
    for (const peer of members) {
      const symbol = quote ? `${peer}-${quote}` : peer
      const change = changeFor(peer, symbol, quotes, coins)
      // A member nobody prices is not a peer today: an unpriced row would
      // carry an empty percentage into a list whose whole job is comparison.
      if (change === null && peer !== activeBase) continue
      peers.push({
        base: peer,
        symbol,
        changePct: change,
        logoUrl: coins.get(peer)?.logoUrl ?? null,
        isActive: peer === activeBase,
      })
    }

    peers.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return (
        (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity) ||
        a.base.localeCompare(b.base)
      )
    })
    return peers.slice(0, PEER_LIMIT)
  }, [category, base, quote, membership.membersOf, quotes, coins])

  if (!category) {
    return (
      <PaneEmpty
        icon={Boxes}
        title={t('sectorPeers.emptyTitle')}
        body={
          membership.ready
            ? t('sectorPeers.emptyBody', { pair: pairKey })
            : t('sectorPeers.loadingBody')
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-2.5 py-2">
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          {t('sectorPeers.subtitle', {
            sector: t(`markets.category.${category}`),
            total: rows.length,
            symbol: base.toUpperCase(),
          })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.map((row) => (
          <PeerLink
            key={row.base}
            row={row}
            market={market}
            quote={quote}
            active={row.isActive}
          />
        ))}
      </div>
    </div>
  )
}

/** Exact pair first, base symbol second — the same join the scanner uses. */
function changeFor(
  base: string,
  symbol: string,
  quotes: ReadonlyMap<string, BulkQuote>,
  coins: ReadonlyMap<string, TopCoin>,
): number | null {
  const live = quotes.get(symbol)
  if (live && Number.isFinite(live.change24h)) return live.change24h
  const coin = coins.get(base.toUpperCase())
  if (coin && Number.isFinite(coin.percentChange24h)) {
    return coin.percentChange24h
  }
  return null
}

function PeerLink({
  row,
  market,
  quote,
  active,
}: {
  row: PeerRow
  market: string
  quote: string
  active: boolean
}) {
  const target = entryToMarketRef(
    { symbol: row.symbol, assetClass: 'crypto', quote },
    market,
  )
  const up = (row.changePct ?? 0) >= 0

  return (
    <Link
      {...chartLinkProps(target)}
      className={cn(
        'flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5 transition-colors hover:bg-accent/40',
        active &&
          '[background-color:color-mix(in_oklch,var(--primary)_7%,transparent)]',
      )}
    >
      <PairAvatar
        base={row.base}
        logoUrl={row.logoUrl}
        assetClass="crypto"
        size="sm"
        className="size-[18px] text-[8px]"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-[11.5px]',
          active ? 'font-semibold' : 'font-medium',
        )}
      >
        {row.base}
      </span>
      <MiniPriceChart
        market={market}
        pair={row.symbol}
        className="h-4 w-[42px] shrink-0"
      />
      <span
        className={cn(
          'w-14 shrink-0 text-right font-mono text-[11px] tabular-nums',
          row.changePct === null
            ? 'text-muted-foreground/50'
            : up
              ? 'text-up'
              : 'text-down',
        )}
      >
        {row.changePct === null
          ? '—'
          : `${up ? '+' : ''}${row.changePct.toFixed(1)}%`}
      </span>
    </Link>
  )
}
