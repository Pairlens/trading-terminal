// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shared shell for CEX market connector plugins.
 *
 * Every CEX connector exposes the same plugin surface: one shared public WS
 * client for market data, a map of per-credential slots for private trading
 * state, and identical execute/subscribe capability dispatch. Only the
 * exchange-specific pieces vary — REST candle fetch, order-executor call
 * signatures, pair normalization, geo restrictions — and those come in
 * through the spec hooks below.
 */

import { PlatformRestrictedError } from '@pairlens/market-engine/errors'
import { isCorsConstrained } from '@pairlens/market-engine/platform'
import type {
  PluginCapabilityDeclaration,
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { OrderParams } from '@pairlens/market-engine/types'

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const STANDARD_CEX_CAPABILITIES = [
  { id: 'market-data:candles', streaming: true },
  { id: 'market-data:ticker', streaming: true },
  { id: 'market-data:orderbook', streaming: true },
  { id: 'market-data:history', streaming: false },
  { id: 'trading:orders', streaming: true },
  { id: 'trading:balances', streaming: true },
] as const

export type CexManifestOptions = {
  id: string
  name: string
  /** Display name used in the description, e.g. 'Kraken', 'Gate.io'. */
  displayName: string
  /** Overrides the generated 'Direct market data and trading via …' description. */
  description?: string
  marketId: string
  icon: string
  gradient: string
  abbr: string
  headerImage?: string
  /**
   * The connector places exchange-native trigger (TP/SL) orders when
   * OrderParams.trigger is set. Surfaces as MarketAdapterInfo.triggerOrders
   * in the terminal, which gates workflow stop-loss/take-profit routing.
   */
  triggerOrders?: boolean
  /**
   * The venue is unreachable from a browser build (no CORS headers on its
   * public REST, no candle history on its WS) and works only on desktop.
   *
   * The spec flag of the same name makes the CONNECTOR refuse; this one makes
   * the terminal SAY SO — it rides the manifest into MarketAdapterInfo, which
   * is what the venue picker and the workspace gate read. Both are needed:
   * without the manifest copy the venue looks ordinary right up until the
   * chart refuses.
   */
  requiresDesktop?: boolean
  /**
   * The connector implements `market-data:ticker-snapshot` (bulk 24h quotes
   * for every listed spot pair in one public REST call). Declared with
   * markets: ['*'] — the snapshot serves the whole app (markets scanner)
   * regardless of the active market, and the resolver's fallback chain
   * walks to the next venue when one is unreachable or geo-blocked.
   */
  tickerSnapshot?: boolean
  /**
   * The connector implements `market-data:trades` (public time and sales).
   *
   * Opt-in rather than standard because the capability is only correct once a
   * venue's aggressor-side semantics are pinned down — venues report the taker
   * and the maker side interchangeably, and a wrong mapping inverts every
   * buy/sell in the tape without failing loudly. A venue that hasn't been
   * verified declares nothing, and the terminal shows the tape as unsupported
   * there rather than showing it backwards.
   */
  trades?: boolean
}

export function createCexConnectorManifest(
  opts: CexManifestOptions,
): PluginManifest {
  return {
    id: opts.id,
    name: opts.name,
    version: '0.1.0',
    author: 'Pairlens',
    description:
      opts.description ??
      `Direct market data and trading via ${opts.displayName} exchange APIs`,
    homepage: 'https://pairlens.finance',
    icon: opts.icon,
    capabilities: [
      ...STANDARD_CEX_CAPABILITIES.map(
        (cap): PluginCapabilityDeclaration => ({
          id: cap.id,
          singleton: false,
          markets: [opts.marketId],
          priority: 1,
          streaming: cap.streaming,
        }),
      ),
      ...(opts.tickerSnapshot
        ? [
            {
              id: 'market-data:ticker-snapshot',
              singleton: false,
              markets: ['*'],
              priority: 20,
              streaming: false,
            } satisfies PluginCapabilityDeclaration,
          ]
        : []),
      ...(opts.trades
        ? [
            {
              id: 'market-data:trades',
              singleton: false,
              markets: [opts.marketId],
              priority: 1,
              streaming: true,
            } satisfies PluginCapabilityDeclaration,
          ]
        : []),
    ],
    metadata: {
      family: 'cex-spot',
      assetClass: 'crypto-spot',
      gradient: opts.gradient,
      abbr: opts.abbr,
      logoUrl: opts.icon,
      ...(opts.headerImage ? { headerImage: opts.headerImage } : {}),
      ...(opts.triggerOrders ? { triggerOrders: true } : {}),
      ...(opts.requiresDesktop ? { requiresDesktop: true } : {}),
    },
    config: {},
  }
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

export type CexCredentials = Record<string, string>

/** Public market-data WS client — one shared instance per plugin. */
export interface CexPublicWsClient {
  subscribeCandles: (
    pair: string,
    timeframe: string,
    country: string,
    callback: (data: unknown) => void,
  ) => () => void
  subscribeTicker: (
    pair: string,
    country: string,
    callback: (data: unknown) => void,
  ) => () => void
  subscribeOrderbook: (
    pair: string,
    country: string,
    callback: (data: unknown) => void,
  ) => () => void
  /** Present only on venues whose manifest declares `trades`. */
  subscribeTrades?: (
    pair: string,
    country: string,
    callback: (data: unknown) => void,
  ) => () => void
  destroy: () => void
}

/**
 * Private WS client — one per credential slot.
 *
 * `destroy` is the only teardown on purpose. Every call site drops its
 * reference to the client immediately after, so a softer "stop but stay
 * reusable" variant could only ever leave unreachable state running; having
 * both is what let an authenticated socket outlive its slot.
 */
export interface CexPrivateWsClient<TCredentials extends CexCredentials> {
  connect: (
    credentials: TCredentials,
    country: string,
    paper: boolean,
    onOrderUpdate: (update: unknown) => void,
    onBalances: (balances: unknown) => void,
  ) => void
  destroy: () => void
}

/** Per-credential private state — one slot per provisioned credential. */
export type CexSlot<TCredentials extends CexCredentials = CexCredentials> = {
  id: string
  credentials: TCredentials
  mode: 'paper' | 'live'
  country: string
  privateWsClient: CexPrivateWsClient<TCredentials> | null
  orderCallback: ((data: unknown) => void) | null
  balanceCallback: ((data: unknown) => void) | null
  currentPair: string
}

export type CexConnectorSpec<TCredentials extends CexCredentials> = {
  /** Plugin id, used in error messages, e.g. 'kraken-market-connector'. */
  id: string
  marketId: string
  /**
   * Credential config keys copied into the slot. A slot is only created when
   * every `required` key is present; optional keys default to ''.
   */
  credentialKeys: Array<{ key: keyof TCredentials & string; required: boolean }>
  defaultMode: 'paper' | 'live'
  createWsClient: () => CexPublicWsClient
  createPrivateWsClient: () => CexPrivateWsClient<TCredentials>
  /**
   * Geo restriction check — throw GeoRestrictedError to block. Called at the
   * top of every execute() and subscribe() with the caller's country and the
   * requested capability; the spec decides which capabilities to gate.
   */
  geoCheck?: (country: string, capability: string) => void
  /**
   * Venue whose public REST host sends no `Access-Control-Allow-Origin` AND
   * whose WS carries no usable candle history — so it cannot work in a browser
   * build at all. Set it and the factory refuses up front with a
   * PlatformRestrictedError instead of letting the chart hang and then show a
   * single live candle. Desktop is unaffected: it reaches exchanges through the
   * Rust HTTP client, which is exempt from CORS.
   */
  requiresDesktop?: boolean
  /**
   * Geo restriction check for order execution, run after credential-slot
   * resolution with the slot's provisioned country — so a missing credential
   * still surfaces as 'No credentials configured' rather than a geo error.
   */
  tradeGeoCheck?: (slot: CexSlot<TCredentials>) => void
  fetchCandles: (
    pair: string,
    timeframe: string,
    limit: number,
    country: string,
    /**
     * Fetch candles strictly OLDER than this epoch-ms timestamp (exclusive).
     * Enables pan-left backfill and bar replay. Connectors that don't support
     * range queries may ignore it (they simply can't page further back).
     */
    endTs?: number,
  ) => Promise<unknown>
  /** Candle count for market-data:history when the caller passes no limit (default 300). */
  defaultHistoryLimit?: number
  /**
   * Bulk 24h quotes for every listed spot pair (one public REST call).
   * Required when the manifest declares `tickerSnapshot`.
   */
  fetchTickerSnapshot?: (country: string) => Promise<unknown>
  fetchOpenOrders: (slot: CexSlot<TCredentials>) => Promise<unknown>
  fetchOrderHistory: (slot: CexSlot<TCredentials>) => Promise<unknown>
  cancelOrder: (
    orderId: string,
    pair: string,
    slot: CexSlot<TCredentials>,
    /** trigger: the order is a resting trigger (TP/SL) order — venues
     * with a separate algo-order id space must cancel via their
     * trigger-order endpoint. */
    opts?: { trigger?: boolean },
  ) => Promise<unknown>
  /**
   * Place an order. The hook owns exchange-specific pair normalization and
   * must keep `slot.currentPair` up to date (some exchanges need the last
   * traded pair to scope order-history/cancel requests).
   */
  placeOrder: (
    order: OrderParams,
    slot: CexSlot<TCredentials>,
  ) => Promise<unknown>
  fetchBalances: (slot: CexSlot<TCredentials>) => Promise<unknown>
}

// ---------------------------------------------------------------------------
// Plugin shell
// ---------------------------------------------------------------------------

export function createCexConnectorPlugin<TCredentials extends CexCredentials>(
  spec: CexConnectorSpec<TCredentials>,
  manifest: PluginManifest,
): PluginInstance {
  // Shared public WS — market data doesn't need credentials
  let wsClient: CexPublicWsClient | null = null

  // Per-credential private state
  const slots = new Map<string, CexSlot<TCredentials>>()

  function getWsClient(): CexPublicWsClient {
    if (!wsClient) wsClient = spec.createWsClient()
    return wsClient
  }

  function getSlot(params: PluginExecuteParams): CexSlot<TCredentials> | null {
    const credId = params.params['credentialId'] as string | undefined
    // Fail closed: a provided-but-unknown credentialId must never fall
    // back to another slot — an order could hit the wrong account/mode.
    if (credId) return slots.get(credId) ?? null
    // Fallback: first slot (backward compat for callers that don't pass credentialId)
    const first = slots.values().next()
    return first.done ? null : first.value
  }

  /**
   * Refuse a venue the current build cannot reach. Mirrors geoCheck's placement
   * so both restrictions are decided in exactly one place per entry point.
   */
  function platformCheck(): void {
    if (spec.requiresDesktop && isCorsConstrained()) {
      // manifest.name is the human label ("KuCoin"), which reaches the user
      // verbatim wherever a pane renders the raw error message.
      throw new PlatformRestrictedError(manifest.name || spec.marketId)
    }
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p, context } = params

    platformCheck()
    spec.geoCheck?.(context.country, capability)

    if (capability === 'market-data:history') {
      const pair = String(p['pair'] ?? context.pair)
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      const limit =
        typeof p['limit'] === 'number'
          ? p['limit']
          : (spec.defaultHistoryLimit ?? 300)
      const endTs = typeof p['endTs'] === 'number' ? p['endTs'] : undefined
      return spec.fetchCandles(pair, timeframe, limit, context.country, endTs)
    }

    if (capability === 'market-data:ticker-snapshot') {
      if (!spec.fetchTickerSnapshot) {
        throw new Error(`${spec.id}: ticker snapshot not implemented`)
      }
      return spec.fetchTickerSnapshot(context.country)
    }

    if (capability === 'trading:orders') {
      const slot = getSlot(params)
      if (!slot) {
        return {
          success: false,
          error: p['credentialId']
            ? `Unknown credential '${String(p['credentialId'])}'`
            : 'No credentials configured',
        }
      }

      spec.tradeGeoCheck?.(slot)

      const action = String(p['action'] ?? 'place')

      if (action === 'list') {
        const [open, history] = await Promise.all([
          spec.fetchOpenOrders(slot),
          spec.fetchOrderHistory(slot),
        ])
        return { open, history }
      }

      if (action === 'cancel') {
        const orderId = String(p['orderId'] ?? '')
        const pair = String(p['pair'] ?? slot.currentPair)
        return spec.cancelOrder(
          orderId,
          pair,
          slot,
          p['trigger'] === true ? { trigger: true } : undefined,
        )
      }

      const rawTrigger = p['trigger'] as
        | { triggerPrice?: unknown; triggerType?: unknown }
        | undefined
      const triggerType: 'tp' | 'sl' | undefined =
        rawTrigger?.triggerType === 'tp' || rawTrigger?.triggerType === 'sl'
          ? rawTrigger.triggerType
          : undefined
      const trigger =
        rawTrigger?.triggerPrice && triggerType
          ? { triggerPrice: String(rawTrigger.triggerPrice), triggerType }
          : undefined

      const order: OrderParams = {
        market: spec.marketId,
        pair: String(p['pair'] ?? context.pair),
        side: String(p['side'] ?? 'buy') as 'buy' | 'sell',
        type: String(p['type'] ?? 'market') as 'market' | 'limit',
        size: String(p['size'] ?? '0'),
        price: p['price'] ? String(p['price']) : undefined,
        trigger,
        mode: slot.mode,
        tgtCcy: p['tgtCcy'] ? String(p['tgtCcy']) : undefined,
        clientOrderId: p['clientOrderId']
          ? String(p['clientOrderId'])
          : undefined,
      }
      return spec.placeOrder(order, slot)
    }

    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return []
      return spec.fetchBalances(slot)
    }

    throw new Error(
      `${spec.id}: unsupported execute capability '${capability}'`,
    )
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    const { capability, params: p, context } = params

    platformCheck()
    spec.geoCheck?.(context.country, capability)

    const pair = String(p['pair'] ?? context.pair)
    const country = context.country

    if (capability === 'market-data:candles') {
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      return getWsClient().subscribeCandles(pair, timeframe, country, callback)
    }

    if (capability === 'market-data:ticker') {
      return getWsClient().subscribeTicker(pair, country, callback)
    }

    if (capability === 'market-data:orderbook') {
      return getWsClient().subscribeOrderbook(pair, country, callback)
    }

    if (capability === 'market-data:trades') {
      const client = getWsClient()
      // Reachable only if the manifest declared `trades`, so a missing client
      // method is a connector wiring bug, not a runtime condition to absorb.
      if (!client.subscribeTrades) {
        throw new Error(
          `${spec.id}: declares market-data:trades but its WS client has no subscribeTrades`,
        )
      }
      return client.subscribeTrades(pair, country, callback)
    }

    if (capability === 'trading:orders') {
      const slot = getSlot(params)
      if (!slot) return () => {}
      if (!slot.privateWsClient) {
        slot.privateWsClient = spec.createPrivateWsClient()
      }
      slot.orderCallback = callback
      slot.privateWsClient.connect(
        slot.credentials,
        slot.country,
        slot.mode === 'paper',
        (update) => {
          slot.orderCallback?.(update)
        },
        (balances) => {
          slot.balanceCallback?.({ type: 'balance', balances })
        },
      )
      return () => {
        // destroy(), not a softer stop: the reference is dropped right after,
        // so anything the client still owns (socket, timers, wake-monitor
        // listener) would be unreachable and impossible to shut down later.
        slot.privateWsClient?.destroy()
        slot.privateWsClient = null
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
      `${spec.id}: unsupported subscribe capability '${capability}'`,
    )
  }

  function buildCredentials(
    config: Record<string, unknown>,
  ): TCredentials | null {
    for (const { key, required } of spec.credentialKeys) {
      if (required && !config[key]) return null
    }
    const credentials: CexCredentials = {}
    for (const { key } of spec.credentialKeys) {
      credentials[key] = String(config[key] ?? '')
    }
    return credentials as TCredentials
  }

  function buildSlot(
    id: string,
    credentials: TCredentials,
    config: Record<string, unknown>,
  ): CexSlot<TCredentials> {
    return {
      id,
      credentials,
      mode: (config['mode'] as 'paper' | 'live') ?? spec.defaultMode,
      country: config['country'] ? String(config['country']) : '',
      privateWsClient: null,
      orderCallback: null,
      balanceCallback: null,
      currentPair: '',
    }
  }

  async function initialize(config: Record<string, unknown>): Promise<void> {
    const credentialId = config['credentialId']
      ? String(config['credentialId'])
      : undefined

    // Legacy path: no credentialId — update first slot or create a default one
    if (!credentialId) {
      const first = slots.values().next()
      const id = first.done ? '__default__' : first.value.id
      const credentials = buildCredentials(config)
      if (credentials) {
        slots.set(id, buildSlot(id, credentials, config))
      }
      return
    }

    const credentials = buildCredentials(config)
    if (!credentials) return

    const existing = slots.get(credentialId)
    if (existing) existing.privateWsClient?.destroy()

    slots.set(credentialId, buildSlot(credentialId, credentials, config))
  }

  async function destroy(): Promise<void> {
    wsClient?.destroy()
    wsClient = null
    for (const slot of slots.values()) {
      slot.privateWsClient?.destroy()
    }
    slots.clear()
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
