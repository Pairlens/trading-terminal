// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { computeSignals } from '@pairlens/strategy-engine'
import { notificationRuntime } from './notification-runtime'
import type { PluginManager } from '@pairlens/plugin-system'
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'
import type { Candle } from '@pairlens/shared/types'
import { runHeadlessIndicatorAlerts } from '@/lib/indicators/headless-indicator-alerts'
import { getCountrySetting } from '@/lib/region-settings'
import { useNotificationStore } from '@/stores/notification-store'

type ActiveSub = {
  unsub: () => void
}

type SubscriptionSpec = {
  capability: string
  params: Record<string, unknown>
  eventType: string
  market: string
  /**
   * `indicator` values from the indicator-alert rules this candle subscription
   * serves. Empty means no rule on this stream wants scripts run; a blank
   * string inside means "every alert-declaring script".
   */
  indicatorFilters: Array<string>
}

/**
 * Bars kept per candle subscription. `computeSignals` needs 39; the rest is
 * headroom so a signal evaluated here matches what the chart shows.
 */
const MAX_BUFFERED_CANDLES = 200

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
  /** Rolling candle window per subscription key, oldest first. Signals are
   * computed from this, so the notification path evaluates the same history
   * the chart does instead of the single bar an update carries. */
  private candleBuffers = new Map<string, Array<Candle>>()
  /** Timestamp of the bar currently forming per key. A bar has closed when a
   * newer one appears — the stream itself never says so (`CandleUpdate.type`
   * is only 'snapshot' | 'update'). */
  private formingBarTs = new Map<string, number>()
  /** Last signal emitted per key (`strategy:direction`), so a signal that
   * keeps evaluating across bars notifies once on its edge, not every close. */
  private lastSignal = new Map<string, string>()
  /**
   * Live spec per active key, refreshed on every reconcile. The subscribe
   * callback reads THIS rather than closing over the spec it was created with:
   * adding an indicator-alert rule to a pair+timeframe that already has a
   * candle subscription does not resubscribe, so a captured spec would keep
   * the filter list it had at subscribe time and never run the new script.
   */
  private specs = new Map<string, SubscriptionSpec>()

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
    this.candleBuffers.clear()
    this.formingBarTs.clear()
    this.lastSignal.clear()
    this.specs.clear()
    this.pluginManager = null
  }

  private reconcile(): void {
    if (!this.pluginManager) return

    const { rules, bindings } = useNotificationStore.getState()
    const ruleMap = new Map(rules.map((r) => [r.id, r]))
    const needed = new Map<string, SubscriptionSpec>()

    for (const binding of bindings) {
      if (!binding.enabled || !binding.pair) continue
      const rule = ruleMap.get(binding.ruleId)
      if (!rule || rule.enabled === false) continue

      for (const step of rule.steps) {
        if (step.type === 'price-alert') {
          const key = `ticker:${binding.pair}:${binding.market}`
          if (!needed.has(key)) {
            needed.set(key, {
              capability: 'market-data:ticker',
              params: { pair: binding.pair },
              eventType: 'price-alert',
              market: binding.market,
              indicatorFilters: [],
            })
          }
        }
        if (
          step.type === 'candle-close' ||
          step.type === 'signal-generated' ||
          step.type === 'indicator-alert'
        ) {
          // All three are driven by bar closes and configure a timeframe;
          // '1h' only covers rules saved before the field existed.
          const tf = String(step.data.timeframe ?? '1h')
          // One candle subscription per pair+tf, shared by every rule on it.
          // Rules carrying a DIFFERENT timeframe also see these events, so the
          // evaluator filters on payload timeframe — see matchesEventFilter.
          const key = `candles:${binding.pair}:${binding.market}:${tf}`
          const existing = needed.get(key)
          const spec = existing ?? {
            capability: 'market-data:candles',
            params: { pair: binding.pair, timeframe: tf },
            eventType: 'candle-close', // handleCandles emits both types
            market: binding.market,
            indicatorFilters: [],
          }
          // Indicator alerts have no event source of their own — the scripts
          // have to be run for them. Collect which ones this subscription is
          // responsible for; blank means every alert-declaring script.
          if (step.type === 'indicator-alert') {
            const filter = String(step.data.indicator ?? '')
            if (!spec.indicatorFilters.includes(filter)) {
              spec.indicatorFilters.push(filter)
            }
          }
          needed.set(key, spec)
        }
        // order-executed uses the order-events-store adapter, no plugin sub needed
      }
    }

    // Publish the freshly-computed specs before touching subscriptions, so a
    // callback that fires mid-reconcile already sees the current filters.
    this.specs = needed

    // Unsubscribe stale
    for (const [key, sub] of this.activeSubs) {
      if (!needed.has(key)) {
        sub.unsub()
        this.activeSubs.delete(key)
        this.lastPrices.delete(key)
        this.candleBuffers.delete(key)
        this.formingBarTs.delete(key)
        this.lastSignal.delete(key)
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
          (data) => this.handleData(key, data),
        )
        this.activeSubs.set(key, { unsub })
      } catch (err) {
        // Connector refused (region block, plugin not active yet) — skip this
        // rule's subscription; the next store change retriggers reconcile.
        console.warn(`[notifications] Subscription failed for ${key}:`, err)
      }
    }
  }

  private handleData(key: string, data: unknown): void {
    const spec = this.specs.get(key)
    if (!spec) return // Reconciled away while an update was in flight.
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
      this.handleCandles(key, spec, data, pair, market)
    }
  }

  /**
   * Turn a candle stream into close events.
   *
   * The stream has no "this bar closed" message — `CandleUpdate.type` is only
   * 'snapshot' | 'update', and an update carries the still-forming bar. So a
   * close is inferred the way the chart infers it: the forming bar's timestamp
   * changed, therefore the previous one is final. The snapshot only seeds the
   * buffer; firing on it is what made every candle rule notify seconds after
   * launch and again on every reconnect.
   */
  private handleCandles(
    key: string,
    spec: SubscriptionSpec,
    data: unknown,
    pair: string,
    market: string,
  ): void {
    const update = data as { type?: string; candles?: Array<Candle> }
    if (!update?.candles?.length) return

    const timeframe = String(spec.params.timeframe ?? '1h')

    if (update.type === 'snapshot') {
      const seeded = [...update.candles]
        .filter((c) => Number.isFinite(c.ts))
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_BUFFERED_CANDLES)
      if (seeded.length === 0) return
      this.candleBuffers.set(key, seeded)
      this.formingBarTs.set(key, seeded[seeded.length - 1].ts)
      // Deliberately no event: nothing closed, we just learned the history.
      return
    }

    const buffer = this.candleBuffers.get(key)
    if (!buffer) return // No snapshot yet — nothing to close against.

    for (const candle of update.candles) {
      if (Number.isFinite(candle.ts)) upsertCandle(buffer, candle)
    }
    if (buffer.length > MAX_BUFFERED_CANDLES) {
      buffer.splice(0, buffer.length - MAX_BUFFERED_CANDLES)
    }

    const newestTs = buffer[buffer.length - 1].ts
    const previousTs = this.formingBarTs.get(key)
    if (previousTs === undefined) {
      this.formingBarTs.set(key, newestTs)
      return
    }
    if (newestTs <= previousTs) return // Still the same bar, just ticking.

    this.formingBarTs.set(key, newestTs)

    // The bar that just closed, plus the window ending at it. Anything newer
    // is forming and must not influence a signal that confirms on close.
    const closedIndex = buffer.findIndex((c) => c.ts === previousTs)
    if (closedIndex === -1) return
    const closedBar = buffer[closedIndex]
    const closedWindow = buffer.slice(0, closedIndex + 1)

    const percentChange =
      closedBar.open > 0
        ? ((closedBar.close - closedBar.open) / closedBar.open) * 100
        : 0
    const base = {
      timestamp: closedBar.ts,
      pair,
      market,
      price: closedBar.close,
    }

    notificationRuntime.handleEvent({
      ...base,
      eventType: 'candle-close',
      data: { timeframe, percentChange },
    })

    // Indicator alerts have no upstream event source — the scripts only run on
    // the chart. Run them here too, or a rule bound to a pair the user is not
    // looking at can never fire. Fire-and-forget: Python is slow relative to
    // the stream and must not stall the rest of this handler.
    if (spec.indicatorFilters.length > 0) {
      void runHeadlessIndicatorAlerts({
        market,
        pair,
        timeframe,
        // The runtime transfers (detaches) the arrays it builds from this, so
        // hand it a copy rather than the live buffer.
        bars: buffer.slice(),
        indicatorFilters: spec.indicatorFilters,
      })
    }

    // A signal event now means a signal actually exists. This used to emit
    // unconditionally alongside candle-close with no strategy attached, which
    // made "Signal Generated" an exact alias for "Candle Close".
    const signal = computeSignals(closedWindow)
    const signature = signal ? `${signal.strategy}:${signal.direction}` : ''
    if (!signal) {
      this.lastSignal.delete(key)
      return
    }
    if (this.lastSignal.get(key) === signature) return // Same run, already told.
    this.lastSignal.set(key, signature)

    notificationRuntime.handleEvent({
      ...base,
      eventType: 'signal-generated',
      data: {
        timeframe,
        percentChange,
        signalType: signal.strategy,
        direction: signal.direction,
        confidence: signal.confidence,
        regime: signal.regime,
      },
    })
  }
}

/** In-place ascending upsert by timestamp. */
function upsertCandle(buffer: Array<Candle>, candle: Candle): void {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].ts === candle.ts) {
      buffer[i] = candle
      return
    }
    if (buffer[i].ts < candle.ts) {
      buffer.splice(i + 1, 0, candle)
      return
    }
  }
  buffer.unshift(candle)
}

export const notificationSubscriptionManager =
  new NotificationSubscriptionManager()
