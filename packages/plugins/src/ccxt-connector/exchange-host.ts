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
 */

import { restFetch } from '@pairlens/market-engine/http'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'

/** How long to wait on `close()` before discarding the instance anyway. */
const CLOSE_TIMEOUT_MS = 3_000

export type ExchangeLease = {
  exchange: CcxtExchangeLike
  /** Bumped on every close/rebuild — stale work compares against `host.generation`. */
  generation: number
}

export type CcxtExchangeHostOptions = {
  venue: CcxtVenueConfig
  /** Raw inbound frame observed (the liveness signal). */
  onInbound?: () => void
  onError?: (scope: string, error: unknown) => void
}

export class CcxtExchangeHost {
  private instance: CcxtExchangeLike | null = null
  private building: Promise<CcxtExchangeLike> | null = null
  private country = ''
  private instanceCountry = ''
  private generationCounter = 0
  private destroyed = false

  constructor(private readonly opts: CcxtExchangeHostOptions) {}

  get generation(): number {
    return this.generationCounter
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

    const exchange = new Exchange({
      enableRateLimit: true,
      timeout: 15_000,
      ...venue.options,
      options: {
        // ByBit and friends default to swap; spot is the only asset class
        // Pairlens trades on a CEX, and the wrong default silently resolves
        // BTC/USDT to a perpetual.
        defaultType: 'spot',
        fetchMarkets: { types: ['spot'] },
        ...((venue.options?.['options'] as Record<string, unknown>) ?? {}),
      },
    })

    // Must be assigned before the first request: ccxt memoizes the resolved
    // implementation on the instance the first time it fetches.
    exchange.fetchImplementation = restFetch

    if (venue.timeframeOverrides) {
      Object.assign(exchange.timeframes, venue.timeframeOverrides)
    }
    venue.applyUrls?.(exchange, this.country)

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
    this.instance = null
    this.instanceCountry = ''
    this.generationCounter++
    if (!exchange) return
    try {
      await Promise.race([
        exchange.close(true),
        new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
      ])
    } catch (error) {
      this.opts.onError?.('close', error)
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    await this.close()
  }
}
