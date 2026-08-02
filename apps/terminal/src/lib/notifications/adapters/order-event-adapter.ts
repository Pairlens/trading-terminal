// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { notificationRuntime } from '../notification-runtime'
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'
import {
  getOrderEvents,
  subscribeOrderEvents,
} from '@/stores/order-events-store'

/**
 * Bridges order events from the order-events-store to the notification runtime.
 * Tracks seen order IDs to avoid re-notifying on REST backfill.
 */
export function startOrderEventAdapter(): () => void {
  const seenOrders = new Set<string>()

  // Snapshot current orders so we don't notify on initial load
  for (const event of getOrderEvents()) {
    seenOrders.add(event.orderId)
  }

  const unsubscribe = subscribeOrderEvents(() => {
    const currentSnapshot = getOrderEvents()

    for (const event of currentSnapshot) {
      if (seenOrders.has(event.orderId)) continue
      seenOrders.add(event.orderId)

      // Only notify for terminal states
      if (event.status !== 'filled' && event.status !== 'partially_filled')
        continue

      const payload: NotificationEventPayload = {
        eventType: 'order-executed',
        timestamp: event.ts,
        pair: event.pair,
        market: event.market,
        price: parseFloat(event.avgPrice) || undefined,
        data: {
          orderId: event.orderId,
          side: event.side,
          type: event.type,
          size: event.size,
          fillSize: event.fillSize,
          avgPrice: event.avgPrice,
          status: event.status,
          mode: event.mode,
        },
      }

      notificationRuntime.handleEvent(payload)
    }
  })

  return unsubscribe
}
