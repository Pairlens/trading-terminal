// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { notificationRuntime } from './notification-runtime'
import type { PluginManager } from '@pairlens/plugin-system'
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'
import { getCountrySetting } from '@/lib/region-settings'
import { useNotificationStore } from '@/stores/notification-store'

type ActiveSub = {
  unsub: () => void
}

/**
 * Reactively manages plugin subscriptions for notification rules.
 * When rules change (created/deleted/toggled), reconciles the set of
 * active subscriptions to match what's needed.
 */
export class NotificationSubscriptionManager {
  private pluginManager: PluginManager | null = null
  private activeSubs = new Map<string, ActiveSub>()
  private storeUnsub: (() => void) | null = null
  /** Last observed ticker price per subscription key — lets price alerts
   * fire on threshold crossing instead of on every tick past the level. */
  private lastPrices = new Map<string, number>()

  start(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager
    // Subscribe to store changes to react to rule enable/disable/create/delete
    this.storeUnsub = useNotificationStore.subscribe(() =>
      queueMicrotask(() => this.reconcile()),
    )
    this.reconcile()
  }

  stop(): void {
    this.storeUnsub?.()
    this.storeUnsub = null
    for (const sub of this.activeSubs.values()) sub.unsub()
    this.activeSubs.clear()
    this.lastPrices.clear()
    this.pluginManager = null
  }

  private reconcile(): void {
    if (!this.pluginManager) return

    const { rules, bindings } = useNotificationStore.getState()
    const ruleMap = new Map(rules.map((r) => [r.id, r]))
    const needed = new Map<
      string,
      {
        capability: string
        params: Record<string, unknown>
        eventType: string
        market: string
      }
    >()

    for (const binding of bindings) {
      if (!binding.enabled || !binding.pair) continue
      const rule = ruleMap.get(binding.ruleId)
      if (!rule) continue

      for (const step of rule.steps) {
        if (step.type === 'price-alert') {
          const key = `ticker:${binding.pair}:${binding.market}`
          if (!needed.has(key)) {
            needed.set(key, {
              capability: 'market-data:ticker',
              params: { pair: binding.pair },
              eventType: 'price-alert',
              market: binding.market,
            })
          }
        }
        if (step.type === 'candle-close' || step.type === 'signal-generated') {
          const tf = String(step.data.timeframe ?? '1h')
          // Share one candle subscription per pair+tf, emit both event types
          const key = `candles:${binding.pair}:${binding.market}:${tf}`
          if (!needed.has(key)) {
            needed.set(key, {
              capability: 'market-data:candles',
              params: { pair: binding.pair, timeframe: tf },
              eventType: 'candle-close', // handleData emits both types
              market: binding.market,
            })
          }
        }
        // order-executed uses the order-events-store adapter, no plugin sub needed
      }
    }

    // Unsubscribe stale
    for (const [key, sub] of this.activeSubs) {
      if (!needed.has(key)) {
        sub.unsub()
        this.activeSubs.delete(key)
        this.lastPrices.delete(key)
      }
    }

    // Subscribe new
    for (const [key, spec] of needed) {
      if (this.activeSubs.has(key)) continue

      // Scope resolution to the binding's market before subscribing — the
      // resolver reads the manager context, and without this the capability
      // resolves against whatever market the last UI stream happened to set
      // (or none at boot), landing the subscription on the wrong connector.
      this.pluginManager.setContext({
        market: spec.market,
        pair: String(spec.params.pair ?? ''),
        country: getCountrySetting(),
      })

      try {
        const unsub = this.pluginManager.subscribe(
          spec.capability as Parameters<PluginManager['subscribe']>[0],
          spec.params,
          (data) => this.handleData(key, spec, data),
        )
        this.activeSubs.set(key, { unsub })
      } catch (err) {
        // Connector refused (region block, plugin not active yet) — skip this
        // rule's subscription; the next store change retriggers reconcile.
        console.warn(`[notifications] Subscription failed for ${key}:`, err)
      }
    }
  }

  private handleData(
    key: string,
    spec: {
      capability: string
      eventType: string
      params: Record<string, unknown>
      market: string
    },
    data: unknown,
  ): void {
    const pair = String(spec.params.pair ?? '')
    const market = spec.market

    if (spec.capability === 'market-data:ticker') {
      const update = data as {
        type?: string
        ticker?: { last?: number; change24h?: number }
      }
      if (!update?.ticker?.last) return

      const prevPrice = this.lastPrices.get(key)
      this.lastPrices.set(key, update.ticker.last)

      const payload: NotificationEventPayload = {
        eventType: 'price-alert',
        timestamp: Date.now(),
        pair,
        market,
        price: update.ticker.last,
        prevPrice,
        data: {
          percentChange: update.ticker.change24h ?? 0,
        },
      }
      notificationRuntime.handleEvent(payload)
    }

    if (spec.capability === 'market-data:candles') {
      const update = data as {
        type?: string
        candles?: Array<{ ts: number; open?: number; close: number }>
      }
      // Only fire on candle close/snapshot, not on incremental ticks
      if (
        !update?.candles?.length ||
        (update.type !== 'snapshot' && update.type !== 'close')
      )
        return

      const candle = update.candles[update.candles.length - 1]
      const tf = spec.params.timeframe ?? '1h'

      // The candle's own % move, so percent-change conditions work on
      // candle-driven flows too
      const percentChange =
        candle.open && candle.open > 0
          ? ((candle.close - candle.open) / candle.open) * 100
          : 0

      // Emit both candle-close and signal-generated — the evaluator
      // will match the event step type in each rule
      const base = { timestamp: candle.ts, pair, market, price: candle.close }
      notificationRuntime.handleEvent({
        ...base,
        eventType: 'candle-close',
        data: { timeframe: tf, percentChange },
      })
      notificationRuntime.handleEvent({
        ...base,
        eventType: 'signal-generated',
        data: { timeframe: tf, percentChange },
      })
    }
  }
}

export const notificationSubscriptionManager =
  new NotificationSubscriptionManager()
