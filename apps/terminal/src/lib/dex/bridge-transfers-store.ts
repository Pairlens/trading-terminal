// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every bridge transfer this browser has sent, kept until it lands.
 *
 * Local, and deliberately so. A cross-chain transfer outlives the tab it was
 * sent from: the source transaction confirms in seconds and the destination leg
 * can be minutes behind it, which is long enough for a reload, a crash or a
 * closed laptop. Nothing else in the app remembers the hash, and without it the
 * transfer is only findable by scrolling a block explorer.
 *
 * Not synced to the App Server, and never will be: the row names an address,
 * two chains and an amount, which is exactly the profile the credentials rule
 * keeps off our servers. A transfer sent from the desktop app is tracked by the
 * desktop app.
 *
 * Keyed by wallet address so two wallets are two lists rather than one merged
 * history that belongs to nobody. Terminal transfers are pruned after a week on
 * load: a confirmed transfer is a receipt, and a receipt has a useful life.
 */
import { create } from 'zustand'

import type { BridgeStatusUpdate } from '@pairlens/shared/instrument-types'
import type { BridgeTransfer } from '@/lib/dex/bridge-types'
import { applyStatusUpdate, isTerminalTransfer } from '@/lib/dex/bridge-types'

export const BRIDGE_TRANSFERS_KEY = 'pairlens:bridge.transfers'

/** How long a landed (or failed) transfer stays in the list. */
export const TRANSFER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/** Ceiling on the stored list, so a busy month cannot grow localStorage without bound. */
const MAX_TRANSFERS = 100

/**
 * Drop terminal transfers older than the retention window, newest first.
 *
 * Pending ones are never pruned by age. A transfer that has been pending for a
 * fortnight is not stale data, it is a stuck transfer, and dropping it would
 * delete the only record of a send that has not arrived.
 */
export function pruneTransfers(
  transfers: Array<BridgeTransfer>,
  now: number = Date.now(),
): Array<BridgeTransfer> {
  return transfers
    .filter(
      (transfer) =>
        !isTerminalTransfer(transfer) ||
        now - transfer.startedAt < TRANSFER_RETENTION_MS,
    )
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_TRANSFERS)
}

/** Insert or replace by hash, keeping the list newest-first. */
export function upsertTransfer(
  transfers: Array<BridgeTransfer>,
  next: BridgeTransfer,
): Array<BridgeTransfer> {
  const without = transfers.filter((transfer) => transfer.id !== next.id)
  return [next, ...without].sort((a, b) => b.startedAt - a.startedAt)
}

function readStored(): Array<BridgeTransfer> {
  try {
    const raw = localStorage.getItem(BRIDGE_TRANSFERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Shape-checked on the way in: a row without a hash cannot be polled, and a
    // row without a wallet belongs to nobody.
    return parsed.filter(
      (entry): entry is BridgeTransfer =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as BridgeTransfer).id === 'string' &&
        typeof (entry as BridgeTransfer).walletAddress === 'string',
    )
  } catch {
    return []
  }
}

function persist(transfers: Array<BridgeTransfer>): void {
  try {
    localStorage.setItem(BRIDGE_TRANSFERS_KEY, JSON.stringify(transfers))
  } catch {
    // Persistence is best-effort: a full quota must not break a send that has
    // already happened on-chain.
  }
}

type BridgeTransfersState = {
  transfers: Array<BridgeTransfer>
  loaded: boolean
  /** Read localStorage and prune. Idempotent; safe to call from every pane. */
  load: () => void
  /** Record a transfer the user just signed. */
  record: (transfer: BridgeTransfer) => void
  /** Fold a status poll into the row, if it is still known. */
  applyStatus: (id: string, update: BridgeStatusUpdate) => void
  /** Forget one row. The user's own "clear", never automatic. */
  remove: (id: string) => void
}

export const useBridgeTransfersStore = create<BridgeTransfersState>(
  (set, get) => ({
    transfers: [],
    loaded: false,

    load: () => {
      if (get().loaded) return
      const pruned = pruneTransfers(readStored())
      set({ transfers: pruned, loaded: true })
      persist(pruned)
    },

    record: (transfer) => {
      const next = pruneTransfers(upsertTransfer(get().transfers, transfer))
      set({ transfers: next, loaded: true })
      persist(next)
    },

    applyStatus: (id, update) => {
      const current = get().transfers
      const existing = current.find((transfer) => transfer.id === id)
      if (!existing) return
      const updated = applyStatusUpdate(existing, update)
      // Identity is preserved when nothing moved, so a poll that changes
      // nothing does not re-render every row in the pane.
      if (
        updated.status === existing.status &&
        updated.substatus === existing.substatus &&
        updated.amountOut === existing.amountOut &&
        updated.destinationTxHash === existing.destinationTxHash &&
        updated.explorerUrl === existing.explorerUrl
      ) {
        return
      }
      const next = current.map((transfer) =>
        transfer.id === id ? updated : transfer,
      )
      set({ transfers: next })
      persist(next)
    },

    remove: (id) => {
      const next = get().transfers.filter((transfer) => transfer.id !== id)
      set({ transfers: next })
      persist(next)
    },
  }),
)

/** This wallet's transfers, newest first. */
export function transfersForWallet(
  transfers: Array<BridgeTransfer>,
  address: string | null | undefined,
): Array<BridgeTransfer> {
  if (!address) return []
  const key = address.toLowerCase()
  return transfers.filter((transfer) => transfer.walletAddress === key)
}
