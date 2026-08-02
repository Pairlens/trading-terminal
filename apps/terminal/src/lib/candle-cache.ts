// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PluginCandle } from '@/hooks/use-candle-stream'

type CacheKey = string
type CacheEntry = {
  candles: Array<PluginCandle>
  cachedAt: number
}

// Sized so a trader flipping between several venues and timeframes keeps an
// instant chart for each combination (13 CEX venues alone exceed the old 10).
const MAX_ENTRIES = 40

// Cached candles restore instantly on a venue/timeframe switch while the
// fresh snapshot loads — but they render indistinguishable from live data.
// If the snapshot then fails (e.g. Kraken REST rate limit), an unbounded
// cache would leave an hours-old chart next to a live top-bar price. Cap how
// old a restored entry may be: the cache exists for quick flip-backs, which
// happen on the scale of seconds to minutes.
const MAX_AGE_MS = 10 * 60 * 1000

/**
 * Bounded in-memory LRU cache for candle data.
 * Key format: `${market}:${pairKey}:${timeframe}`
 */
export class CandleCache {
  private entries = new Map<CacheKey, CacheEntry>()

  static makeKey(market: string, pairKey: string, timeframe: string): CacheKey {
    return `${market}:${pairKey}:${timeframe}`
  }

  get(key: CacheKey): Array<PluginCandle> | null {
    const entry = this.entries.get(key)
    if (!entry) return null

    // Expired — too stale to show as a chart (see MAX_AGE_MS).
    if (Date.now() - entry.cachedAt > MAX_AGE_MS) {
      this.entries.delete(key)
      return null
    }

    // LRU: move to end (most recently used)
    this.entries.delete(key)
    this.entries.set(key, entry)

    return entry.candles
  }

  set(key: CacheKey, candles: Array<PluginCandle>): void {
    // Remove existing entry first (to update LRU position)
    this.entries.delete(key)

    // Evict oldest if at capacity
    if (this.entries.size >= MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey)
      }
    }

    this.entries.set(key, {
      candles: candles.slice(), // defensive copy
      cachedAt: Date.now(),
    })
  }

  clear(): void {
    this.entries.clear()
  }
}

// Singleton instance for the terminal
export const candleCache = new CandleCache()
