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
import { usePairlens } from './pairlens-provider'
import { getCountrySetting } from './region-settings'
import { streamHealth } from './stream-health'
import { setIndicatorHistorySource } from './indicators/request-data'
import { setBotOrderSource } from './bots/bot-order-source'
import { PositionLedger } from './risk/position-ledger'
import type { ThrottleMode, ThrottleStream } from '@pairlens/market-engine'
import type { Candle } from '@pairlens/shared/types'
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
import { getOrderEvents, upsertOrderEvent } from '@/stores/order-events-store'
import {
  clearBalancesForCredential,
  dexBalanceCredentialKey,
  getBalances,
  upsertBalance,
} from '@/stores/balances-store'
import {
  USD_PEGGED,
  evaluatePositionSize,
  orderNotionalUsd,
  priceUsdFor,
} from '@/lib/risk/position-size'
import { normalizePairKey } from '@/lib/pairs'
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
const WARMUP_TTL_MS = 15_000

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
      source === 'copilot' || source === 'workflow' ? source : 'trade_panel',
  }
}

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

function getConnectorAdapterInfo(
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

  const meta = plugin.manifest.metadata as
    | Record<string, string | boolean>
    | undefined
  const assetClass = ((meta?.assetClass as string) ??
    'crypto-spot') as AssetClass
  const walletChain = meta?.walletChain as WalletChain | undefined
  const dexLimitOrders = meta?.dexLimitOrders === true
  const triggerOrders = meta?.triggerOrders === true
  // Declared by the four venues a browser cannot reach (see the connector
  // spec's requiresDesktop). It has to come off the MANIFEST rather than the
  // connector's exported adapter info, because that export is never read —
  // this function builds MarketAdapterInfo from the manifest alone.
  const requiresDesktop = meta?.requiresDesktop === true

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
    supportedTimeframes: [
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '1d',
      '1w',
    ],
    walletChain,
    dexLimitOrders,
    triggerOrders,
    requiresDesktop,
  }
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

export function MarketDataProvider({ children }: MarketDataProviderProps) {
  const { pluginManager, pluginsReady } = usePairlens()
  const [availableMarkets, setAvailableMarkets] = useState<
    Array<MarketAdapterInfo>
  >([])
  const throttleRef = useRef(new StreamThrottle())
  const pausedRef = useRef(false)
  const activeUnsubs = useRef<Set<() => void>>(new Set())
  // Session-scoped average-cost ledger that turns observed fills into realized
  // PnL, feeding the daily-loss risk guard (spot exchanges don't report PnL).
  const positionLedgerRef = useRef(new PositionLedger())

  // Derive available markets from active connector plugins
  const refreshMarkets = useCallback(() => {
    const active = pluginManager.getActivePlugins()
    const markets: Array<MarketAdapterInfo> = []
    for (const p of active) {
      const info = getConnectorAdapterInfo(p)
      if (info) markets.push(info)
    }
    setAvailableMarkets(markets)
  }, [pluginManager])

  // Listen for plugin lifecycle events
  useEffect(() => {
    refreshMarkets() // initial scan

    const listener: PluginLifecycleListener = {
      onActivated: () => refreshMarkets(),
      onDeactivated: (pluginId) => {
        refreshMarkets()
        // Clean up credential subscriptions for deactivated plugin
        const currentCredentials = useCredentialsStore.getState().credentials
        for (const [credId, unsubs] of credentialUnsubsRef.current) {
          const cred = currentCredentials.find((c) => c.id === credId)
          if (cred && `${cred.market}-market-connector` === pluginId) {
            for (const u of unsubs) u()
            credentialUnsubsRef.current.delete(credId)
            provisionedIdsRef.current.delete(credId)
          }
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
  }, [pluginManager, refreshMarkets])

  // Per-credential unsub functions (trading:orders WS + trading:balances WS)
  const credentialUnsubsRef = useRef(new Map<string, Array<() => void>>())

  // Auto-provision ALL credentials to their connector plugins.
  // Each credential gets its own private WS connection for order updates
  // and balance streaming.
  const credentials = useCredentialsStore((s) => s.credentials)
  const credentialsLoaded = useCredentialsStore((s) => s.loaded)
  const loadCredentials = useCredentialsStore((s) => s.load)
  /**
   * credentialId → the provisioning signature the connector currently holds.
   *
   * Not a Set of ids: a credential can be EDITED in place (its account entity,
   * its mode, a rotated key), and those decide which host the connector signs
   * and streams against. Keyed by id alone, an edit would sit in the store
   * while every order kept going to the old endpoint until a reload. The
   * signature carries no secret the store doesn't already hold in memory.
   */
  const provisionedIdsRef = useRef(new Map<string, string>())

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  useEffect(() => {
    if (!credentialsLoaded || !pluginsReady) return

    const currentIds = new Set(credentials.map((c) => c.id))

    /** Everything the connector reads at initialize that decides routing. */
    const signatureOf = (cred: (typeof credentials)[number]) =>
      `${cred.market}|${cred.mode}|${cred.entity ?? ''}|${cred.apiKey}`

    /** Drop this credential's streams; the slot is about to go or be rebuilt. */
    const teardown = (id: string) => {
      clearBalancesForCredential(id)
      const unsubs = credentialUnsubsRef.current.get(id)
      if (unsubs) {
        for (const u of unsubs) u()
        credentialUnsubsRef.current.delete(id)
      }
    }

    // Deprovision removed credentials
    for (const id of [...provisionedIdsRef.current.keys()]) {
      if (!currentIds.has(id)) {
        provisionedIdsRef.current.delete(id)
        teardown(id)
      }
    }

    for (const cred of credentials) {
      const signature = signatureOf(cred)
      const provisioned = provisionedIdsRef.current.get(cred.id)
      if (provisioned === signature) continue

      const connectorId = `${cred.market}-market-connector`
      const plugin = pluginManager
        .getInstalledPlugins()
        .find((p) => p.manifest.id === connectorId)
      if (!plugin?.initialize) continue

      // An edited credential is re-provisioned, not provisioned twice: drop
      // the sockets opened against the previous endpoint first. The connector
      // destroys the old private WS itself when the slot is rebuilt, but the
      // unsub closures held here would otherwise leak and double-subscribe.
      if (provisioned !== undefined) teardown(cred.id)

      provisionedIdsRef.current.set(cred.id, signature)

      plugin
        .initialize({
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
          const unsubs: Array<() => void> = []

          pluginManager.setContext({
            market: cred.market,
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
                  cred.market,
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
                  cred.market,
                  cred.mode as 'paper' | 'live',
                )
              }
            })
            .catch((err) =>
              console.warn(
                `[market-data] Order history backfill failed for ${cred.market}:`,
                err,
              ),
            )

          // REST backfill — fetch account balances
          fetchBalancesForCredential(cred.market, cred.id)

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
                    market: cred.market,
                    credentialId: cred.id,
                    updatedAt: Date.now(),
                  })
                }
              },
            )
            unsubs.push(unsub)
          } catch {
            // Plugin doesn't support streaming trading:balances
          }

          credentialUnsubsRef.current.set(cred.id, unsubs)
        })
        .catch((err) =>
          console.warn(
            `[market-data] Credential provisioning failed for ${cred.market}:`,
            err,
          ),
        )
    }
  }, [credentials, credentialsLoaded, pluginsReady, pluginManager]) // deps intentionally scoped: re-provision only when credentials/readiness change

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

        const meta = plugin.manifest.metadata as
          | Record<string, string>
          | undefined
        if (meta?.walletChain !== wallet.chain) continue
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
          throttled: throttleRef.current.wrap(channel, (data: unknown) => {
            // `e` is closed over and assigned below before any data can arrive.
            if (shouldCache(data)) e.cached = data
            for (const c of e.callbacks) {
              try {
                c(data)
              } catch {
                // one bad consumer must not break the fan-out
              }
            }
          }),
          cached: undefined,
        }
        // start() may throw if no plugin serves the capability (e.g. DEX has no
        // orderbook). Let it propagate to match the previous direct behavior,
        // except orderbook which the caller wraps.
        //
        // Health is marked on RAW arrival, ahead of the throttle: the throttle
        // legitimately drops frames under load, and "we are receiving data" is
        // a different question from "we are painting every frame".
        e.unsub = start((data: unknown) => {
          streamHealth.mark(key)
          // Sampled on RAW arrival for the same reason health is: the throttle
          // drops frames under load, and a dropped frame is still evidence of
          // how fresh the feed is. latencyMonitor throttles its own sampling.
          if (feedVenue) {
            const eventTs = feedEventTs(data)
            if (eventTs !== null) {
              latencyMonitor.recordFeedAge(feedVenue, eventTs)
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
      timeframe: string,
      cb: (data: unknown) => void,
    ): (() => void) =>
      multiplex(
        `candles:${market}:${pair}:${timeframe}`,
        'candles',
        (dispatch) => {
          pluginManager.setContext({
            market,
            pair,
            timeframe,
            country: getCountrySetting(),
          })
          return pluginManager.subscribe(
            'market-data:candles',
            { pair, timeframe },
            dispatch,
          )
        },
        (d) => (d as { type?: string })?.type === 'snapshot',
        cb,
      ),
    [pluginManager, multiplex],
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
    (market: string, pair: string, timeframe: string) => {
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
    [subscribe, subscribeTicker, subscribeOrderbook],
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
      timeframe: string,
      limit: number,
      endTs?: number,
    ): Promise<Array<Candle>> => {
      pluginManager.setContext({
        market,
        pair,
        timeframe,
        country: getCountrySetting(),
      })
      const result = await pluginManager.execute('market-data:history', {
        pair,
        timeframe,
        limit,
        ...(endTs !== undefined ? { endTs } : {}),
      })
      return result as Array<Candle>
    },
    [pluginManager],
  )

  const probeVenueHistory = useCallback(
    (
      market: string,
      pair: string,
      timeframe: string,
      limit: number,
    ): Promise<Array<Candle>> | null => {
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
    [pluginManager],
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
          const notionalUsd = orderNotionalUsd(
            { pair, size: orderSize, quoteDenominated, price: refPrice },
            priceUsd,
          )
          const credentialId =
            typeof params['credentialId'] === 'string'
              ? params['credentialId']
              : undefined
          const balanceScope =
            credentialId ??
            (walletId != null
              ? dexBalanceCredentialKey(walletId, market)
              : undefined)
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

        pluginManager.setContext({ market, country: getCountrySetting() })
        // Idempotency key — generated once per logical order so a retried or
        // double-clicked submit can't execute twice at the exchange. 32
        // alphanumeric chars fits every connector's client-order-id field.
        const clientOrderId =
          (params['clientOrderId'] as string | undefined) ??
          crypto.randomUUID().replace(/-/g, '')
        // `analyticsSource` is client-side telemetry routing — never forward
        // it to connector plugins.
        const orderParams = { ...params }
        delete orderParams['analyticsSource']
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
    (market: string, credentialId: string) => {
      pluginManager.setContext({ market, country: getCountrySetting() })
      pluginManager
        .execute('trading:balances', { action: 'fetch', credentialId })
        .then((result) => {
          const records = result as Array<NormalizedBalance>
          if (!Array.isArray(records)) return
          clearBalancesForCredential(credentialId)
          for (const b of records) {
            upsertBalance({
              currency: b.currency,
              available: b.available,
              frozen: b.frozen,
              total: b.total,
              market,
              credentialId,
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
