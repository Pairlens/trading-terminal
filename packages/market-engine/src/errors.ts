// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Typed connector errors shared across all market connectors.
 *
 * These are constructed inside connector packages but inspected in the
 * terminal, which may load a *different* bundled copy of this module. So the
 * type guards key off a stable `name` string rather than `instanceof`, which
 * is unreliable across module/bundle boundaries.
 */

/**
 * The exchange has refused service for the user's region — either because we
 * statically know the venue is unavailable there (e.g. ByBit in the US) or
 * because the exchange returned a geo-block HTTP status (451, or 403 with
 * body evidence of a geo block).
 */
export class GeoRestrictedError extends Error {
  /** Sentinel for the cross-bundle type guard (survives name mangling). */
  readonly __geoRestricted = true
  readonly exchange: string
  /** User's selected ISO country code, or '' if they haven't set one. */
  readonly region: string
  /** HTTP status that triggered detection, when reactive (451 or 403). */
  readonly status?: number

  constructor(exchange: string, region: string, status?: number) {
    super(
      `${exchange} is not available in your region${
        region ? ` (${region})` : ''
      }`,
    )
    this.name = 'GeoRestrictedError'
    this.exchange = exchange
    this.region = region
    this.status = status
  }
}

/** True when `e` is a GeoRestrictedError (robust across bundle boundaries). */
export function isGeoRestrictedError(e: unknown): e is GeoRestrictedError {
  return (
    e instanceof Error &&
    (e.name === 'GeoRestrictedError' ||
      (e as Partial<GeoRestrictedError>).__geoRestricted === true)
  )
}

/**
 * The venue cannot be reached from this build at all — not a region block, a
 * platform one.
 *
 * A browser tab can only make REST calls to hosts that send
 * `Access-Control-Allow-Origin`, and some exchanges send none: api.coinbase.com,
 * api.kucoin.com, api.gateio.ws and api.mexc.com. WebSockets are exempt from
 * CORS, so where a venue streams enough history to seed a chart we use that
 * instead (Bitfinex ships a 240-bar snapshot; OKX reads public data from its
 * CORS-enabled global host). These four can do neither — Coinbase's WS candles
 * are 5-minute-only, Gate's and MEXC's carry no history, and KuCoin cannot even
 * open a socket because its WS URL comes from a REST POST that is itself
 * blocked.
 *
 * Rather than let that surface as a chart that hangs and then shows one candle,
 * connectors declare it up front and the terminal offers the desktop app, which
 * reaches these venues through the Rust HTTP client and is unaffected.
 */
export class PlatformRestrictedError extends Error {
  /** Sentinel for the cross-bundle type guard (survives name mangling). */
  readonly __platformRestricted = true
  readonly exchange: string
  /** Where the venue does work, for the UI's call to action. */
  readonly availableOn = 'desktop' as const

  constructor(exchange: string) {
    super(`${exchange} is only available in the desktop app`)
    this.name = 'PlatformRestrictedError'
    this.exchange = exchange
  }
}

/** True when `e` is a PlatformRestrictedError (robust across bundles). */
export function isPlatformRestrictedError(
  e: unknown,
): e is PlatformRestrictedError {
  return (
    e instanceof Error &&
    (e.name === 'PlatformRestrictedError' ||
      (e as Partial<PlatformRestrictedError>).__platformRestricted === true)
  )
}

/**
 * The provider is refusing requests right now, and the SAME request would
 * succeed later — a free-tier rate limit (429) or a transient server error
 * (5xx).
 *
 * This exists because a throttled provider looks exactly like a missing market
 * to everything downstream. GeckoTerminal's free tier allows roughly 30
 * requests a minute across one IP; a busy DEX board plus a charted pair can
 * reach that, and once it does the candle probe comes back empty and the
 * terminal used to record the pair as "not carried by this venue" — a verdict
 * that outlived the throttle. So the DEX clients raise this instead of
 * returning an empty result, and every consumer that would otherwise publish a
 * permanent verdict checks for it first.
 *
 * `retryAfterMs` is the provider's own `Retry-After` where it sends one, and a
 * conservative default otherwise. It is advice, not a guarantee.
 */
export class ProviderThrottledError extends Error {
  /** Sentinel for the cross-bundle type guard (survives name mangling). */
  readonly __providerThrottled = true
  /** Display name of the data provider, for the pane's error banner. */
  readonly provider: string
  /** HTTP status that triggered detection (429, or a 5xx). */
  readonly status: number
  /** How long to wait before the next attempt is worth making. */
  readonly retryAfterMs: number

  constructor(provider: string, status: number, retryAfterMs: number) {
    super(
      status === 429
        ? `${provider} is rate limiting requests. Try again shortly.`
        : `${provider} is temporarily unavailable (HTTP ${status}). Try again shortly.`,
    )
    this.name = 'ProviderThrottledError'
    this.provider = provider
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** True when `e` is a ProviderThrottledError (robust across bundles). */
export function isProviderThrottledError(
  e: unknown,
): e is ProviderThrottledError {
  return (
    e instanceof Error &&
    (e.name === 'ProviderThrottledError' ||
      (e as Partial<ProviderThrottledError>).__providerThrottled === true)
  )
}

/** Cool-off for a 429 that carried no usable `Retry-After`. */
export const THROTTLE_COOLDOWN_MS = 15_000
/** Cool-off for a 5xx. Shorter: an overloaded edge usually recovers fast. */
export const TRANSIENT_COOLDOWN_MS = 3_000

/**
 * `Retry-After` in milliseconds. The header is either delta-seconds or an
 * HTTP date; anything else (and a date already in the past) reads as absent.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
): number | null {
  if (!value) return null
  const seconds = Number(value.trim())
  if (Number.isFinite(seconds)) {
    return seconds > 0 ? Math.round(seconds * 1000) : null
  }
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return null
  const delta = at - Date.now()
  return delta > 0 ? delta : null
}

/** Just enough of a `Response` to classify it. Keeps this testable. */
type ClassifiableResponse = {
  status: number
  headers?: { get: (name: string) => string | null } | undefined
}

/**
 * Classify a response as a throttle/transient refusal, or null when the status
 * says something else entirely (including a 2xx).
 *
 * One source of truth for WHICH statuses are worth retrying, because the two
 * DEX data providers and the paced GeckoTerminal transport all have to agree:
 * if one of them treated a 429 as "no such pool", the pane would latch an empty
 * state the other two are still retrying out of.
 */
export function providerThrottleFromResponse(
  resp: ClassifiableResponse,
  provider: string,
): ProviderThrottledError | null {
  if (resp.status === 429) {
    let retryAfter: number | null = null
    try {
      retryAfter = parseRetryAfterMs(resp.headers?.get('retry-after'))
    } catch {
      // A Response implementation without usable headers (or a Tauri-side
      // shim) must not turn a throttle into an unhandled error.
      retryAfter = null
    }
    return new ProviderThrottledError(
      provider,
      429,
      retryAfter ?? THROTTLE_COOLDOWN_MS,
    )
  }
  if (resp.status >= 500 && resp.status <= 599) {
    return new ProviderThrottledError(
      provider,
      resp.status,
      TRANSIENT_COOLDOWN_MS,
    )
  }
  return null
}

/** Substrings exchanges use in geo-block response bodies (case-insensitive). */
const GEO_BLOCK_MARKERS = [
  'restricted',
  'region',
  'country',
  'location',
  'unavailable in your',
]

function bodyIndicatesGeoBlock(body: string): boolean {
  const lower = body.toLowerCase()
  return GEO_BLOCK_MARKERS.some((marker) => lower.includes(marker))
}

/**
 * Assert a fetch Response is OK, throwing a typed error otherwise.
 *
 * - 451 (Unavailable For Legal Reasons) is unambiguous → GeoRestrictedError
 *   so the UI can surface a region-aware dialog.
 * - 403 (Forbidden) is ambiguous — exchanges also use it for revoked API
 *   keys and WAF/rate-limit bans. Only classify it as a geo block when the
 *   response body (optional, best-effort) contains a known geo-block marker.
 * - Any other non-2xx (and 403 without body evidence) → a generic Error with
 *   the status, preserving today's message shape
 *   (`"<Exchange> REST error: <status>"`).
 */
export function assertResponseOk(
  resp: { ok: boolean; status: number },
  exchange: string,
  region: string,
  body?: string,
): void {
  if (resp.ok) return
  if (resp.status === 451) {
    throw new GeoRestrictedError(exchange, region, resp.status)
  }
  if (
    resp.status === 403 &&
    body !== undefined &&
    bodyIndicatesGeoBlock(body)
  ) {
    throw new GeoRestrictedError(exchange, region, resp.status)
  }
  throw new Error(`${exchange} REST error: ${resp.status}`)
}
