// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every swap through the pool as it confirms, with the wallet that signed it.
 *
 * One polled feed for the pane rather than a socket per row — the providers
 * have no streaming trade endpoint, and the poll cadence is set against
 * GeckoTerminal's free tier, which a charted pair is already spending on
 * candles and a ticker.
 *
 * The counterparty column is an ADDRESS and nothing else. A prototype showed
 * badges like "market maker" and "DAO treasury"; no wallet-labelling source is
 * connected, and a guessed label on a tape is a claim about who is on the
 * other side of a trade. The address links to the chain's explorer, where the
 * reader can decide that for themselves.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Receipt } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { PoolTrade } from '@pairlens/shared/instrument-types'

import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { usePoolTrades } from '@/hooks/use-pool-stats'
import { dexChain, explorerTxUrl } from '@/lib/dex/chain-catalog'
import { truncateAddress } from '@/lib/dex/pool-math'
import { formatCompactUsd } from '@/lib/format-price'

/** Prints drawn. The provider serves ~200; the pane shows a fraction. */
const MAX_ROWS = 200
/** The "large prints only" filter, in USD. */
const LARGE_TRADE_USD = 50_000

const GRID =
  'grid grid-cols-[3rem_2.75rem_1fr_1fr] gap-1.5 px-2.5 @min-[19rem]/pane:grid-cols-[3rem_2.75rem_1fr_1fr_5.5rem]'

export function OnchainTradesPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return (
    <OnchainTradesPaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
    />
  )
}

function OnchainTradesPaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const chain = dexChain(market)
  const [largeOnly, setLargeOnly] = useState(false)

  const { trades, isLoading, noPool, error } = usePoolTrades(market, pairKey, {
    enabled: Boolean(chain),
    // Filtering at the provider rather than after the fact: the endpoint takes
    // a minimum, so the large-print view fetches large prints instead of
    // dropping most of a page on arrival.
    minVolumeUsd: largeOnly ? LARGE_TRADE_USD : 0,
  })

  const rows = useMemo(() => trades.slice(0, MAX_ROWS), [trades])

  const net1h = useMemo(() => {
    const cutoff = Date.now() - 3_600_000
    let net = 0
    for (const trade of rows) {
      if (trade.ts < cutoff) continue
      net += trade.side === 'buy' ? trade.amountUsd : -trade.amountUsd
    }
    return net
  }, [rows])

  if (!chain) {
    return (
      <PaneEmpty
        icon={Receipt}
        title={t('onchainTrades.notOnChainTitle')}
        body={t('onchainTrades.notOnChainBody')}
      />
    )
  }

  if (noPool) {
    return <PaneDataUnavailable compact market={market} pairKey={pairKey} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <FilterChip
          active={!largeOnly}
          onClick={() => setLargeOnly(false)}
          label={t('onchainTrades.filterAll')}
        />
        <FilterChip
          active={largeOnly}
          onClick={() => setLargeOnly(true)}
          label={t('onchainTrades.filterLarge', {
            value: formatCompactUsd(LARGE_TRADE_USD),
          })}
        />
      </div>

      {error ? (
        <div className="px-2.5 pt-2">
          <PaneErrorBanner venue={chain.displayName} message={error} />
        </div>
      ) : null}

      <div
        className={cn(
          GRID,
          'shrink-0 border-b border-border py-1 font-mono text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground',
        )}
      >
        <span>{t('onchainTrades.columns.time')}</span>
        <span>{t('onchainTrades.columns.side')}</span>
        <span className="text-right">{t('onchainTrades.columns.value')}</span>
        <span className="text-right">{t('onchainTrades.columns.price')}</span>
        <span className="hidden text-right @min-[19rem]/pane:block">
          {t('onchainTrades.columns.wallet')}
        </span>
      </div>

      {rows.length === 0 ? (
        <PaneEmpty
          icon={Receipt}
          title={
            isLoading
              ? t('onchainTrades.loadingTitle')
              : t('onchainTrades.emptyTitle')
          }
          body={
            isLoading
              ? t('onchainTrades.loadingBody')
              : t('onchainTrades.emptyBody')
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((trade) => (
            <TradeRow key={trade.id} trade={trade} market={market} />
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-border px-2.5 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {t('onchainTrades.net1h')}
        </span>
        <span
          className={cn(
            'font-mono text-[11px] [font-variant-numeric:tabular-nums]',
            net1h >= 0 ? 'text-up' : 'text-down',
          )}
        >
          {net1h >= 0 ? '+' : '-'}
          {formatCompactUsd(Math.abs(net1h))}
        </span>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-2 py-0.5 text-[11px] transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

function TradeRow({ trade, market }: { trade: PoolTrade; market: string }) {
  const { t } = useTranslation()
  const buy = trade.side === 'buy'
  const url = explorerTxUrl(market, trade.txHash)

  return (
    <div
      className={cn(
        GRID,
        'items-center border-b border-border/40 py-[3px] font-mono text-[11px] [font-variant-numeric:tabular-nums]',
        buy ? 'bg-up/5' : 'bg-down/5',
      )}
    >
      <span className="text-muted-foreground">{clockTime(trade.ts)}</span>
      <span className={buy ? 'text-up' : 'text-down'}>
        {buy ? t('onchainTrades.buy') : t('onchainTrades.sell')}
      </span>
      <span className="text-right">{formatCompactUsd(trade.amountUsd)}</span>
      <span className="text-right text-foreground/70">
        {trade.priceUsd === null ? '—' : formatSwapPrice(trade.priceUsd)}
      </span>
      <span className="hidden justify-self-end @min-[19rem]/pane:block">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            title={t('onchainTrades.openTx')}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {truncateAddress(trade.wallet, 4, 4)}
            <ExternalLink className="size-2.5 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-muted-foreground">
            {truncateAddress(trade.wallet, 4, 4)}
          </span>
        )}
      </span>
    </div>
  )
}

function clockTime(ts: number): string {
  const date = new Date(ts)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** A swap price, which on a memecoin pair runs to eight leading zeros. */
function formatSwapPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  return price.toPrecision(4)
}
