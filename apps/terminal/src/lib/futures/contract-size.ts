// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Base units per contract, per (venue, contract).
 *
 * A ticket that sizes in contracts is unreadable without this on two of the
 * three v1 venues: KuCoin's XBTUSDTM is 0.001 BTC per contract, so "10" means
 * 0.01 BTC, and a trader reading it as 10 BTC is off by three orders of
 * magnitude. Binance and Kraken linear perps are 1:1, which is exactly why the
 * hint hides itself when it would only restate the contract count.
 *
 * The numbers live in each futures connector's own cached market table, which
 * is a KV read. The ticket needs an answer SYNCHRONOUSLY, on the render that
 * shows the size field, so this keeps a module-scoped map: warmed once per
 * session (and again when a venue's table is rebuilt), read synchronously
 * afterwards.
 *
 * "Not in the map" is reported as UNKNOWN, never as 1. The first-ever visit to
 * a futures venue warms a cache the connector has not written yet, and a
 * warm-once latch then pinned every contract at 1 for the rest of the session
 * — silently a thousand-fold understatement of a KuCoin order's exposure in
 * the risk guard. So a miss on a perp pair retries a few times on a short
 * backoff while that pair is on screen, and the callers that cannot wait pass
 * the unknown along rather than substituting a number.
 *
 * The read costs an IndexedDB round trip, so nothing here runs for a pair that
 * is not a perp.
 */
import { useEffect, useSyncExternalStore } from 'react'

import { readCachedFuturesListings } from '@pairlens/plugins/ccxt-futures-connector/listings'

import { isPerpPairKey, normalizePairKey } from '@/lib/pairs'

const sizes = new Map<string, number>()
const listeners = new Set<() => void>()
let version = 0
let warming: Promise<void> | null = null

/** Re-reads granted to one unresolved contract before giving up on it. */
const MISS_RETRIES = 4
/** Grows per attempt: a venue table lands within a second of the first quote. */
const MISS_BACKOFF_MS = 1200

function keyOf(market: string, pair: string): string {
  return `${market}:${normalizePairKey(pair)}`
}

function publish(): void {
  version++
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getVersion(): number {
  return version
}

/** Read every cached futures table into the map. Idempotent; shared in flight. */
export function warmContractSizes(): Promise<void> {
  if (warming) return warming
  warming = (async () => {
    try {
      const tables = await readCachedFuturesListings()
      let changed = false
      for (const table of tables) {
        for (const row of table.listings) {
          const size = Number(row.contractSize)
          if (!Number.isFinite(size) || size <= 0) continue
          const key = keyOf(table.venue, row.symbol)
          if (sizes.get(key) === size) continue
          sizes.set(key, size)
          changed = true
        }
      }
      if (changed) publish()
    } catch {
      // A venue that has never been reached has no table yet. The retry above
      // this is what covers the case where it is about to have one.
    } finally {
      warming = null
    }
  })()
  return warming
}

/** Synchronous lookup. 1 when the venue's table has not been read yet. */
export function contractSizeFor(market: string, pair: string): number {
  return sizes.get(keyOf(market, pair)) ?? 1
}

/**
 * The contract size for the pair on screen, plus whether it is actually KNOWN.
 *
 * The two are separate answers on purpose. The hint under the size field is
 * shown only when the venue publishes a contract that is not one unit of the
 * base, so "unknown" and "one to one" must not look alike — and the ticket
 * forwards `undefined` rather than 1 to the risk guard on an unknown, so the
 * guard resolves it itself instead of pricing a contract count as a base
 * amount.
 */
export function useContractSize(
  market: string,
  pair: string,
): { contractSize: number; known: boolean } {
  useSyncExternalStore(subscribe, getVersion, getVersion)

  const perp = isPerpPairKey(pair)
  const key = keyOf(market, pair)
  const size = perp ? sizes.get(key) : undefined
  const known = size !== undefined

  useEffect(() => {
    if (!perp || known) return
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const attempt = () => {
      attempts++
      void warmContractSizes().then(() => {
        if (cancelled || sizes.has(key) || attempts >= MISS_RETRIES) return
        timer = setTimeout(attempt, MISS_BACKOFF_MS * attempts)
      })
    }
    attempt()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [perp, key, known])

  return { contractSize: size ?? 1, known }
}
