// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `trading:orders` + `trading:balances`, generically, through ccxt's unified
 * order API.
 *
 * The native connectors each hand-roll five signed REST calls per venue. ccxt
 * has already collapsed those into `createOrder` / `cancelOrder` /
 * `fetchOpenOrders` / `fetchClosedOrders` / `fetchBalance`, so what is left for
 * the bridge is the part ccxt does NOT unify:
 *
 * - **Nothing may throw.** The terminal's guarded order path treats
 *   `trading:orders` as side-effecting and never re-routes it, so a rejection
 *   has to come back as `{success:false, error}` — a thrown error surfaces as
 *   "All candidates failed" with the venue's reason buried inside. ccxt throws
 *   for everything, including a bad symbol, so every entry point here is a
 *   try/catch that ends in an `OrderResult` or an empty array.
 * - **Capability is per-venue and lives in `has`.** Trigger orders exist on 13
 *   of 14 venues, stop-market on 11, quote-denominated market buys on 12. Rather
 *   than a hand-kept table, every branch reads the flag ccxt already publishes
 *   and refuses with a sentence naming the venue when it is absent.
 * - **Paper is not universal.** Six venues have a sandbox ccxt can switch to;
 *   Kraken has a `validate: true` dry run instead; the rest have neither. A
 *   paper slot on a venue with neither is REFUSED. Falling through to the live
 *   endpoint would execute a real trade against a credential the user marked
 *   paper, which is the worst failure mode in this file.
 * - **Secrets must not leak.** ccxt error messages carry the response body and,
 *   on some venues, the echoed request. Every message that leaves this module —
 *   returned or logged — goes through `redactSecrets` first.
 *
 * Mapping back out is `normalizeCcxtOrder` / `normalizeCcxtBalances`, both pure
 * and both exercised against `assertOrderConformant` / `assertBalanceConformant`
 * in the test suite.
 */

import { normalizePair, toCcxtSymbol } from './parser'
import { CcxtExchangeHost, toCcxtCredentials } from './exchange-host'
import type { CcxtCredentialSet } from './exchange-host'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'
import type { CexCredentials, CexSlot } from '../cex-connector'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

/**
 * How a venue is asked for its trigger-order id space. ccxt reads both
 * spellings (`safeValue2(params, 'stop', 'trigger')`) and which one is honored
 * moved between releases, so both go out.
 */
const DEFAULT_TRIGGER_QUERY = { trigger: true, stop: true } as const

/** Orders pulled per `'list'` call. Matches the native OKX history page. */
const ORDER_HISTORY_LIMIT = 50

// ── Pure mapping ───────────────────────────────────────────────────────────

type CcxtOrderLike = Record<string, unknown>

/**
 * ccxt status → the terminal's four-state union.
 *
 * `'open'` splits on fill progress because the terminal renders
 * `partially_filled` differently and the position ledger keys off it; ccxt
 * keeps the order `'open'` either way. `'expired'` and `'rejected'` collapse
 * into `'cancelled'` — the union has no room for them and "it is not resting
 * and it did not fill" is the property every consumer actually reads.
 */
export function mapCcxtOrderStatus(
  status: unknown,
  filled: number,
): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'closed':
      return 'filled'
    case 'canceled':
    case 'cancelled':
    case 'expired':
    case 'rejected':
      return 'cancelled'
    case 'open':
      return filled > 0 ? 'partially_filled' : 'live'
    default:
      return filled > 0 ? 'partially_filled' : 'live'
  }
}

/**
 * A ccxt unified order → `NormalizedOrderUpdate`.
 *
 * Numbers become strings because that is the contract: the terminal formats
 * them with the venue's own precision and never does arithmetic on them, and a
 * float round-trip is how a size of `0.1` becomes `0.09999999999999999` in an
 * order confirmation.
 *
 * `triggerOrder` is set from the unified `triggerPrice`/`stopLossPrice`/
 * `takeProfitPrice` fields rather than from which endpoint the row arrived on,
 * so the tag is right whether the venue keeps trigger orders in a separate id
 * space or mixes them into the regular list.
 */
export function normalizeCcxtOrder(
  raw: CcxtOrderLike,
  fallbackPair = '',
): NormalizedOrderUpdate {
  const filled = numberOf(raw['filled']) ?? 0
  const symbol = typeof raw['symbol'] === 'string' ? raw['symbol'] : ''
  const timestamp = numberOf(raw['timestamp'])
  const updated = numberOf(raw['lastUpdateTimestamp'])
  const createdAt = timestamp ?? Date.now()
  // Some venues report `triggerPrice: "0"` on PLAIN orders (Binance testnet
  // does, found by the E2E) — a zero trigger is "no trigger", and tagging a
  // plain order `triggerOrder: true` would route its cancel through the
  // trigger id space. Only a positive price counts.
  const rawTrigger =
    stringOf(raw['triggerPrice']) ||
    stringOf(raw['stopLossPrice']) ||
    stringOf(raw['takeProfitPrice'])
  const triggerPrice = Number(rawTrigger) > 0 ? rawTrigger : ''

  const fee = raw['fee']
  const feeRecord = fee && typeof fee === 'object' ? (fee as CcxtOrderLike) : {}

  return {
    ...(triggerPrice ? { triggerOrder: true, triggerPrice } : {}),
    orderId: stringOf(raw['id']),
    pair: symbol ? normalizePair(symbol.split(':')[0] ?? symbol) : fallbackPair,
    side: raw['side'] === 'sell' ? 'sell' : 'buy',
    type: raw['type'] === 'market' ? 'market' : 'limit',
    size: stringOf(raw['amount']),
    price: stringOf(raw['price']),
    fillSize: stringOf(raw['filled']),
    avgPrice: stringOf(raw['average']),
    status: mapCcxtOrderStatus(raw['status'], filled),
    fee: stringOf(feeRecord['cost']),
    feeCcy: stringOf(feeRecord['currency']),
    ts: updated ?? timestamp ?? Date.now(),
    createdAt,
  }
}

/**
 * A ccxt unified balance → the terminal's rows, zero totals dropped.
 *
 * ccxt's balance object mixes per-currency entries with the `free`/`used`/
 * `total` cross-sections and an `info` blob, so the currency list is taken from
 * `total` (always present, always complete) rather than from the object's own
 * keys.
 */
export function normalizeCcxtBalances(
  raw: Record<string, unknown>,
): Array<NormalizedBalance> {
  const totals = asRecord(raw['total'])
  const free = asRecord(raw['free'])
  const used = asRecord(raw['used'])
  const out: Array<NormalizedBalance> = []
  for (const [currency, value] of Object.entries(totals)) {
    const total = numberOf(value)
    if (total === null || total <= 0) continue
    out.push({
      currency,
      available: stringOf(free[currency] ?? 0),
      frozen: stringOf(used[currency] ?? 0),
      total: stringOf(value),
    })
  }
  return out
}

/**
 * Strip credential material out of a message before it is returned or logged.
 *
 * ccxt embeds the response body — and on a few venues the echoed request — in
 * its error messages, and the terminal renders a rejection reason verbatim in
 * the order pane. The 8-character floor keeps a short optional passphrase from
 * turning every message into asterisks.
 */
export function redactSecrets(
  message: string,
  credentials: Record<string, string> | null | undefined,
): string {
  if (!credentials) return message
  let out = message
  for (const value of Object.values(credentials)) {
    if (typeof value === 'string' && value.length >= 8) {
      out = out.split(value).join('***')
    }
  }
  return out
}

/** The `has` slice the order builder reads. Kept structural so tests can fake it. */
export type OrderCapabilities = Record<string, unknown>

export type CcxtOrderCall =
  | {
      kind: 'order'
      symbol: string
      type: 'market' | 'limit'
      side: 'buy' | 'sell'
      amount: number
      price: number | undefined
      params: Record<string, unknown>
    }
  | {
      kind: 'cost'
      symbol: string
      side: 'buy' | 'sell'
      cost: number
      params: Record<string, unknown>
    }
  | { kind: 'reject'; error: string }

/**
 * `OrderParams` → the ccxt call to make. Pure, so the whole capability matrix
 * is testable without a socket or a signature.
 *
 * The rejections are as load-bearing as the successes: a venue that cannot do
 * what was asked must say so in a sentence the user can act on, because the
 * alternative — silently dropping the trigger, or sending a base-denominated
 * size where a quote one was meant — spends real money.
 */
export function buildCcxtOrderCall(
  order: OrderParams,
  has: OrderCapabilities,
  venue: Pick<
    CcxtVenueConfig,
    'displayName' | 'orderParams' | 'supportsTriggerOrders'
  >,
): CcxtOrderCall {
  const label = venue.displayName
  const symbol = toCcxtSymbol(order.pair)
  const size = Number(order.size)
  if (!Number.isFinite(size) || size <= 0) {
    return { kind: 'reject', error: `Invalid order size '${order.size}'` }
  }

  const price = order.price === undefined ? undefined : Number(order.price)
  if (order.type === 'limit' && (price === undefined || !(price > 0))) {
    return { kind: 'reject', error: 'A limit order needs a limit price' }
  }

  const params: Record<string, unknown> = { ...venue.orderParams }
  if (order.clientOrderId) params['clientOrderId'] = order.clientOrderId

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
    // carries the tp/sl semantic, and only `takeProfitPrice`/`stopLossPrice`
    // preserve it. The generic `triggerPrice` collapses both into the venue's
    // conditional-order default — on Binance that is STOP_LOSS_LIMIT, which
    // inverts the trigger direction of a take-profit and gets rejected live
    // with "Stop price would trigger immediately" (found by the testnet E2E).
    // `stopPrice` is the pre-4.2 name a couple of parsers still read.
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

  // Quote-denominated sizing. Only meaningful on a market order: a limit order
  // already prices the base amount, and the terminal's own risk math treats
  // `quote_ccy` as "this number is money" (market-data-provider.tsx:1247).
  if (order.tgtCcy === 'quote_ccy' && order.type === 'market') {
    if (!hasCostSupport(has, order.side)) {
      return {
        kind: 'reject',
        error: `${label} does not accept quote-denominated market ${order.side}s — size the order in ${symbol.split('/')[0] ?? 'the base asset'}`,
      }
    }
    return { kind: 'cost', symbol, side: order.side, cost: size, params }
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

function hasTriggerSupport(has: OrderCapabilities): boolean {
  return (
    has['createTriggerOrder'] === true ||
    has['createStopOrder'] === true ||
    has['createStopLossOrder'] === true ||
    has['createTakeProfitOrder'] === true
  )
}

function hasCostSupport(has: OrderCapabilities, side: 'buy' | 'sell'): boolean {
  if (has['createMarketOrderWithCost'] === true) return true
  return side === 'buy'
    ? has['createMarketBuyOrderWithCost'] === true
    : has['createMarketSellOrderWithCost'] === true
}

// ── Runtime ────────────────────────────────────────────────────────────────

export type CcxtTradingRuntimeOptions = {
  venue: CcxtVenueConfig
  /**
   * Give `exchange` a market table without a signed `loadMarkets`. The read
   * path already owns the cache; an authed instance calling `loadMarkets` for
   * itself would sign KuCoin's margin endpoints and pay the download twice.
   */
  ensureMarkets: (exchange: CcxtExchangeLike) => Promise<void>
  onError?: (scope: string, error: unknown) => void
  /** Injectable so the fetch-stub suite can drive a fake exchange. */
  createHost?: (
    options: ConstructorParameters<typeof CcxtExchangeHost>[0],
  ) => CcxtExchangeHost
}

type SlotHost = {
  host: CcxtExchangeHost
  country: string
  paper: boolean
}

/**
 * One authed ccxt instance per credential slot, plus the five REST hooks the
 * CEX shell dispatches into.
 *
 * Keyed by the slot's `credentials` OBJECT, not its id: the shell rebuilds that
 * object on every `initialize`, so identity already means "this exact
 * credential, as most recently provisioned" and a stale host can never be
 * handed to a re-keyed slot. A WeakMap also keeps the key material out of any
 * string that could reach a log line.
 */
export class CcxtTradingRuntime {
  private hosts = new WeakMap<CexCredentials, SlotHost>()
  private live = new Set<CcxtExchangeHost>()
  private destroyed = false

  constructor(private readonly opts: CcxtTradingRuntimeOptions) {}

  async placeOrder(
    order: OrderParams,
    slot: CexSlot<CexCredentials>,
  ): Promise<OrderResult> {
    // Before anything that can fail: venues that scope history and cancel by
    // the last traded pair read this, and a rejected order still moved the
    // user's attention to that market.
    slot.currentPair = normalizePair(order.pair)

    try {
      const { exchange, host } = await this.acquire(slot)
      const paperGuard = this.checkPaper(order.mode, host)
      if (paperGuard) return paperGuard

      const call = buildCcxtOrderCall(order, exchange.has, this.opts.venue)
      if (call.kind === 'reject') return { success: false, error: call.error }

      const params =
        order.mode === 'paper' && !host.paperActive
          ? { ...call.params, ...this.opts.venue.paperOrderParams }
          : call.params

      const raw =
        call.kind === 'cost'
          ? await this.createWithCost(exchange, call.symbol, call.side, {
              cost: call.cost,
              params,
            })
          : await callOrThrow(
              exchange.createOrder,
              exchange,
              `${this.opts.venue.displayName} cannot place orders`,
            )(
              call.symbol,
              call.type,
              call.side,
              call.amount,
              call.price,
              params,
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
      const cancel = callOrThrow(
        exchange.cancelOrder,
        exchange,
        `${this.opts.venue.displayName} cannot cancel orders`,
      )
      // Trigger orders live in a separate id space on OKX, Bitget, Gate and
      // friends; without the flag the venue looks the id up in the regular book
      // and reports "order not found" for an order that is plainly resting.
      await cancel(
        orderId,
        toCcxtSymbol(pair),
        opts?.trigger ? this.triggerQuery() : {},
      )
      return { success: true, orderId }
    } catch (error) {
      return this.failure('cancel', error, slot)
    }
  }

  /**
   * Resting orders, including the trigger-order id space where the venue keeps
   * one behind a flag.
   *
   * The second call is deduplicated by order id rather than trusted to return
   * only trigger orders: a venue that ignores the flag answers with the regular
   * book again, and two copies of one order in the terminal's order pane is
   * indistinguishable from two real orders.
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
      const supportsTrigger =
        this.opts.venue.supportsTriggerOrders ?? hasTriggerSupport(exchange.has)
      const triggers = supportsTrigger
        ? await fetch
            .call(exchange, symbol, undefined, undefined, this.triggerQuery())
            .catch(() => [])
        : []

      const seen = new Set<string>()
      const out: Array<NormalizedOrderUpdate> = []
      for (const raw of [...regular, ...triggers]) {
        const mapped = normalizeCcxtOrder(raw, slot.currentPair)
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
   * Recently closed orders.
   *
   * `fetchClosedOrders` is `'emulated'` on Binance and Crypto.com, where ccxt
   * fulfils it from `fetchOrders` and needs a symbol; `slot.currentPair` is the
   * only one the connector knows, which is exactly why `placeOrder` keeps it
   * fresh. An empty array is the right answer when neither endpoint exists —
   * order history is a nicety, and throwing would fail the whole `'list'` pair.
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
      return rows.map((raw) => normalizeCcxtOrder(raw, slot.currentPair))
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

  async destroy(): Promise<void> {
    this.destroyed = true
    const hosts = [...this.live]
    this.live.clear()
    this.hosts = new WeakMap()
    await Promise.all(hosts.map((host) => host.destroy()))
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private triggerQuery(): Record<string, unknown> {
    return { ...(this.opts.venue.triggerQueryParams ?? DEFAULT_TRIGGER_QUERY) }
  }

  /**
   * A paper slot on a venue with neither a sandbox nor a dry-run param is
   * refused. The alternative — signing the same order against the production
   * endpoint — is a real trade on a credential the user labelled paper.
   */
  private checkPaper(
    mode: 'paper' | 'live',
    host: CcxtExchangeHost,
  ): OrderResult | null {
    if (mode !== 'paper' || host.paperActive) return null
    if (this.opts.venue.paperOrderParams) return null
    return {
      success: false,
      error: `${this.opts.venue.displayName} has no paper trading environment — switch this credential to live or paper-trade on another venue`,
    }
  }

  private async createWithCost(
    exchange: CcxtExchangeLike,
    symbol: string,
    side: 'buy' | 'sell',
    call: { cost: number; params: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    // The per-venue overrides are the point of going through these helpers:
    // OKX's sets `tgtCcy: 'quote_ccy'`, Binance's sets `cost`, KuCoin's sets
    // `funds`. Reimplementing that here would be a fourteen-venue table.
    const sided =
      side === 'buy'
        ? exchange.createMarketBuyOrderWithCost
        : exchange.createMarketSellOrderWithCost
    if (typeof sided === 'function') {
      return sided.call(exchange, symbol, call.cost, call.params)
    }
    const both = exchange.createMarketOrderWithCost
    if (typeof both === 'function') {
      return both.call(exchange, symbol, side, call.cost, call.params)
    }
    throw new Error(
      `${this.opts.venue.displayName} does not accept quote-denominated market ${side}s`,
    )
  }

  private async acquire(slot: CexSlot<CexCredentials>): Promise<{
    exchange: CcxtExchangeLike
    host: CcxtExchangeHost
  }> {
    if (this.destroyed)
      throw new Error(`${this.opts.venue.marketId}: destroyed`)
    const credentials = toCcxtCredentials(slot.credentials)
    if (!credentials) throw new Error('No credentials configured')

    const host = this.hostFor(slot, credentials)
    // A region change rebuilds rather than mutates: the REST base is baked into
    // every signature and ccxt caches endpoint state on the instance.
    if (host.setCountry(slot.country)) await host.close()
    const lease = await host.acquire()
    await this.opts.ensureMarkets(lease.exchange)
    return { exchange: lease.exchange, host }
  }

  private hostFor(
    slot: CexSlot<CexCredentials>,
    credentials: CcxtCredentialSet,
  ): CcxtExchangeHost {
    const paper = slot.mode === 'paper'
    const existing = this.hosts.get(slot.credentials)
    if (existing && existing.paper === paper) return existing.host
    if (existing) {
      // A mode flip is a different environment entirely — never reuse.
      this.live.delete(existing.host)
      void existing.host.destroy()
    }

    const create = this.opts.createHost ?? ((o) => new CcxtExchangeHost(o))
    const host = create({
      venue: this.opts.venue,
      credentials,
      // The account's home entity, where the venue declares one (OKX). Rides
      // in the slot's credential record because that is what the shell copies
      // from `initialize` config — and because the hosts map is keyed on that
      // record's identity, an in-place entity edit lands as a fresh record and
      // therefore a fresh host on the right endpoints.
      entity: slot.credentials['entity'] ?? '',
      paper,
      onError: (scope, error) => this.warn(scope, error, slot),
    })
    this.hosts.set(slot.credentials, { host, country: slot.country, paper })
    this.live.add(host)
    return host
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

/**
 * A venue-scoped symbol for the calls that need one. Several venues reject a
 * symbol-less order history, and `slot.currentPair` is the only pair the
 * connector can know about — hence `placeOrder` keeping it current.
 */
function slotSymbol(slot: CexSlot<CexCredentials>): string | undefined {
  return slot.currentPair ? toCcxtSymbol(slot.currentPair) : undefined
}

function callOrThrow<T extends (...args: Array<never>) => unknown>(
  method: T | undefined,
  self: unknown,
  message: string,
): (...args: Parameters<T>) => ReturnType<T> {
  if (typeof method !== 'function') {
    return () => {
      throw new Error(message)
    }
  }
  return (...args: Parameters<T>) =>
    (method as (...a: Parameters<T>) => ReturnType<T>).apply(
      self as never,
      args,
    )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Every `NormalizedOrderUpdate` money field is a string, and an absent value is
 * `''` rather than `'0'` — the terminal renders a dash for the former and a
 * real zero for the latter, and "no average fill price yet" is not "filled at
 * zero".
 */
function stringOf(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : ''
  return String(value)
}
