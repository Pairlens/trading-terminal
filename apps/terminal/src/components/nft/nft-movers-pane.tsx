// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The floors that moved: what is being bid up, and what is being sold into.
 *
 * Derived from the rankings the table beside it already fetched rather than
 * from its own request, and deliberately from the DEFAULT ranking rather than
 * whichever axis the reader last clicked. Two reasons. React Query keys on the
 * ranking axis, so following the table would open a second rankings query and
 * spend the shared provider budget twice on the same fifty collections. And
 * ranking the whole market by floor change surfaces whatever untraded thing
 * repriced by 400% on a single sale, which is noise wearing a headline: the
 * movers worth reading are the movers among collections that actually trade.
 *
 * One list with a side toggle rather than two stacked halves. The pane is a
 * rail on a board that may give it eight rows, and half of eight is a list too
 * short to rank anything.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Gem } from 'lucide-react'

import { cn } from '@pairlens/ui'
import {
  NFT_VISUAL,
  NftChangeCell,
  NftErrorBanner,
  NftPaneFallback,
  NftSkeletonList,
  NftThumbnail,
  nftPanePhase,
} from './nft-pane-primitives'
import type { NftCollectionSummary } from '@pairlens/shared/nft-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useNftCollections } from '@/hooks/use-nft-market'
import { useNftChainFilter } from '@/lib/nft/discovery-filter-store'
import { formatNftChange, formatNftPrice } from '@/lib/nft/format'
import { useNftSelect } from '@/lib/nft/navigate'

/** Rows before the rail stops being a summary. */
const MAX_ROWS = 12

type Side = 'gainers' | 'losers'

export function NftMoversPane() {
  const { t } = useTranslation()
  const chain = useNftChainFilter()
  const select = useNftSelect()
  const [side, setSide] = useState<Side>('gainers')

  const { collections, ...status } = useNftCollections({ chain })

  const rows = useMemo(() => {
    const moved = collections.filter(
      (c) => c.floorChange24h != null && Number.isFinite(c.floorChange24h),
    )
    const wanted = moved.filter((c) =>
      side === 'gainers'
        ? (c.floorChange24h ?? 0) > 0
        : (c.floorChange24h ?? 0) < 0,
    )
    wanted.sort((a, b) =>
      side === 'gainers'
        ? (b.floorChange24h ?? 0) - (a.floorChange24h ?? 0)
        : (a.floorChange24h ?? 0) - (b.floorChange24h ?? 0),
    )
    return wanted.slice(0, MAX_ROWS)
  }, [collections, side])

  const phase = nftPanePhase(status, rows.length > 0)

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderMetric>{t('nftMovers.subtitle')}</PaneHeaderMetric>

      {/* Controls only: the shell header already names the pane. */}
      <div className="flex shrink-0 items-center gap-1 pb-1.5">
        {(['gainers', 'losers'] as const).map((option) => (
          <button
            aria-pressed={side === option}
            className={cn(
              'h-6 rounded-md px-2 text-[11px] transition-colors',
              side === option
                ? cn('font-medium', NFT_VISUAL.activeBg, NFT_VISUAL.text)
                : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={option}
            onClick={() => setSide(option)}
            type="button"
          >
            {option === 'gainers'
              ? t('nftMovers.gainers')
              : t('nftMovers.losers')}
          </button>
        ))}
      </div>

      <NftErrorBanner phase={phase} status={status} />

      {phase === 'loading' ? (
        <div aria-busy className="min-h-0 flex-1 overflow-hidden">
          <SkeletonStatus label={t('nftMovers.loadingLabel')} />
          <NftSkeletonList rows={6} />
        </div>
      ) : phase !== 'ready' ? (
        <NftPaneFallback
          emptyBody={
            side === 'gainers'
              ? t('nftMovers.emptyGainersBody')
              : t('nftMovers.emptyLosersBody')
          }
          emptyTitle={t('nftMovers.emptyTitle')}
          icon={Gem}
          phase={phase}
          status={status}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((row) => (
            <MoverRow
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
          ))}
        </div>
      )}
    </div>
  )
}

function MoverRow({
  row,
  onSelect,
}: {
  row: NftCollectionSummary
  onSelect: () => void
}) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-sm px-1 py-1.5 text-left transition-colors hover:bg-muted/40"
      onClick={onSelect}
      type="button"
    >
      <NftThumbnail imageUrl={row.imageUrl} />
      <span className="min-w-0 flex-1 truncate text-[11.5px]">{row.name}</span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatNftPrice(row.floorPrice, row.priceCurrency)}
      </span>
      <NftChangeCell
        className="w-14 shrink-0 text-right font-mono text-[11px]"
        fraction={row.floorChange24h}
        text={formatNftChange(row.floorChange24h)}
      />
    </button>
  )
}
