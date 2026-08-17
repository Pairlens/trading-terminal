// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The LP side of the pool: the band against the price, what the position is
 * made of right now, and what it has not collected yet.
 *
 * All of it is read off the chain for the connected wallet — the position
 * manager (EVM) or the position PDA behind each NFT (Solana) for the ranges,
 * and the pool's own state for the current tick — so the composition on screen
 * is what a burn would return this block. Nothing is modelled. What the chain does not carry is not shown at all rather than
 * estimated: there is no cost basis in a v3 position, so no "up 7.8% since
 * deposit", and no history, so no loss-versus-holding. Those are numbers people
 * close real positions on.
 *
 * Positions on the pool the pane is bound to come first, and the rest follow
 * because a wallet's other ranges are the context for the one on screen. The
 * pool match is decided on token ADDRESSES by the connector, never on tickers.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Layers } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { LpPositionEntry } from '@/lib/dex/lp-types'

import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { DexPaneHeader } from '@/components/dex/dex-pane-primitives'
import {
  LpStatLine,
  RangeBadge,
  RangeBar,
} from '@/components/dex/lp-pane-primitives'
import {
  shortWalletLabel,
  useLpSourceState,
} from '@/components/dex/use-lp-source-state'
import {
  sortLpPositions,
  useLpChains,
  useLpPositions,
} from '@/hooks/use-lp-positions'
import { usePoolStats } from '@/hooks/use-pool-stats'
import { dexChain, explorerAddressUrl } from '@/lib/dex/chain-catalog'
import {
  bandHalfWidth,
  headroomToUpper,
  orientPosition,
  positionValueUsd,
} from '@/lib/dex/lp-display'
import { splitPairKey } from '@/lib/dex/pair-legs'
import { formatAmount, formatCompactUsd } from '@/lib/format-price'

export function LpPositionPane() {
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)
  // The gate and the wallet are two views of one decision: no wallet, no read.
  if (!state.wallet) return state.gate
  return <LpPositionPaneInner owner={state.wallet.address} pair={activePair} />
}

function LpPositionPaneInner({
  owner,
  pair,
}: {
  owner: string
  pair: { market: string; pairKey: string } | null
}) {
  const { t } = useTranslation()
  const chain = dexChain(pair?.market)
  const legs = splitPairKey(pair?.pairKey)
  const chains = useLpChains()
  const { positions, isPending, errors, hiddenByCap } = useLpPositions(
    chains,
    owner,
    pair,
  )
  // The pool feed prices the pair's two legs in USD, which is the only honest
  // way to put a dollar figure on a position. It is asked for the pane's own
  // pair only, so positions in OTHER pools are valued in their quote leg.
  const { stats } = usePoolStats(pair?.market, pair?.pairKey, Boolean(chain))

  const sorted = useMemo(
    () => sortLpPositions(positions, pair?.market),
    [positions, pair?.market],
  )
  const primary = sorted[0] ?? null
  const others = sorted.slice(1)

  if (chains.length === 0) {
    return (
      <PaneEmpty
        icon={Layers}
        title={t('lpPosition.noChainsTitle')}
        body={t('lpPosition.noChainsBody')}
      />
    )
  }

  if (!primary) {
    return (
      <PaneEmpty
        icon={Layers}
        title={
          isPending ? t('lpPosition.loadingTitle') : t('lpPosition.emptyTitle')
        }
        body={
          isPending
            ? t('lpPosition.loadingBody')
            : t('lpPosition.emptyBody', { wallet: shortWalletLabel(owner) })
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DexPaneHeader
        title={t('lpPosition.title')}
        subtitle={t('lpPosition.subtitle', {
          wallet: shortWalletLabel(owner),
          count: sorted.length,
        })}
      >
        {hiddenByCap > 0 ? (
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {t('lpPosition.capped', { count: hiddenByCap })}
          </span>
        ) : null}
      </DexPaneHeader>

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

      <div className="min-h-0 flex-1 overflow-auto">
        <PositionDetail
          entry={primary}
          legs={primary.matchesPair === true ? legs : null}
          basePriceUsd={primary.matchesPair === true ? stats?.priceUsd : null}
          quotePriceUsd={
            primary.matchesPair === true ? stats?.quotePriceUsd : null
          }
        />
        {others.length > 0 ? (
          <div className="flex flex-col gap-2 px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">
              {t('lpPosition.otherPositions')}
            </span>
            {others.map((entry) => (
              <OtherPositionRow
                key={`${entry.market}:${entry.managerAddress}:${entry.tokenId}`}
                entry={entry}
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {t('lpPosition.footnote')}
      </p>
    </div>
  )
}

/**
 * The pane's headline position.
 *
 * Value is stated in the QUOTE leg first and in dollars only when the pool feed
 * prices both tokens. Quote units are always available (the pool's own price
 * relates the two legs) and never require a second source to be right, which is
 * the opposite trade-off from showing a dollar figure that quietly drops one
 * side of the position.
 */
function PositionDetail({
  entry,
  legs,
  basePriceUsd,
  quotePriceUsd,
}: {
  entry: LpPositionEntry
  legs: { base: string; quote: string } | null
  basePriceUsd: number | null | undefined
  quotePriceUsd: number | null | undefined
}) {
  const { t } = useTranslation()
  const view = orientPosition(entry, legs)
  const chain = dexChain(entry.market)
  const poolUrl = explorerAddressUrl(entry.market, entry.poolAddress)

  const baseInQuote =
    view.baseAmount !== null && view.priceCurrent !== null
      ? view.baseAmount * view.priceCurrent
      : null
  const valueInQuote =
    baseInQuote !== null && view.quoteAmount !== null
      ? baseInQuote + view.quoteAmount
      : null
  const valueUsd = positionValueUsd(
    view.baseAmount,
    view.quoteAmount,
    basePriceUsd ?? null,
    quotePriceUsd ?? null,
  )
  const baseShare =
    valueInQuote !== null && valueInQuote > 0 && baseInQuote !== null
      ? baseInQuote / valueInQuote
      : null

  const halfWidth = bandHalfWidth(view.priceLower, view.priceUpper)
  const headroom = headroomToUpper(view.priceCurrent, view.priceUpper)

  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            {view.baseSymbol}/{view.quoteSymbol}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {[
              entry.dexName,
              chain?.displayName,
              entry.feeTier === null
                ? null
                : t('lpPosition.feeTier', {
                    value: (entry.feeTier * 100).toFixed(2),
                  }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <RangeBadge inRange={entry.inRange} />
      </div>

      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            {t('lpPosition.value')}
          </span>
          <span className="font-mono text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
            {valueInQuote === null
              ? t('lpPosition.poolUnread')
              : `${formatAmount(valueInQuote)} ${view.quoteSymbol}`}
          </span>
        </div>
        {valueUsd !== null ? (
          <p className="mt-0.5 text-right font-mono text-[10.5px] text-muted-foreground [font-variant-numeric:tabular-nums]">
            {formatCompactUsd(valueUsd)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {t('lpPosition.range')}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground [font-variant-numeric:tabular-nums]">
            {t('lpPosition.ticks', {
              lower: entry.tickLower,
              upper: entry.tickUpper,
            })}
          </span>
        </div>
        <RangeBar
          lower={view.priceLower}
          upper={view.priceUpper}
          current={view.priceCurrent}
          quoteSymbol={view.quoteSymbol}
        />
        {halfWidth !== null ? (
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            {headroom !== null && headroom > 0
              ? t('lpPosition.bandWithHeadroom', {
                  band: (halfWidth * 100).toFixed(1),
                  headroom: (headroom * 100).toFixed(1),
                })
              : t('lpPosition.band', { band: (halfWidth * 100).toFixed(1) })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          {t('lpPosition.composition')}
        </span>
        {baseShare !== null ? (
          <div className="flex h-[22px] overflow-hidden rounded-md">
            <span
              className="grid place-items-center bg-[var(--chart-3)]/60 font-mono text-[10.5px] [font-variant-numeric:tabular-nums]"
              style={{ width: `${baseShare * 100}%` }}
            >
              {baseShare > 0.22
                ? `${formatAmount(view.baseAmount ?? 0)} ${view.baseSymbol}`
                : ''}
            </span>
            <span className="grid flex-1 place-items-center bg-[var(--chart-2)]/55 font-mono text-[10.5px] [font-variant-numeric:tabular-nums]">
              {baseShare < 0.78
                ? `${formatAmount(view.quoteAmount ?? 0)} ${view.quoteSymbol}`
                : ''}
            </span>
          </div>
        ) : null}
        <LpStatLine
          label={view.baseSymbol}
          value={view.baseAmount === null ? '' : formatAmount(view.baseAmount)}
        />
        <LpStatLine
          label={view.quoteSymbol}
          value={
            view.quoteAmount === null ? '' : formatAmount(view.quoteAmount)
          }
        />
      </div>

      <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          {t('lpPosition.uncollected')}
        </span>
        <LpStatLine
          label={view.baseSymbol}
          value={view.baseFees === null ? '' : formatAmount(view.baseFees)}
          tone={view.baseFees !== null && view.baseFees > 0 ? 'up' : 'muted'}
        />
        <LpStatLine
          label={view.quoteSymbol}
          value={view.quoteFees === null ? '' : formatAmount(view.quoteFees)}
          tone={view.quoteFees !== null && view.quoteFees > 0 ? 'up' : 'muted'}
        />
        {/* This position's boundary tick accounts could not be read, so its
            fee growth could not be replayed and only the settled amount is
            known. Labelled, because an unlabelled floor reads as the whole
            claim. */}
        {entry.feesAsOf === 'last-touch' ? (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {t('lpPosition.feesLastTouch')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
        <LpStatLine
          label={t('lpPosition.tokenId')}
          value={`#${entry.tokenId}`}
          tone="muted"
        />
        {poolUrl ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {t('lpPosition.pool')}
            </span>
            <a
              href={poolUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 items-center gap-1 font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <span className="truncate">
                {entry.poolAddress?.slice(0, 6)}…{entry.poolAddress?.slice(-4)}
              </span>
              <ExternalLink className="size-2.5 shrink-0" aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </div>
    </>
  )
}

/**
 * One of the wallet's other ranges.
 *
 * Oriented by the POOL rather than by the pane's pair: these are different
 * pools, so the pair on screen says nothing about which of their tokens is the
 * base. Value is in the pool's own quote leg for the same reason.
 */
function OtherPositionRow({ entry }: { entry: LpPositionEntry }) {
  const view = orientPosition(entry, null)
  const chain = dexChain(entry.market)
  const valueInQuote =
    view.baseAmount !== null &&
    view.quoteAmount !== null &&
    view.priceCurrent !== null
      ? view.baseAmount * view.priceCurrent + view.quoteAmount
      : null
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[11.5px]',
        entry.inRange === false && 'opacity-70',
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {view.baseSymbol}/{view.quoteSymbol}
        <span className="text-muted-foreground">
          {' · '}
          {chain?.abbr ?? entry.market}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground [font-variant-numeric:tabular-nums]">
        {valueInQuote === null
          ? ''
          : `${formatAmount(valueInQuote)} ${view.quoteSymbol}`}
      </span>
      <RangeBadge inRange={entry.inRange} compact />
    </div>
  )
}
