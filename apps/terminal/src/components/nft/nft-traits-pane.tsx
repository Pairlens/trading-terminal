// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The alpha surface: a collection floor is a headline, a trait floor is the
 * market.
 *
 * On any collection past its first month the single floor number stops being
 * informative. What a token is worth is decided by what it carries, and the
 * spread between the cheapest Gold Fur and the cheapest anything is where the
 * actual pricing happens. This pane is that spread, laid out so it can be read
 * down a column rather than clicked through a filter panel.
 *
 * Grouped by trait key, and within a key sorted by floor, high to low. Rarity
 * is shown next to the floor on purpose: the pair is the whole point. A trait
 * on 0.4% of supply with a floor at the collection floor is a mispricing; a
 * trait on 18% of supply with a floor at three times it is a story the market
 * already believes.
 *
 * Listed count is the third column because a trait floor set by one listing is
 * a quote, not a market, and there is no way to tell those apart from the price.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Tags } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { NftChain, NftTraitFloor } from '@pairlens/shared/nft-types'
import {
  PANE_COLUMN_HEADER,
  PANE_FOOTNOTE,
  PANE_TABLE_BODY,
  PaneEmpty,
} from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import {
  NFT_NO_VALUE,
  NftErrorBanner,
  NftPaneFallback,
  NftShareBar,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftCollection, useNftTraits } from '@/hooks/use-nft-market'
import { formatNftCount, formatNftPrice } from '@/lib/nft/format'

export function NftTraitsPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftTraits.noPairBody')}
        icon={Tags}
        title={t('nftTraits.noPairTitle')}
      />
    )
  }

  return <NftTraitsInner chain={target.chain} contract={target.contract} />
}

type TraitGroup = {
  key: string
  values: Array<NftTraitFloor>
  /** The dearest floor in the group, which scales the group's own bars. */
  topFloor: number
}

function NftTraitsInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { traits, ...status } = useNftTraits(chain, contract)
  // `NftTraitFloor` carries a price and no ticker, and a floor labelled ETH on
  // a Solana collection is wrong by two orders of magnitude. The collection
  // read owns the settlement currency, and this shares its cache entry with the
  // header pane rather than opening a second request for one string.
  const { collection } = useNftCollection(chain, contract)
  const phase = nftPanePhase(status, traits.length > 0)

  const groups = useMemo(() => groupTraits(traits), [traits])

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftTraits.emptyBody')}
        emptyTitle={t('nftTraits.emptyTitle')}
        icon={Tags}
        phase={phase}
        status={status}
      />
    )
  }

  const currency = collection?.priceCurrency
  const priced = traits.filter((trait) => trait.floorPrice != null).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>
        {t('nftTraits.groupCount', { count: groups.length })}
      </PaneHeaderMetric>

      <div className="grid shrink-0 grid-cols-[1fr_58px_64px_44px] gap-x-2 pb-1">
        <span className={PANE_COLUMN_HEADER}>
          {t('nftTraits.columns.value')}
        </span>
        <span className={cn(PANE_COLUMN_HEADER, 'text-right')}>
          {t('nftTraits.columns.count')}
        </span>
        <span className={cn(PANE_COLUMN_HEADER, 'text-right')}>
          {t('nftTraits.columns.floor')}
        </span>
        <span className={cn(PANE_COLUMN_HEADER, 'text-right')}>
          {t('nftTraits.columns.listed')}
        </span>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto', PANE_TABLE_BODY)}>
        {groups.map((group) => (
          <section className="mb-2 last:mb-0" key={group.key}>
            <div
              className={cn('pb-0.5', PANE_COLUMN_HEADER, 'text-foreground/70')}
              title={group.key}
            >
              {group.key}
            </div>
            {group.values.map((trait) => (
              <div
                className="grid grid-cols-[1fr_58px_64px_44px] items-center gap-x-2 py-[2px]"
                key={`${trait.key}:${trait.value}`}
              >
                <div className="min-w-0">
                  <div className="truncate" title={trait.value}>
                    {trait.value}
                  </div>
                  {group.topFloor > 0 && (
                    <div className="mt-[3px]">
                      <NftShareBar
                        fraction={(trait.floorPrice ?? 0) / group.topFloor}
                      />
                    </div>
                  )}
                </div>
                <div className="text-right text-muted-foreground">
                  <div>{formatNftCount(trait.count)}</div>
                  <div className="text-[9.5px]">
                    {trait.rarity != null
                      ? `${(trait.rarity * 100).toFixed(1)}%`
                      : NFT_NO_VALUE}
                  </div>
                </div>
                <div className="text-right">
                  {formatNftPrice(trait.floorPrice, currency)}
                </div>
                <div className="text-right text-muted-foreground">
                  {trait.listedCount != null
                    ? formatNftCount(trait.listedCount)
                    : NFT_NO_VALUE}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div
        className={cn('flex shrink-0 items-center gap-2 pt-1.5', PANE_FOOTNOTE)}
      >
        <span className="min-w-0 flex-1 truncate">
          {t('nftTraits.footnote', { priced, total: traits.length })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}

/**
 * One section per trait key, dearest value first.
 *
 * Unpriced values sink to the bottom of their group rather than being dropped:
 * "this trait exists and nothing carrying it is listed" is a fact about the
 * market, and hiding it would make a group look smaller than the collection is.
 */
function groupTraits(traits: Array<NftTraitFloor>): Array<TraitGroup> {
  const byKey = new Map<string, Array<NftTraitFloor>>()
  for (const trait of traits) {
    const bucket = byKey.get(trait.key)
    if (bucket) bucket.push(trait)
    else byKey.set(trait.key, [trait])
  }

  return [...byKey.entries()]
    .map(([key, values]) => {
      const sorted = [...values].sort(
        (a, b) => (b.floorPrice ?? -1) - (a.floorPrice ?? -1),
      )
      return { key, values: sorted, topFloor: sorted[0]?.floorPrice ?? 0 }
    })
    .sort((a, b) => b.topFloor - a.topFloor || a.key.localeCompare(b.key))
}
