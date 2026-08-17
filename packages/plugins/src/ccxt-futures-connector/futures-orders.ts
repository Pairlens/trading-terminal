// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `trading:orders`, `trading:balances` and `trading:positions` on linear
 * perpetuals, through ccxt's unified derivatives API.
 *
 * The invariants are the spot runtime's, restated because they are the ones
 * that cost money: nothing may throw (the terminal's guarded order path never
 * re-routes a `trading:orders` failure, so a rejection has to come back as
 * `{success:false, error}`); capability is read from `exchange.has` rather than
 * from a hand-kept table; a paper slot on a venue with no sandbox is REFUSED
 * rather than routed to the live matching engine; and every message that leaves
 * this module goes through `redactSecrets` first.
 *
 * What is genuinely different from spot, and why this is a fork rather than a
 * flag on `CcxtTradingRuntime`:
 *
 * - **Size is a contract count.** ccxt's unified convention on a contract
 *   market is contracts, not base units, and the quote-denominated `cost`
 *   helpers do not exist there at all. So the whole `tgtCcy: 'quote_ccy'`
 *   branch is gone, and asking for one is a rejection with a sentence rather
 *   than a silent reinterpretation of the number as money.
 * - **Symbols carry a settle leg.** Every pair↔symbol hop goes through
 *   `futures-symbols`, including the ORDER normalizer — the shared
 *   `normalizeCcxtOrder` takes the mapping as a parameter and its spot default
 *   strips `:SETTLE`, so a fill reported as `BTC-USDT` would land in the spot
 *   pair's position-ledger slot.
 * - **Leverage is account state.** No venue accepts it in the order payload; it
 *   is a separate signed call, applied before the order and cached per symbol
 *   so a burst of orders does not re-send it.
 */

import {
  CcxtExchangeHost,
  toCcxtCredentials,
} from '../ccxt-connector/exchange-host'
import {
  callOrThrow,
  normalizeCcxtBalances,
  normalizeCcxtOrder,
  numberOf,
  redactSecrets,
  stringOf,
} from '../ccxt-connector/orders'
import {
  fromFuturesSymbol,
  normalizeFuturesPair,
  toFuturesSymbol,
} from './futures-symbols'
import type { CcxtCredentialSet } from '../ccxt-connector/exchange-host'
import type { CexCredentials, CexSlot } from '../cex-connector'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  NormalizedPosition,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'
import type {
  CcxtFuturesExchangeLike,
  CcxtFuturesVenueConfig,
} from './futures-types'

/** Both spellings go out — ccxt reads `safeValue2(params, 'stop', 'trigger')`. */
const DEFAULT_TRIGGER_QUERY = { trigger: true, stop: true } as const

/** Orders pulled per `'list'` call. Matches the spot runtime's page. */
const ORDER_HISTORY_LIMIT = 50

// ── Pure mapping ───────────────────────────────────────────────────────────

/**
 * ccxt unified positions → the terminal's rows.
 *
 * Flat rows are dropped rather than reported at zero: three venues answer
 * `fetchPositions` with every symbol the account has ever touched, and a
 * zero-contract row rendered in the positions pane is indistinguishable from a
 * position the trader forgot about.
 *
 * `contracts` is normalized to a positive count with the direction moved into
 * `side`, because venues disagree: some sign the count, some only set `side`,
 * and one-hand-per-venue arithmetic in the pane is how a short renders as a
 * long. `side` wins when both are present, and the sign is the fallback.
 */
export function normalizeCcxtPositions(
  rows: Array<Record<string, unknown>>,
): Array<NormalizedPosition> {
  const out: Array<NormalizedPosition> = []
  for (const raw of rows) {
    const contracts = numberOf(raw['contracts'])
    if (contracts === null || contracts === 0) continue
    const symbol = typeof raw['symbol'] === 'string' ? raw['symbol'] : ''
    if (!symbol) continue
    const declaredSide = raw['side']
    const side: NormalizedPosition['side'] =
      declaredSide === 'long' || declaredSide === 'short'
        ? declaredSide
        : contracts < 0
          ? 'short'
          : 'long'
    const marginMode = raw['marginMode']
    out.push({
      pair: fromFuturesSymbol(symbol),
      side,
      contracts: Math.abs(contracts),
      ...optionalNumber('contractSize', raw['contractSize']),
      ...optionalNumber('entryPrice', raw['entryPrice']),
      ...optionalNumber('markPrice', raw['markPrice']),
      ...optionalNumber('liquidationPrice', raw['liquidationPrice']),
      ...optionalNumber('leverage', raw['leverage']),
      ...optionalNumber('unrealizedPnl', raw['unrealizedPnl']),
      ...optionalNumber('notionalUsd', raw['notional']),
      // The margin side, straight from the venue. Each is spread only when the
      // venue filled it in: a missing maintenance margin has to stay missing so
      // the margin pane says "not published" instead of drawing a gauge from a
      // zero it invented.
      ...optionalNumber('collateral', raw['collateral']),
      ...optionalNumber('initialMargin', raw['initialMargin']),
      ...optionalNumber('maintenanceMargin', raw['maintenanceMargin']),
      ...optionalNumber('marginRatio', raw['marginRatio']),
      ...(marginMode === 'cross' || marginMode === 'isolated'
        ? { marginMode }
        : {}),
      ...optionalNumber('timestamp', raw['timestamp']),
    })
  }
  return out
}

/** The `has` slice the order builder reads. Structural so tests can fake it. */
export type FuturesOrderCapabilities = Record<string, unknown>

export type CcxtFuturesOrderCall =
  | {
      kind: 'order'
      symbol: string
      type: 'market' | 'limit'
      side: 'buy' | 'sell'
      /** CONTRACTS, not base units — ccxt's convention on contract markets. */
      amount: number
      price: number | undefined
      params: Record<string, unknown>
    }
  | { kind: 'reject'; error: string }

/**
 * `OrderParams` → the ccxt call to make. Pure, so the capability matrix is
 * testable without a socket or a signature.
 *
 * There is no cost/`tgtCcy` branch and no `needsReferencePrice` branch, which
 * is the point: on a contract market ccxt's `createMarketBuyOrderWithCost`
 * family does not exist, and reinterpreting the size as money would place an
 * order for however many contracts that number of dollars happens to be.
 */
export function buildCcxtFuturesOrderCall(
  order: OrderParams,
  has: FuturesOrderCapabilities,
  venue: Pick<
    CcxtFuturesVenueConfig,
    'displayName' | 'orderParams' | 'supportsTriggerOrders'
  >,
): CcxtFuturesOrderCall {
  const label = venue.displayName
  const symbol = toFuturesSymbol(order.pair)
  const size = Number(order.size)
  if (!Number.isFinite(size) || size <= 0) {
    return { kind: 'reject', error: `Invalid order size '${order.size}'` }
  }

  const price = order.price === undefined ? undefined : Number(order.price)
  if (order.type === 'limit' && (price === undefined || !(price > 0))) {
    return { kind: 'reject', error: 'A limit order needs a limit price' }
  }

  if (order.tgtCcy === 'quote_ccy') {
    return {
      kind: 'reject',
      error: `${label} sizes perpetuals in contracts — quote-denominated orders are not available on a futures market`,
    }
  }

  const params: Record<string, unknown> = { ...venue.orderParams }
  if (order.clientOrderId) params['clientOrderId'] = order.clientOrderId
  // Only ever set when asked. The flag is a hard venue-side guarantee that the
  // order cannot increase exposure, and sending `false` explicitly is a
  // different request from omitting it on venues that validate the field.
  if (order.reduceOnly === true) params['reduceOnly'] = true

  if (order.trigger) {
    const triggerPrice = Number(order.trigger.triggerPrice)
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      return {
        kind: 'reject',
        error: `Invalid trigger price '${order.trigger.triggerPrice}'`,
      }
    }
    if (!(venue.supportsTriggerOrders ?? hasTriggerSupport(has))) {
      return {
        kind: 'reject',
        error: `${label} does not support trigger (TP/SL) orders`,
      }
    }
    if (order.type === 'market' && has['createStopMarketOrder'] === false) {
      return {
        kind: 'reject',
        error: `${label} only accepts trigger orders with a limit price — set one and resubmit`,
      }
    }
    // The explicit TP/SL spelling comes FIRST: a Pairlens trigger always
    // carries the tp/sl semantic and only `takeProfitPrice`/`stopLossPrice`
    // preserve it. The generic `triggerPrice` collapses both into the venue's
    // conditional-order default, which inverts a take-profit's trigger
    // direction on Binance and is rejected with "would trigger immediately".
    if (
      order.trigger.triggerType === 'tp' &&
      has['createTakeProfitOrder'] === true
    ) {
      params['takeProfitPrice'] = triggerPrice
    } else if (
      order.trigger.triggerType === 'sl' &&
      has['createStopLossOrder'] === true
    ) {
      params['stopLossPrice'] = triggerPrice
    } else if (has['createTriggerOrder'] === true) {
      params['triggerPrice'] = triggerPrice
    } else {
      params['stopPrice'] = triggerPrice
    }
  }

  return {
    kind: 'order',
    symbol,
    type: order.type,
    side: order.side,
    amount: size,
    price,
    params,
  }
}

function hasTriggerSupport(has: FuturesOrderCapabilities): boolean {
  return (
    has['createTriggerOrder'] === true ||
    has['createStopOrder'] === true ||
    has['createStopLossOrder'] === true ||
    has['createTakeProfitOrder'] === true
  )
}

// ── Runtime ────────────────────────────────────────────────────────────────

export type CcxtFuturesTradingRuntimeOptions = {
  venue: CcxtFuturesVenueConfig
  /**
   * Give `exchange` a market table without a signed `loadMarkets`. The read
   * path already owns the cache; an authed instance loading its own would sign
   * endpoints it has no reason to touch and pay the download twice.
   */
  ensureMarkets: (exchange: CcxtFuturesExchangeLike) => Promise<void>
  onError?: (scope: string, error: unknown) => void
  /** Injectable so the fetch-stub suites can drive a fake exchange. */
  createHost?: (
    options: ConstructorParameters<typeof CcxtExchangeHost>[0],
  ) => CcxtExchangeHost
}

type SlotHost = {
  host: CcxtExchangeHost
  paper: boolean
  /** Leverage this host has already set, per symbol — see `applyLeverage`. */
  leverage: Map<string, number>
}

/**
 * One authed ccxt instance per credential slot, plus the hooks the CEX shell
 * dispatches into.
 *
 * Keyed by the slot's `credentials` OBJECT rather than its id: the shell
 * rebuilds that object on every `initialize`, so identity already means "this
 * exact credential, as most recently provisioned". A WeakMap also keeps key
 * material out of any string that could reach a log line. The id registry
 * beside it exists because that same freshness means the WeakMap lookup MISSES
 * on a re-provisioned slot — without it each key edit would leak another live
 * authed instance until plugin teardown.
 */
export class CcxtFuturesTradingRuntime {
  private hosts = new WeakMap<CexCredentials, SlotHost>()
  private hostsBySlotId = new Map<
    string,
    { host: CcxtExchangeHost; credentials: CexCredentials }
  >()
  private live = new Set<CcxtExchangeHost>()
  private destroyed = false

  constructor(private readonly opts: CcxtFuturesTradingRuntimeOptions) {}

  async placeOrder(
    order: OrderParams,
    slot: CexSlot<CexCredentials>,
  ): Promise<OrderResult> {
    // Before anything that can fail: venues that scope history and cancel by
    // the last traded pair read this, and a rejected order still moved the
    // user's attention to that market.
    slot.currentPair = normalizeFuturesPair(order.pair)

    try {
      const { exchange, entry } = await this.acquire(slot)
      const paperGuard = this.checkPaper(order.mode, entry)
      if (paperGuard) return paperGuard

      const call = buildCcxtFuturesOrderCall(
        order,
        exchange.has,
        this.opts.venue,
      )
      if (call.kind === 'reject') return { success: false, error: call.error }

      // Leverage first, and its failure IS the order's failure: placing at
      // whatever the account happened to carry would size the position
      // differently from what the ticket showed.
      if (order.leverage !== undefined) {
        const applied = await this.applyLeverage(
          exchange,
          entry,
          call.symbol,
          order.leverage,
        )
        if (applied) return applied
      }

      const create = callOrThrow(
        exchange.createOrder,
        exchange,
        `${this.opts.venue.displayName} cannot place orders`,
      )
      const raw = await create(
        call.symbol,
        call.type,
        call.side,
        call.amount,
        call.price,
        call.params,
      )

      const orderId = stringOf(raw['id'])
      return orderId ? { success: true, orderId } : { success: true }
    } catch (error) {
      return this.failure('place', error, slot)
    }
  }

  async cancelOrder(
    orderId: string,
    pair: string,
    slot: CexSlot<CexCredentials>,
    opts?: { trigger?: boolean },
  ): Promise<OrderResult> {
    try {
      const { exchange } = await this.acquire(slot)
      const symbol = toFuturesSymbol(pair)
      // Trigger orders live in a separate id space on most venues; without the
      // flag the venue looks the id up in the regular book and reports "order
      // not found" for an order that is plainly resting.
      const params = opts?.trigger ? this.triggerQuery() : {}
      const cancel = callOrThrow(
        exchange.cancelOrder,
        exchange,
        `${this.opts.venue.displayName} cannot cancel orders`,
      )
      await cancel(orderId, symbol, params)
      return { success: true, orderId }
    } catch (error) {
      return this.failure('cancel', error, slot)
    }
  }

  /**
   * Resting orders, including the trigger-order id space where the venue keeps
   * one behind a flag. Deduped by order id rather than trusted: a venue that
   * ignores the flag answers with the regular book again, and two copies of one
   * order is indistinguishable from two real orders.
   */
  async fetchOpenOrders(
    slot: CexSlot<CexCredentials>,
  ): Promise<Array<NormalizedOrderUpdate>> {
    try {
      const { exchange } = await this.acquire(slot)
      const symbol = slotSymbol(slot)
      const fetch = exchange.fetchOpenOrders
      if (typeof fetch !== 'function') return []

      const regular = await fetch.call(exchange, symbol)
      const probeTriggerBook =
        this.opts.venue.separateTriggerOrderBook !== false &&
        (this.opts.venue.supportsTriggerOrders ??
          hasTriggerSupport(exchange.has))
      const triggers = probeTriggerBook
        ? await fetch
            .call(exchange, symbol, undefined, undefined, this.triggerQuery())
            .catch(() => [])
        : []

      const seen = new Set<string>()
      const out: Array<NormalizedOrderUpdate> = []
      for (const raw of [...regular, ...triggers]) {
        const mapped = normalizeCcxtOrder(
          raw,
          slot.currentPair,
          fromFuturesSymbol,
        )
        if (mapped.orderId && seen.has(mapped.orderId)) continue
        if (mapped.orderId) seen.add(mapped.orderId)
        out.push(mapped)
      }
      return out
    } catch (error) {
      this.warn('open-orders', error, slot)
      return []
    }
  }

  /**
   * Recently closed orders. An empty array is the right answer when neither
   * endpoint exists — order history is a nicety, and throwing would fail the
   * whole `'list'` pair.
   */
  async fetchOrderHistory(
    slot: CexSlot<CexCredentials>,
  ): Promise<Array<NormalizedOrderUpdate>> {
    try {
      const { exchange } = await this.acquire(slot)
      const symbol = slotSymbol(slot)
      const fetch = exchange.has['fetchClosedOrders']
        ? exchange.fetchClosedOrders
        : exchange.has['fetchOrders']
          ? exchange.fetchOrders
          : undefined
      if (typeof fetch !== 'function') return []
      const rows = await fetch.call(
        exchange,
        symbol,
        undefined,
        ORDER_HISTORY_LIMIT,
      )
      return rows.map((raw) =>
        normalizeCcxtOrder(raw, slot.currentPair, fromFuturesSymbol),
      )
    } catch (error) {
      this.warn('order-history', error, slot)
      return []
    }
  }

  async fetchBalances(
    slot: CexSlot<CexCredentials>,
  ): Promise<Array<NormalizedBalance>> {
    try {
      const { exchange } = await this.acquire(slot)
      if (typeof exchange.fetchBalance !== 'function') return []
      const raw = await exchange.fetchBalance()
      return normalizeCcxtBalances(raw)
    } catch (error) {
      this.warn('balances', error, slot)
      return []
    }
  }

  /**
   * Open positions. An empty array on failure, like the other read hooks — the
   * positions pane refetches on a timer, and a thrown error there would take
   * every other connected account's rows down with it.
   */
  async fetchPositions(
    slot: CexSlot<CexCredentials>,
  ): Promise<Array<NormalizedPosition>> {
    try {
      const { exchange } = await this.acquire(slot)
      if (typeof exchange.fetchPositions !== 'function') return []
      const rows = await exchange.fetchPositions()
      return normalizeCcxtPositions(rows)
    } catch (error) {
      this.warn('positions', error, slot)
      return []
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    const hosts = [...this.live]
    this.live.clear()
    this.hosts = new WeakMap()
    this.hostsBySlotId.clear()
    await Promise.all(hosts.map((host) => host.destroy()))
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private triggerQuery(): Record<string, unknown> {
    return { ...(this.opts.venue.triggerQueryParams ?? DEFAULT_TRIGGER_QUERY) }
  }

  /**
   * Apply leverage to `symbol`, or explain why the order cannot proceed.
   * Returns null on success — an `OrderResult` here is always a failure.
   *
   * Cached per host and symbol because it is a signed write: the ticket sends
   * the selector's value with every order, so an uncached call would add a
   * round trip and an account mutation to each submit even when nothing moved.
   * The cache is per HOST, so a re-provisioned credential or a region rebuild
   * starts clean rather than assuming state on an instance that never set it.
   */
  private async applyLeverage(
    exchange: CcxtFuturesExchangeLike,
    entry: SlotHost,
    symbol: string,
    leverage: number,
  ): Promise<OrderResult | null> {
    if (!Number.isFinite(leverage) || leverage <= 0) {
      return { success: false, error: `Invalid leverage '${leverage}'` }
    }
    const capped = this.opts.venue.maxLeverage
    if (leverage > capped) {
      return {
        success: false,
        error: `${this.opts.venue.displayName} allows at most ${capped}x leverage`,
      }
    }
    if (entry.leverage.get(symbol) === leverage) return null
    if (
      exchange.has['setLeverage'] !== true ||
      typeof exchange.setLeverage !== 'function'
    ) {
      return {
        success: false,
        error: `${this.opts.venue.displayName} does not support setting leverage from the API — change it on the exchange`,
      }
    }
    await exchange.setLeverage(leverage, symbol)
    entry.leverage.set(symbol, leverage)
    return null
  }

  /**
   * A paper slot on a venue whose sandbox did not take is refused. The
   * alternative — signing the same order against production — is a real,
   * leveraged trade on a credential the user labelled paper, which is the worst
   * failure mode in this file. No dry-run-param fallback: none of the three
   * venues publishes one for contracts.
   */
  private checkPaper(
    mode: 'paper' | 'live',
    entry: SlotHost,
  ): OrderResult | null {
    if (mode !== 'paper' || entry.host.paperActive) return null
    return {
      success: false,
      error:
        this.opts.venue.noPaperReason ??
        `${this.opts.venue.displayName} has no paper trading environment — switch this credential to live or paper-trade on another venue`,
    }
  }

  private async acquire(slot: CexSlot<CexCredentials>): Promise<{
    exchange: CcxtFuturesExchangeLike
    entry: SlotHost
  }> {
    if (this.destroyed)
      throw new Error(`${this.opts.venue.marketId}: destroyed`)
    const credentials = toCcxtCredentials(slot.credentials)
    if (!credentials) throw new Error('No credentials configured')

    const entry = this.hostFor(slot, credentials)
    // A region change rebuilds rather than mutates: the REST base is baked into
    // every signature and ccxt caches endpoint state on the instance. The
    // leverage memo belongs to the discarded instance, so it goes with it.
    if (entry.host.setCountry(slot.country)) {
      await entry.host.close()
      entry.leverage.clear()
    }
    const lease = await entry.host.acquire()
    const exchange = lease.exchange as CcxtFuturesExchangeLike
    await this.opts.ensureMarkets(exchange)
    return { exchange, entry }
  }

  private hostFor(
    slot: CexSlot<CexCredentials>,
    credentials: CcxtCredentialSet,
  ): SlotHost {
    const paper = slot.mode === 'paper'
    const existing = this.hosts.get(slot.credentials)
    if (existing && existing.paper === paper) return existing
    if (existing) {
      // A mode flip is a different environment entirely — never reuse.
      this.live.delete(existing.host)
      void existing.host.destroy()
    }
    // A re-provisioned slot arrives with a FRESH credentials object, so the
    // WeakMap lookup above misses by design — the previous host is found by
    // slot id and torn down here, or it would stay live with its markets table
    // and sockets until plugin teardown.
    const prior = this.hostsBySlotId.get(slot.id)
    if (prior && prior.credentials !== slot.credentials) {
      this.live.delete(prior.host)
      void prior.host.destroy()
      this.hostsBySlotId.delete(slot.id)
    }

    const create = this.opts.createHost ?? ((o) => new CcxtExchangeHost(o))
    const host = create({
      venue: this.opts.venue,
      credentials,
      entity: slot.credentials['entity'] ?? '',
      paper,
      onError: (scope, error) => this.warn(scope, error, slot),
    })
    const entry: SlotHost = { host, paper, leverage: new Map() }
    this.hosts.set(slot.credentials, entry)
    this.hostsBySlotId.set(slot.id, { host, credentials: slot.credentials })
    this.live.add(host)
    return entry
  }

  private failure(
    scope: string,
    error: unknown,
    slot: CexSlot<CexCredentials>,
  ): OrderResult {
    const message = this.describe(
      redactSecrets(
        error instanceof Error ? error.message : 'Network error',
        slot.credentials,
      ),
      slot,
    )
    this.opts.onError?.(`${scope}:rejected`, new Error(message))
    return { success: false, error: message }
  }

  private warn(
    scope: string,
    error: unknown,
    slot: CexSlot<CexCredentials>,
  ): void {
    const message = this.describe(
      redactSecrets(
        error instanceof Error ? error.message : String(error),
        slot.credentials,
      ),
      slot,
    )
    this.opts.onError?.(scope, new Error(message))
  }

  /** Venue's chance to turn an unactionable rejection into an actionable one. */
  private describe(message: string, slot: CexSlot<CexCredentials>): string {
    return this.opts.venue.describeTradingError?.(message, slot) ?? message
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** A venue-scoped symbol for the calls that need one (order history, cancel). */
function slotSymbol(slot: CexSlot<CexCredentials>): string | undefined {
  return slot.currentPair ? toFuturesSymbol(slot.currentPair) : undefined
}

/**
 * `{ key: value }` when the venue sent a finite number, `{}` when it did not.
 * Spread into the position row so an absent field stays absent rather than
 * being reported as a real zero — "no liquidation price" is not "liquidates at
 * zero".
 */
function optionalNumber<TKey extends string>(
  key: TKey,
  value: unknown,
): Partial<Record<TKey, number>> {
  const parsed = numberOf(value)
  return parsed === null ? {} : ({ [key]: parsed } as Record<TKey, number>)
}
