// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `createPredictionConnectorPlugin` — one factory behind every prediction
 * venue.
 *
 * A sibling runtime to `ccxt-connector`, not a layer on it. The spot bridge
 * rides the CEX shell, and the CEX shell is written on the unified spot
 * surface: pairs are `BASE/QUOTE`, market rows must carry a `symbol`, the
 * markets pipeline filters on `spot === true`, and the order builder splits the
 * symbol to name the base asset in its rejections. ccxt's `PredictionExchange`
 * satisfies none of that — its rows carry no symbol at all — so forcing it
 * through would not fail, it would return nothing and look like a dead venue.
 *
 * What IS copied verbatim, because it is load-bearing in the terminal rather
 * than incidental to spot:
 *
 * - **Refusal ordering.** `platformCheck()` then `geoCheck()`, thrown
 *   SYNCHRONOUSLY from both `execute` and `subscribe`, before any channel work.
 *   The region dialog is raised from the `catch` around the synchronous
 *   `subscribe` call; a rejected promise arrives after the chart has already
 *   drawn its empty state.
 * - **Slots fail closed.** A `credentialId` that is provided but unknown
 *   resolves to no slot rather than falling back to the first one — an order
 *   could otherwise hit the wrong account or the wrong mode.
 * - **`tradeGeoCheck` runs AFTER slot resolution**, so a missing credential
 *   still reads as 'No credentials configured' rather than as a geo error.
 *
 * ccxt is reached only through `venue.loadExchangeClass()`, which must be a
 * literal `import('ccxt/js/src/prediction/<id>.js')`: the barrel would pull
 * ~130 exchange classes into the graph, and a literal deep import gives each
 * venue its own chunk.
 */

import { PlatformRestrictedError } from '@pairlens/market-engine/errors'
import { isVenueRestBlocked } from '@pairlens/market-engine/platform'
import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { olderThan } from '@pairlens/market-engine/candle-paging'
import { timeframeToMs } from '@pairlens/shared'
import { PredictionExchangeHost } from './exchange-host'
import { OutcomeKeyMap, sanitizeOutcomeKey } from './outcome-keys'
import { OutcomeResolver } from './outcomes'
import { fetchPredictionEvents, searchPredictionInstruments } from './events'
import { parsePredictionOhlcvBatch } from './parser'
import { PredictionStreamHub } from './streams'
import { PredictionTradingRuntime } from './orders'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { Candle, Timeframe } from '@pairlens/shared/types'
import type { OrderParams } from '@pairlens/market-engine/types'
import type { PredictionSlot, PredictionVenueConfig } from './types'

export type { PredictionVenueConfig, PredictionExchangeLike } from './types'
export {
  createPredictionConnectorManifest,
  type PredictionManifestOptions,
} from './manifest'
export { OutcomeKeyMap, sanitizeOutcomeKey } from './outcome-keys'
export { OutcomeResolver, outcomeSearchQueries } from './outcomes'
export {
  PredictionExchangeHost,
  enablePredictionSandbox,
} from './exchange-host'
export { PredictionStreamHub } from './streams'
export {
  PredictionTradingRuntime,
  buildPredictionOrderCall,
  normalizePredictionOrder,
  normalizePredictionPositions,
  type NormalizedPredictionPosition,
} from './orders'
export {
  fetchCryptoUpDownEvents,
  fetchPredictionEvents,
  searchPredictionInstruments,
} from './events'
export {
  UPDOWN_SERIES_LIMIT,
  classifyUpDown,
  openWindows,
  sideOf,
  type CryptoUpDownConfig,
  type UpDownSeriesFetch,
  type UpDownSeriesSpec,
} from './crypto-updown'
export * from './parser'

/** Candles returned by `market-data:history` when the caller passes no limit. */
const DEFAULT_HISTORY_LIMIT = 300

/**
 * Smallest window, in bars, any history request may ask the venue about.
 *
 * See `fetchHistory` — both venues derive a time span from the requested count,
 * so a one-bar request asks about a one-bar-wide slice of a tape that is often
 * silent. 200 bars covers a quiet market at every supported timeframe and still
 * fits inside Polymarket's 15-day price-history cap at the fine ones.
 */
const MIN_HISTORY_SPAN_BARS = 200

export type CreatePredictionConnectorOptions = {
  /** Injectable outcome-key storage — the CLI and tests run in memory. */
  outcomeStorage?: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
  } | null
  /** Injectable clocks for the stream loops. */
  streams?: {
    sleep?: (ms: number) => Promise<void>
    now?: () => number
  }
}

export function createPredictionConnectorPlugin(
  venue: PredictionVenueConfig,
  manifest: PluginManifest,
  options: CreatePredictionConnectorOptions = {},
): PluginInstance {
  const keys = new OutcomeKeyMap(venue.marketId, options.outcomeStorage)
  const resolver = new OutcomeResolver(venue, keys)

  // The PUBLIC host — market data must never carry a signature, because ccxt
  // signs opportunistically the moment credentials are present.
  //
  // Declared before the hub so `onInbound` can reach it: the host wraps ccxt's
  // `handleMessage` once, at client construction, and that wrap is the only
  // place a raw frame (a market update OR a keepalive pong) is observable. It
  // is what the hub's liveness watchdog measures against.
  // The two reference each other — the hub drives the host, and the host
  // reports inbound frames to the hub — and the host must exist first because
  // the hub takes it. One forward reference resolves the cycle; frames that
  // somehow arrive before the hub exists are dropped rather than thrown.
  const inbound = { note: (): void => {} }
  const publicHost = new PredictionExchangeHost({
    venue,
    onInbound: () => inbound.note(),
    onError: (scope, error) => warn(venue.marketId, scope, error),
  })
  const hub = new PredictionStreamHub({
    venue,
    host: publicHost,
    resolver,
    onError: (scope, error) => warn(venue.marketId, scope, error),
    ...(options.streams ?? {}),
  })
  inbound.note = () => hub.noteInbound()
  const trading = new PredictionTradingRuntime({
    venue,
    resolver,
    onError: (scope, error) => warn(venue.marketId, scope, error),
  })

  const slots = new Map<string, PredictionSlot>()

  /**
   * The id the caller used to name a slot, under either spelling.
   *
   * A wallet venue's slots are keyed by `walletId`, and the terminal's wallet
   * paths (balance refresh, order backfill) say `walletId` rather than
   * `credentialId`. Reading only the latter meant a two-wallet user fell
   * through to "first slot" and saw wallet one's balances and orders under
   * wallet two's heading.
   */
  function slotIdOf(params: PluginExecuteParams): string | undefined {
    const credId = params.params['credentialId']
    if (typeof credId === 'string' && credId) return credId
    const walletId = params.params['walletId']
    if (typeof walletId === 'string' && walletId) return walletId
    return undefined
  }

  function getSlot(params: PluginExecuteParams): PredictionSlot | null {
    const id = slotIdOf(params)
    // Fail closed: a provided-but-unknown id must never fall back to another
    // slot — an order could hit the wrong account or the wrong mode.
    if (id) return slots.get(id) ?? null
    const first = slots.values().next()
    return first.done ? null : first.value
  }

  /** Refuse a venue this build cannot reach. Mirrors geoCheck's placement. */
  function platformCheck(): void {
    // `venue.devProxy` and not `isCorsConstrained()`: `external-api.kalshi.com`
    // has no `/__*` prefix in apps/terminal/vite.config.ts, so browser dev is
    // as blocked as the hosted build and the events board showed a bare
    // `fetch failed` there.
    if (venue.requiresDesktop && isVenueRestBlocked(venue.devProxy === true)) {
      // manifest.name is the human label, which reaches the user verbatim
      // wherever a pane renders the raw error message.
      throw new PlatformRestrictedError(manifest.name || venue.marketId)
    }
  }

  function assertTimeframe(timeframe: string): Timeframe {
    if (!venue.timeframes.includes(timeframe as Timeframe)) {
      throw new Error(
        `${venue.displayName} charts ${venue.timeframes.join(', ')} only: '${timeframe}' is not available on this venue`,
      )
    }
    return timeframe as Timeframe
  }

  /**
   * A page of history, ascending, strictly older than `endTs` when one is
   * given.
   *
   * Paging goes through `since`, not an `until` param: neither venue's
   * `fetchOHLCV` reads one — Kalshi derives `end_ts` from `since + limit × tf`
   * and Polymarket clamps the same window to its 15-day cap — and an unknown
   * param would ride into the query string and be ignored or rejected. So the
   * window is anchored from the left and the result is still filtered, because
   * venues disagree about boundary inclusivity and a single duplicated bar
   * makes the chart latch `exhausted` for the rest of the session.
   *
   * The window is also FLOORED, which is the part that is easy to get wrong.
   * Neither venue returns "the last N bars": both compute a time span from
   * `limit × timeframe` and return whatever prints fall inside it. A prediction
   * market can go hours without a trade, so a small `limit` asks about a window
   * that is very likely empty — and the terminal's availability probe asks for
   * exactly one bar (`probeVenueHistory(…, 1)`). Measured on Kalshi
   * 2026-08-15: `limit: 1` at `1h` returned 0 rows where `limit: 300` returned
   * 21, so the probe concluded the pair was unlisted and hid the working book,
   * tape and ticket along with the chart. Asking for a real window and slicing
   * afterwards costs the same one request.
   */
  async function fetchHistory(
    pair: string,
    timeframe: string,
    limit: number,
    endTs?: number,
  ): Promise<Array<Candle>> {
    const tf = assertTimeframe(timeframe)
    const { exchange } = await publicHost.acquire()
    const outcome = await resolver.resolve(exchange, pair)
    const span = Math.max(limit, MIN_HISTORY_SPAN_BARS)
    const since =
      endTs === undefined ? undefined : endTs - span * timeframeToMs(tf)
    const rows = await exchange.fetchOHLCV(outcome, tf, since, span)
    // ccxt sorts OHLCV ascending, but a venue that changes its REST ordering
    // would break the buffer's append path; the sort also de-duplicates equal
    // timestamps, keeping the later row.
    const candles = olderThan(
      sortCandlesAscending(parsePredictionOhlcvBatch(rows)),
      endTs,
    )
    // The NEWEST `limit` bars: the caller asked for the bars nearest `endTs`
    // (or nearest now), and the widened window only exists to find them.
    return candles.length > limit ? candles.slice(-limit) : candles
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p, context } = params

    platformCheck()
    venue.geoCheck?.(context.country, capability)
    hub.setCountry(context.country)

    if (capability === 'market-data:history') {
      const pair = String(p['pair'] ?? context.pair)
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      const limit =
        typeof p['limit'] === 'number' ? p['limit'] : DEFAULT_HISTORY_LIMIT
      const endTs = typeof p['endTs'] === 'number' ? p['endTs'] : undefined
      return fetchHistory(pair, timeframe, limit, endTs)
    }

    if (capability === 'market-data:events') {
      const { exchange } = await publicHost.acquire()
      return fetchPredictionEvents(
        exchange,
        { venue, resolver },
        {
          ...(p['preset'] === 'crypto-updown'
            ? { preset: 'crypto-updown' as const }
            : {}),
          ...(typeof p['eventId'] === 'string'
            ? { eventId: p['eventId'] }
            : {}),
          ...(typeof p['query'] === 'string' ? { query: p['query'] } : {}),
          ...(typeof p['category'] === 'string'
            ? { category: p['category'] }
            : {}),
          ...(typeof p['limit'] === 'number' ? { limit: p['limit'] } : {}),
          ...(typeof p['cursor'] === 'string' ? { cursor: p['cursor'] } : {}),
        },
      )
    }

    if (capability === 'market-data:discovery:search') {
      const query = String(p['query'] ?? '')
      const { exchange } = await publicHost.acquire()
      return searchPredictionInstruments(
        exchange,
        { venue, resolver },
        query,
        typeof p['limit'] === 'number' ? p['limit'] : undefined,
      )
    }

    if (capability === 'trading:orders') {
      const slot = getSlot(params)
      if (!slot) {
        // Name whichever spelling the caller used, so a wallet venue's
        // rejection does not talk about a credential the user never entered.
        const requested = slotIdOf(params)
        return {
          success: false,
          error: requested
            ? `Unknown ${venue.walletCredentials ? 'wallet' : 'credential'} '${requested}'`
            : venue.walletCredentials
              ? 'No wallet connected'
              : 'No credentials configured',
        }
      }

      venue.tradeGeoCheck?.(slot)

      const action = String(p['action'] ?? 'place')

      if (action === 'list') {
        const [open, history] = await Promise.all([
          trading.fetchOpenOrders(slot),
          trading.fetchOrderHistory(slot),
        ])
        return { open, history }
      }

      if (action === 'cancel') {
        const orderId = String(p['orderId'] ?? '')
        const pair = String(p['pair'] ?? slot.currentPair)
        return trading.cancelOrder(orderId, pair, slot)
      }

      const order: OrderParams = {
        market: venue.marketId,
        pair: String(p['pair'] ?? context.pair),
        side: String(p['side'] ?? 'buy') as 'buy' | 'sell',
        type: String(p['type'] ?? 'limit') as 'market' | 'limit',
        // Contracts, not a base-asset amount — one contract settles at 1 unit
        // of collateral if the outcome wins.
        size: String(p['size'] ?? '0'),
        price: p['price'] ? String(p['price']) : undefined,
        mode: slot.mode,
        clientOrderId: p['clientOrderId']
          ? String(p['clientOrderId'])
          : undefined,
      }
      return trading.placeOrder(order, slot)
    }

    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return []
      return trading.fetchBalances(slot)
    }

    if (capability === 'trading:positions') {
      const slot = getSlot(params)
      if (!slot) return { positions: [] }
      return trading.fetchPositions(slot)
    }

    throw new Error(
      `${venue.marketId}: unsupported execute capability '${capability}'`,
    )
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    const { capability, params: p, context } = params

    platformCheck()
    venue.geoCheck?.(context.country, capability)
    hub.setCountry(context.country)

    const pair = String(p['pair'] ?? context.pair)

    if (capability === 'market-data:candles') {
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      return hub.subscribeCandles(pair, timeframe, callback)
    }
    if (capability === 'market-data:ticker') {
      return hub.subscribeTicker(pair, callback)
    }
    if (capability === 'market-data:orderbook') {
      return hub.subscribeOrderbook(pair, callback)
    }
    if (capability === 'market-data:trades') {
      return hub.subscribeTrades(pair, callback)
    }

    // Neither venue streams private state the bridge can use: Kalshi has no
    // socket at all, and Polymarket's user channel needs the derived L2
    // credentials that only exist after a signed REST round trip. The
    // subscription is accepted and left quiet rather than refused, so the
    // terminal's order pane keeps its REST-driven refresh instead of
    // rendering the venue as unsupported.
    if (capability === 'trading:orders') {
      const slot = getSlot(params)
      if (!slot) return () => {}
      slot.orderCallback = callback
      return () => {
        slot.orderCallback = null
      }
    }
    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return () => {}
      slot.balanceCallback = callback
      return () => {
        slot.balanceCallback = null
      }
    }

    throw new Error(
      `${venue.marketId}: unsupported subscribe capability '${capability}'`,
    )
  }

  /**
   * Copy the venue's declared credential fields, or refuse the slot.
   *
   * Same fail-closed rule as the CEX shell: a missing required field produces
   * NO slot, which reads downstream as 'No credentials configured' rather than
   * as a signing failure at order time.
   */
  function buildFields(
    config: Record<string, unknown>,
  ): Record<string, string> | null {
    for (const { key, required } of venue.credentialKeys) {
      if (required && !config[key]) return null
    }
    const fields: Record<string, string> = {}
    for (const { key } of venue.credentialKeys) {
      fields[key] = String(config[key] ?? '')
    }
    return fields
  }

  function buildSlot(
    id: string,
    kind: PredictionSlot['kind'],
    fields: Record<string, string>,
    secretRef: PredictionSlot['secretRef'],
    config: Record<string, unknown>,
  ): PredictionSlot {
    return {
      id,
      kind,
      fields,
      secretRef,
      mode: (config['mode'] as 'paper' | 'live') ?? venue.defaultMode,
      country: config['country'] ? String(config['country']) : '',
      currentPair: '',
      orderCallback: null,
      balanceCallback: null,
    }
  }

  /**
   * Provision one credential.
   *
   * Two shapes reach this, and which one a venue gets is a property of the
   * venue rather than of the call: an API-key venue is provisioned from the
   * keychain with `credentialId` plus its declared fields, and a wallet venue
   * is provisioned the way the EVM DEX connectors are — `walletId`, `address`,
   * and a `getPrivateKey` accessor that reaches the vault on demand, so the
   * key itself never becomes part of a long-lived object.
   */
  async function initialize(config: Record<string, unknown>): Promise<void> {
    if (venue.walletCredentials) {
      // Fail closed: a wallet venue accepts ONLY the wallet shape. Falling
      // through to the key path would build a slot out of an empty
      // `credentialKeys` list — a slot that exists, resolves, and cannot sign.
      const walletId = config['walletId']
      const address = config['address']
      if (
        typeof walletId !== 'string' ||
        !walletId ||
        typeof address !== 'string' ||
        !address
      ) {
        return
      }
      const getKey =
        typeof config['getPrivateKey'] === 'function'
          ? (config['getPrivateKey'] as (id: string) => Promise<string | null>)
          : null
      slots.set(
        walletId,
        buildSlot(
          walletId,
          'wallet',
          { walletAddress: address },
          getKey ? () => getKey(walletId) : null,
          config,
        ),
      )
      return
    }

    const fields = buildFields(config)
    if (!fields) return

    const credentialId = config['credentialId']
      ? String(config['credentialId'])
      : undefined
    if (!credentialId) {
      // Legacy path: no id — update the first slot or create a default one.
      const first = slots.values().next()
      const id = first.done ? '__default__' : first.value.id
      slots.set(id, buildSlot(id, 'credential', fields, null, config))
      return
    }
    slots.set(
      credentialId,
      buildSlot(credentialId, 'credential', fields, null, config),
    )
  }

  async function destroy(): Promise<void> {
    slots.clear()
    await Promise.all([hub.destroy(), trading.destroy()])
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
    subscribe,
    initialize,
    destroy,
  }
}

/** The pair key for a Kalshi-style raw ticker, for callers building links. */
export function predictionPairKey(outcomeSymbol: string): string {
  return sanitizeOutcomeKey(outcomeSymbol)
}

function warn(marketId: string, scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[${marketId}] ${scope}: ${message}`)
}
