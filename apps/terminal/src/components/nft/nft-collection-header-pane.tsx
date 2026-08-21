// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The board's identity line: what this collection is, and what it costs.
 *
 * A contract address is not a name, and the route carries nothing else, so a
 * cold link opens on `0xbd35…2cf8` until the first provider read lands. The
 * directory fixes that: whatever row sent the reader here pinned the name and
 * the artwork on the way out, and this header reads the pin first and lets the
 * live answer overwrite it. A header that blanks for two seconds on every open
 * is a header nobody trusts to be current.
 *
 * The floor is the one large number, because it is the only price on the board
 * that a buyer can act on without reading anything else. Everything after it is
 * a dense stat row rather than a grid of cards: seven facts, in the order they
 * change a decision. Listed share sits in there deliberately — 2% listed is a
 * floor with conviction behind it, 30% listed is an exit queue, and the floor
 * alone cannot tell those apart.
 */
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Gem } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { NftChain } from '@pairlens/shared/nft-types'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  NFT_NO_VALUE,
  NftChangeCell,
  NftErrorBanner,
  NftPaneFallback,
  NftThumbnail,
  nftChainLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { useNftPaneTarget } from '@/components/nft/nft-board-target'
import { useNftCollection } from '@/hooks/use-nft-market'
import { useNftDirectoryEntry } from '@/stores/nft-directory-store'
import {
  formatNftChange,
  formatNftCount,
  formatNftPrice,
  formatNftUsd,
  listedRatio,
  shortenAddress,
} from '@/lib/nft/format'

export function NftCollectionHeaderPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftCollectionHeader.noPairBody')}
        icon={Gem}
        title={t('nftCollectionHeader.noPairTitle')}
      />
    )
  }

  return (
    <NftCollectionHeaderInner chain={target.chain} contract={target.contract} />
  )
}

function NftCollectionHeaderInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const pinned = useNftDirectoryEntry(chain, contract)
  const { collection, ...status } = useNftCollection(chain, contract)

  // The pin counts as something to draw. A header with the right name and no
  // numbers yet is the honest intermediate state; an empty pane is not.
  const phase = nftPanePhase(status, Boolean(collection ?? pinned))

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftCollectionHeader.emptyBody')}
        emptyTitle={t('nftCollectionHeader.emptyTitle')}
        icon={Gem}
        phase={phase}
        status={status}
      />
    )
  }

  const name = collection?.name ?? pinned?.name ?? shortenAddress(contract)
  const imageUrl = collection?.imageUrl ?? pinned?.imageUrl
  const currency = collection?.priceCurrency ?? pinned?.priceCurrency
  const verified = collection?.verified ?? pinned?.verified ?? false
  const listed = listedRatio(collection?.listedCount, collection?.totalSupply)
  const royalty =
    collection?.royaltyBps != null ? collection.royaltyBps / 100 : null

  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-2 py-0.5">
      <div className="flex items-start gap-3">
        <NftThumbnail className="size-10 rounded-lg" imageUrl={imageUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2
              className="truncate text-base font-semibold leading-tight tracking-tight"
              title={name}
            >
              {name}
            </h2>
            {verified && (
              <BadgeCheck
                aria-label={t('nftCollectionHeader.verified')}
                className="size-3.5 shrink-0 text-primary"
              />
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{t(nftChainLabelKey(chain))}</span>
            <span title={contract}>{shortenAddress(contract)}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
            {t('nftCollectionHeader.floor')}
          </div>
          <div className="mt-0.5 font-mono text-xl font-semibold leading-none tabular-nums">
            {formatNftPrice(collection?.floorPrice, currency)}
          </div>
          <div className="mt-1 flex items-center justify-end gap-2 font-mono text-[10.5px] tabular-nums">
            <NftChangeCell
              fraction={collection?.floorChange24h}
              text={formatNftChange(collection?.floorChange24h)}
            />
            <span className="text-muted-foreground">
              {formatNftUsd(collection?.floorPriceUsd)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <Stat
          label={t('nftCollectionHeader.volume24h')}
          value={formatNftPrice(collection?.volume24h, currency)}
        />
        <Stat
          label={t('nftCollectionHeader.marketCap')}
          value={
            collection?.marketCapUsd != null
              ? formatNftUsd(collection.marketCapUsd)
              : formatNftPrice(collection?.marketCap, currency)
          }
        />
        <Stat
          label={t('nftCollectionHeader.supply')}
          value={formatNftCount(collection?.totalSupply)}
        />
        <Stat
          label={t('nftCollectionHeader.holders')}
          value={formatNftCount(collection?.ownerCount)}
        />
        <Stat
          label={t('nftCollectionHeader.listed')}
          value={
            listed === null
              ? NFT_NO_VALUE
              : t('nftCollectionHeader.listedValue', {
                  percent: (listed * 100).toFixed(1),
                  listed: formatNftCount(collection?.listedCount),
                })
          }
        />
        <Stat
          label={t('nftCollectionHeader.topOffer')}
          value={formatNftPrice(collection?.topOffer, currency)}
        />
        <Stat
          label={t('nftCollectionHeader.royalty')}
          value={royalty === null ? NFT_NO_VALUE : `${royalty.toFixed(2)}%`}
        />
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}

/** One fact: its name above it, quiet, and the number in the board's voice. */
function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px] tabular-nums">{value}</div>
    </div>
  )
}
