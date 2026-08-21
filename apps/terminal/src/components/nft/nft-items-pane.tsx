// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one pane on this board allowed to look like a gallery.
 *
 * Everything else here deliberately refuses the shopping-grid reading of an NFT
 * market, and this is the exception that proves the rule: picking a specific
 * token is a real job. A rank-40 token and a rank-4000 token at the same ask are
 * not the same trade, and no amount of depth drawing tells you which one you
 * would rather own. Art is data here.
 *
 * So: image first, then the two facts that price it. Listed tokens carry their
 * ask in the settlement currency; unlisted ones say so rather than showing a
 * blank, because "not for sale" and "we did not read a price" are different.
 * Rank is the second line and stays put whether the token is listed or not.
 *
 * The grid is `auto-fill`, not a fixed column count: this pane is dropped into
 * a 240px column and a full-width row of the same board, and a hardcoded four
 * columns is wrong in both.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Images } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { NftChain } from '@pairlens/shared/nft-types'
import { PANE_FOOTNOTE, PaneEmpty } from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import {
  NFT_NO_VALUE,
  NftErrorBanner,
  NftPaneFallback,
  NftThumbnail,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftItems } from '@/hooks/use-nft-market'
import { formatNftCount, formatNftPrice, formatTokenId } from '@/lib/nft/format'

export function NftItemsPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftItems.noPairBody')}
        icon={Images}
        title={t('nftItems.noPairTitle')}
      />
    )
  }

  return <NftItemsInner chain={target.chain} contract={target.contract} />
}

function NftItemsInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { items, ...status } = useNftItems(chain, contract)
  const phase = nftPanePhase(status, items.length > 0)

  // Listed first, cheapest first within that: the tokens a reader can act on
  // lead, and the rest of the collection follows by rank.
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aListed = a.listPrice != null
        const bListed = b.listPrice != null
        if (aListed !== bListed) return aListed ? -1 : 1
        if (aListed && bListed) return (a.listPrice ?? 0) - (b.listPrice ?? 0)
        return (a.rarityRank ?? Infinity) - (b.rarityRank ?? Infinity)
      }),
    [items],
  )

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftItems.emptyBody')}
        emptyTitle={t('nftItems.emptyTitle')}
        icon={Images}
        phase={phase}
        status={status}
      />
    )
  }

  const listedCount = sorted.filter((item) => item.listPrice != null).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>
        {t('nftItems.count', { count: sorted.length })}
      </PaneHeaderMetric>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
          {sorted.map((item) => (
            <div className="min-w-0" key={item.tokenId}>
              <NftThumbnail
                className="aspect-square size-auto w-full rounded-lg"
                imageUrl={item.imageUrl}
              />
              <div className="mt-1 flex items-baseline justify-between gap-1 font-mono text-[10.5px] tabular-nums">
                <span className="truncate" title={item.name}>
                  {formatTokenId(item.tokenId)}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {item.rarityRank != null
                    ? `#${item.rarityRank}`
                    : NFT_NO_VALUE}
                </span>
              </div>
              <div
                className={cn(
                  'truncate font-mono text-[10.5px] tabular-nums',
                  item.listPrice != null ? 'text-down' : 'text-muted-foreground',
                )}
              >
                {item.listPrice != null
                  ? formatNftPrice(item.listPrice, item.priceCurrency)
                  : t('nftItems.unlisted')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={cn('flex shrink-0 items-center gap-2 pt-1.5', PANE_FOOTNOTE)}
      >
        <span className="min-w-0 flex-1 truncate">
          {t('nftItems.footnote', {
            listed: formatNftCount(listedCount),
            shown: formatNftCount(sorted.length),
          })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}
