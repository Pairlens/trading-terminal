// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the wallet's ranges have earned and not yet taken out.
 *
 * The claimable figure is exact and comes from the chain itself: a static
 * `collect` against the position manager, sent from the owner's address, which
 * returns what a real collect would pay this block. Both legs, per position,
 * plus the totals.
 *
 * What is NOT here, and why the footnote says so. Fees ALREADY collected leave
 * no trace in state, so there is no fees-to-date figure and therefore no fee
 * APR. The pool publishes its current tick and not its history, so there is no
 * time-in-range percentage. And loss versus simply holding needs a cost basis a
 * v3 position does not store. Each of those needs an indexer or a fee-growth
 * snapshot diffed over time; a bar chart of invented daily fees would be worse
 * than an empty pane, because it would look measured.
 *
 * Totals are per TOKEN, not in dollars. A wallet's positions span pools this
 * pane has no price for, and a dollar total that silently skipped the unpriced
 * ones would read as the whole claim.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { LpPositionEntry } from '@/lib/dex/lp-types'

import {
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { DexPaneHeader } from '@/components/dex/dex-pane-primitives'
import { RangeBadge } from '@/components/dex/lp-pane-primitives'
import {
  shortWalletLabel,
  useLpSourceState,
} from '@/components/dex/use-lp-source-state'
import {
  sortLpPositions,
  useLpChains,
  useLpPositions,
} from '@/hooks/use-lp-positions'
import { dexChain } from '@/lib/dex/chain-catalog'
import { orientPosition, totalClaimableBySymbol } from '@/lib/dex/lp-display'
import { splitPairKey } from '@/lib/dex/pair-legs'
import { formatAmount } from '@/lib/format-price'

export function FeeAccrualPane() {
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)
  if (!state.wallet) return state.gate
  return <FeeAccrualPaneInner owner={state.wallet.address} pair={activePair} />
}

function FeeAccrualPaneInner({
  owner,
  pair,
}: {
  owner: string
  pair: { market: string; pairKey: string } | null
}) {
  const { t } = useTranslation()
  const legs = splitPairKey(pair?.pairKey)
  const chains = useLpChains()
  const { positions, isPending, errors } = useLpPositions(chains, owner, pair)

  const sorted = useMemo(
    () => sortLpPositions(positions, pair?.market),
    [positions, pair?.market],
  )
  const totals = useMemo(() => totalClaimableBySymbol(sorted), [sorted])

  if (chains.length === 0) {
    return (
      <PaneEmpty
        icon={Coins}
        title={t('feeAccrual.noChainsTitle')}
        body={t('feeAccrual.noChainsBody')}
      />
    )
  }

  if (sorted.length === 0) {
    return (
      <PaneEmpty
        icon={Coins}
        title={
          isPending ? t('feeAccrual.loadingTitle') : t('feeAccrual.emptyTitle')
        }
        body={
          isPending
            ? t('feeAccrual.loadingBody')
            : t('feeAccrual.emptyBody', { wallet: shortWalletLabel(owner) })
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DexPaneHeader
        title={t('feeAccrual.title')}
        subtitle={t('feeAccrual.subtitle', {
          wallet: shortWalletLabel(owner),
          count: sorted.length,
        })}
      />

      {errors.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-1 px-3 pt-2">
          {errors.slice(0, 2).map((error) => (
            <PaneErrorBanner
              key={`${error.chain}:${error.message}`}
              venue={error.chain}
              message={error.message}
            />
          ))}
        </div>
      ) : null}

      {/* The total, per token. Two lines at most: past that the table below is
          the readable form and a stacked list of ten symbols is not. */}
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <p className="text-[10px] text-muted-foreground">
          {t('feeAccrual.claimableLabel')}
        </p>
        {totals.length === 0 ? (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {t('feeAccrual.nothingClaimable')}
          </p>
        ) : (
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {totals.slice(0, 4).map((total) => (
              <span
                key={total.symbol}
                className="font-mono text-[15px] font-semibold text-up [font-variant-numeric:tabular-nums]"
              >
                {formatAmount(total.amount)}
                <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">
                  {total.symbol}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background text-muted-foreground">
            <tr className="border-b border-border">
              <th className="pb-1.5 pl-3 pr-3 text-left font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {t('feeAccrual.columns.position')}
              </th>
              <Th align="right">{t('feeAccrual.columns.fee')}</Th>
              <th className="pb-1.5 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {t('feeAccrual.columns.claimable')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <FeeRow
                key={`${entry.market}:${entry.managerAddress}:${entry.tokenId}`}
                entry={entry}
                legs={entry.matchesPair === true ? legs : null}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {t('feeAccrual.footnote')}
      </p>
    </div>
  )
}

function FeeRow({
  entry,
  legs,
}: {
  entry: LpPositionEntry
  legs: { base: string; quote: string } | null
}) {
  const { t } = useTranslation()
  const view = orientPosition(entry, legs)
  const chain = dexChain(entry.market)
  const hasFees =
    (view.baseFees !== null && view.baseFees > 0) ||
    (view.quoteFees !== null && view.quoteFees > 0)

  return (
    <tr className="border-b border-border/40 text-xs">
      <td className="py-1.5 pl-3 pr-3">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate">
            {view.baseSymbol}/{view.quoteSymbol}
          </span>
          <RangeBadge inRange={entry.inRange} compact />
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {[entry.dexName, chain?.displayName].filter(Boolean).join(' · ')}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right font-mono text-[11px] text-muted-foreground [font-variant-numeric:tabular-nums]">
        {entry.feeTier === null ? '' : `${(entry.feeTier * 100).toFixed(2)}%`}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {view.baseFees === null && view.quoteFees === null ? (
          <span className="text-[10.5px] text-muted-foreground">
            {t('feeAccrual.notRead')}
          </span>
        ) : (
          <>
            <span className={cn('block', hasFees && 'text-up')}>
              {view.baseFees === null
                ? ''
                : `${formatAmount(view.baseFees)} ${view.baseSymbol}`}
            </span>
            <span
              className={cn(
                'block text-[10.5px]',
                hasFees ? 'text-up' : 'text-muted-foreground',
              )}
            >
              {view.quoteFees === null
                ? ''
                : `${formatAmount(view.quoteFees)} ${view.quoteSymbol}`}
            </span>
          </>
        )}
      </td>
    </tr>
  )
}
