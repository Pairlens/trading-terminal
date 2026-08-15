// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The ccxt `PredictionExchange` instance a venue's plugin runs on.
 *
 * Same three policies as the spot host (`ccxt-connector/exchange-host.ts`), for
 * the same reasons — the instance IS the connection pool so a reconnect means
 * discarding it; `close()` can hang on a socket that is already CLOSED so every
 * close is raced against a timeout; liveness has to be observed here because
 * ccxt's ping loop cannot detect a stall in a browser — and one difference that
 * matters:
 *
 * **No `defaultType: 'spot'`, no `fetchMarkets: {types: ['spot']}`.** Every
 * prediction market row has `spot: false`, so the spot host's unconditional
 * options would filter the venue's entire universe to nothing. This host sets
 * neither.
 *
 * A host is PUBLIC or AUTHED, never both, and for the same reason: ccxt signs
 * opportunistically the moment credentials are present, and market data must
 * not carry a signature.
 */

import { restFetch } from '@pairlens/market-engine/http'
import { withGeoClassification } from '../ccxt-connector/exchange-host'
import type {
  PredictionCredentialSet,
  PredictionExchangeLike,
  PredictionVenueConfig,
} from './types'

/** How long to wait on `close()` before discarding the instance anyway. */
const CLOSE_TIMEOUT_MS = 3_000

export type PredictionExchangeLease = {
  exchange: PredictionExchangeLike
  /** Bumped on every close — stale work compares against `host.generation`. */
  generation: number
}

export type PredictionExchangeHostOptions = {
  venue: PredictionVenueConfig
  /** Omitted or null builds a PUBLIC instance, which must never sign. */
  credentials?: PredictionCredentialSet | null
  /** Route this instance at the venue's demo environment. */
  paper?: boolean
  /** Raw inbound frame observed (the liveness signal). */
  onInbound?: () => void
  onError?: (scope: string, error: unknown) => void
}

/**
 * Turn on the venue's sandbox and report whether it actually took.
 *
 * `setSandboxMode` gates on `'test' in this.urls` and assigns
 * `clone(urls.test)` to `urls.api` — on a venue that declares the key with an
 * undefined value that blanks the base URL instead of throwing. Kalshi does
 * declare a real demo host, so this normally succeeds; verifying anyway is what
 * makes a paper order refuse rather than reach the live matching engine on a
 * venue where it silently did not.
 */
export function enablePredictionSandbox(
  exchange: PredictionExchangeLike,
): boolean {
  if (typeof exchange.setSandboxMode !== 'function') return false
  const before = exchange.urls['api']
  try {
    exchange.setSandboxMode(true)
  } catch {
    return false
  }
  const after = exchange.urls['api']
  if (!isUsableApiUrls(after)) {
    exchange.urls['api'] = before
    exchange.isSandboxModeEnabled = false
    return false
  }
  return after !== before || exchange.options['sandboxMode'] === true
}

function isUsableApiUrls(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0
  if (!value || typeof value !== 'object') return false
  return Object.keys(value).length > 0
}

export class PredictionExchangeHost {
  private instance: PredictionExchangeLike | null = null
  private building: Promise<PredictionExchangeLike> | null = null
  private country = ''
  private instanceCountry = ''
  private generationCounter = 0
  private destroyed = false
  private paperActiveFlag = false

  constructor(private readonly opts: PredictionExchangeHostOptions) {}

  get generation(): number {
    return this.generationCounter
  }

  /** True when this host asked for paper AND the venue's sandbox took effect. */
  get paperActive(): boolean {
    return this.paperActiveFlag
  }

  get authed(): boolean {
    return this.opts.credentials != null
  }

  /** The live instance, or null when none is built. Never constructs. */
  peek(): PredictionExchangeLike | null {
    return this.instance
  }

  /**
   * Record the caller's region; returns true when the live instance was built
   * for a different one. The caller decides WHEN to rebuild — tearing an
   * instance down mid-subscribe would drop the frame it is about to deliver.
   */
  setCountry(country: string): boolean {
    this.country = country
    return this.instance !== null && this.instanceCountry !== country
  }

  /**
   * The live instance, building one if needed. Concurrent callers share a
   * single construction: a venue switch acquires candles, ticker, book and
   * trades in the same tick and must not build four exchanges.
   */
  async acquire(): Promise<PredictionExchangeLease> {
    if (this.destroyed) {
      throw new Error(`${this.opts.venue.marketId}: destroyed`)
    }
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

  private async build(): Promise<PredictionExchangeLike> {
    const { venue } = this.opts
    const Exchange = await venue.loadExchangeClass()
    if (this.destroyed) throw new Error(`${venue.marketId}: destroyed`)

    const credentials = this.opts.credentials ?? null
    const exchange = new Exchange({
      enableRateLimit: true,
      timeout: 15_000,
      ...venue.options,
      // After the venue's own config, so a venue can never pin a credential.
      ...(credentials
        ? {
            ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
            ...(credentials.secret ? { secret: credentials.secret } : {}),
            ...(credentials.password ? { password: credentials.password } : {}),
            ...(credentials.privateKey
              ? { privateKey: credentials.privateKey }
              : {}),
            ...(credentials.walletAddress
              ? { walletAddress: credentials.walletAddress }
              : {}),
          }
        : {}),
      options: {
        // ccxt retains 1000 trades per outcome in its WS cache; the bridge
        // copies everything out on delivery, so that depth is pure retained
        // memory. No OHLCV cap — neither venue streams candles.
        tradesLimit: 200,
        ...((venue.options?.['options'] as Record<string, unknown>) ?? {}),
      },
    })

    // Must be assigned before the first request: ccxt memoizes the resolved
    // implementation the first time it fetches.
    exchange.fetchImplementation = withGeoClassification(
      restFetch,
      venue.displayName,
      () => this.country,
    )

    if (this.opts.paper) {
      this.paperActiveFlag = enablePredictionSandbox(exchange)
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
   * Close and discard the instance, bumping the generation. Discarding rather
   * than reusing is the only reliable way to clear the per-instance caches
   * ccxt stashes in `options` (Polymarket keeps its derived L2 credentials
   * and its outcome index there) and that survive a plain `close()`.
   */
  async close(): Promise<void> {
    const exchange = this.instance
    this.instance = null
    this.instanceCountry = ''
    this.paperActiveFlag = false
    this.generationCounter++
    if (!exchange) return
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
