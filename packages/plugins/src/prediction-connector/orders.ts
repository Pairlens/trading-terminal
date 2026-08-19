// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `trading:orders`, `trading:balances` and `trading:positions` for prediction
 * venues.
 *
 * The rules the spot order module established hold here unchanged, because the
 * failure modes are the same:
 *
 * - **Nothing may throw.** `trading:orders` is declared `sideEffect: true`, so
 *   the plugin manager never re-routes a failure to another candidate; a thrown
 *   error surfaces as "All candidates failed" with the venue's actual reason
 *   buried inside it. Every entry point ends in an `OrderResult` or an empty
 *   array.
 * - **Secrets must not leak.** ccxt error messages carry the response body, and
 *   a rejection reason is rendered verbatim in the order pane. Everything that
 *   leaves this module goes through `redactSecrets` — which here has to cover
 *   an EOA private key as well as an API secret.
 * - **Paper is refused, not faked.** A paper slot on a venue with no sandbox
 *   would otherwise sign the same order against production.
 *
 * What is genuinely different is the unit and the addressing. `size` is a
 * CONTRACT count, not a base-asset amount, and `pair` is an outcome key that
 * has to go through `resolveOutcome` before ccxt sees it. And prediction books
 * are limit-centric: Polymarket's CLOB has no market sell at all, so the
 * refusal has to name what the user can do instead rather than let ccxt throw
 * a signing error three layers down.
 */

import {
  mapCcxtOrderStatus,
  normalizeCcxtBalances,
  redactSecrets,
} from '../ccxt-connector/orders'
import { PredictionExchangeHost } from './exchange-host'
import { sanitizeOutcomeKey } from './outcome-keys'
import type { OutcomeResolver } from './outcomes'
import type {
  PredictionCredentialSet,
  PredictionExchangeLike,
  PredictionOrderLike,
  PredictionSlot,
  PredictionVenueConfig,
} from './types'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

/** Orders pulled per `'list'` call. */
const ORDER_HISTORY_LIMIT = 50

/**
 * One open position on a prediction venue.
 *
 * Deliberately NOT the spot `NormalizedBalance` shape: a prediction position is
 * a contract count on one side of one question, and the fields that make it
 * readable (which question, which outcome, when it resolves, what it paid) have
 * no balance equivalent. The `trading:positions` capability returns these rows.
 */
export type NormalizedPredictionPosition = {
  /** The pair key the chart and the ticket address this outcome by. */
  pairKey: string
  outcomeLabel: string
  /** Contract count. Positive; the direction is in `side`. */
  contracts: string
  avgPrice?: string
  side: 'long' | 'short'
  marketTitle: string
  endMs?: number
  resolved?: boolean
  /** Settlement proceeds in collateral units, once the market has resolved. */
  payout?: string
}

// ── Pure mapping ───────────────────────────────────────────────────────────

/**
 * A ccxt `PredictionOrder` → `NormalizedOrderUpdate`.
 *
 * `pair` comes from the resolver rather than from the order's own `outcome`
 * field, because the two are not the same string on a mapped venue — the order
 * echoes ccxt's handle and the terminal keys everything on the sanitized pair
 * key. Money fields stay strings: the terminal formats them with the venue's
 * precision and never does arithmetic on them.
 */
export function normalizePredictionOrder(
  raw: PredictionOrderLike,
  pairKey: string,
): NormalizedOrderUpdate {
  const filled = numberOf(raw['filled']) ?? 0
  const timestamp = numberOf(raw['timestamp'])
  const updated = numberOf(raw['lastUpdateTimestamp'])
  const fee = raw['fee']
  const feeRecord =
    fee && typeof fee === 'object' ? (fee as Record<string, unknown>) : {}

  return {
    orderId: stringOf(raw['id']),
    pair: pairKey,
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
    createdAt: timestamp ?? Date.now(),
  }
}

/**
 * A ccxt `PredictionPosition` → a terminal row, empty ones dropped.
 *
 * ccxt reports `side` as 'long'/'short' where a venue distinguishes them and
 * omits it where holding the outcome is the only direction; a missing side is
 * long, because you cannot be short a contract you do not hold.
 */
export function normalizePredictionPositions(
  rows: Array<Record<string, unknown>>,
  keyOf: (outcomeSymbol: string) => string,
): Array<NormalizedPredictionPosition> {
  const out: Array<NormalizedPredictionPosition> = []
  for (const raw of rows) {
    const contracts = numberOf(raw['contracts'])
    if (contracts === null || contracts === 0) continue
    const outcomeSymbol = stringOf(raw['outcome'])
    if (!outcomeSymbol) continue
    const entry = numberOf(raw['entryPrice'])
    const payout = numberOf(raw['payout'])
    const end = numberOf(raw['end'])
    out.push({
      pairKey: keyOf(outcomeSymbol),
      outcomeLabel: stringOf(raw['label']) || outcomeSymbol,
      contracts: String(Math.abs(contracts)),
      ...(entry !== null ? { avgPrice: String(entry) } : {}),
      side: raw['side'] === 'short' || contracts < 0 ? 'short' : 'long',
      marketTitle: stringOf(raw['market']) || stringOf(raw['event']),
      ...(end !== null ? { endMs: end } : {}),
      ...(raw['resolved'] === true ? { resolved: true } : {}),
      ...(payout !== null ? { payout: String(payout) } : {}),
    })
  }
  return out
}

export type PredictionOrderCall =
  | {
      kind: 'order'
      type: 'market' | 'limit'
      side: 'buy' | 'sell'
      amount: number
      price: number | undefined
    }
  | { kind: 'reject'; error: string }

/**
 * `OrderParams` → the ccxt call to make. Pure, so the whole capability matrix
 * is testable without a signature.
 *
 * The rejections carry the weight. A prediction market prices between 0 and 1,
 * so a limit price outside that range is not a slip of the finger the venue
 * will round — it is an order that cannot rest, and saying so here is better
 * than a signing error. Likewise a market order on a limit-only book: the user
 * needs to be told to name a price, not told that signing failed.
 */
export function buildPredictionOrderCall(
  order: OrderParams,
  venue: Pick<PredictionVenueConfig, 'displayName' | 'marketOrders'>,
): PredictionOrderCall {
  const size = Number(order.size)
  if (!Number.isFinite(size) || size <= 0) {
    return { kind: 'reject', error: `Invalid contract count '${order.size}'` }
  }
  if (order.trigger) {
    return {
      kind: 'reject',
      error: `${venue.displayName} does not support trigger (TP/SL) orders`,
    }
  }

  const price = order.price === undefined ? undefined : Number(order.price)
  if (order.type === 'limit') {
    if (price === undefined || !Number.isFinite(price)) {
      return { kind: 'reject', error: 'A limit order needs a limit price' }
    }
    if (price <= 0 || price >= 1) {
      return {
        kind: 'reject',
        error: `A ${venue.displayName} limit price is a probability between 0 and 1: '${order.price}' cannot rest`,
      }
    }
    return {
      kind: 'order',
      type: 'limit',
      side: order.side,
      amount: size,
      price,
    }
  }

  if (venue.marketOrders === 'none') {
    return {
      kind: 'reject',
      error: `${venue.displayName} is a limit-only book: set a limit price between 0 and 1 and resubmit`,
    }
  }

  return {
    kind: 'order',
    type: 'market',
    side: order.side,
    amount: size,
    price,
  }
}

// ── Runtime ────────────────────────────────────────────────────────────────

export type PredictionTradingRuntimeOptions = {
  venue: PredictionVenueConfig
  resolver: OutcomeResolver
  onError?: (scope: string, error: unknown) => void
  /** Injectable so tests can drive a fake exchange without a socket. */
  createHost?: (
    options: ConstructorParameters<typeof PredictionExchangeHost>[0],
  ) => PredictionExchangeHost
}

type SlotHost = {
  host: PredictionExchangeHost
  paper: boolean
  /** The slot OBJECT this host was built for; a re-provision makes a new one. */
  provision: PredictionSlot
  /** The resolved secret this host was built with, so a rotation rebuilds. */
  secretFingerprint: string
}

/**
 * One authed ccxt instance per credential slot.
 *
 * Keyed by slot id rather than by the credential object, because the wallet
 * path has no stable credential object at all — the key is fetched per use and
 * never stored.
 *
 * ## Why the secret is not resolved on every call
 *
 * `secretRef()` is a VAULT DECRYPT. The terminal polls positions every 60 s and
 * refreshes order lists alongside, so resolving on every `acquire` meant
 * decrypting the user's wallet key roughly twice a minute while the app sat
 * idle — and recomputing a fingerprint over it each time. So a cached host is
 * reused on identity alone (same slot object, same mode), and the vault is
 * touched only when something already forces a rebuild.
 *
 * The rebuild signals are: no host yet, a mode flip (paper and live are
 * different environments), and a re-provision — `initialize` builds a FRESH
 * slot object every time, so object identity is an exact "the user changed
 * this account" signal. On that path the secret IS resolved and the
 * fingerprint compared, which is what lets a re-provision with an unchanged
 * key keep its warm instance instead of rebuilding for nothing.
 *
 * **Tradeoff, deliberately taken:** a key rotated IN PLACE in the vault, with
 * no re-provision, is not noticed until the next rebuild. That is safe because
 * the terminal re-provisions the slot whenever a wallet is re-keyed, so the
 * signal arrives through the provision change; and the failure mode if it ever
 * did not is a signing rejection the user can act on, not a wrong-account
 * trade — the host is bound to one wallet id for its whole life.
 */
export class PredictionTradingRuntime {
  private readonly hosts = new Map<string, SlotHost>()
  private destroyed = false

  constructor(private readonly opts: PredictionTradingRuntimeOptions) {}

  async placeOrder(
    order: OrderParams,
    slot: PredictionSlot,
  ): Promise<OrderResult> {
    // Before anything that can fail: the reads that need an outcome scope use
    // this, and a rejected order still moved the user's attention here.
    slot.currentPair = sanitizeOutcomeKey(order.pair)

    try {
      const { exchange, host } = await this.acquire(slot)
      const paperGuard = this.checkPaper(order.mode, host)
      if (paperGuard) return paperGuard

      const call = buildPredictionOrderCall(order, this.opts.venue)
      if (call.kind === 'reject') return { success: false, error: call.error }

      const outcome = await this.opts.resolver.resolve(exchange, order.pair)

      if (typeof exchange.createOrder !== 'function') {
        return {
          success: false,
          error: `${this.opts.venue.displayName} cannot place orders`,
        }
      }
      const raw = await exchange.createOrder(
        outcome,
        call.type,
        call.side,
        call.amount,
        call.price,
        {},
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
    slot: PredictionSlot,
  ): Promise<OrderResult> {
    try {
      const { exchange } = await this.acquire(slot)
      if (typeof exchange.cancelOrder !== 'function') {
        return {
          success: false,
          error: `${this.opts.venue.displayName} cannot cancel orders`,
        }
      }
      // A cancel needs the outcome on both venues, but a resolved-away market
      // must still be cancellable — so a resolution failure falls back to the
      // id alone rather than blocking the one action that frees collateral.
      const outcome = await this.opts.resolver
        .resolve(exchange, pair)
        .catch(() => undefined)
      await exchange.cancelOrder(orderId, outcome, {})
      return { success: true, orderId }
    } catch (error) {
      return this.failure('cancel', error, slot)
    }
  }

  async fetchOpenOrders(
    slot: PredictionSlot,
  ): Promise<Array<NormalizedOrderUpdate>> {
    try {
      const { exchange } = await this.acquire(slot)
      if (typeof exchange.fetchOpenOrders !== 'function') return []
      const rows = await exchange.fetchOpenOrders()
      return this.mapOrders(rows, slot)
    } catch (error) {
      this.warn('open-orders', error, slot)
      return []
    }
  }

  async fetchOrderHistory(
    slot: PredictionSlot,
  ): Promise<Array<NormalizedOrderUpdate>> {
    try {
      const { exchange } = await this.acquire(slot)
      const fetch =
        exchange.has['fetchClosedOrders'] && exchange.fetchClosedOrders
          ? exchange.fetchClosedOrders
          : exchange.has['fetchOrders'] && exchange.fetchOrders
            ? exchange.fetchOrders
            : undefined
      if (typeof fetch !== 'function') return []
      const rows = await fetch.call(
        exchange,
        undefined,
        undefined,
        ORDER_HISTORY_LIMIT,
      )
      return this.mapOrders(rows, slot)
    } catch (error) {
      this.warn('order-history', error, slot)
      return []
    }
  }

  async fetchBalances(slot: PredictionSlot): Promise<Array<NormalizedBalance>> {
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
   * Open positions.
   *
   * Polymarket's `fetchPositions` throws `ArgumentsRequired` without a
   * `walletAddress`, which is a configuration problem the user can fix — so it
   * is surfaced as a sentence rather than swallowed into an empty list that
   * reads as "you hold nothing".
   */
  async fetchPositions(slot: PredictionSlot): Promise<{
    positions: Array<NormalizedPredictionPosition>
    error?: string
  }> {
    try {
      const { exchange } = await this.acquire(slot)
      if (typeof exchange.fetchPositions !== 'function') {
        return { positions: [] }
      }
      const rows = await exchange.fetchPositions()
      return {
        positions: normalizePredictionPositions(rows, sanitizeOutcomeKey),
      }
    } catch (error) {
      this.warn('positions', error, slot)
      return {
        positions: [],
        error: this.describe(error, slot),
      }
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    const hosts = [...this.hosts.values()]
    this.hosts.clear()
    await Promise.all(hosts.map((entry) => entry.host.destroy()))
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private mapOrders(
    rows: Array<PredictionOrderLike>,
    slot: PredictionSlot,
  ): Array<NormalizedOrderUpdate> {
    const out: Array<NormalizedOrderUpdate> = []
    for (const raw of rows) {
      const outcome = stringOf(raw['outcome'])
      const pairKey = outcome ? sanitizeOutcomeKey(outcome) : slot.currentPair
      out.push(normalizePredictionOrder(raw, pairKey))
    }
    return out
  }

  /**
   * A paper slot on a venue with no sandbox is refused. Falling through would
   * sign the same order against the live matching engine on a credential the
   * user labelled paper.
   */
  private checkPaper(
    mode: 'paper' | 'live',
    host: PredictionExchangeHost,
  ): OrderResult | null {
    if (mode !== 'paper' || host.paperActive) return null
    return {
      success: false,
      error: `${this.opts.venue.displayName} has no paper trading environment for this credential: switch it to live, or paper-trade on a venue that has one`,
    }
  }

  private async acquire(slot: PredictionSlot): Promise<{
    exchange: PredictionExchangeLike
    host: PredictionExchangeHost
  }> {
    if (this.destroyed) {
      throw new Error(`${this.opts.venue.marketId}: destroyed`)
    }
    const paper = slot.mode === 'paper'
    const existing = this.hosts.get(slot.id)

    // The warm path: no vault decrypt, no fingerprint. See the class doc.
    const host =
      existing && existing.paper === paper && existing.provision === slot
        ? existing.host
        : await this.rebuild(slot, paper, existing)

    // A region change rebuilds the INSTANCE, not the host: the REST base is
    // baked into every signature ccxt has already computed.
    if (host.setCountry(slot.country)) await host.close()
    const lease = await host.acquire()
    return { exchange: lease.exchange, host }
  }

  /** The only path that touches the vault. */
  private async rebuild(
    slot: PredictionSlot,
    paper: boolean,
    existing: SlotHost | undefined,
  ): Promise<PredictionExchangeHost> {
    const fields = { ...slot.fields }
    if (slot.secretRef) {
      const secret = await slot.secretRef()
      if (!secret) {
        throw new Error(
          'This wallet is locked: unlock it to place or read orders',
        )
      }
      fields['privateKey'] = secret
    }
    const credentials = this.opts.venue.toCcxtCredentials(fields)
    if (!credentials) throw new Error('No credentials configured')
    const fingerprint = fingerprintOf(credentials)

    // A re-provision that changed nothing keeps its warm instance: the slot
    // object is new, but the environment and the key behind it are not.
    if (
      existing &&
      existing.paper === paper &&
      existing.secretFingerprint === fingerprint
    ) {
      existing.provision = slot
      return existing.host
    }
    if (existing) {
      // A mode flip is a different environment and a rotated key is a
      // different account — never reuse either.
      void existing.host.destroy()
      this.hosts.delete(slot.id)
    }

    const create =
      this.opts.createHost ?? ((o) => new PredictionExchangeHost(o))
    const host = create({
      venue: this.opts.venue,
      credentials,
      paper,
      onError: (scope, error) => this.warn(scope, error, slot),
    })
    this.hosts.set(slot.id, {
      host,
      paper,
      provision: slot,
      secretFingerprint: fingerprint,
    })
    return host
  }

  private failure(
    scope: string,
    error: unknown,
    slot: PredictionSlot,
  ): OrderResult {
    const message = this.describe(error, slot)
    this.opts.onError?.(`${scope}:rejected`, new Error(message))
    return { success: false, error: message }
  }

  private warn(scope: string, error: unknown, slot: PredictionSlot): void {
    this.opts.onError?.(scope, new Error(this.describe(error, slot)))
  }

  /**
   * The message that may leave this module, with credential material removed.
   *
   * `slot.fields` is redacted rather than the resolved credential set because
   * the EOA key is never held long enough to redact against — it is fetched
   * inside `acquire` and dropped. What CAN appear in a ccxt message is the
   * wallet address and the api key, and both are in `fields`.
   */
  private describe(error: unknown, slot: PredictionSlot): string {
    const raw = error instanceof Error ? error.message : String(error)
    return redactSecrets(raw, slot.fields)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * A stable, non-reversible tag for a credential set.
 *
 * Length and a coarse checksum only: enough to notice that a key rotated,
 * never enough to reconstruct one if it lands in a log.
 */
function fingerprintOf(credentials: PredictionCredentialSet): string {
  const parts: Array<string> = []
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value !== 'string' || value === '') continue
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0
    }
    parts.push(`${key}:${value.length}:${hash}`)
  }
  return parts.sort().join('|')
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringOf(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }
  return String(value)
}
