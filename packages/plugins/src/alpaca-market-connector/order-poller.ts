// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Alpaca private-data poller — order and balance updates via REST.
 *
 * Alpaca's trade_updates WebSocket sends binary MessagePack frames, which
 * the shared string-oriented WS transport doesn't speak. Instead of pulling
 * in a msgpack decoder, this polls the REST endpoints and diffs: at 5s
 * cadence that's ~24 req/min against the 200 req/min account limit, and
 * order state for a human-driven terminal doesn't need sub-second latency.
 *
 * Exposes the same connect/disconnect/destroy surface as the other
 * connectors' private WS clients so the plugin wiring stays uniform.
 */

import {
  fetchAlpacaBalances,
  fetchAlpacaOpenOrders,
  fetchAlpacaOrderHistory,
} from './order-executor'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
} from '@pairlens/market-engine/types'
import type { AlpacaCredentials } from './rest-client'

export type OrderUpdateCallback = (update: NormalizedOrderUpdate) => void
export type BalanceUpdateCallback = (updates: Array<NormalizedBalance>) => void

const POLL_INTERVAL_MS = 5_000

export class AlpacaOrderPoller {
  private credentials: AlpacaCredentials | null = null
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private destroyed = false
  // Last seen per-order state; an order re-emits only when it changes.
  private seen = new Map<string, string>()
  private lastBalancesJson = ''

  connect(
    credentials: AlpacaCredentials,
    paper: boolean,
    cb: OrderUpdateCallback,
    onBalance?: BalanceUpdateCallback,
  ): void {
    this.credentials = credentials
    this.paper = paper
    this.callback = cb
    this.balanceCallback = onBalance ?? null
    if (!this.timer) {
      this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    }
    void this.poll()
  }

  disconnect(): void {
    this.callback = null
    this.balanceCallback = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.seen.clear()
    this.lastBalancesJson = ''
  }

  destroy(): void {
    this.destroyed = true
    this.disconnect()
  }

  private async poll(): Promise<void> {
    if (this.polling || this.destroyed || !this.credentials || !this.callback)
      return
    this.polling = true

    try {
      const mode = this.paper ? ('paper' as const) : ('live' as const)
      const [open, closed] = await Promise.all([
        fetchAlpacaOpenOrders(this.credentials, mode),
        fetchAlpacaOrderHistory(this.credentials, mode),
      ])

      // First poll seeds the baseline silently — only CHANGES are updates.
      const seeding = this.seen.size === 0

      for (const order of [...closed, ...open]) {
        if (!order.orderId) continue
        const fingerprint = `${order.status}:${order.fillSize}:${order.avgPrice}`
        const prev = this.seen.get(order.orderId)
        this.seen.set(order.orderId, fingerprint)
        if (!seeding && prev !== fingerprint) {
          this.callback?.(order)
        }
      }

      if (this.balanceCallback) {
        const balances = await fetchAlpacaBalances(this.credentials, mode)
        const json = JSON.stringify(balances)
        if (json !== this.lastBalancesJson) {
          this.lastBalancesJson = json
          this.balanceCallback(balances)
        }
      }
    } catch {
      // Transient network failure — next tick retries.
    } finally {
      this.polling = false
    }
  }
}
