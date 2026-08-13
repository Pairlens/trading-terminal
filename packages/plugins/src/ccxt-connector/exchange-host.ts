// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Owns the one ccxt Pro instance a venue's plugin runs on: construction,
 * transport wiring, region rebuilds, and the generation counter the watch
 * driver uses to ignore work that belongs to a socket we already walked away
 * from.
 *
 * Three things about ccxt shape this file:
 *
 * 1. **The instance IS the connection pool.** `exchange.clients` is keyed by
 *    URL and a `WsClient` never reconnects itself — ccxt deletes the dead
 *    client and the next `watch*` builds a new one. So "force a reconnect"
 *    means `exchange.close()`, and "change region" means a NEW instance, not a
 *    mutated `urls` (the old one still holds KuCoin's bullet URL, Binance's
 *    `streamBySubscriptionsHash`, MEXC's listenKey and Coinbase's wsToken in
 *    `options`, all of which survive `close()`).
 * 2. **`close()` can hang.** `WsClient.close()` returns a Future resolved only
 *    from `onClose`, and a socket already `CLOSED` never fires it again — the
 *    wake-from-sleep case exactly. Every close is raced against a timeout and
 *    the instance is then discarded regardless.
 * 3. **Liveness has to be observed here.** ccxt's ping loop degrades to
 *    `this.lastPong = now` in a browser, so its stall detector can never fire.
 *    Wrapping `handleMessage` before the first client is constructed (ccxt
 *    binds it once, per client) gives the driver a true raw-inbound signal —
 *    including the pong frames that would otherwise be invisible.
 *
 * REST goes through `restFetch`, which is structurally a WHATWG `fetch` and is
 * exactly what ccxt's `fetchImplementation` seam wants: desktop routes absolute
 * URLs through the Rust HTTP client, the `globalThis.fetch` test stub still
 * intercepts, and relative dev-proxy prefixes stay on the platform fetch.
 *
 * A host is either PUBLIC or AUTHED, never both. ccxt signs opportunistically:
 * `kucoin.loadMarkets()` calls `privateGetMarginSymbols` the moment credentials
 * are present, and several venues switch `fetchCurrencies` to a private
 * endpoint the same way. Market data must not carry a signature, so the read
 * path builds its instance with no credentials at all and the trading path
 * builds one per credential slot.
 */

import { restFetch } from '@pairlens/market-engine/http'
import {
  assertResponseOk,
  isGeoRestrictedError,
} from '@pairlens/market-engine/errors'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'

/** How long to wait on `close()` before discarding the instance anyway. */
const CLOSE_TIMEOUT_MS = 3_000

export type ExchangeLease = {
  exchange: CcxtExchangeLike
  /** Bumped on every close/rebuild — stale work compares against `host.generation`. */
  generation: number
}

/** ccxt's credential field names. Pairlens `passphrase` is ccxt `password`. */
export type CcxtCredentialSet = {
  apiKey: string
  secret: string
  password?: string
}

export type CcxtExchangeHostOptions = {
  venue: CcxtVenueConfig
  /**
   * Credentials for an authed instance. Omitted (or null) builds a PUBLIC
   * instance, which must never sign — see the file header.
   */
  credentials?: CcxtCredentialSet | null
  /**
   * The credential's home regional entity ('' = route by country). Carried
   * into the `CcxtUrlContext` handed to the venue's URL hooks — see the type's
   * own doc for why a key's home entity outranks the user's country.
   */
  entity?: string
  /** Route this instance at the venue's sandbox/demo environment. */
  paper?: boolean
  /** Raw inbound frame observed (the liveness signal). */
  onInbound?: () => void
  onError?: (scope: string, error: unknown) => void
}

/**
 * Map the credential keys the CEX shell puts in a slot onto ccxt's.
 *
 * Returns null when the pair that every venue needs is incomplete — the shell
 * already refuses to build a slot without the required keys, so this is the
 * belt to that braces rather than a user-facing path.
 */
export function toCcxtCredentials(
  credentials: Record<string, string>,
): CcxtCredentialSet | null {
  const apiKey = credentials['apiKey'] ?? ''
  const secret = credentials['apiSecret'] ?? ''
  if (!apiKey || !secret) return null
  const password = credentials['passphrase'] ?? ''
  return { apiKey, secret, ...(password ? { password } : {}) }
}

/**
 * Turn on the venue's sandbox and report whether it actually took.
 *
 * `setSandboxMode` cannot be trusted to fail loudly. The base implementation
 * gates on `'test' in this.urls`, and eight of the fourteen venues declare the
 * key with an `undefined` value — so instead of throwing `NotSupported` it
 * assigns `clone(undefined)` to `urls.api` and every subsequent request loses
 * its base URL. Measured 2026-08 on bitvavo, mexc, kucoin, coinbase, kraken,
 * htx, bitfinex and upbit.
 *
 * So: call it, then verify. A blanked `urls.api` is restored and reported as
 * "no sandbox here", which is what makes the caller refuse a paper order
 * rather than quietly send it to the live matching engine.
 */
export function enableCcxtSandbox(exchange: CcxtExchangeLike): boolean {
  if (typeof exchange.setSandboxMode !== 'function') return false
  const before = exchange.urls['api']
  try {
    exchange.setSandboxMode(true)
  } catch {
    // NotSupported: the venue declares no test endpoints at all.
    return false
  }
  const after = exchange.urls['api']
  if (!isUsableApiUrls(after)) {
    exchange.urls['api'] = before
    exchange.isSandboxModeEnabled = false
    return false
  }
  // Bitget's override leaves `urls.api` alone and only flips a header flag, so
  // "changed" alone would under-report; the flag alone would over-report on the
  // venues repaired above.
  return after !== before || exchange.options['sandboxMode'] === true
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

/**
 * Wrap a transport so a geo-block HTTP status becomes a typed
 * `GeoRestrictedError` before ccxt can lose it.
 *
 * The native connectors ran `assertResponseOk(resp, …)` at every REST call
 * site, which read `resp.status` directly. ccxt gives the bridge no such seam
 * downstream: `handleRestResponse` calls the VENUE's `handleErrors` first, and
 * most venues parse the body and throw their own error without ever mentioning
 * the status — ByBit answers a 451 with `ExchangeError('bybit {}')`. Recovering
 * "451" from that message is impossible, because it is not in it.
 *
 * The one place the status is still visible is the response itself, and the
 * bridge owns the transport (`fetchImplementation`), so the classification goes
 * here — the same layer, and the same rule, as the native's.
 *
 * ccxt's own `catch` around `fetchImplementation` rethrows anything that is not
 * an abort, a `TypeError` or a coded connection error, so the typed error
 * reaches the caller intact.
 *
 * Only 451 and 403 pay anything: every other status returns the untouched
 * response, and the 403 body is read from a `clone()` so ccxt still gets its
 * own unread stream.
 */
export function withGeoClassification(
  base: FetchLike,
  exchange: string,
  country: () => string,
): FetchLike {
  return async (input, init) => {
    const response = await base(input, init)
    if (response.ok) return response
    // 451 is unambiguous; 403 needs body evidence (exchanges also use it for a
    // revoked key and for WAF bans, and calling those a region block would send
    // the user to a dialog that cannot help them).
    if (response.status !== 451 && response.status !== 403) return response
    const body =
      response.status === 403
        ? await response
            .clone()
            .text()
            .catch(() => '')
        : ''
    try {
      assertResponseOk(
        { ok: false, status: response.status },
        exchange,
        country(),
        body,
      )
    } catch (error) {
      // `assertResponseOk` also throws a generic `<exchange> REST error: 403`
      // for a 403 with no evidence. That one is NOT ours to raise — ccxt's own
      // handler produces a better message from the body it is about to read.
      if (isGeoRestrictedError(error)) throw error
    }
    return response
  }
}

function isUsableApiUrls(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0
  if (!value || typeof value !== 'object') return false
  return Object.keys(value).length > 0
}

export class CcxtExchangeHost {
  private instance: CcxtExchangeLike | null = null
  private building: Promise<CcxtExchangeLike> | null = null
  private country = ''
  private instanceCountry = ''
  private generationCounter = 0
  private destroyed = false
  private paperActiveFlag = false
  /** What the venue chose to carry out of the last discarded instance. */
  private captured: { value: unknown; country: string } | null = null

  constructor(private readonly opts: CcxtExchangeHostOptions) {}

  get generation(): number {
    return this.generationCounter
  }

  /** True when this host asked for paper AND the venue's sandbox took effect. */
  get paperActive(): boolean {
    return this.paperActiveFlag
  }

  /** True when this host signs its requests. */
  get authed(): boolean {
    return this.opts.credentials != null
  }

  /** The live instance, or null when none is built. Never constructs. */
  peek(): CcxtExchangeLike | null {
    return this.instance
  }

  /**
   * Record the caller's region. Returns true when the live instance was built
   * for a different one and must be rebuilt — the caller decides when, because
   * tearing an instance down mid-`subscribe` would drop the frame it is about
   * to deliver.
   */
  setCountry(country: string): boolean {
    this.country = country
    return this.instance !== null && this.instanceCountry !== country
  }

  /**
   * The live instance, building one if needed. Concurrent callers share a
   * single construction — a venue switch acquires candles, ticker, book and
   * trades in the same tick and must not build four exchanges.
   */
  async acquire(): Promise<ExchangeLease> {
    if (this.destroyed)
      throw new Error(`${this.opts.venue.marketId}: destroyed`)
    if (this.instance) {
      return { exchange: this.instance, generation: this.generationCounter }
    }
    if (!this.building) {
      this.building = this.build().finally(() => {
        this.building = null
      })
    }
    const exchange = await this.building
    return { exchange, generation: this.generationCounter }
  }

  private async build(): Promise<CcxtExchangeLike> {
    const { venue } = this.opts
    const Exchange = await venue.loadExchangeClass()
    if (this.destroyed) throw new Error(`${venue.marketId}: destroyed`)

    const credentials = this.opts.credentials ?? null
    const exchange = new Exchange({
      enableRateLimit: true,
      timeout: 15_000,
      // The public instance never reads `exchange.currencies` — the trimmed
      // markets table stores no currency fields — but `loadMarketsHelper`
      // awaits `fetchCurrencies()` BEFORE `fetchMarkets()`, a serialized
      // round trip plus a throttle slot on the exact path first paint waits
      // on. Six venues issue that call unauthenticated (Gate, Bitget,
      // Bitvavo, HTX, Bitfinex, Kraken); all but Kraken (see
      // `needsPublicCurrencies`) skip it now. The ccxt constructor
      // deep-extends `has`, so only this one flag changes.
      ...(credentials === null && venue.needsPublicCurrencies !== true
        ? { has: { fetchCurrencies: false } }
        : {}),
      ...venue.options,
      // After the venue's own config, so a venue can never accidentally pin a
      // credential, and before `options`, which is merged separately below.
      ...(credentials
        ? {
            apiKey: credentials.apiKey,
            secret: credentials.secret,
            ...(credentials.password ? { password: credentials.password } : {}),
          }
        : {}),
      options: {
        // ByBit and friends default to swap; spot is the only asset class
        // Pairlens trades on a CEX, and the wrong default silently resolves
        // BTC/USDT to a perpetual.
        defaultType: 'spot',
        fetchMarkets: { types: ['spot'] },
        // ccxt THROWS rather than warns when Binance's open-order list is
        // requested without a symbol, and the connector genuinely has no symbol
        // to give at credential-provisioning time — the terminal asks for every
        // resting order before the user has picked a pair. Acknowledging the
        // heavier rate-limit weight is the documented opt-in; the call runs once
        // per credential, not on a timer.
        fetchOpenOrders: { warnWithoutSymbol: false },
        // ccxt retains 1000 trades and 1000 OHLCV rows per symbol in its WS
        // caches. The bridge copies everything out on delivery and keeps
        // candle history in its own CandleBuffer, so that depth is pure
        // retained memory — and the Kraken guard copies-and-sorts the whole
        // OHLCV cache once per frame. 60 stays comfortably above the largest
        // subscribe burst measured (~15 bars); a venue can override either.
        tradesLimit: 200,
        OHLCVLimit: 60,
        ...((venue.options?.['options'] as Record<string, unknown>) ?? {}),
      },
    })

    // Must be assigned before the first request: ccxt memoizes the resolved
    // implementation on the instance the first time it fetches. Assigning
    // anything here also keeps `fetchIsNative` false, which matters — ccxt
    // bypasses `fetchImplementation` entirely for the native fetch on node.
    exchange.fetchImplementation = withGeoClassification(
      restFetch,
      venue.displayName,
      () => this.country,
    )

    if (venue.timeframeOverrides) {
      Object.assign(exchange.timeframes, venue.timeframeOverrides)
    }
    // What this instance IS travels with the country: a venue whose public and
    // authed traffic route to different origins (OKX) cannot tell them apart
    // from the country alone, and getting it wrong sends an EEA user's orders
    // to a host their key does not exist on.
    const urlContext = {
      authed: credentials !== null,
      paper: this.opts.paper === true,
      entity: this.opts.entity ?? '',
    }
    venue.applyUrls?.(exchange, this.country, urlContext)

    // Sandbox last: it replaces the whole `urls.api` subtree, so anything
    // `applyUrls` installed is gone afterwards. `applyPaperUrls` is the venue's
    // chance to put back what still matters on the testnet endpoints (a
    // portless WS host, a missing spot channel).
    if (this.opts.paper) {
      this.paperActiveFlag = enableCcxtSandbox(exchange)
      if (this.paperActiveFlag) {
        venue.applyPaperUrls?.(exchange, this.country, urlContext)
      }
    }

    // A venue may carry expensive negotiated state (KuCoin's bullet URL)
    // across the discard-and-rebuild lifecycle — same country only, since
    // endpoints move with it.
    if (this.captured && this.captured.country === this.country) {
      try {
        venue.seedOptions?.(exchange, this.captured.value)
      } catch {
        // A bad carry must never break a build — the venue just re-earns it.
      }
    }

    // Bound once per client at client construction — wrapping after the first
    // socket opens would miss that socket's traffic entirely.
    const onInbound = this.opts.onInbound
    if (onInbound && typeof exchange.handleMessage === 'function') {
      const original = exchange.handleMessage.bind(exchange)
      exchange.handleMessage = (client: unknown, message: unknown) => {
        onInbound()
        return original(client, message)
      }
    }

    this.instance = exchange
    this.instanceCountry = this.country
    return exchange
  }

  /**
   * Close and discard the instance, bumping the generation.
   *
   * Discarding rather than reusing is deliberate: it is the only reliable way
   * to clear the per-instance caches ccxt stashes in `options` and survives a
   * plain `close()`.
   */
  async close(): Promise<void> {
    const exchange = this.instance
    if (exchange && this.opts.venue.captureOptions) {
      try {
        this.captured = {
          value: this.opts.venue.captureOptions(exchange),
          country: this.instanceCountry,
        }
      } catch {
        this.captured = null
      }
    }
    this.instance = null
    this.instanceCountry = ''
    this.paperActiveFlag = false
    this.generationCounter++
    if (!exchange) return
    // The loser of the race has to be cleaned up: a 3 s timer left pending on
    // every close keeps the event loop alive that much longer, which in a
    // process that closes an instance per venue switch is a visible tail on
    // shutdown (and three extra seconds on every test file that builds one).
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        exchange.close(true),
        new Promise((resolve) => {
          timer = setTimeout(resolve, CLOSE_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      this.opts.onError?.('close', error)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    await this.close()
  }
}
