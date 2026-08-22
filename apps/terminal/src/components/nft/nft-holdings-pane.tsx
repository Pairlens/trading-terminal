// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the connected wallet owns here, marked against the bid.
 *
 * Marked against the BID, not the floor, and that is the whole argument for the
 * pane. Every NFT portfolio on the internet values a holding at the collection
 * floor, which is the price somebody is ASKING: it is not a price the holder
 * can get, and on an illiquid collection it can sit two or three times above
 * the best standing offer for weeks. The mark here is the best bid the token
 * could actually be sold into now, so an unrealised number on this board is one
 * a holder could go and realise.
 *
 * Cost basis is optional and stays optional. Most providers index ownership
 * without attributing an acquisition, and inventing a basis from the last sale
 * of the token would attribute somebody else's trade to this wallet. No basis
 * means no P/L row, not a zero.
 *
 * Public chain state only: the address is read, never a key, so this works with
 * the vault sealed.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { NftChain, NftHolding } from '@pairlens/shared/nft-types'
import {
  PANE_FOOTNOTE,
  PANE_TABLE_BODY,
  PaneEmpty,
  Th,
} from '@/components/panes/pane-primitives'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import {
  NFT_NO_VALUE,
  NftErrorBanner,
  NftPaneFallback,
  NftThumbnail,
  nftChainLabelKey,
  nftPanePhase,
} from '@/components/nft/nft-pane-primitives'
import { NftLoadingRows } from '@/components/nft/nft-board-skeletons'
import {
  useNftBoardWallet,
  useNftPaneTarget,
} from '@/components/nft/nft-board-target'
import { useNftCollection, useNftHoldings } from '@/hooks/use-nft-market'
import { formatNftPrice, formatTokenId, shortenAddress } from '@/lib/nft/format'
import { formatResolutionDate } from '@/lib/format-time'

export function NftHoldingsPane() {
  const { t } = useTranslation()
  const target = useNftPaneTarget()

  if (!target) {
    return (
      <PaneEmpty
        body={t('nftHoldings.noPairBody')}
        icon={Wallet}
        title={t('nftHoldings.noPairTitle')}
      />
    )
  }

  return <NftHoldingsInner chain={target.chain} contract={target.contract} />
}

function NftHoldingsInner({
  chain,
  contract,
}: {
  chain: NftChain
  contract: string
}) {
  const { t } = useTranslation()
  const { wallet, sealed, loaded } = useNftBoardWallet(chain)
  const { holdings, ...status } = useNftHoldings(
    chain,
    wallet?.address,
    contract,
    Boolean(wallet),
  )
  const { collection } = useNftCollection(chain, contract)

  const sorted = useMemo(
    () =>
      [...holdings].sort((a, b) => (b.acquiredMs ?? 0) - (a.acquiredMs ?? 0)),
    [holdings],
  )

  if (sealed || (loaded && !wallet)) {
    return (
      <PaneCredentialsRequired
        compact
        kind="wallet"
        market={chain}
        state={sealed ? 'sealed' : 'missing'}
        venueLabel={t(nftChainLabelKey(chain))}
      />
    )
  }

  const phase = nftPanePhase(status, sorted.length > 0)
  if (phase === 'loading') {
    return (
      <NftLoadingRows
        cells={['w-16', 'w-14', 'w-12', 'w-12', 'w-12']}
        label={t('nftHoldings.loadingLabel')}
        rows={6}
        template="grid-cols-[1fr_auto_auto_auto_auto]"
        thumbnail
      />
    )
  }

  if (phase !== 'ready') {
    return (
      <NftPaneFallback
        emptyBody={t('nftHoldings.emptyBody')}
        emptyTitle={t('nftHoldings.emptyTitle')}
        icon={Wallet}
        phase={phase}
        status={status}
      />
    )
  }

  const currency = sorted[0]?.priceCurrency ?? collection?.priceCurrency
  const markTotal = sorted.reduce(
    (sum, holding) => sum + (holding.markPrice ?? 0),
    0,
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeaderMetric>{shortenAddress(wallet?.address)}</PaneHeaderMetric>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className={cn('w-full', PANE_TABLE_BODY)}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              <Th>{t('nftHoldings.columns.item')}</Th>
              <Th>{t('nftHoldings.columns.acquired')}</Th>
              <Th align="right">{t('nftHoldings.columns.basis')}</Th>
              <Th align="right">{t('nftHoldings.columns.mark')}</Th>
              <Th align="right">{t('nftHoldings.columns.pnl')}</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((holding) => (
              <HoldingRow
                currency={currency}
                holding={holding}
                key={holding.tokenId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div
        className={cn('flex shrink-0 items-center gap-2 pt-1.5', PANE_FOOTNOTE)}
      >
        <span className="min-w-0 flex-1 truncate">
          {t('nftHoldings.footnote', {
            count: sorted.length,
            value: formatNftPrice(markTotal, currency),
          })}
        </span>
      </div>

      <NftErrorBanner phase={phase} status={status} />
    </div>
  )
}

function HoldingRow({
  holding,
  currency,
}: {
  holding: NftHolding
  /** The collection's settlement currency, where the row carries none. */
  currency: string | undefined
}) {
  const ticker = holding.priceCurrency ?? currency
  // Both halves or nothing: a P/L against an assumed basis is a made-up number.
  const pnl =
    holding.costBasis != null && holding.markPrice != null
      ? holding.markPrice - holding.costBasis
      : null
  const pnlPct =
    pnl !== null && holding.costBasis ? (pnl / holding.costBasis) * 100 : null

  return (
    <tr className="border-none">
      <td className="py-[3px] pr-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <NftThumbnail
            className="size-5 rounded-[4px]"
            imageUrl={holding.imageUrl}
          />
          <span className="truncate" title={holding.name}>
            {formatTokenId(holding.tokenId)}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap py-[3px] pr-3 text-muted-foreground">
        {holding.acquiredMs
          ? formatResolutionDate(holding.acquiredMs)
          : NFT_NO_VALUE}
      </td>
      <td className="py-[3px] pr-3 text-right text-muted-foreground">
        {formatNftPrice(holding.costBasis, ticker)}
      </td>
      <td className="py-[3px] pr-3 text-right">
        {formatNftPrice(holding.markPrice, ticker)}
      </td>
      <td
        className={cn(
          'py-[3px] text-right',
          pnl === null
            ? 'text-muted-foreground'
            : pnl >= 0
              ? 'text-up'
              : 'text-down',
        )}
      >
        {pnl === null ? (
          NFT_NO_VALUE
        ) : (
          <>
            <div>{formatNftPrice(pnl, ticker)}</div>
            {pnlPct !== null && (
              <div className="text-[9.5px]">
                {pnlPct > 0 ? '+' : ''}
                {pnlPct.toFixed(1)}%
              </div>
            )}
          </>
        )}
      </td>
    </tr>
  )
}
