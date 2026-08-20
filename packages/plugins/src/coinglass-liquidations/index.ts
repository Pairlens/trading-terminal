// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinglass liquidation prints, as a second source for the liquidation map.
 *
 * Pairlens already draws measured liquidation clusters for the venues its own
 * App Server collects, which today is Binance Futures on a 72-hour window. That
 * covers one venue for free and stops there, because holding a venue-wide
 * force-order stream for three days is not something a client can do. This
 * plugin is the other answer: a user who already pays Coinglass points it at
 * their key and gets the venues we do not collect, over a 7-day window.
 *
 * Three decisions are worth stating up front, because each one rules out an
 * easier implementation that would have been dishonest.
 *
 * **Only `/api/futures/liquidation/order` is mapped.** Coinglass's heatmap and
 * map endpoints are price-keyed and look like a perfect fit for the bucket
 * shape, but they carry PREDICTED leverage levels: where standing positions
 * would liquidate if price got there. No counts, no realized notional, and no
 * side label at all. Feeding them into `market-data:liquidations` would paint
 * a forecast in the pane that says "what the venue actually liquidated". They
 * deserve their own surface, labelled as projections, and until that exists
 * they are not served here.
 *
 * **Desktop only.** `open-api-v4.coinglass.com` answers an OPTIONS preflight
 * with 403 and no `access-control-allow-*` headers at all, and `CG-API-KEY` is
 * a non-simple header, so every real call preflights. There is no
 * browser-reachable variant to fall back to, which is why this refuses with a
 * typed `PlatformRestrictedError` instead of failing at the network layer.
 *
 * **The key is required to activate.** A keyless install would win the
 * capability resolution for four venues and then refuse every request, which
 * the pane cannot tell apart from an outage. Refusing to activate hands those
 * venues back to whatever else claims them, or to the pane's honest "no
 * aggregate feed for this venue" state.
 */
import { PlatformRestrictedError } from '@pairlens/market-engine/errors'
import { isVenueRestBlocked } from '@pairlens/market-engine/platform'
import {
  CoinglassApiError,
  createCoinglassClient,
  isCoinglassApiError,
} from './client'
import { DEFAULT_MAX_REQUESTS, createOrderStore, walkWindow } from './orders'
import {
  LIQUIDATION_RESOLUTION_MS,
  aggregateLiquidationOrders,
  parseFuturesPairKey,
  resolveCompleteness,
} from './mapper'
import {
  COINGLASS_RETENTION_MS,
  COINGLASS_VENUE_IDS,
  coinglassVenue,
} from './venues'
import type { CoinglassClient, CoinglassRefusalReason } from './client'
import type { OrderStore } from './orders'
import type {
  LiquidationClustersResponse,
  LiquidationsUnavailableReason,
  LiquidationsUnavailableResponse,
} from '@pairlens/shared/instrument-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

/** Display name used in refusals and the desktop-only call to action. */
const DISPLAY_NAME = 'Coinglass'

/** Longest window the 7-day retention can serve, in hours. */
export const MAX_WINDOW_HOURS = 168
export const DEFAULT_WINDOW_HOURS = 24

/**
 * Default `min_liquidation_amount`, in USD.
 *
 * The parameter is MANDATORY on Coinglass's side, so there is no "everything"
 * setting to default to. $1,000 keeps a busy pair inside the 200-row page cap
 * often enough that bisection stays cheap, while still showing the prints a
 * liquidation map is read for. Lower it to see retail-sized prints and expect
 * more truncation; the response says which happened either way.
 */
export const DEFAULT_MIN_LIQUIDATION_USD = 1_000

export const coinglassLiquidationsManifest: PluginManifest = {
  id: 'coinglass-liquidations',
  name: 'Coinglass Liquidations',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Liquidation prints from your own Coinglass key, for the perpetual venues Pairlens does not collect itself. Desktop only, and the liquidation-order endpoint it reads starts at the Coinglass Standard plan.',
  homepage: 'https://www.coinglass.com/pricing',
  icon: '/posters/coinglass-liquidations.png',
  metadata: {
    family: 'cex-futures',
    assetClass: 'crypto-perp',
    // No CORS headers on any Coinglass origin, and the preflight 403s.
    requiresDesktop: true,
    gradient: 'from-rose-500 to-orange-500',
    abbr: 'CG',
  },
  capabilities: [
    {
      id: 'market-data:liquidations',
      singleton: false,
      // Named venues, never '*'. The pane resolves this capability by reading
      // the manifest's own venue list, so a wildcard would claim venues
      // Coinglass does not carry and turn "no feed here" into a paid request
      // that fails.
      markets: [...COINGLASS_VENUE_IDS],
      // Behind pairlens-intelligence (5) on purpose. Where both answer, the
      // App Server's collector is measured from the venue's own stream and
      // costs the user nothing; this is the paid second opinion and the only
      // source for the venues the collector does not hold.
      priority: 20,
      streaming: false,
    },
  ],
  config: {
    apiKey: {
      type: 'secret',
      label: 'Coinglass API key',
      // Required, and enforced in `initialize`. See the header note.
      required: true,
    },
    minLiquidationUsd: {
      type: 'number',
      label: 'Minimum liquidation size (USD)',
      required: false,
      default: DEFAULT_MIN_LIQUIDATION_USD,
    },
  },
}

/**
 * Reasons that are a fact about the KEY rather than about the venue.
 *
 * All three answer the same user question ("why is there no data, and what do
 * I do?") with the same action ("fix the key or the plan in the Plugin
 * Store"), so they collapse onto one wire reason. The distinctions that matter
 * for debugging live in the thrown `CoinglassApiError.message`, which is what
 * the plugin keeps when it maps one of these.
 *
 * `rate_limited`, `bad_request` and `upstream` are deliberately NOT here. They
 * are transient or ours, the same request works later or after a fix, and a
 * typed refusal is a durable statement the pane would keep showing.
 */
const CREDENTIAL_REFUSALS: ReadonlySet<CoinglassRefusalReason> = new Set([
  'key_missing',
  'key_invalid',
  'plan_required',
])

function unavailable(
  reason: LiquidationsUnavailableReason,
  fetchedAt: string,
  trackedSince?: number,
): LiquidationsUnavailableResponse {
  const body: LiquidationsUnavailableResponse = {
    error: 'liquidations_unavailable',
    reason,
    fetchedAt,
  }
  if (trackedSince != null) body.trackedSince = trackedSince
  return body
}

/** `hours` as a window the 7-day retention can answer. */
export function clampWindowHours(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WINDOW_HOURS
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_WINDOW_HOURS)
}

/** The configured threshold, or the default. Negative values are not a filter. */
export function readMinLiquidationUsd(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MIN_LIQUIDATION_USD
  return parsed
}

export type CreateCoinglassOptions = {
  /** Injected in tests: a stub client and a frozen clock keep fixtures exact. */
  createClient?: (apiKey: string) => CoinglassClient
  now?: () => number
  store?: OrderStore
  /** Injected in tests so the browser refusal can be exercised both ways. */
  restBlocked?: () => boolean
}

export function createCoinglassLiquidationsPlugin(
  manifest: PluginManifest,
  options: CreateCoinglassOptions = {},
): PluginInstance {
  const now = options.now ?? (() => Date.now())
  // No dev proxy is declared for this host, so a browser cannot reach it under
  // `bun run dev` either. `isVenueRestBlocked(false)` is exactly that question.
  const restBlocked = options.restBlocked ?? (() => isVenueRestBlocked(false))
  // Same clock and same retention as the response the store feeds. A store on
  // its own wall clock prunes against a floor the response never mentions,
  // which is how a window that says "7 days" comes back empty.
  const store =
    options.store ??
    createOrderStore({ retentionMs: COINGLASS_RETENTION_MS, now })

  let apiKey = ''
  let minLiquidationUsd = DEFAULT_MIN_LIQUIDATION_USD
  let client: CoinglassClient | null = null

  function ensureClient(): CoinglassClient {
    client ??= options.createClient
      ? options.createClient(apiKey)
      : createCoinglassClient({ apiKey })
    return client
  }

  async function clusters(
    p: Record<string, unknown>,
  ): Promise<LiquidationClustersResponse | LiquidationsUnavailableResponse> {
    // Refusals BEFORE the key is touched, in the order a reader would want
    // them: platform first (nothing about the request can fix it), then the
    // venue, then the pair.
    if (restBlocked()) throw new PlatformRestrictedError(DISPLAY_NAME)

    const fetchedAt = new Date(now()).toISOString()
    const venueId = String(p['venue'] ?? p['market'] ?? '')
    const pairKey = String(p['pair'] ?? '')
    if (!venueId || !pairKey) {
      throw new CoinglassApiError(
        'bad_request',
        'Coinglass liquidations need a venue and a pair.',
      )
    }

    const venue = coinglassVenue(venueId)
    if (!venue) return unavailable('not_tracked', fetchedAt)

    const pair = parseFuturesPairKey(pairKey)
    // Coinglass serves futures liquidations. A spot key has none, and saying
    // so beats attaching a perpetual's prints to an instrument without them.
    if (!pair) return unavailable('not_tracked', fetchedAt)

    // Everything past here needs the key, so everything past here can refuse
    // for a reason the user fixes in the Plugin Store rather than in the pane.
    // Those come back as the typed `plan_required` refusal: the hook carries it
    // in `unavailable`, and the pane states it. The one thing this must never
    // do is fall through to a zero-bucket success, which reads as "nothing was
    // liquidated" on a contract that was liquidated plenty.
    try {
      return await serve({ venue, pair, venueId, pairKey, p, fetchedAt })
    } catch (error) {
      if (isCoinglassApiError(error) && CREDENTIAL_REFUSALS.has(error.reason)) {
        return unavailable('plan_required', fetchedAt)
      }
      throw error
    }
  }

  /**
   * The part that spends the key: probe, page, aggregate.
   *
   * Split from `clusters` so the credential catch wraps exactly the calls that
   * can raise one, and not the venue and pair gates in front of them. Wrapping
   * those too would let a future `bad_request` on a malformed pair key come
   * back as "your plan is wrong".
   */
  async function serve(input: {
    venue: NonNullable<ReturnType<typeof coinglassVenue>>
    pair: NonNullable<ReturnType<typeof parseFuturesPairKey>>
    venueId: string
    pairKey: string
    p: Record<string, unknown>
    fetchedAt: string
  }): Promise<LiquidationClustersResponse | LiquidationsUnavailableResponse> {
    const { venue, pair, venueId, pairKey, p, fetchedAt } = input

    if (apiKey.trim() === '') {
      throw new CoinglassApiError(
        'key_missing',
        'Coinglass needs an API key. Add one in the plugin settings.',
      )
    }

    // The live spelling of the exchange, from the one endpoint every plan can
    // call. It doubles as the key probe: if this answers and the prints
    // endpoint does not, the plan is the problem, not the key.
    const api = ensureClient()
    const names = await api.exchangeNames()
    const exchange =
      names.find((n) => n.toLowerCase() === venue.exchange.toLowerCase()) ??
      null
    // Coinglass itself says it does not carry this venue. That is the same
    // fact the pane already renders for an uncollected venue.
    if (!exchange) return unavailable('not_tracked', fetchedAt)

    const hours = clampWindowHours(p['hours'])
    const until = now()
    const retentionFloor = until - COINGLASS_RETENTION_MS
    const since = Math.max(until - hours * 3_600_000, retentionFloor)

    const { rows, truncated } = await store.read(`${venueId}:${pairKey}`, {
      since,
      until,
      walk: (from, to) =>
        walkWindow({
          fetchPage: (startTime, endTime) =>
            api.liquidationOrders({
              exchange,
              symbol: pair.base,
              minLiquidationUsd,
              startTime,
              endTime,
            }),
          startTime: from,
          endTime: to,
          maxRequests: DEFAULT_MAX_REQUESTS,
        }),
    })

    const { buckets, bucketWidth } = aggregateLiquidationOrders({
      rows,
      pair,
      exchange,
      since,
    })

    return {
      venue: venueId,
      pairKey,
      bucketWidth,
      resolutionMs: LIQUIDATION_RESOLUTION_MS,
      retentionMs: COINGLASS_RETENTION_MS,
      // Honest: nothing older than the retention floor can be served, whatever
      // window was asked for.
      trackedSince: retentionFloor,
      completeness: resolveCompleteness(venue.streamCompleteness, {
        thresholdUsd: minLiquidationUsd,
        truncated,
      }),
      buckets,
      fetchedAt,
    }
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params
    if (capability !== 'market-data:liquidations') {
      throw new Error(
        `coinglass-liquidations: unsupported capability '${capability}'`,
      )
    }
    return clusters(p)
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,

    async initialize(config: Record<string, unknown>) {
      const next = String(config['apiKey'] ?? '').trim()
      if (next === '') {
        throw new Error(
          'Coinglass API key required: add it in the plugin settings',
        )
      }
      // A new key is a new budget and a new entitlement, so the cached client
      // (and the exchange list it memoized) must not outlive it.
      if (next !== apiKey) {
        apiKey = next
        client = null
        store.clear()
      }
      minLiquidationUsd = readMinLiquidationUsd(config['minLiquidationUsd'])
    },

    async destroy() {
      store.clear()
      client = null
    },
  }
}
