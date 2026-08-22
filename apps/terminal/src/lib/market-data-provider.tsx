// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { StreamThrottle } from '@pairlens/market-engine'
import { feedEventTs, latencyMonitor } from '@pairlens/market-engine/latency'
import { TIMEFRAMES, isTimeframe } from '@pairlens/shared/timeframe'
import { usePairlens } from './pairlens-provider'
import { getCountrySetting } from './region-settings'
import { streamHealth } from './stream-health'
import { setIndicatorHistorySource } from './indicators/request-data'
import { setBotOrderSource } from './bots/bot-order-source'
import { PositionLedger } from './risk/position-ledger'
import type { ThrottleMode, ThrottleStream } from '@pairlens/market-engine'
import type { Candle, Timeframe } from '@pairlens/shared/types'
import type {
  AssetClass,
  MarketAdapterInfo,
  WalletChain,
} from '@pairlens/market-engine/adapter'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderResult,
} from '@pairlens/market-engine/types'
import type {
  CapabilityId,
  PluginInstance,
  PluginLifecycleListener,
} from '@pairlens/plugin-system/types'
import type { TradeEventProps, TradeFailReason } from '@/lib/analytics-events'
import { clampTimeframeToVenue } from '@/lib/chart-timeframes'
import { getOrderEvents, upsertOrderEvent } from '@/stores/order-events-store'
import {
  clearBalancesForCredential,
  clearBalancesForScope,
  dexBalanceCredentialKey,
  getBalances,
  upsertBalance,
  venueBalanceCredentialKey,
} from '@/stores/balances-store'
import {
  USD_PEGGED,
  evaluatePositionSize,
  orderNotionalUsd,
  priceUsdFor,
} from '@/lib/risk/position-size'
import { isNftPairKey, normalizePairKey } from '@/lib/pairs'
import { resolveSolanaRpcEndpoint } from '@/lib/dex/solana-rpc'
import { contractSizeFor } from '@/lib/futures/contract-size'
import {
  balanceScopeFor,
  credentialAliasEntries,
  setCredentialAliasSource,
  setCredentialAliases,
} from '@/lib/venues/credential-alias'
import { track } from '@/lib/analytics-events'
import {
  CREDENTIAL_SCHEMAS,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { requireUnlockForTrade } from '@/lib/security/lock-store'
import {
  VaultSealedError,
  isVaultSealed,
} from '@/lib/security/vault/vault-errors'
import {
  isVaultEnrolled,
  isVaultUnlocked,
} from '@/lib/security/vault/vault-session'
import i18n from '@/lib/i18n'

export type MarketDataStatus = 'disconnected' | 'connecting' | 'connected'

// How long a speculative warmup (see warmupMarket) holds its streams open
// waiting for the user to complete the switch. Long enough to cover
// hover-then-decide, short enough that hovering the whole dropdown doesn't
// pin a dozen venue connections.
/**
 * Which asset class a pair key is about, when the market id alone cannot say.
 *
 * A market id used to be enough. It stopped being enough when NFTs arrived:
 * 'ethereum' is a DEX venue AND an NFT venue, both declare `trading:orders`
 * and `market-data:candles` on it, and the capability resolver keys on the
 * market alone. The DEX connector is the higher priority, and `trading:orders`
 * is side-effecting so there is no walk to a runner-up, which meant every NFT
 * order was handed to a swap router that split the contract address on a dash,
 * found no quote leg, and refused. The chart lost the same way, to a pool
 * resolver that answered an empty array rather than throwing.
 *
 * Undefined for everything else, which the resolver reads as "do not filter":
 * every venue that does not share its market id with another class resolves
 * exactly as it always did.
 */
function assetClassFor(pair: string): string | undefined {
  return isNftPairKey(pair) ? 'nft' : undefined
}

const WARMUP_TTL_MS = 15_000
/** Speculative streams open at once — hover sweeps must not fan out. */
const MAX_CONCURRENT_WARMUPS = 3

// ── Trade analytics (opt-in, privacy-bounded) ──
// Orders are described by venue/side/type/mode only — never by pair, size,
// or price. See the taxonomy in lib/analytics-events.ts.

function orderAnalyticsProps(params: Record<string, unknown>): TradeEventProps {
  const venue = String(params['market'] ?? '')
  const isDex = typeof params['walletId'] === 'string'
  const credentialId =
    typeof params['credentialId'] === 'string'
      ? params['credentialId']
      : undefined
  const cred = credentialId
    ? useCredentialsStore
        .getState()
        .credentials.find((c) => c.id === credentialId)
    : undefined
  const mode =
    params['mode'] === 'live' || params['mode'] === 'paper'
      ? params['mode']
      : isDex
        ? 'live'
        : (cred?.mode ?? 'paper')
  const type = String(params['type'] ?? 'market')
  const source = params['analyticsSource']
  return {
    venue,
    venue_kind: isDex
      ? 'dex'
      : CREDENTIAL_SCHEMAS[venue]?.kind === 'broker'
        ? 'broker'
        : 'cex',
    side:
      String(params['side'] ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy',
    order_type: params['trigger'] ? `trigger_${type}` : type,
    mode,
    source:
      source === 'copilot' || source === 'workflow' || source === 'basket'
        ? source
        : 'trade_panel',
  }
}

/**
 * The candle stream's one full-state frame: the connector's REST backfill,
 * emitted once per subscription. Distinct from an orderbook 'snapshot', which
 * is what every book frame is called.
 */
const isCandleSnapshot = (d: unknown): boolean =>
  (d as { type?: string })?.type === 'snapshot'

export function orderFailReason(err: unknown): TradeFailReason {
  // Typed before textual: a sealed vault is its own bucket, not an `auth`
  // failure. Filing it under `auth` would read in the funnel as "the venue
  // rejected their key", which is a completely different product problem.
  if (isVaultSealed(err)) return 'vault-sealed'
  const message = err instanceof Error ? err.message : String(err)
  const m = message.toLowerCase()
  if (m.includes('risk limit') || m.includes('locked')) return 'guardrail'
  if (
    m.includes('credential') ||
    m.includes('api key') ||
    m.includes('auth') ||
    m.includes('signature')
  ) {
    return 'auth'
  }
  if (m.includes('network') || m.includes('timeout') || m.includes('fetch')) {
    return 'network'
  }
  return 'unknown'
}

type MarketDataContextValue = {
  status: MarketDataStatus
  pluginsReady: boolean
  availableMarkets: Array<MarketAdapterInfo>
  getTimeframes: (market: string) => Array<string>
  getCapabilities: (market: string) => Array<string>
  subscribe: (
    market: string,
    pair: string,
    timeframe: string,
    cb: (data: unknown) => void,
  ) => () => void
  subscribeTicker: (
    market: string,
    pair: string,
    cb: (data: unknown) => void,
  ) => () => void
  subscribeOrderbook: (
    market: string,
    pair: string,
    cb: (data: unknown) => void,
  ) => () => void
  /**
   * Public trade feed. Not every venue provides one (see Trade.side on why
   * the capability is opt-in), so this resolves to a no-op unsubscribe when
   * the active market has no `market-data:trades` provider — pair it with
   * `hasCapability` to tell "no feed here" apart from "no trades yet".
   */
  subscribeTrades: (
    market: string,
    pair: string,
    cb: (data: unknown) => void,
  ) => () => void
  /**
   * Whether any active plugin provides `capability` for `market`.
   *
   * Distinct from `getCapabilities`, which reports the venue's adapter-level
   * read/trade role rather than plugin capability ids.
   */
  hasCapability: (capability: CapabilityId, market: string) => boolean
  /**
   * Speculatively pre-open the streams a switch to `market` would need
   * (candles, ticker, orderbook), so the actual switch finds a warm socket
   * and replays an already-fetched snapshot instead of paying the connect +
   * backfill latency. Safe to call on hover; releases itself after a TTL.
   */
  warmupMarket: (market: string, pair: string, timeframe: string) => void
  fetchHistory: (
    market: string,
    pair: string,
    timeframe: string,
    limit: number,
    /** Fetch candles strictly older than this epoch-ms timestamp. */
    endTs?: number,
  ) => Promise<Array<Candle>>
  /**
   * Ask ONE venue for candles, with no fallback to another provider — the
   * question is whether this venue carries this pair, so an answer from
   * anywhere else is worse than no answer. Returns null when the venue
   * declares no history capability of its own, meaning it can't be asked.
   */
  probeVenueHistory: (
    market: string,
    pair: string,
    timeframe: string,
    limit: number,
  ) => Promise<Array<Candle>> | null
  placeOrder: (params: Record<string, unknown>) => Promise<OrderResult>
  /**
   * The same risk guards, without the before-trade identity check.
   *
   * For orders that fire long after the person who authorized them walked
   * away — a workflow's stop-loss behind a `wait` step of up to 24 hours.
   * Nobody is there to answer a password prompt, and `requireUnlockForTrade`
   * resolves `false` outright on an already-locked terminal, so routing these
   * through `placeOrder` silently cancels the protective order and leaves a
   * live position naked. Same trade the bot runtime already makes: freezing
   * something mid-position is strictly more dangerous than the shoulder-surfing
   * the lock defends against. Callers gate the run itself, once, while the user
   * is still there.
   */
  placeUnattendedOrder: (
    params: Record<string, unknown>,
  ) => Promise<OrderResult>
  cancelOrder: (
    market: string,
    orderId: string,
    pair: string,
    credentialId?: string,
    /** Set for trigger (TP/SL) orders — routes to the venue's
     * trigger-order cancel endpoint where that differs. */
    opts?: { trigger?: boolean },
  ) => Promise<OrderResult>
  refreshWalletBalances: (
    market: string,
    walletId: string,
    pair?: string,
  ) => void
  streamVersion: number
  pauseStreams: () => void
  resumeStreams: () => void
  setThrottleMode: (mode: ThrottleMode) => void
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null)

/**
 * The list a CEX venue is assumed to serve when its manifest says nothing.
 * Every ccxt-bridge connector accepts all nine, so silence means "the usual".
 */
// The full shared union, in chart-toolbar order. This is the fallback for
// venues that declare no `metadata.timeframes`, and it must stay the FULL
// list: the toolbar now filters its chips by `supportedTimeframes`, so a
// shorter default here would silently remove 3d/1M from every CEX venue —
// a regression against the pre-declaration behavior where all eleven were
// offered everywhere.
const DEFAULT_TIMEFRAMES: Array<Timeframe> = TIMEFRAMES

/**
 * `metadata.timeframes`, validated against the shared `Timeframe` union.
 *
 * Load-bearing for prediction venues: Kalshi's OHLCV endpoint accepts three
 * intervals and 400s on the rest, so offering the CEX nine would draw an empty
 * chart and blame the network. A manifest that declares nothing, or declares
 * only strings outside the union, falls back to the CEX list rather than
 * leaving a venue with no timeframes at all.
 */
function readManifestTimeframes(value: unknown): Array<Timeframe> {
  if (!Array.isArray(value)) return DEFAULT_TIMEFRAMES
  const valid = value.filter(isTimeframe)
  return valid.length > 0 ? valid : DEFAULT_TIMEFRAMES
}

/** Exported for the manifest-walking test; not part of the provider's API. */
export function getConnectorAdapterInfo(
  plugin: PluginInstance,
): MarketAdapterInfo | null {
  // A market venue plugin declares at least one market-specific (non-wildcard)
  // candles or discovery capability. Wildcard providers are data sources, not venues.
  const venueCapabilities = plugin.manifest.capabilities.filter(
    (c) =>
      (c.id === 'market-data:candles' || c.id === 'market-data:discovery') &&
      c.markets.length > 0 &&
      !c.markets.includes('*'),
  )
  if (venueCapabilities.length === 0) return null

  const marketId =
    venueCapabilities[0].markets[0] ??
    plugin.manifest.id.replace(/-(?:market|dex)-connector$/, '')

  const meta = plugin.manifest.metadata
  const rawAssetClass = meta?.['assetClass']
  const assetClass = (
    typeof rawAssetClass === 'string' ? rawAssetClass : 'crypto-spot'
  ) as AssetClass
  // First declared family only: this shape feeds every UI surface that reads
  // a venue's wallet chain as a single string. A dual-family manifest (the
  // bridge) never reaches here today because it declares no venue capability,
  // but an array must not be castable into a string field if one ever does.
  const walletChain = manifestWalletChains(meta)[0] as WalletChain | undefined
  const dexLimitOrders = meta?.['dexLimitOrders'] === true
  const triggerOrders = meta?.['triggerOrders'] === true
  // Prediction venues: Kalshi refuses a priceless order outright, so the
  // ticket has to know before the submit rather than after the rejection.
  const rawMarketOrders = meta?.['marketOrders']
  const marketOrders =
    rawMarketOrders === 'none' || rawMarketOrders === 'native'
      ? rawMarketOrders
      : undefined
  // One fact, so one answer: a venue that declares only `marketOrders: 'none'`
  // is limit-only whether or not it also set the flag, and the two can never
  // disagree for whichever surface happens to read the other field.
  const limitOnly = meta?.['limitOnly'] === true || marketOrders === 'none'
  // Declared by the four venues a browser cannot reach (see the connector
  // spec's requiresDesktop). It has to come off the MANIFEST rather than the
  // connector's exported adapter info, because that export is never read —
  // this function builds MarketAdapterInfo from the manifest alone.
  const requiresDesktop = meta?.['requiresDesktop'] === true
  // Same manifest-only reasoning as `requiresDesktop`: the panes need to know
  // a venue has no public feed BEFORE any subscribe is attempted, and the
  // adapter that would tell them is exactly the thing that cannot start.
  const credentialedMarketData = meta?.['credentialedMarketData'] === true

  // Perpetual-futures venues: how far the leverage selector may go. Validated
  // the way `marketOrders` is — a nonsense value is dropped rather than handed
  // to a control that would build a slider out of it, because "max leverage
  // NaN" is how a ticket ends up offering 0x or Infinity.
  const rawMaxLeverage = meta?.['maxLeverage']
  const maxLeverage =
    typeof rawMaxLeverage === 'number' &&
    Number.isFinite(rawMaxLeverage) &&
    rawMaxLeverage > 0
      ? rawMaxLeverage
      : undefined

  const hasTradingCap = plugin.manifest.capabilities.some(
    (c) => c.id === 'trading:orders',
  )

  return {
    marketId,
    displayName: plugin.manifest.name
      .replace(' Market Connector', '')
      .replace(' DEX Connector', ''),
    assetClasses: [assetClass],
    capabilities: hasTradingCap ? ['read', 'trade'] : ['read'],
    credentialSchema: [],
    iconUrl: plugin.manifest.icon,
    supportedTimeframes: readManifestTimeframes(meta?.['timeframes']),
    walletChain,
    dexLimitOrders,
    triggerOrders,
    limitOnly,
    ...(marketOrders ? { marketOrders } : {}),
    ...(maxLeverage !== undefined ? { maxLeverage } : {}),
    requiresDesktop,
    credentialedMarketData,
  }
}

/**
 * The wallet families a manifest asks to be provisioned with.
 *
 * Almost every connector signs on one chain family and declares a bare string.
 * A connector that spans two declares an array, and the bridge is the reason a
 * connector ever would: a transfer out of Solana into Base needs the Solana key
 * to sign the send AND the EVM address to receive it, and no single-family
 * manifest can ask for both. Normalising here keeps the provisioning loop one
 * comparison, and a manifest declaring neither shape gets no wallet at all
 * rather than a coerced one.
 */
export function manifestWalletChains(
  metadata: Record<string, unknown> | undefined,
): Array<string> {
  const declared = metadata?.['walletChain']
  if (typeof declared === 'string') return [declared]
  if (!Array.isArray(declared)) return []
  return declared.filter((chain): chain is string => typeof chain === 'string')
}

/**
 * Every installed connector one credential provisions.
 *
 * Historically exactly one: `${market}-market-connector`. A futures venue may
 * also declare `metadata.credentialAlias` naming the SPOT venue whose key it
 * shares — Binance Futures rides the Binance key, KuCoin Futures the KuCoin
 * one — so a single entry in Accounts lights up both. Two connector slots and
 * two authenticated instances, unavoidably, but one thing for the user to
 * paste. Kraken Futures deliberately declares no alias: its API keys are
 * issued separately from spot Kraken's, so it carries its own credential
 * schema instead.
 */
function connectorsForCredential(
  installed: Array<PluginInstance>,
  market: string,
): Array<PluginInstance> {
  const primaryId = `${market}-market-connector`
  return installed.filter(
    (p) =>
      p.manifest.id === primaryId ||
      p.manifest.metadata?.['credentialAlias'] === market,
  )
}

/** Map a normalized connector order update into the local order journal. */
function recordOrderEvent(
  order: NormalizedOrderUpdate,
  market: string,
  mode: 'paper' | 'live',
) {
  upsertOrderEvent({
    orderId: order.orderId,
    market,
    pair: order.pair,
    side: order.side,
    type: order.type,
    size: order.size,
    price: order.price,
    fillSize: order.fillSize,
    avgPrice: order.avgPrice,
    mode,
    status: order.status,
    fee: order.fee,
    feeCcy: order.feeCcy,
    ts: order.ts,
    ...(order.triggerOrder ? { triggerOrder: true } : {}),
    ...(order.triggerPrice ? { triggerPrice: order.triggerPrice } : {}),
  })
}

// ── maxPositionSize enforcement helpers ─────────────────────────────
// The mux caches the latest ticker per (market, pair) for every stream that
// is already running — placeOrder reads those snapshots so risk math never
// adds subscriptions or per-tick work of its own.

type CachedStreamEntry = { cached: unknown }

function tickerLastFromCache(cached: unknown): number | null {
  const last = (cached as { ticker?: { last?: number } } | undefined)?.ticker
    ?.last
  return typeof last === 'number' && Number.isFinite(last) && last > 0
    ? last
    : null
}

/** Build a currency→USD price map from every cached ticker snapshot. */
function collectPricesUsd(
  mux: Map<string, CachedStreamEntry>,
): Map<string, number> {
  const prices = new Map<string, number>()
  for (const [key, entry] of mux) {
    if (!key.startsWith('ticker:')) continue
    const pair = key.split(':')[2]
    if (!pair) continue
    const last = tickerLastFromCache(entry.cached)
    if (last == null) continue
    const [base, quote] = pair.toUpperCase().split('-')
    if (!base || !quote) continue
    if (USD_PEGGED.has(quote)) {
      if (!prices.has(base)) prices.set(base, last)
    } else if (USD_PEGGED.has(base)) {
      // Inverted pairs (e.g. USDT-EUR) price the quote currency in USD.
      if (!prices.has(quote)) prices.set(quote, 1 / last)
    }
  }
  return prices
}

/** Latest cached last price for one (market, pair) ticker stream, if any. */
function cachedLastPrice(
  mux: Map<string, CachedStreamEntry>,
  market: string,
  pair: string,
): number | null {
  const entry = mux.get(`ticker:${market}:${normalizePairKey(pair)}`)
  return entry ? tickerLastFromCache(entry.cached) : null
}

/** USD portfolio value of the balances held under one credential scope. */
function portfolioValueUsdFor(
  scope: string | undefined,
  prices: Map<string, number>,
): number {
  let total = 0
  for (const b of getBalances()) {
    if (scope && b.credentialId !== scope) continue
    total += Number(b.total) * (priceUsdFor(b.currency, prices) ?? 0)
  }
  return total
}

type MarketDataProviderProps = {
  children: React.ReactNode
}

/** What one (credential, connector) pair currently holds open. */
type ProvisionSlot = {
  signature: string
  /** The balance namespace this connector writes to. */
  balanceScope: string
  unsubs: Array<() => void>
}

export function MarketDataProvider({ children }: MarketDataProviderProps) {
  const { pluginManager, pluginsReady, pluginStateVersion } = usePairlens()
  // Registered during render, not from the effect below: every consumer of the
  // alias map is a DESCENDANT of this provider, so their first render lands
  // before any effect here could have filled it, and a cold map answers "no
  // account here" for a venue the user has already connected.
  setCredentialAliasSource(() =>
    credentialAliasEntries(pluginManager.getActivePlugins()),
  )
  const [availableMarkets, setAvailableMarkets] = useState<
    Array<MarketAdapterInfo>
  >([])
  /**
   * The venue table, readable from a callback without becoming a dependency
   * of one. `subscribe` is memoized on `[pluginManager, multiplex]` on
   * purpose — taking `availableMarkets` as a dep would rebuild every stream
   * closure each time a plugin activates.
   */
  const adaptersRef = useRef<Array<MarketAdapterInfo>>(availableMarkets)
  adaptersRef.current = availableMarkets

  /**
   * The venue's own interval, for a caller who asked for one it does not
   * serve. Every path out of this provider that names a timeframe goes
   * through here, because the alternative was a per-consumer fix: the chart
   * had one, and the keyboard shortcuts, the copilot's `get_candles` and the
   * indicator workbench's `request.security` each found their own way to a
   * venue that answers 400. A prediction venue serves three or four intervals
   * where a CEX serves eleven.
   *
   * It never writes anything back. What the user chose stays chosen — leaving
   * the venue restores it — so this is a translation at the wire, not a
   * correction of intent.
   */
  const clampForMarket = useCallback(
    (market: string, timeframe: string): string =>
      clampTimeframeToVenue(
        timeframe,
        adaptersRef.current.find((m) => m.marketId === market)
          ?.supportedTimeframes ?? [],
      ),
    [],
  )

  const throttleRef = useRef(new StreamThrottle())
  const pausedRef = useRef(false)
  const activeUnsubs = useRef<Set<() => void>>(new Set())
  // Session-scoped average-cost ledger that turns observed fills into realized
  // PnL, feeding the daily-loss risk guard (spot exchanges don't report PnL).
  const positionLedgerRef = useRef(new PositionLedger())

  // Derive available markets from active connector plugins
  const refreshMarkets = useCallback(() => {
    const markets: Array<MarketAdapterInfo> = []
    // Same pass, same manifests, same resolved market id: which venue borrows
    // which venue's credential is collected here so that a lookup anywhere
    // else is always at least as fresh as the venue table rendered beside it.
    const aliases: Array<[string, string]> = []
    for (const p of pluginManager.getActivePlugins()) {
      const info = getConnectorAdapterInfo(p)
      if (!info) continue
      markets.push(info)
      const alias = p.manifest.metadata?.['credentialAlias']
      if (typeof alias === 'string' && alias.length > 0) {
        aliases.push([info.marketId, alias])
      }
    }
    setCredentialAliases(aliases)
    setAvailableMarkets(markets)
  }, [pluginManager])

  /**
   * credentialId → pluginId → what that connector currently holds.
   *
   * Two levels, because one credential now provisions more than one connector
   * and they come and go independently: a futures connector can be disabled in
   * the Plugin Store while its spot sibling keeps streaming from the same key.
   * Flat, the teardown for either took both down.
   *
   * The signature is everything the connector reads at initialize that decides
   * routing. Not a plain "provisioned" flag: a credential can be EDITED in
   * place (its account entity, its mode, a rotated key), and keyed by identity
   * alone that edit would sit in the store while every order kept going to the
   * old endpoint until a reload. It carries no secret the store does not
   * already hold in memory.
   *
   * `balanceScope` rides along because teardown has to clear the namespace
   * this connector wrote to, and for an aliased venue that is not the bare
   * credential id.
   */
  const provisionedRef = useRef(new Map<string, Map<string, ProvisionSlot>>())

  /** Drop one connector's streams and balances; nothing else the key reaches. */
  const teardownPlugin = useCallback((credId: string, pluginId: string) => {
    const byPlugin = provisionedRef.current.get(credId)
    const entry = byPlugin?.get(pluginId)
    if (!byPlugin || !entry) return
    for (const unsub of entry.unsubs) unsub()
    byPlugin.delete(pluginId)
    if (byPlugin.size === 0) provisionedRef.current.delete(credId)
    // A venue that borrows this key records its balances under its OWN
    // namespace (a futures margin balance is not the spot balance), and until
    // this cleared them a disabled futures connector left stale margin figures
    // on screen with nothing behind them.
    clearBalancesForScope(entry.balanceScope)
  }, [])

  // Listen for plugin lifecycle events
  useEffect(() => {
    refreshMarkets() // initial scan

    const listener: PluginLifecycleListener = {
      onActivated: () => refreshMarkets(),
      onDeactivated: (pluginId) => {
        refreshMarkets()
        // Only THIS plugin's streams. A credential now provisions more than
        // one connector, and tearing down the whole credential took the
        // surviving sibling's order and balance sockets down with it, with
        // nothing to wire them back: the provisioning effect skips a
        // credential whose signature it already holds. Dropping the entry
        // per plugin is what lets the effect re-provision exactly the one
        // that came back.
        for (const credId of [...provisionedRef.current.keys()]) {
          teardownPlugin(credId, pluginId)
        }
        // Clean up wallet provision keys for deactivated plugin
        for (const key of walletProvisionedRef.current) {
          if (key.endsWith(`:${pluginId}`)) {
            walletProvisionedRef.current.delete(key)
          }
        }
      },
      onUninstalled: () => refreshMarkets(),
    }
    pluginManager.addLifecycleListener(listener)
    return () => pluginManager.removeLifecycleListener(listener)
  }, [pluginManager, refreshMarkets, teardownPlugin])

  // Auto-provision ALL credentials to their connector plugins.
  // Each credential gets its own private WS connection for order updates
  // and balance streaming.
  const credentials = useCredentialsStore((s) => s.credentials)
  const credentialsLoaded = useCredentialsStore((s) => s.loaded)
  const loadCredentials = useCredentialsStore((s) => s.load)

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  useEffect(() => {
    if (!credentialsLoaded || !pluginsReady) return

    const currentIds = new Set(credentials.map((c) => c.id))

    /** Everything the connector reads at initialize that decides routing. */
    const signatureOf = (cred: (typeof credentials)[number]) =>
      `${cred.market}|${cred.mode}|${cred.entity ?? ''}|${cred.apiKey}`

    // Deprovision removed credentials. The balance clear is by credential
    // rather than by scope: every venue this key reached goes with it, and the
    // credential is already out of the store, so its aliases cannot be derived
    // from it any more.
    for (const [id, byPlugin] of [...provisionedRef.current]) {
      if (currentIds.has(id)) continue
      for (const entry of byPlugin.values()) {
        for (const unsub of entry.unsubs) unsub()
      }
      provisionedRef.current.delete(id)
      clearBalancesForCredential(id)
    }

    for (const cred of credentials) {
      const signature = signatureOf(cred)
      const connectors = connectorsForCredential(
        pluginManager.getInstalledPlugins(),
        cred.market,
      ).filter((p) => p.initialize)
      const byPlugin =
        provisionedRef.current.get(cred.id) ?? new Map<string, ProvisionSlot>()

      // A connector that no longer serves this credential (uninstalled, or the
      // credential's own market was edited) keeps neither its streams nor its
      // balances.
      const serving = new Set(connectors.map((p) => p.manifest.id))
      for (const pluginId of [...byPlugin.keys()]) {
        if (!serving.has(pluginId)) teardownPlugin(cred.id, pluginId)
      }
      if (connectors.length === 0) continue

      for (const plugin of connectors) {
        if (byPlugin.get(plugin.manifest.id)?.signature === signature) continue

        // The venue this connector IS, which for an aliased futures venue is
        // not `cred.market`. Everything downstream is scoped by it: the
        // capability context that decides which plugin answers, the market
        // stamped on order journal entries, and the balance namespace.
        const venueMarket =
          getConnectorAdapterInfo(plugin)?.marketId ?? cred.market
        const aliased = venueMarket !== cred.market

        // An edited credential is re-provisioned, not provisioned twice: drop
        // the sockets opened against the previous endpoint first. The connector
        // destroys the old private WS itself when the slot is rebuilt, but the
        // unsub closures held here would otherwise leak and double-subscribe.
        // Before the paper check below, not after, so that switching a
        // credential to paper actually CLOSES a live-mode alias connector
        // rather than leaving it streaming under a stale signature.
        teardownPlugin(cred.id, plugin.manifest.id)

        // A venue with no sandbox of its own cannot serve a paper account, and
        // the alias fan-out would otherwise provision it against the venue's
        // PRODUCTION host from a credential the user labelled paper. Nothing
        // to show for that venue in paper mode is the honest outcome; real
        // money behind a paper label is not. The primary connector is
        // unaffected: `mode` is its own credential's, chosen deliberately.
        if (
          aliased &&
          cred.mode === 'paper' &&
          plugin.manifest.metadata?.['paperTrading'] === false
        ) {
          continue
        }

        const entry: ProvisionSlot = {
          signature,
          balanceScope: aliased
            ? venueBalanceCredentialKey(cred.id, venueMarket)
            : cred.id,
          unsubs: [],
        }
        const slots =
          provisionedRef.current.get(cred.id) ??
          new Map<string, ProvisionSlot>()
        slots.set(plugin.manifest.id, entry)
        provisionedRef.current.set(cred.id, slots)

        provisionConnector(plugin, cred, venueMarket, entry)
      }
    }

    /** One connector, one credential — initialize, then wire its streams. */
    function provisionConnector(
      plugin: PluginInstance,
      cred: (typeof credentials)[number],
      venueMarket: string,
      slot: ProvisionSlot,
    ): void {
      const { balanceScope } = slot
      plugin.initialize!({
        ...plugin.config,
        credentialId: cred.id,
        apiKey: cred.apiKey,
        apiSecret: cred.apiSecret,
        passphrase: cred.passphrase ?? '',
        // Account-entity override (e.g. OKX) — the connector routes this
        // credential's calls to its home entity instead of by country.
        entity: cred.entity ?? '',
        mode: cred.mode,
        country: getCountrySetting(),
      })
        .then(() => {
          // A teardown that landed while `initialize` was in flight — a second
          // credential edit, or the connector being disabled — already dropped
          // this slot. Wiring it now would open sockets that nothing holds an
          // unsubscribe for.
          if (
            provisionedRef.current.get(cred.id)?.get(plugin.manifest.id) !==
            slot
          ) {
            return
          }

          // Connectors whose MARKET DATA needs credentials (Alpaca: no public
          // feed) are subscribed to before the vault is unlocked, so their
          // first subscribe threw and the pane has been spinning ever since.
          // Nothing else re-runs those effects — unlocking a vault is not a
          // pair, venue or timeframe change — so bump the version the stream
          // hooks already watch for pause/resume and let them re-subscribe.
          // Gated on the flag so unlocking a vault does NOT tear down and
          // refetch every crypto chart, whose data never needed a key.
          if (plugin.manifest.metadata?.['credentialedMarketData'] === true) {
            setStreamVersion((v) => v + 1)
          }

          const unsubs: Array<() => void> = []

          pluginManager.setContext({
            market: venueMarket,
            mode: cred.mode as 'paper' | 'live',
            country: getCountrySetting(),
          })

          // Start private WS for real-time order updates
          try {
            const unsub = pluginManager.subscribe(
              'trading:orders',
              { credentialId: cred.id },
              (data) => {
                const order = data as NormalizedOrderUpdate
                if (!order?.orderId) return
                recordOrderEvent(
                  order,
                  venueMarket,
                  cred.mode as 'paper' | 'live',
                )

                // Feed realized PnL from this fill into the daily-loss guard.
                // Only live-stream fills are counted — REST history backfill is
                // excluded so prior days don't re-realize on every session.
                const realized = positionLedgerRef.current.applyFill(
                  order.orderId,
                  order.pair,
                  order.side,
                  Number(order.fillSize) || 0,
                  Number(order.avgPrice) || 0,
                )
                if (realized !== 0) {
                  useRiskConfigStore.getState().addPnl(realized)
                  useRiskConfigStore.getState().checkAndLock()
                }
              },
            )
            unsubs.push(unsub)
          } catch {
            // Plugin doesn't support streaming trading:orders
          }

          // REST backfill — fetch open orders + history
          pluginManager
            .execute('trading:orders', {
              action: 'list',
              credentialId: cred.id,
            })
            .then((result) => {
              const r = result as {
                open?: Array<NormalizedOrderUpdate>
                history?: Array<NormalizedOrderUpdate>
              }
              const orders = [
                ...(Array.isArray(r?.open) ? r.open : []),
                ...(Array.isArray(r?.history) ? r.history : []),
              ]
              for (const order of orders) {
                if (!order.orderId) continue
                recordOrderEvent(
                  order,
                  venueMarket,
                  cred.mode as 'paper' | 'live',
                )
              }
            })
            .catch((err) =>
              console.warn(
                `[market-data] Order history backfill failed for ${venueMarket}:`,
                err,
              ),
            )

          // REST backfill — fetch account balances
          fetchBalancesForCredential(venueMarket, cred.id, balanceScope)

          // Subscribe to real-time balance updates via private WS
          try {
            const unsub = pluginManager.subscribe(
              'trading:balances',
              { credentialId: cred.id },
              (data) => {
                const d = data as {
                  type: string
                  balances: Array<NormalizedBalance>
                }
                if (d?.type !== 'balance' || !Array.isArray(d.balances)) return
                for (const b of d.balances) {
                  upsertBalance({
                    currency: b.currency,
                    available: b.available,
                    frozen: b.frozen,
                    total: b.total,
                    market: venueMarket,
                    credentialId: balanceScope,
                    updatedAt: Date.now(),
                  })
                }
              },
            )
            unsubs.push(unsub)
          } catch {
            // Plugin doesn't support streaming trading:balances
          }

          // Into this connector's own slot, which was created empty for THIS
          // provisioning. Appending to a per-credential list is what let two
          // rapid credential edits leave the first edit's subscription live
          // alongside the second's.
          slot.unsubs.push(...unsubs)
        })
        .catch((err) =>
          console.warn(
            `[market-data] Credential provisioning failed for ${venueMarket}:`,
            err,
          ),
        )
    }
    // `pluginStateVersion` is what re-runs this after a connector is enabled
    // or disabled in the Plugin Store. Without it the teardown above was
    // one-way: the deactivated plugin's slot was dropped and nothing ever
    // provisioned it again, so re-enabling a connector left it authenticated
    // by nothing until a reload.
  }, [
    credentials,
    credentialsLoaded,
    pluginsReady,
    pluginManager,
    pluginStateVersion,
    teardownPlugin,
  ])

  // ── Wallet provisioning (DEX) ───────────────────────────────────────
  // For each crypto wallet, find all active DEX plugins that match its
  // chain and initialize them with the wallet's address.
  const wallets = useWalletsStore((s) => s.wallets)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const loadWallets = useWalletsStore((s) => s.load)
  const getPrivateKey = useWalletsStore((s) => s.getPrivateKey)
  const walletProvisionedRef = useRef(new Set<string>())

  // Fetch on-chain balances for a DEX wallet on one market. Records are
  // namespaced per (wallet, market) — the same wallet holds independent
  // balances on every chain. `pair` ensures the on-screen pair's tokens are
  // included in the scan.
  const refreshWalletBalances = useCallback(
    (market: string, walletId: string, pair?: string) => {
      pluginManager.setContext({ market, country: getCountrySetting() })
      pluginManager
        .execute('trading:balances', {
          walletId,
          ...(pair ? { pair } : {}),
        })
        .then((result) => {
          const records = result as Array<NormalizedBalance>
          if (!Array.isArray(records)) return
          const credentialKey = dexBalanceCredentialKey(walletId, market)
          clearBalancesForCredential(credentialKey)
          for (const b of records) {
            upsertBalance({
              currency: b.currency,
              available: b.available,
              frozen: b.frozen,
              total: b.total,
              market,
              credentialId: credentialKey,
              updatedAt: Date.now(),
            })
          }
        })
        .catch((err) =>
          console.warn(
            `[market-data] DEX balance fetch failed for ${market}:`,
            err,
          ),
        )
    },
    [pluginManager],
  )

  useEffect(() => {
    loadWallets()
  }, [loadWallets])

  // ── Solana RPC endpoint (DEX) ───────────────────────────────────────
  // Solana connectors take an `rpcUrl` and default to the public node, which
  // sheds load with a bare 403 and reads downstream as an empty wallet. The
  // endpoint comes from the `rpc:solana` capability instead, so a user's own
  // key reaches balances, LP reads AND swap submission through one setting.
  //
  // Deliberately not folded into the wallet loop below: the connector has to
  // know its endpoint whether or not a wallet is connected, and re-resolving on
  // `pluginStateVersion` is what applies a key the user just enrolled without
  // a reload. The ref makes it idempotent — an unchanged URL re-initializes
  // nothing.
  const solanaRpcRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pluginsReady) return
    let cancelled = false
    void resolveSolanaRpcEndpoint(pluginManager).then((endpoint) => {
      if (cancelled || !endpoint) return
      if (endpoint.url === solanaRpcRef.current) return
      solanaRpcRef.current = endpoint.url
      for (const plugin of pluginManager.getActivePlugins()) {
        const chains = manifestWalletChains(plugin.manifest.metadata)
        if (!chains.includes('solana')) continue
        if (!plugin.initialize) continue
        // Endpoint only. No wallet id, no key accessor — a connector's existing
        // slots keep the accessor they were provisioned with.
        plugin.initialize({ rpcUrl: endpoint.url }).catch((err) => {
          console.warn(
            `[market-data] Solana RPC wiring failed for ${plugin.manifest.id}:`,
            err,
          )
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [pluginsReady, pluginManager, pluginStateVersion])

  useEffect(() => {
    if (!walletsLoaded || !pluginsReady) return

    const currentIds = new Set(wallets.map((w) => w.id))

    // Deprovision removed wallets
    for (const key of walletProvisionedRef.current) {
      const walletId = key.split(':')[0]
      if (!currentIds.has(walletId)) {
        walletProvisionedRef.current.delete(key)
      }
    }

    // Provision each wallet to ALL matching DEX plugins
    const active = pluginManager.getActivePlugins()
    for (const wallet of wallets) {
      for (const plugin of active) {
        const provisionKey = `${wallet.id}:${plugin.manifest.id}`
        if (walletProvisionedRef.current.has(provisionKey)) continue

        // A connector may declare one wallet family or several: the bridge asks
        // for both the EVM and the Solana key, because a transfer that crosses
        // families needs one to sign and the other to receive.
        const chains = manifestWalletChains(plugin.manifest.metadata)
        if (!chains.includes(wallet.chain)) continue
        if (!plugin.initialize) continue

        walletProvisionedRef.current.add(provisionKey)

        plugin
          .initialize({
            walletId: wallet.id,
            address: wallet.address,
            chain: wallet.chain,
            // Scope the key accessor to THIS wallet only. Connector plugins
            // are third-party code — an unrestricted accessor would let a
            // malicious plugin enumerate wallet ids and exfiltrate every
            // wallet's private key. Fail closed on any other id.
            getPrivateKey: (id: string) => {
              if (id !== wallet.id) {
                console.warn(
                  `[market-data] Plugin ${plugin.manifest.id} requested key for unprovisioned wallet '${id}' — denied`,
                )
                return Promise.resolve(null)
              }
              // Deliberately NOT wrapped in a catch: a sealed vault throws out
              // of here, and the plugin has to see a failure. Collapsing it
              // into the `null` above would be indistinguishable from the deny
              // path and the swap would look like "this wallet has no key".
              return getPrivateKey(id)
            },
          })
          .then(() => {
            const marketId = getConnectorAdapterInfo(plugin)?.marketId
            if (!marketId) return
            // Seed on-chain balances so the portfolio shows holdings before
            // the user ever opens a trade panel for this venue.
            refreshWalletBalances(marketId, wallet.id)
            // Backfill resting limit orders (Jupiter Trigger / KyberSwap LO)
            // into the orders pane — mirrors the credential REST backfill.
            pluginManager.setContext({
              market: marketId,
              country: getCountrySetting(),
            })
            pluginManager
              .execute('trading:orders', {
                action: 'list',
                walletId: wallet.id,
              })
              .then((result) => {
                const r = result as {
                  open?: Array<NormalizedOrderUpdate>
                  history?: Array<NormalizedOrderUpdate>
                }
                const orders = [
                  ...(Array.isArray(r?.open) ? r.open : []),
                  ...(Array.isArray(r?.history) ? r.history : []),
                ]
                for (const order of orders) {
                  if (!order.orderId) continue
                  recordOrderEvent(order, marketId, 'live')
                }
              })
              .catch((err) =>
                console.warn(
                  `[market-data] Wallet order backfill failed for ${marketId}:`,
                  err,
                ),
              )
          })
          .catch((err) =>
            console.warn(
              `[market-data] Wallet provisioning failed for ${plugin.manifest.id}:`,
              err,
            ),
          )
      }
    }
  }, [
    wallets,
    walletsLoaded,
    pluginsReady,
    pluginManager,
    getPrivateKey,
    refreshWalletBalances,
  ])

  const status: MarketDataStatus =
    availableMarkets.length > 0 ? 'connected' : 'disconnected'

  const getTimeframes = useCallback(
    (market: string): Array<string> => {
      const info = availableMarkets.find((m) => m.marketId === market)
      return info?.supportedTimeframes ?? []
    },
    [availableMarkets],
  )

  const getCapabilities = useCallback(
    (market: string): Array<string> => {
      const info = availableMarkets.find((m) => m.marketId === market)
      return info?.capabilities ?? []
    },
    [availableMarkets],
  )

  // ── Subscription multiplexer ──────────────────────────────────────
  // Dedupe identical (channel, market, pair[, timeframe]) subscriptions into a
  // SINGLE underlying connector subscription and fan out to every caller.
  //
  // Without this, two callers wanting the same stream (e.g. the chart AND the
  // watchlist both wanting BTC-USDT's ticker) each call the connector's
  // subscribe — and most connectors key their subscriber map by pair, so the
  // second caller OVERWRITES the first's callback. Only the last subscriber
  // then receives updates; the other silently goes dark. That is why a chart on
  // a watchlisted pair stopped live-updating on every connector except OKX
  // (OKX is the only one that stored multiple callbacks per pair).
  const muxRef = useRef(
    new Map<
      string,
      {
        callbacks: Set<(data: unknown) => void>
        unsub: () => void
        throttled: ((data: unknown) => void) & { cancel: () => void }
        cached: unknown
      }
    >(),
  )

  const multiplex = useCallback(
    (
      key: string,
      channel: ThrottleStream,
      start: (dispatch: (data: unknown) => void) => () => void,
      shouldCache: (data: unknown) => boolean,
      cb: (data: unknown) => void,
      /**
       * Set only for streams whose payloads carry the venue's own emission
       * timestamp (today: trades). Passing it opts the stream into feed-age
       * latency sampling — see market-engine/latency for why this is the only
       * stream that qualifies.
       */
      feedVenue?: string,
      /**
       * Frames that must reach consumers even when a live update lands in the
       * same throttle window. Only the candle stream passes one: its
       * `snapshot` is the venue's REST backfill, it arrives once, and the
       * throttle's queue is lossy (see StreamThrottle.wrap). An orderbook
       * frame is a snapshot every time, so it deliberately does NOT.
       */
      immediate?: (data: unknown) => boolean,
    ): (() => void) => {
      if (pausedRef.current) return () => {}

      const mux = muxRef.current
      let entry = mux.get(key)
      if (!entry) {
        const e: {
          callbacks: Set<(data: unknown) => void>
          unsub: () => void
          throttled: ((data: unknown) => void) & { cancel: () => void }
          cached: unknown
        } = {
          callbacks: new Set(),
          unsub: () => {},
          throttled: throttleRef.current.wrap(
            channel,
            (data: unknown) => {
              // `e` is closed over and assigned below before any data can arrive.
              if (shouldCache(data)) e.cached = data
              for (const c of e.callbacks) {
                try {
                  c(data)
                } catch {
                  // one bad consumer must not break the fan-out
                }
              }
            },
            immediate ? { immediate } : {},
          ),
          cached: undefined,
        }
        // start() may throw if no plugin serves the capability (e.g. DEX has no
        // orderbook). Let it propagate to match the previous direct behavior,
        // except orderbook which the caller wraps.
        //
        // Health is marked on RAW arrival, ahead of the throttle: the throttle
        // legitimately drops frames under load, and "we are receiving data" is
        // a different question from "we are painting every frame".
        // The FIRST trades frame after a subscribe is the venue's replay of
        // recent executions, and on a quiet pair the newest replayed print can
        // be minutes old — its age measures the pair's activity, not the link.
        // One such sample parked a 51 s "round trip" on the header for minutes
        // (Crypto.com, measured 2026-08-14), because the median only heals as
        // fast as new trades arrive. Every frame after the first is a live
        // print, so only those are sampled.
        let firstFeedFrame = true
        e.unsub = start((data: unknown) => {
          streamHealth.mark(key)
          // Sampled on RAW arrival for the same reason health is: the throttle
          // drops frames under load, and a dropped frame is still evidence of
          // how fresh the feed is. latencyMonitor throttles its own sampling.
          if (feedVenue) {
            const eventTs = feedEventTs(data)
            if (eventTs !== null) {
              if (firstFeedFrame) {
                firstFeedFrame = false
              } else {
                latencyMonitor.recordFeedAge(feedVenue, eventTs)
              }
            }
          }
          e.throttled(data)
        })
        mux.set(key, e)
        streamHealth.register(key)
        activeUnsubs.current.add(e.unsub)
        entry = e
      }

      const e = entry
      e.callbacks.add(cb)
      // Replay the last cached value (candle/orderbook snapshot, or latest
      // ticker) so a late joiner doesn't sit blank until the next message.
      if (e.cached !== undefined) {
        try {
          cb(e.cached)
        } catch {
          // ignore
        }
      }

      return () => {
        e.callbacks.delete(cb)
        if (e.callbacks.size === 0) {
          e.unsub()
          e.throttled.cancel()
          activeUnsubs.current.delete(e.unsub)
          streamHealth.unregister(key)
          if (muxRef.current.get(key) === e) muxRef.current.delete(key)
        }
      }
    },
    [pluginManager],
  )

  const subscribe = useCallback(
    (
      market: string,
      pair: string,
      requestedTimeframe: string,
      cb: (data: unknown) => void,
    ): (() => void) => {
      // Clamped before the multiplex key is built, so two consumers asking a
      // three-interval venue for 15m and 30m share the single 1m stream they
      // both actually get rather than opening two.
      const timeframe = clampForMarket(market, requestedTimeframe)
      return multiplex(
        `candles:${market}:${pair}:${timeframe}`,
        'candles',
        (dispatch) => {
          pluginManager.setContext({
            market,
            pair,
            timeframe,
            country: getCountrySetting(),
            assetClass: assetClassFor(pair),
          })
          return pluginManager.subscribe(
            'market-data:candles',
            { pair, timeframe },
            dispatch,
          )
        },
        isCandleSnapshot,
        cb,
        undefined,
        // The one frame carrying history. Exempt from the throttle's lossy
        // queue, where a live update arriving milliseconds later used to
        // delete it — leaving the chart on a single forming bar.
        isCandleSnapshot,
      )
    },
    [pluginManager, multiplex, clampForMarket],
  )

  const subscribeTicker = useCallback(
    (
      market: string,
      pair: string,
      cb: (data: unknown) => void,
    ): (() => void) => {
      try {
        return multiplex(
          `ticker:${market}:${pair}`,
          'ticker',
          (dispatch) => {
            pluginManager.setContext({
              market,
              pair,
              country: getCountrySetting(),
              assetClass: assetClassFor(pair),
            })
            return pluginManager.subscribe(
              'market-data:ticker',
              { pair },
              dispatch,
            )
          },
          // Cache the latest tick so late joiners get a price immediately.
          () => true,
          cb,
        )
      } catch {
        // The connector may refuse synchronously (e.g. a region block). The
        // candle stream is the canonical detector that surfaces the geo dialog;
        // here we just avoid an uncaught throw taking down the ticker pane.
        return () => {}
      }
    },
    [pluginManager, multiplex],
  )

  const subscribeOrderbook = useCallback(
    (
      market: string,
      pair: string,
      cb: (data: unknown) => void,
    ): (() => void) => {
      try {
        return multiplex(
          `orderbook:${market}:${pair}`,
          'orderbook',
          (dispatch) => {
            pluginManager.setContext({
              market,
              pair,
              country: getCountrySetting(),
              assetClass: assetClassFor(pair),
            })
            return pluginManager.subscribe(
              'market-data:orderbook',
              { pair },
              dispatch,
            )
          },
          (d) => (d as { type?: string })?.type === 'snapshot',
          cb,
        )
      } catch {
        // No plugin provides orderbook for this market (e.g. DEX/AMM)
        return () => {}
      }
    },
    [pluginManager, multiplex],
  )

  const hasCapability = useCallback(
    (capability: CapabilityId, market: string): boolean =>
      pluginManager.getPluginsForCapability(capability, market).length > 0,
    // pluginsReady/pluginVersion are not tracked here: the callback reads the
    // manager live, and consumers re-run it whenever their own market changes.
    [pluginManager],
  )

  const subscribeTrades = useCallback(
    (
      market: string,
      pair: string,
      cb: (data: unknown) => void,
    ): (() => void) => {
      try {
        return multiplex(
          `trades:${market}:${pair}`,
          'trades',
          (dispatch) => {
            pluginManager.setContext({
              market,
              pair,
              country: getCountrySetting(),
              assetClass: assetClassFor(pair),
            })
            return pluginManager.subscribe(
              'market-data:trades',
              { pair },
              dispatch,
            )
          },
          // No snapshot frame on this capability — a tape is inherently
          // incremental, so there is nothing to replay to a late joiner.
          () => false,
          cb,
          market,
        )
      } catch {
        // Venue has no trade feed — the pane renders an unsupported state.
        return () => {}
      }
    },
    [pluginManager, multiplex],
  )

  // ── Speculative warmup for market switching ──
  //
  // Joins the same multiplexed streams the chart/ticker/orderbook hooks will
  // subscribe to on a market switch, with no-op callbacks. By the time the
  // user completes the switch the WS handshake and REST backfill are done and
  // the mux replays the cached snapshot synchronously — the switch renders
  // instantly. If the switch never happens, the warmup releases after the TTL
  // and the connector session's grace period keeps the socket cheap to revisit.
  const warmupsRef = useRef(
    new Map<
      string,
      { release: () => void; timer: ReturnType<typeof setTimeout> }
    >(),
  )

  const warmupMarket = useCallback(
    (market: string, pair: string, requestedTimeframe: string) => {
      // `subscribe` clamps too, so this is about the warmup's OWN dedupe key:
      // hovering a three-interval venue at 15m and then switching to it must
      // find the warm stream, not open a second one under a different key.
      const timeframe = clampForMarket(market, requestedTimeframe)
      const key = `${market}:${pair}:${timeframe}`
      const warmups = warmupsRef.current
      const existing = warmups.get(key)
      if (existing) {
        // Re-hover: extend the TTL instead of stacking another warmup.
        clearTimeout(existing.timer)
        existing.timer = setTimeout(() => {
          warmups.delete(key)
          existing.release()
        }, WARMUP_TTL_MS)
        return
      }
      // Cap concurrent warmups so an arrow-key sweep down a result list
      // doesn't open dozens of speculative streams. Maps iterate in insertion
      // order — evict the oldest.
      while (warmups.size >= MAX_CONCURRENT_WARMUPS) {
        const oldest = warmups.entries().next()
        if (oldest.done) break
        const [oldKey, oldWarmup] = oldest.value
        warmups.delete(oldKey)
        clearTimeout(oldWarmup.timer)
        oldWarmup.release()
      }
      const noop = () => {}
      const unsubs: Array<() => void> = []
      // A hovered market must never surface errors — the candle subscribe can
      // throw synchronously on a proactive geo block (ticker/orderbook already
      // swallow their own).
      try {
        unsubs.push(subscribe(market, pair, timeframe, noop))
      } catch {
        // ignore — the real subscription surfaces this if the user switches
      }
      unsubs.push(subscribeTicker(market, pair, noop))
      unsubs.push(subscribeOrderbook(market, pair, noop))
      // The tape too — it is one of the four panes a switch mounts, and
      // subscribeTrades already resolves to a no-op on venues without a feed.
      unsubs.push(subscribeTrades(market, pair, noop))
      const release = () => {
        for (const u of unsubs) u()
      }
      warmups.set(key, {
        release,
        timer: setTimeout(() => {
          warmups.delete(key)
          release()
        }, WARMUP_TTL_MS),
      })
    },
    [
      subscribe,
      subscribeTicker,
      subscribeOrderbook,
      subscribeTrades,
      clampForMarket,
    ],
  )

  // Release outstanding warmups on unmount.
  useEffect(() => {
    const warmups = warmupsRef.current
    return () => {
      for (const w of warmups.values()) {
        clearTimeout(w.timer)
        w.release()
      }
      warmups.clear()
    }
  }, [])

  const fetchHistory = useCallback(
    async (
      market: string,
      pair: string,
      requestedTimeframe: string,
      limit: number,
      endTs?: number,
    ): Promise<Array<Candle>> => {
      // Covers the copilot's candle tools and the Python indicators'
      // `request.security`, both of which name a timeframe the user never
      // saw on a venue picker.
      const timeframe = clampForMarket(market, requestedTimeframe)
      pluginManager.setContext({
        market,
        pair,
        timeframe,
        country: getCountrySetting(),
        assetClass: assetClassFor(pair),
      })
      const result = await pluginManager.execute('market-data:history', {
        pair,
        timeframe,
        limit,
        ...(endTs !== undefined ? { endTs } : {}),
      })
      return result as Array<Candle>
    },
    [pluginManager, clampForMarket],
  )

  const probeVenueHistory = useCallback(
    (
      market: string,
      pair: string,
      requestedTimeframe: string,
      limit: number,
    ): Promise<Array<Candle>> | null => {
      // Clamped like every other egress. This probe decides whether a pair is
      // published as UNLISTED, so asking a venue for an interval it does not
      // serve would answer "this pair does not exist here" about a pair that
      // does — and take the order book, the tape and the ticket down with it.
      const timeframe = clampForMarket(market, requestedTimeframe)
      // The venue's OWN history provider, resolved by an explicit (non-'*')
      // market declaration. `fetchHistory` goes through pluginManager.execute,
      // which walks a fallback chain when the primary errors — right for
      // filling a chart, wrong for asking a venue about itself: GeckoTerminal
      // declares market-data:history for '*' and would gladly answer "does
      // Bitvavo carry BTC-USDT?" on Bitvavo's behalf.
      const plugin = pluginManager
        .getPluginsForCapability('market-data:history', market)
        .find((p) =>
          p.manifest.capabilities.some(
            (c) => c.id === 'market-data:history' && c.markets.includes(market),
          ),
        )
      if (!plugin) return null

      // A locally-built context rather than setContext(): this runs alongside
      // other panes' streams, and mutating the shared context to ask one
      // question would hand the next caller the wrong market.
      return plugin.execute({
        capability: 'market-data:history',
        params: { pair, timeframe, limit },
        context: {
          ...pluginManager.getContext(),
          market,
          pair,
          timeframe,
          country: getCountrySetting(),
        },
      }) as Promise<Array<Candle>>
    },
    [pluginManager, clampForMarket],
  )

  const placeOrderGuarded = useCallback(
    async (params: Record<string, unknown>): Promise<OrderResult> => {
      const analytics = orderAnalyticsProps(params)
      track('trade_submitted', analytics)
      try {
        // ── Vault guard ──
        // Before the risk guards, because this is not a policy decision — the
        // credential that signs this order is ciphertext we cannot open. It
        // has to fail loud and typed: a connector handed no credential would
        // otherwise report an authentication error from the venue, and the
        // user would go looking at their API key instead of their lock screen.
        if (isVaultEnrolled() && !isVaultUnlocked()) {
          throw new VaultSealedError(
            i18n.t('security.vault.orderBlocked', {
              defaultValue:
                'Your credential vault is locked — unlock Pairlens to place live orders.',
            }),
          )
        }

        // ── Risk guard ──
        const riskStore = useRiskConfigStore.getState()
        riskStore.checkWindowReset()

        if (riskStore.ordersLocked) {
          throw new Error(i18n.t('common.ordersLockedRiskLimit'))
        }
        const side = String(params['side'] ?? '').toLowerCase()
        if (riskStore.buyOrdersLocked && side === 'buy') {
          throw new Error(i18n.t('common.buyOrdersLockedRiskLimit'))
        }

        const market = String(params['market'] ?? '')

        // ── maxPositionSize guard (single order as a % of portfolio) ──
        // Enforced here so EVERY order path — trade panel, workflow executor,
        // DEX swap — is covered; the panel's pre-check is UX only. Prices come
        // from the mux's cached ticker snapshots (no new subscriptions), and
        // like the panel check it fails open when a notional can't be priced,
        // so missing price data never blocks a legitimate order.
        if (
          riskStore.maxPositionSize > 0 &&
          (riskStore.positionSizeAction === 'block_all' ||
            (riskStore.positionSizeAction === 'block_buys' && side === 'buy'))
        ) {
          const pair = String(params['pair'] ?? '')
          const type = String(params['type'] ?? '')
          const orderSize = Number(params['size'])
          const priceParam = Number(params['price'])
          const walletId =
            typeof params['walletId'] === 'string' ? params['walletId'] : null
          // DEX market swaps denominate size in the INPUT token (a buy spends
          // the quote leg); CEX orders carry an explicit tgtCcy. Limit orders
          // are always base-denominated with an explicit price.
          const quoteDenominated =
            walletId != null
              ? type === 'market' && side === 'buy'
              : params['tgtCcy'] === 'quote_ccy'
          const priceUsd = collectPricesUsd(muxRef.current)
          const refPrice =
            type === 'limit' && priceParam > 0
              ? priceParam
              : cachedLastPrice(muxRef.current, market, pair)
          // Base units per contract, for a perp venue whose contract is not
          // one unit of the base (KuCoin's XBTUSDTM is 0.001 BTC). The ticket
          // sends it as a hint, but the copilot and the bot runtime do not —
          // and an order priced as if a 0.001 BTC contract were a whole one
          // overstates its notional a thousandfold, which turns the position
          // cap into a refusal of every legitimate KuCoin order. So the hint
          // is preferred and the terminal's own lookup fills the gap.
          const hinted = Number(params['contractSize'])
          const contractSize =
            Number.isFinite(hinted) && hinted > 0
              ? hinted
              : contractSizeFor(market, pair)
          const notionalUsd = orderNotionalUsd(
            {
              pair,
              size: orderSize,
              quoteDenominated,
              price: refPrice,
              ...(contractSize > 0 ? { contractSize } : {}),
            },
            priceUsd,
          )
          const credentialId =
            typeof params['credentialId'] === 'string'
              ? params['credentialId']
              : undefined
          // Venue-scoped, because a futures connector records its margin
          // balances under `${credentialId}@${venue}`. Measured against the
          // bare id, a futures-only account's portfolio reads as zero, and a
          // zero denominator disables the cap entirely — the guard fails open
          // exactly where leverage makes it matter most.
          const balanceScope =
            credentialId != null
              ? balanceScopeFor(credentialId, market)
              : walletId != null
                ? dexBalanceCredentialKey(walletId, market)
                : undefined
          const { exceeds, ratioPct } = evaluatePositionSize(
            notionalUsd,
            portfolioValueUsdFor(balanceScope, priceUsd),
            riskStore.maxPositionSize,
          )
          if (exceeds) {
            throw new Error(
              i18n.t('common.positionSizeExceeded', {
                ratioPct: ratioPct.toFixed(1),
                maxPositionSize: riskStore.maxPositionSize,
              }),
            )
          }
        }

        pluginManager.setContext({
          market,
          country: getCountrySetting(),
          assetClass: assetClassFor(String(params['pair'] ?? '')),
        })
        // Idempotency key — generated once per logical order so a retried or
        // double-clicked submit can't execute twice at the exchange. 32
        // alphanumeric chars fits every connector's client-order-id field.
        const clientOrderId =
          (params['clientOrderId'] as string | undefined) ??
          crypto.randomUUID().replace(/-/g, '')
        // `analyticsSource` is client-side telemetry routing and
        // `contractSize` is the risk guard's own hint — neither is an order
        // parameter, so neither is forwarded to connector plugins.
        const orderParams = { ...params }
        delete orderParams['analyticsSource']
        delete orderParams['contractSize']
        const result = (await pluginManager.execute('trading:orders', {
          ...orderParams,
          clientOrderId,
          action: 'place',
        })) as OrderResult

        // ── Post-order: increment trade count and evaluate breaches ──
        useRiskConfigStore.getState().incrementTradeCount()
        useRiskConfigStore.getState().checkAndLock()

        if (result?.success) track('trade_executed', analytics)
        else track('trade_failed', { ...analytics, reason: 'rejected' })
        return result
      } catch (err) {
        track('trade_failed', { ...analytics, reason: orderFailReason(err) })
        throw err
      }
    },
    [pluginManager],
  )

  /**
   * The attended order path: an optional identity check in front of the risk
   * guards above.
   *
   * Gating lives here rather than at the two UI call sites (trade panel,
   * copilot confirm card) because this callback is the single choke point
   * every attended order already goes through — a future third trade surface
   * is covered by construction. The bot runtime gets `placeOrderGuarded`
   * instead (see `setBotOrderSource` below), and so does anything deferred —
   * see `placeUnattendedOrder`.
   */
  const placeOrder = useCallback(
    async (params: Record<string, unknown>): Promise<OrderResult> => {
      // A sealed vault also resolves `requireUnlockForTrade` to false, but
      // "your order was cancelled" is the wrong explanation for it — let the
      // guarded path below throw the sealed error, which says what to do.
      if (!isVaultEnrolled() || isVaultUnlocked()) {
        const allowed = await requireUnlockForTrade()
        if (!allowed) {
          throw new Error(i18n.t('security.lock.orderCancelled'))
        }
      }
      return placeOrderGuarded(params)
    },
    [placeOrderGuarded],
  )

  const cancelOrder = useCallback(
    async (
      market: string,
      orderId: string,
      pair: string,
      credentialId?: string,
      opts?: { trigger?: boolean },
    ): Promise<OrderResult> => {
      pluginManager.setContext({ market, country: getCountrySetting() })
      const result = (await pluginManager.execute('trading:orders', {
        action: 'cancel',
        orderId,
        pair,
        ...(credentialId ? { credentialId } : {}),
        ...(opts?.trigger ? { trigger: true } : {}),
      })) as OrderResult
      // Optimistically reflect the cancel in the local journal. CEX private
      // streams echo it anyway; DEX venues have no stream, so without this
      // the order would show as live until the next backfill.
      if (result?.success) {
        track('order_cancelled', { venue: market })
        const event = getOrderEvents().find((e) => e.orderId === orderId)
        if (event && event.status !== 'filled') {
          upsertOrderEvent({ ...event, status: 'cancelled', ts: Date.now() })
        }
      }
      return result
    },
    [pluginManager],
  )

  const fetchBalancesForCredential = useCallback(
    /**
     * `credentialId` addresses the connector's slot; `scope` is where the
     * records land in the store, and defaults to the same value. They differ
     * only for an aliased venue, whose margin balances must not overwrite the
     * spot balances held under the same key.
     */
    (market: string, credentialId: string, scope?: string) => {
      const balanceScope = scope ?? credentialId
      pluginManager.setContext({ market, country: getCountrySetting() })
      pluginManager
        .execute('trading:balances', { action: 'fetch', credentialId })
        .then((result) => {
          const records = result as Array<NormalizedBalance>
          if (!Array.isArray(records)) return
          clearBalancesForCredential(balanceScope)
          for (const b of records) {
            upsertBalance({
              currency: b.currency,
              available: b.available,
              frozen: b.frozen,
              total: b.total,
              market,
              credentialId: balanceScope,
              updatedAt: Date.now(),
            })
          }
        })
        .catch((err) =>
          console.warn(
            `[market-data] Balance fetch failed for ${market}:`,
            err,
          ),
        )
    },
    [pluginManager],
  )

  // Pause/resume uses a version counter. Hooks depend on it — when it
  // increments, effects re-run and skip subscribing while paused.
  const [streamVersion, setStreamVersion] = useState(0)
  const pauseStreams = useCallback(() => {
    pausedRef.current = true
    // Tear down every multiplexed underlying subscription and clear the mux so
    // resume (via streamVersion bump) re-creates them fresh.
    for (const entry of muxRef.current.values()) {
      entry.unsub()
      entry.throttled.cancel()
    }
    muxRef.current.clear()
    // Paused streams are silent by design — don't report that as a fault.
    streamHealth.clear()
    for (const unsub of activeUnsubs.current) {
      unsub()
    }
    activeUnsubs.current.clear()
  }, [])

  const resumeStreams = useCallback(() => {
    pausedRef.current = false
    // Bump version so hooks re-subscribe
    setStreamVersion((v) => v + 1)
  }, [])

  const setThrottleMode = useCallback((mode: ThrottleMode) => {
    throttleRef.current.setMode(mode)
  }, [])

  const contextValue = useMemo<MarketDataContextValue>(
    () => ({
      status,
      pluginsReady,
      availableMarkets,
      getTimeframes,
      getCapabilities,
      subscribe,
      subscribeTicker,
      subscribeOrderbook,
      subscribeTrades,
      hasCapability,
      warmupMarket,
      fetchHistory,
      probeVenueHistory,
      placeOrder,
      placeUnattendedOrder: placeOrderGuarded,
      cancelOrder,
      refreshWalletBalances,
      streamVersion,
      pauseStreams,
      resumeStreams,
      setThrottleMode,
    }),
    [
      status,
      pluginsReady,
      availableMarkets,
      getTimeframes,
      getCapabilities,
      subscribe,
      subscribeTicker,
      subscribeOrderbook,
      subscribeTrades,
      hasCapability,
      warmupMarket,
      fetchHistory,
      probeVenueHistory,
      placeOrder,
      placeOrderGuarded,
      cancelOrder,
      refreshWalletBalances,
      streamVersion,
      pauseStreams,
      resumeStreams,
      setThrottleMode,
    ],
  )

  // Custom (Python) indicators declare extra candle series via
  // `request.security(...)`. The request layer is a plain module — give it a
  // way to pull history without threading the provider through the engine.
  useEffect(() => {
    setIndicatorHistorySource((market, pair, timeframe, limit, endTs) =>
      fetchHistory(market, pair, timeframe, limit, endTs),
    )
    return () => setIndicatorHistorySource(null)
  }, [fetchHistory])

  // The bot runtime is a plain module (it outlives any render and runs off a
  // WebSocket callback), so the same seam gives it the guarded order path,
  // history paging, and read-only access to prices the app already streams.
  // Clearing on unmount is what stops a torn-down provider from placing an
  // order through a stale closure.
  //
  // Deliberately the UNGATED callback: a headless runtime cannot answer a
  // password prompt, and freezing a bot mid-position is strictly more
  // dangerous than the shoulder-surfing the lock defends against. The
  // Security settings section says so out loud.
  useEffect(() => {
    setBotOrderSource({
      placeOrder: placeOrderGuarded,
      fetchHistory,
      getLastPrice: (market, pair) =>
        cachedLastPrice(muxRef.current, market, pair),
    })
    return () => setBotOrderSource(null)
  }, [placeOrderGuarded, fetchHistory])

  return (
    <MarketDataContext.Provider value={contextValue}>
      {children}
    </MarketDataContext.Provider>
  )
}

export function useMarketData() {
  const context = useContext(MarketDataContext)
  if (!context) {
    throw new Error('useMarketData must be used within MarketDataProvider')
  }
  return context
}
