// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The same asset priced on every chain, with gas folded in.
 *
 * The point of the pane is the last column. The deepest pool is routinely not
 * the best fill: Ethereum wins on impact and loses on gas below a few hundred
 * thousand dollars, and the ladder flips above that. Comparing raw quotes
 * would hide exactly that, so the ranking is on what LANDS — output value
 * minus the aggregator's own gas estimate.
 *
 * Cross-chain identity is the honest limit here, and the pane states it. There
 * is no canonical mapping from a token on one chain to "the same" token on
 * another (bridged, wrapped and native versions are different contracts), so a
 * row is only quoted where the chain's own resolver finds a pool for the
 * pair's tickers. A chain where it does not is drawn dimmed and says so rather
 * than being quietly dropped.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ListOrdered } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { SwapRouteQuote } from '@pairlens/market-engine/types'

import { PaneEmpty, Th } from '@/components/panes/pane-primitives'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { fetchSwapRoute, useDexConnectors } from '@/hooks/use-swap-route'
import { useDexChains } from '@/hooks/use-dex-chains'
import { splitPairKey } from '@/lib/dex/pair-legs'
import { formatAmount, formatCompactUsd } from '@/lib/format-price'

/**
 * Notional the ladder is sized for. Fixed rather than typed in: a ladder is a
 * comparison, and it is only a comparison while every row is quoting the same
 * money.
 */
const LADDER_USD = 250_000
const QUOTE_STALE_MS = 60_000

export function ChainLadderPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  // Only the pair matters: the ladder's whole job is to ask every OTHER
  // chain the same question, so the pane's own venue is not an input.
  return <ChainLadderPaneInner pairKey={activePair.pairKey} />
}

type LadderRow = {
  market: string
  displayName: string
  iconUrl: string
  quote: SwapRouteQuote | null
  isLoading: boolean
  gasUsd: number | null
  /** Output value less gas, in output-token units. The ranking number. */
  netOut: number | null
}

function ChainLadderPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const chains = useDexChains()
  const connectors = useDexConnectors()
  const legs = splitPairKey(pairKey)
  const connected = useMemo(
    () => chains.filter((chain) => chain.connected),
    [chains],
  )
  // Each chain quotes the pair against ITS OWN stable leg: the same base
  // ticker on Base and on BNB Chain is quoted in USDC and USDT respectively,
  // and forcing one quote symbol everywhere would simply fail to resolve on
  // half the ladder.
  const results = useQueries({
    queries: connected.map((chain) => {
      const pair = legs ? `${legs.base}-${chain.quoteSymbol}` : null
      const plugin = connectors.get(chain.market) ?? null
      return {
        queryKey: ['chain-ladder-quote', chain.market, pair, LADDER_USD],
        queryFn: async () =>
          fetchSwapRoute(plugin, {
            market: chain.market,
            pairKey: pair,
            side: 'buy' as const,
            // The probe is in quote units, and every chain's quote leg is its
            // canonical USD stable, so the notional is the size.
            size: LADDER_USD,
          }),
        enabled: Boolean(plugin && pair),
        staleTime: QUOTE_STALE_MS,
        gcTime: 5 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      }
    }),
  })

  const rows = useMemo<Array<LadderRow>>(() => {
    return connected.map((chain, index) => {
      const result = results[index]
      const quote = (result?.data ?? null) as SwapRouteQuote | null
      const gasUsd = quote?.gasUsd ?? null
      // Gas is priced in USD and the output in tokens, so it converts through
      // the quote's own execution price before it can be subtracted.
      const gasInOutput =
        gasUsd !== null && quote && quote.amountIn > 0
          ? gasUsd * (quote.amountOut / quote.amountIn)
          : 0
      return {
        market: chain.market,
        displayName: chain.displayName,
        iconUrl: chain.iconUrl,
        quote,
        isLoading: Boolean(result?.isPending && result.fetchStatus !== 'idle'),
        gasUsd,
        netOut: quote ? quote.amountOut - gasInOutput : null,
      }
    })
  }, [connected, results])

  const best = useMemo(() => {
    let bestRow: LadderRow | null = null
    for (const row of rows) {
      if (row.netOut === null) continue
      if (!bestRow || row.netOut > bestRow.netOut!) bestRow = row
    }
    return bestRow
  }, [rows])

  const sorted = useMemo(() => {
    return rows.slice().sort((a, b) => {
      if (a.netOut === null && b.netOut === null) return 0
      if (a.netOut === null) return 1
      if (b.netOut === null) return -1
      return b.netOut - a.netOut
    })
  }, [rows])

  if (!legs) {
    return (
      <PaneEmpty
        icon={ListOrdered}
        title={t('chainLadder.noPairTitle')}
        body={t('chainLadder.noPairBody')}
      />
    )
  }

  if (connected.length === 0) {
    return (
      <PaneEmpty
        icon={ListOrdered}
        title={t('chainLadder.noChainsTitle')}
        body={t('chainLadder.noChainsBody')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">
            {t('chainLadder.title', { asset: legs.base })}
          </h2>
          <p className="truncate text-[10px] text-muted-foreground">
            {t('chainLadder.subtitle')}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
          {t('chainLadder.sizedFor', { value: formatCompactUsd(LADDER_USD) })}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background text-muted-foreground">
            <tr className="border-b border-border">
              <th className="pb-1.5 pl-3 pr-3 text-left font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {t('chainLadder.columns.chain')}
              </th>
              <Th align="right">{t('chainLadder.columns.price')}</Th>
              <Th align="right">{t('chainLadder.columns.impact')}</Th>
              <Th align="right">{t('chainLadder.columns.gas')}</Th>
              <th className="pb-1.5 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {t('chainLadder.columns.youReceive')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <LadderRowView
                key={row.market}
                row={row}
                isBest={best?.market === row.market}
                bestNetOut={best?.netOut ?? null}
                baseSymbol={legs.base}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {t('chainLadder.footnote')}
      </p>
    </div>
  )
}

function LadderRowView({
  row,
  isBest,
  bestNetOut,
  baseSymbol,
}: {
  row: LadderRow
  isBest: boolean
  bestNetOut: number | null
  baseSymbol: string
}) {
  const { t } = useTranslation()
  const quote = row.quote

  if (!quote) {
    return (
      <tr className="border-b border-border/40 text-xs opacity-55">
        <td className="py-1.5 pl-3 pr-3">
          <span className="flex items-center gap-1.5">
            <img src={row.iconUrl} alt="" className="size-4 rounded-full" />
            <span className="truncate">{row.displayName}</span>
          </span>
        </td>
        <td
          className="py-1.5 pr-3 text-right text-muted-foreground"
          colSpan={4}
        >
          {row.isLoading
            ? ''
            : t('chainLadder.notFound', { asset: baseSymbol })}
        </td>
      </tr>
    )
  }

  // Distance from the best fill, in basis points of what lands.
  const bps =
    bestNetOut !== null && bestNetOut > 0 && row.netOut !== null
      ? ((row.netOut - bestNetOut) / bestNetOut) * 10_000
      : null

  return (
    <tr
      className={cn('border-b border-border/40 text-xs', isBest && 'bg-up/8')}
    >
      <td className="py-1.5 pl-3 pr-3">
        <span className="flex items-center gap-1.5">
          <img src={row.iconUrl} alt="" className="size-4 rounded-full" />
          <span className="truncate">{row.displayName}</span>
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        {quote.executionPrice && quote.executionPrice > 0
          ? formatAmount(1 / quote.executionPrice)
          : '—'}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground [font-variant-numeric:tabular-nums]">
        {quote.priceImpact === null
          ? '—'
          : `${(quote.priceImpact * 100).toFixed(2)}%`}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground [font-variant-numeric:tabular-nums]">
        {row.gasUsd === null ? '—' : formatCompactUsd(row.gasUsd)}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono [font-variant-numeric:tabular-nums]">
        <span className="block">
          {row.netOut === null ? '—' : formatAmount(row.netOut)}
        </span>
        <span
          className={cn(
            'block text-[10px]',
            isBest ? 'text-up' : 'text-muted-foreground',
          )}
        >
          {isBest
            ? t('chainLadder.best')
            : bps === null
              ? ''
              : t('chainLadder.versusBest', { bps: bps.toFixed(1) })}
        </span>
      </td>
    </tr>
  )
}
