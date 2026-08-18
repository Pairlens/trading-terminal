// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * OKX linear perpetuals, backed by ccxt Pro's `okx` — the same class the spot
 * connector loads, pointed at the swap universe.
 *
 * **What this venue inherits from spot OKX: the entire routing surface.** The
 * decision, stated once so it survives review: OKX's three regional entities
 * (`www` / `eea` / `us`) publish the IDENTICAL linear-swap universe — measured
 * 2026-08-18, 435 linear contracts on each, same instruments endpoint, same
 * funding payloads — so routing by entity or country changes which legal
 * entity answers, never what data comes back. That makes every spot rule
 * correct here verbatim:
 *
 * - **Regional routing + the account-entity override.** An OKX key exists on
 *   exactly one entity, and the credential's optional `entity` outranks the
 *   user's country for every authed call, live and demo alike. Same resolver,
 *   same 50119 explainer.
 * - **Public REST falls back to the global host under CORS — orders never
 *   do.** `eea.okx.com` and `us.okx.com` send no `Access-Control-Allow-Origin`
 *   (re-measured 2026-08-18 on the funding endpoint) while `www.okx.com`
 *   reflects the request origin, so the hosted terminal reads public swap data
 *   from `www` and keeps signing orders against the account's own entity.
 *   Browser-capable, no `requiresDesktop`.
 * - **No `geoCheck`, like spot.** Unlike Binance Futures there is no country
 *   with nothing to route to — every entity serves the public feed. Whether a
 *   given ACCOUNT may trade swaps is the entity's own decision (per region,
 *   client category and KYC tier), enforced venue-side at order time; encoding
 *   a guess here would refuse users the venue itself accepts.
 * - **Paper is demo trading.** `urls.test` restores the bare `{hostname}` REST
 *   template and the GLOBAL `wspap` socket, so `applyPaperUrls` re-applies the
 *   regional resolution — demo keys are as regional as live ones (60032 on the
 *   wrong demo socket, found by the spot demo E2E).
 *
 * And what is futures-specific:
 *
 * - **`tdMode` must NOT be `'cash'`.** The spot venue forces `cash` because a
 *   Simple-mode account rejects margin trade modes; on a contract market
 *   `cash` is invalid the other way around. ccxt defaults contract orders to
 *   cross margin; pinned explicitly below so the choice is visible and
 *   survives a ccxt default change.
 * - **`3d` is missing from ccxt's timeframe table** even though OKX serves
 *   `3D` — same override as spot.
 * - **Deep history needs `HistoryCandles`**, and REST candles are pinned to
 *   the Hong-Kong bar convention the WS channels use — both spot defects, both
 *   identical on swap candles.
 * - **Trigger (TP/SL) orders land as `conditional`** on the algo endpoint, and
 *   ccxt's algo listing defaults to `ordType: "trigger"` — same
 *   `triggerQueryParams` repair as spot, and the algo book is a separate
 *   endpoint, so the second probe stays on.
 */

import { createCexFuturesConnectorManifest } from '../manifest'
import { createCcxtFuturesConnectorPlugin } from '../index'
import {
  okxPaperWs,
  resolveOkxCcxtUrls,
  resolveOkxTradingCountry,
} from '../../ccxt-connector/venues/okx-regions'
import type { CcxtExchangeCtor } from '../../ccxt-connector/types'
import type { CcxtFuturesVenueConfig } from '../futures-types'
import type { Timeframe } from '@pairlens/shared/types'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ICON_URL =
  'https://static.okx.com/cdn/oksupport/asset/currency/icon/okb.png'

/** The spot venue's list: OKX serves the same candle intervals on swap. */
export const OKX_FUTURES_TIMEFRAMES: Array<Timeframe> = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '3d',
  '1w',
  '1M',
]

/** BTC-USDT-SWAP's `lever` (measured 2026-08-18); most contracts cap lower. */
export const OKX_FUTURES_MAX_LEVERAGE = 100

export const OKX_FUTURES_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'okx-futures',
  displayName: 'OKX Futures',
  assetClasses: ['crypto-perp'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'secret', required: true },
    { key: 'passphrase', label: 'Passphrase', type: 'secret', required: true },
  ],
  supportedTimeframes: [...OKX_FUTURES_TIMEFRAMES],
  iconUrl: ICON_URL,
  triggerOrders: true,
  maxLeverage: OKX_FUTURES_MAX_LEVERAGE,
}

export const okxFuturesMarketConnectorManifest: PluginManifest =
  createCexFuturesConnectorManifest({
    id: 'okx-futures-market-connector',
    name: 'OKX Futures Market Connector',
    displayName: 'OKX Futures',
    marketId: 'okx-futures',
    icon: ICON_URL,
    gradient: 'from-zinc-700 to-zinc-900 dark:from-zinc-300 dark:to-zinc-400',
    abbr: 'OKF',
    timeframes: [...OKX_FUTURES_TIMEFRAMES],
    maxLeverage: OKX_FUTURES_MAX_LEVERAGE,
    triggerOrders: true,
    // One OKX key signs every instrument type on its home entity; without the
    // alias the user would be asked to enter the same credential twice.
    credentialAlias: 'okx',
    headerImage:
      'https://s.yimg.com/ny/api/res/1.2/YcL1Jo0JCQlMJdZnj6SkYg--/YXBwaWQ9aGlnaGxhbmRlcjt3PTk2MDtoPTY0MTtjZj13ZWJw/https://media.zenfs.com/en/reuters-finance.com/852f3f6259d5f775f388a1786a9f4a17',
  })

export const okxFuturesCcxtVenue: CcxtFuturesVenueConfig = {
  exchangeId: 'okx',
  marketId: 'okx-futures',
  displayName: 'OKX Futures',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
    { key: 'passphrase', required: true },
    // Account's home regional entity ('global' | 'eea' | 'us', '' = route by
    // country). Inherited from spot: the SAME credential provisions both
    // venues through the alias, so the same override has to travel with it.
    { key: 'entity', required: false },
  ],
  defaultMode: 'paper',
  maxLeverage: OKX_FUTURES_MAX_LEVERAGE,
  loadExchangeClass: async () => {
    // Deep subpath, dynamically: the barrel would pull ~130 exchange classes
    // into the graph. Same chunk as the spot venue — shared class, separate
    // instances.
    const module = await import('ccxt/js/src/pro/okx.js')
    return (module.default ?? module) as unknown as CcxtExchangeCtor
  },
  options: {
    options: {
      // The exchange host defaults every instance to spot; without this the
      // markets table is the spot list and every 3-segment key resolves to
      // nothing.
      defaultType: 'swap',
      defaultSubType: 'linear',
      // Same two-bar-convention pin as spot: REST >= 6h candles default to the
      // UTC-aligned variants while the WS channels are Hong-Kong-aligned, and
      // a live daily bar that cannot match its own history is dropped or
      // appended as a phantom. Swap candles use the same channel names.
      fetchOHLCV: { timezone: 'HK' },
      // One swap instruments download instead of spot + future + swap +
      // option; the shared linear trim drops the inverse rows it contains.
      fetchMarkets: { types: ['swap'] },
    },
  },
  timeframeOverrides: { '3d': '3D' },
  // `books` (400 levels, checksum-validated), as on spot. NOT 50:
  // `books50-l2-tbt` needs VIP4 and an authenticated socket.
  orderbookDepth: undefined,
  // The trade channel sends only new prints; candles come from watchOHLCV, so
  // the REST fill is safe.
  seedTrades: true,
  // `/market/candles` serves only the most recent ~1440 bars, then returns an
  // EMPTY success page — the paged read asks for the history endpoint
  // explicitly, exactly as spot does.
  maxHistoryLimit: 300,
  historyPageParams: (endTs) => ({
    until: endTs,
    type: 'HistoryCandles',
  }),
  livenessTimeoutMs: 60_000,
  // Cross margin, stated rather than inherited: ccxt defaults contract orders
  // to `tdMode: "cross"` today, and the spot venue's `cash` is invalid on a
  // swap — this venue must never pick that override up by copy-paste.
  orderParams: { tdMode: 'cross' },
  // Every Pairlens TP/SL lands as `conditional` on the algo endpoint; ccxt's
  // algo listing defaults to `ordType: "trigger"` and would list none of them.
  triggerQueryParams: { trigger: true, ordType: 'conditional' },
  // 50119 against the wrong regional entity reads like a typo'd key — same
  // failure mode and same repair as spot, under this venue's routing.
  describeTradingError: (message, slot) => {
    if (!/\b50119\b/.test(message)) return message
    const routed = resolveOkxTradingCountry(
      slot.credentials['entity'],
      slot.country,
    )
    const host = resolveOkxCcxtUrls(routed, { authed: true }).hostname
    return (
      `OKX rejected this API key on ${host} (50119: API key doesn't exist). ` +
      `OKX keys only work on the regional entity where the account was created — ` +
      `if this account was registered on a different OKX entity (Global, EEA or US), ` +
      `pick that entity on the account's card under "OKX account entity".`
    )
  },
  // OKX settles most contracts every eight hours; the funding payload carries
  // per-contract times where they differ.
  fundingIntervalHours: 8,
  applyUrls: (exchange, country, ctx) => {
    // The account's home entity outranks the user's country for authed calls;
    // the public instance never carries an entity. Same resolution as spot.
    const routed = resolveOkxTradingCountry(ctx.entity, country)
    const urls = resolveOkxCcxtUrls(routed, { authed: ctx.authed })
    const api = exchange.urls['api'] as Record<string, unknown>
    api['rest'] = urls.rest
    api['ws'] = urls.ws
    exchange.hostname = urls.hostname
  },
  // Runs after `setSandboxMode` has replaced `urls.api` with the global demo
  // socket and a bare `{hostname}` REST template — both halves are restored
  // from the same resolver the live path uses, so a paper instance routes
  // exactly where its live twin would. Demo keys are regional (60032).
  applyPaperUrls: (exchange, country, ctx) => {
    const routed = resolveOkxTradingCountry(ctx.entity, country)
    const urls = resolveOkxCcxtUrls(routed, { authed: ctx.authed })
    const api = exchange.urls['api'] as Record<string, unknown>
    api['rest'] = urls.rest
    api['ws'] = okxPaperWs(routed)
    exchange.hostname = urls.hostname
  },
}

export function createOkxFuturesMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return createCcxtFuturesConnectorPlugin(okxFuturesCcxtVenue, manifest)
}
