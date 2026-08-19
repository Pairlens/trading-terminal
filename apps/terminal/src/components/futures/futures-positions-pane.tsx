// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open perpetual-futures positions across every connected futures account.
 *
 * A net-new surface, for the same reason the prediction one was: `positions-
 * pane` is misnamed and renders ORDERS, and a spot balance sheet has no
 * concept of a holding that can be liquidated. What a perp position needs on
 * screen is the contract, which way it leans, how big it is, what it cost,
 * where the mark is now, where it dies, and what it is up or down.
 *
 * Deliberately no live mark: a ticker subscription per open position would put
 * a socket on this pane for every row, and the venue already reports mark,
 * liquidation and unrealised PnL inside the positions payload itself. The
 * chart is one click away for a moving price.
 *
 * Closing is the one write. It goes through the guarded `placeOrder` path as a
 * reduce-only market order on the opposite side, behind a confirm dialog —
 * reduce-only is what makes a mistimed double-click harmless: the venue will
 * shrink the position and refuse to flip it.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Link } from '@tanstack/react-router'

import type { NormalizedPosition } from '@pairlens/market-engine/types'
import type { FuturesAccountPositions } from '@/hooks/use-futures-positions'
import {
  useFuturesAccounts,
  useFuturesPositions,
} from '@/hooks/use-futures-positions'
import { formatAmount, formatPrice } from '@/lib/format-price'
import { contractsToBase } from '@/lib/futures/ticket-math'
import { useMarketData } from '@/lib/market-data-provider'
import {
  PANE_TABLE_BODY,
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'

export function FuturesPositionsPane() {
  const { t } = useTranslation()
  const accounts = useFuturesAccounts()
  const { data, isPending, refetch } = useFuturesPositions(accounts)
  const [closing, setClosing] = useState<{
    result: FuturesAccountPositions
    position: NormalizedPosition
  } | null>(null)

  if (accounts.length === 0) {
    return (
      <PaneEmpty
        action={
          <Link
            className="mt-3 text-xs text-primary hover:underline"
            to="/accounts"
          >
            {t('futuresPositions.connect')} →
          </Link>
        }
        body={t('futuresPositions.noAccountsBody')}
        icon={Layers}
        title={t('futuresPositions.noAccountsTitle')}
      />
    )
  }

  // Only while EVERY venue is still in flight. One slow exchange must not hold
  // back the rows another already answered with.
  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">
          {t('futuresPositions.loading')}
        </p>
      </div>
    )
  }

  const results = data
  const rowCount = results.reduce((n, r) => n + r.positions.length, 0)
  const errors = results.filter((r) => r.error)

  if (rowCount === 0 && errors.length === 0) {
    return (
      <PaneEmpty
        body={t('futuresPositions.emptyBody')}
        icon={Layers}
        title={t('futuresPositions.emptyTitle')}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-2">
        {errors.map((result) => (
          <PaneErrorBanner
            key={`err:${result.account.market}:${result.account.credentialId}`}
            message={result.error ?? ''}
            venue={result.account.venueLabel}
          />
        ))}

        {rowCount > 0 && (
          <table className={cn('w-full', PANE_TABLE_BODY)}>
            <thead>
              <tr>
                <Th>{t('futuresPositions.colContract')}</Th>
                <Th>{t('futuresPositions.colSide')}</Th>
                <Th align="right">{t('futuresPositions.colSize')}</Th>
                <Th align="right">{t('futuresPositions.colEntry')}</Th>
                <Th align="right">{t('futuresPositions.colMark')}</Th>
                <Th align="right">{t('futuresPositions.colLiquidation')}</Th>
                <Th align="right">{t('futuresPositions.colLeverage')}</Th>
                <Th align="right">{t('futuresPositions.colPnl')}</Th>
                <Th align="right">{''}</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) =>
                result.positions.map((position) => (
                  <Row
                    key={`${result.account.market}:${result.account.credentialId}:${position.pair}:${position.side}`}
                    onClose={() => setClosing({ result, position })}
                    position={position}
                    result={result}
                  />
                )),
              )}
            </tbody>
          </table>
        )}
      </div>

      <CloseDialog
        onDone={() => {
          setClosing(null)
          void refetch()
        }}
        onOpenChange={(open) => {
          if (!open) setClosing(null)
        }}
        target={closing}
      />
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

/** A number the venue did not report, rendered as absent rather than as zero. */
function num(value: number | undefined): string {
  return value != null && Number.isFinite(value) ? formatPrice(value) : '—'
}

function Row({
  result,
  position,
  onClose,
}: {
  result: FuturesAccountPositions
  position: NormalizedPosition
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isLong = position.side === 'long'
  // Contract counts mean nothing on their own for a venue whose contract is a
  // fraction of the base asset, so the base equivalent rides underneath —
  // shown only when the venue's contract is NOT one unit of the base, which is
  // where the confusion actually lives.
  const contractSize = position.contractSize
  const baseEquivalent =
    contractSize != null &&
    contractSize > 0 &&
    contractSize !== 1 &&
    position.contracts > 0
      ? contractsToBase(position.contracts, contractSize)
      : null
  const pnl = position.unrealizedPnl

  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="max-w-56 truncate py-1.5 pr-3" title={position.pair}>
        <Link
          className="hover:underline"
          params={{ pair: position.pair }}
          to="/pair/$pair"
        >
          {position.pair}
        </Link>
        <span className="ml-1.5 text-[10px] text-muted-foreground">
          {result.account.venueLabel}
        </span>
      </td>
      <td className="py-1.5 pr-3">
        <span className={cn('font-medium', isLong ? 'text-up' : 'text-down')}>
          {isLong
            ? t('futuresPositions.sideLong')
            : t('futuresPositions.sideShort')}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {position.contracts}
        {baseEquivalent !== null && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            ≈ {formatAmount(baseEquivalent)}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {num(position.entryPrice)}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
        {num(position.markPrice)}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-down">
        {num(position.liquidationPrice)}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
        {position.leverage != null ? `${position.leverage}x` : '—'}
      </td>
      <td
        className={cn(
          'py-1.5 pr-3 text-right font-mono tabular-nums',
          pnl == null ? '' : pnl > 0 ? 'text-up' : pnl < 0 ? 'text-down' : '',
        )}
      >
        {pnl != null && Number.isFinite(pnl)
          ? `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}`
          : '—'}
      </td>
      <td className="py-1.5 text-right">
        <button
          className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          {t('futuresPositions.close')}
        </button>
      </td>
    </tr>
  )
}

/**
 * The close confirmation. A reduce-only market order on the opposite side,
 * sized at the full contract count — the venue clamps it to what is actually
 * open, which is what makes a stale row safe to act on.
 */
function CloseDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: {
    result: FuturesAccountPositions
    position: NormalizedPosition
  } | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { placeOrder } = useMarketData()
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!target) return
    setSubmitting(true)
    try {
      const result = await placeOrder({
        market: target.result.account.market,
        pair: target.position.pair,
        side: target.position.side === 'long' ? 'sell' : 'buy',
        type: 'market',
        size: String(target.position.contracts),
        credentialId: target.result.account.credentialId,
        reduceOnly: true,
        // The risk guard prices a contract count, and the venue told us what a
        // contract is worth on this market. Omitting it would have the guard
        // assume 1 and read a KuCoin close of 0.001 BTC contracts as a
        // thousand times its real size.
        ...(target.position.contractSize
          ? { contractSize: target.position.contractSize }
          : {}),
      })
      if (result.success) {
        toast.success(t('futuresPositions.closeSubmitted'))
        onDone()
      } else {
        toast.error(t('terminal.trade.orderRejected'), {
          description: result.error ?? t('common.unknownError'),
        })
      }
    } catch (err) {
      toast.error(t('terminal.trade.orderFailed'), { description: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={target !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('futuresPositions.closeTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? t('futuresPositions.closeBody', {
                  contracts: target.position.contracts,
                  pair: target.position.pair,
                  venue: target.result.account.venueLabel,
                })
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(event) => {
              // The dialog closes itself on action; the request outlives it,
              // and the toast is what reports the outcome.
              event.preventDefault()
              void submit()
            }}
          >
            {submitting
              ? t('terminal.trade.submitting')
              : t('futuresPositions.closeConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
