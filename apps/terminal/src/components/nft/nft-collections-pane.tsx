// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The rankings table: every collection on the selected chain, as a row.
 *
 * The columns are chosen to answer one question a shopping grid cannot: is
 * this floor real. Floor and its 24h move say where the market is, volume and
 * sales say whether anyone is actually trading there, and listed percent says
 * how much supply is queued to hit that floor. Two percent listed is a floor
 * with conviction behind it; thirty percent is an exit queue wearing a price
 * tag, and the two look identical on a wall of pictures.
 *
 * Sorting is split on purpose, and the split is the provider's. Five axes are
 * the RANKING the provider serves, so choosing one re-asks for a different set
 * of fifty collections; the rest are re-orderings of the fifty already on
 * screen and never leave the client. Silently sorting a page of the top fifty
 * by volume and calling the result "the collections with the highest floor"
 * would be a wrong answer stated confidently, so the header says which kind it
 * is by which state it drives.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, BadgeCheck, Gem, Search } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  NFT_NO_VALUE,
  NFT_VISUAL,
  NftChangeCell,
  NftErrorBanner,
  NftPaneFallback,
  NftSkeletonRows,
  NftThumbnail,
  formatNftShare,
  nftPanePhase,
} from './nft-pane-primitives'
import type {
  NftCollectionSort,
  NftCollectionSummary,
} from '@pairlens/shared/nft-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { PANE_TABLE_BODY, Th } from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useNftCollections } from '@/hooks/use-nft-market'
import {
  useNftChainFilter,
  useNftFilterStore,
} from '@/lib/nft/discovery-filter-store'
import {
  formatNftChange,
  formatNftCount,
  formatNftPrice,
  formatNftUsd,
  listedRatio,
} from '@/lib/nft/format'
import { useNftSelect } from '@/lib/nft/navigate'

/** Columns the table re-orders itself, over the page the provider served. */
type ClientSort = 'floorPrice' | 'listed' | 'ownerCount'

export function NftCollectionsPane() {
  const { t } = useTranslation()
  const chain = useNftChainFilter()
  const sort = useNftFilterStore((s) => s.sort)
  const setSort = useNftFilterStore((s) => s.setSort)
  const query = useNftFilterStore((s) => s.query)
  const setQuery = useNftFilterStore((s) => s.setQuery)
  const select = useNftSelect()

  // Null means "the provider's ranking is the order". A client sort layers on
  // top of whichever page that ranking produced, and is dropped the moment the
  // reader picks a different ranking.
  const [clientSort, setClientSort] = useState<ClientSort | null>(null)

  const { collections, ...status } = useNftCollections({ chain, sort })

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? collections.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            (c.slug?.toLowerCase().includes(needle) ?? false),
        )
      : collections
    if (!clientSort) return filtered
    // Descending on every axis: nobody opens a rankings table asking for the
    // emptiest collection, and a second click that inverts it would need a
    // second piece of state the header has no room to explain.
    return filtered
      .slice()
      .sort((a, b) => clientValue(b, clientSort) - clientValue(a, clientSort))
  }, [collections, query, clientSort])

  const phase = nftPanePhase(status, rows.length > 0)
  const searching = query.trim().length > 0

  const pickRanking = (axis: NftCollectionSort) => {
    setClientSort(null)
    setSort(axis)
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderMetric>
        {t('nftCollections.countMetric', { count: rows.length })}
      </PaneHeaderMetric>

      {/* Controls only: the shell header already names the pane. */}
      <div className="flex shrink-0 items-center gap-1.5 pb-1.5">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-6 rounded-md pl-6 text-[11px]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('nftCollections.searchPlaceholder')}
            value={query}
          />
        </div>
      </div>

      <NftErrorBanner phase={phase} status={status} />

      {phase === 'unsupported' || phase === 'failed' ? (
        <NftPaneFallback
          emptyBody={t('nftCollections.emptyBody')}
          emptyTitle={t('nftCollections.emptyTitle')}
          icon={Gem}
          phase={phase}
          status={status}
        />
      ) : phase === 'empty' ? (
        <NftPaneFallback
          // A search that matched nothing is the reader's own filter, not the
          // chain being quiet, and telling them the chain is quiet would send
          // them looking for a provider problem that is not there.
          emptyBody={
            searching
              ? t('nftCollections.noMatchBody')
              : t('nftCollections.emptyBody')
          }
          emptyTitle={
            searching
              ? t('nftCollections.noMatchTitle')
              : t('nftCollections.emptyTitle')
          }
          icon={Gem}
          phase={phase}
          status={status}
        />
      ) : (
        <div
          aria-busy={phase === 'loading'}
          className="min-h-0 flex-1 overflow-auto"
        >
          {phase === 'loading' ? (
            <SkeletonStatus label={t('nftCollections.loadingLabel')} />
          ) : null}
          <table className={cn('w-full border-collapse', PANE_TABLE_BODY)}>
            {/* `bg-card`, not `bg-background`: the pane sits on the column's
                card, and a ground-coloured band scrolling under the rows is
                the wrong surface. */}
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <Th>{t('nftCollections.columns.collection')}</Th>
                <SortableTh
                  active={clientSort === 'floorPrice'}
                  onSort={() => setClientSort('floorPrice')}
                >
                  {t('nftCollections.columns.floor')}
                </SortableTh>
                <SortableTh
                  active={!clientSort && sort === 'floorChange24h'}
                  onSort={() => pickRanking('floorChange24h')}
                >
                  {t('nftCollections.columns.change')}
                </SortableTh>
                <SortableTh
                  active={!clientSort && sort === 'volume24h'}
                  onSort={() => pickRanking('volume24h')}
                >
                  {t('nftCollections.columns.volume')}
                </SortableTh>
                <SortableTh
                  active={!clientSort && sort === 'sales24h'}
                  onSort={() => pickRanking('sales24h')}
                >
                  {t('nftCollections.columns.sales')}
                </SortableTh>
                <SortableTh
                  active={clientSort === 'listed'}
                  onSort={() => setClientSort('listed')}
                >
                  {t('nftCollections.columns.listed')}
                </SortableTh>
                <SortableTh
                  active={clientSort === 'ownerCount'}
                  onSort={() => setClientSort('ownerCount')}
                >
                  {t('nftCollections.columns.holders')}
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {phase === 'loading' ? (
                <NftSkeletonRows columns={7} thumb />
              ) : (
                rows.map((row) => (
                  <CollectionRow
                    key={`${row.chain}:${row.contract}`}
                    onSelect={() =>
                      select({
                        chain: row.chain,
                        contract: row.contract,
                        summary: row,
                      })
                    }
                    row={row}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** A header that ranks. The arrow marks the one axis currently in force. */
function SortableTh({
  active,
  onSort,
  children,
}: {
  active: boolean
  onSort: () => void
  children: React.ReactNode
}) {
  return (
    <Th align="right">
      <button
        className={cn(
          'inline-flex items-center gap-0.5 transition-colors hover:text-foreground',
          active && NFT_VISUAL.text,
        )}
        onClick={onSort}
        type="button"
      >
        {children}
        <ArrowDown
          aria-hidden="true"
          className={cn('size-2.5', active ? 'opacity-100' : 'opacity-0')}
        />
      </button>
    </Th>
  )
}

function CollectionRow({
  row,
  onSelect,
}: {
  row: NftCollectionSummary
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const listed = listedRatio(row.listedCount, row.totalSupply)

  return (
    <tr
      className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40"
      onClick={onSelect}
    >
      <td className="max-w-0 py-1.5 pr-3">
        <span className="flex items-center gap-2">
          <NftThumbnail imageUrl={row.imageUrl} />
          <span className="min-w-0 truncate font-sans text-[12px]">
            {row.name}
          </span>
          {row.verified ? (
            <BadgeCheck
              aria-label={t('nftCollections.verified')}
              className={cn('size-3 shrink-0', NFT_VISUAL.text)}
            />
          ) : null}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right">
        {formatNftPrice(row.floorPrice, row.priceCurrency)}
      </td>
      <td className="py-1.5 pr-3 text-right">
        <NftChangeCell
          fraction={row.floorChange24h}
          text={formatNftChange(row.floorChange24h)}
        />
      </td>
      <td className="py-1.5 pr-3 text-right">
        {/* USD where the provider converted it, native otherwise: volumes are
            read across collections, and a column that silently mixed the two
            would compare an ETH figure with a SOL one. */}
        {row.volume24hUsd != null
          ? formatNftUsd(row.volume24hUsd)
          : formatNftPrice(row.volume24h, row.priceCurrency)}
      </td>
      <td className="py-1.5 pr-3 text-right">{formatNftCount(row.sales24h)}</td>
      <td className="py-1.5 pr-3 text-right">
        {listed === null ? NFT_NO_VALUE : formatNftShare(listed)}
      </td>
      <td className="py-1.5 text-right">{formatNftCount(row.ownerCount)}</td>
    </tr>
  )
}

function clientValue(row: NftCollectionSummary, axis: ClientSort): number {
  if (axis === 'floorPrice') return row.floorPrice ?? -1
  if (axis === 'ownerCount') return row.ownerCount ?? -1
  return listedRatio(row.listedCount, row.totalSupply) ?? -1
}
