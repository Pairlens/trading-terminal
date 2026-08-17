// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Transfers still crossing, and what each one is waiting on.
 *
 * A bridge send outlives the tab it was made in, so the rows come from the
 * local transfer ledger rather than from any connector's memory, and the poller
 * keeps running against the aggregator until each one settles or fails.
 *
 * There is no progress bar, and that is the deliberate part. LI.FI publishes a
 * STAGE ('waiting for the destination transaction') rather than a block count,
 * so a bar would be drawn from nothing: it would advance smoothly on a transfer
 * that is stuck, which is the opposite of what somebody opens this pane for.
 * The row states the stage, the elapsed time against the quoted estimate, and
 * links both transactions so the reader can go and look.
 */
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'

import type { BridgeTransfer } from '@/lib/dex/bridge-types'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { useLpSourceState } from '@/components/dex/use-lp-source-state'
import { useBridgeTransferTracking } from '@/hooks/use-bridge'
import {
  transfersForWallet,
  useBridgeTransfersStore,
} from '@/lib/dex/bridge-transfers-store'
import { dexChain, explorerTxUrl } from '@/lib/dex/chain-catalog'
import { formatAmount } from '@/lib/format-price'

export function InFlightPane() {
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)
  if (state.gate) return state.gate
  return <InFlightPaneInner walletAddress={state.wallet!.address} />
}

function InFlightPaneInner({ walletAddress }: { walletAddress: string }) {
  const { t } = useTranslation()
  const load = useBridgeTransfersStore((s) => s.load)
  const all = useBridgeTransfersStore((s) => s.transfers)

  useEffect(() => {
    load()
  }, [load])

  const transfers = useMemo(
    () => transfersForWallet(all, walletAddress),
    [all, walletAddress],
  )
  useBridgeTransferTracking(transfers)

  if (transfers.length === 0) {
    return (
      <PaneEmpty
        icon={Send}
        title={t('inFlight.emptyTitle')}
        body={t('inFlight.emptyBody')}
      />
    )
  }

  const pending = transfers.filter((transfer) => transfer.status === 'pending')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="truncate text-[13px] font-semibold">
          {t('inFlight.title')}
        </h2>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {t('inFlight.pendingCount', { count: pending.length })}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {transfers.map((transfer) => (
          <TransferRow key={transfer.id} transfer={transfer} />
        ))}
      </div>
    </div>
  )
}

/** Elapsed time as `m:ss`, which is the scale a bridge settles on. */
function elapsedLabel(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
  }
  return `${Math.floor(seconds / 3600)}h${String(
    Math.floor((seconds % 3600) / 60),
  ).padStart(2, '0')}`
}

function TransferRow({ transfer }: { transfer: BridgeTransfer }) {
  const { t } = useTranslation()
  const from = dexChain(transfer.fromMarket)
  const to = dexChain(transfer.toMarket)
  const sourceUrl = explorerTxUrl(transfer.fromMarket, transfer.sourceTxHash)
  const destinationUrl = explorerTxUrl(
    transfer.toMarket,
    transfer.destinationTxHash,
  )
  // `updatedAt` moves on every poll, so the elapsed reading refreshes with the
  // status rather than on a timer of its own: no pane-wide render per second,
  // and a reading that is never fresher than the status beside it.
  const elapsed = elapsedLabel(transfer.startedAt, transfer.updatedAt)
  const overdue =
    transfer.status === 'pending' &&
    transfer.etaSeconds !== null &&
    transfer.updatedAt - transfer.startedAt > transfer.etaSeconds * 3_000

  return (
    <div className="border-b border-border/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-xs [font-variant-numeric:tabular-nums]">
          {`${formatAmount(transfer.amount)} ${transfer.symbol}`}
        </span>
        <span
          className={cn(
            'shrink-0 font-mono text-[10px] [font-variant-numeric:tabular-nums]',
            overdue ? 'text-[var(--chart-4)]' : 'text-muted-foreground',
          )}
        >
          {elapsed}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {t('inFlight.route', {
            from: from?.displayName ?? transfer.fromMarket,
            to: to?.displayName ?? transfer.toMarket,
          })}
        </span>
        <StatusChip transfer={transfer} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('inFlight.sourceTx')}
          </a>
        ) : null}
        {destinationUrl ? (
          <a
            href={destinationUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('inFlight.destinationTx')}
          </a>
        ) : null}
        {transfer.tool ? (
          <span className="ml-auto shrink-0 font-mono text-muted-foreground">
            {transfer.tool}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function StatusChip({ transfer }: { transfer: BridgeTransfer }) {
  const { t } = useTranslation()
  if (transfer.status === 'confirmed') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-up">
        <CheckCircle2 className="size-3" />
        {transfer.amountOut === null
          ? t('inFlight.landed')
          : t('inFlight.landedAmount', {
              amount: formatAmount(transfer.amountOut),
            })}
      </span>
    )
  }
  if (transfer.status === 'failed') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-down">
        <XCircle className="size-3" />
        {t('inFlight.failed')}
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Loader2 className="size-3 animate-spin" />
      {/* The provider's stage, translated where we know it, and stated as
          "confirming" where a later API version invents a new one. */}
      {t(`inFlight.substatus.${transfer.substatus ?? 'PENDING'}`, {
        defaultValue: t('inFlight.confirming'),
      })}
    </span>
  )
}
