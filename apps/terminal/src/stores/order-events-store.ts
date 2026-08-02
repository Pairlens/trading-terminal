// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Global in-memory store for order events from the exchange.
 * Module-scoped — survives component unmount/remount (navigation).
 *
 * The single source of truth is the exchange: REST backfill on mount +
 * private WS for real-time updates. No local/optimistic submissions.
 */

export type OrderEvent = {
  orderId: string
  market: string
  pair: string
  side: string
  type: string
  size: string
  price: string
  fillSize: string
  avgPrice: string
  mode: 'paper' | 'live'
  status: 'live' | 'partially_filled' | 'filled' | 'cancelled' | 'failed'
  fee: string
  feeCcy: string
  ts: number
  /** Resting trigger (TP/SL) order — cancel routes to the venue's
   * trigger-order endpoint. */
  triggerOrder?: boolean
  /** Trigger price for trigger orders (display). */
  triggerPrice?: string
}

type Listener = () => void

const ordersMap = new Map<string, OrderEvent>()
let snapshot: Array<OrderEvent> = []
const listeners = new Set<Listener>()

function rebuildSnapshot(): void {
  snapshot = Array.from(ordersMap.values()).sort((a, b) => b.ts - a.ts)
  for (const l of listeners) l()
}

/** Upsert an order event from the exchange (REST backfill or WS update). */
export function upsertOrderEvent(event: OrderEvent): void {
  ordersMap.set(event.orderId, event)
  rebuildSnapshot()
}

/** Get all order events (newest first). For useSyncExternalStore. */
export function getOrderEvents(): Array<OrderEvent> {
  return snapshot
}

/** Subscribe to changes. For useSyncExternalStore. */
export function subscribeOrderEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
