// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolvePool } from './pool-resolver'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

// DexPaprika ticker client.
//
// The legacy SSE endpoint this connector used (streaming.dexpaprika.com/stream
// ?pools=...) no longer exists — the current stream is /sse/prices and carries
// ONLY a price, no 24h change/volume. So the ticker is sourced by polling the
// pool-details REST endpoint, which returns price plus a `24h` window object.
//
// Verified against the live API: `24h.last_price_usd_change` is a PERCENT, not
// an absolute delta — for SOL at last_price_usd 64.88 it reported 4.70, and the
// implied 24h-ago price (64.88 / 1.047 = 61.97) falls within
// [low_24h 61.27, high_24h 66.11]; the absolute reading (60.18) would sit below
// the 24h low, which is impossible. So it maps straight to change24h.

const API_BASE = 'https://api.dexpaprika.com'
const POLL_INTERVAL_MS = 5000

type PoolDetail = {
  last_price?: number
  last_price_usd?: number
  price_time?: string
  price_stats?: { high_24h?: number; low_24h?: number }
  '24h'?: { last_price_usd_change?: number; volume_usd?: number }
}

/** Map a DexPaprika pool-details response to a normalized ticker. */
export function toTicker(d: PoolDetail): TickerSnapshot {
  const last = Number(d.last_price_usd ?? d.last_price ?? 0)
  const stats = d.price_stats ?? {}
  const window = d['24h'] ?? {}
  const tsMs = d.price_time ? Date.parse(d.price_time) : Date.now()
  return {
    last,
    // DEX pools have no order book; synthesize a tight bid/ask around last so
    // downstream consumers expecting a spread still get sane, non-crossed values.
    bid: last * 0.999,
    ask: last * 1.001,
    high24h: Number(stats.high_24h ?? 0),
    low24h: Number(stats.low_24h ?? 0),
    volume24h: Number(window.volume_usd ?? 0),
    change24h: Number(window.last_price_usd_change ?? 0), // already a percent
    ts: Number.isFinite(tsMs) ? tsMs : Date.now(),
  }
}

type Conn = {
  timer: ReturnType<typeof setInterval>
  callbacks: Set<(t: TickerSnapshot) => void>
  last: TickerSnapshot | null
}

const connections = new Map<string, Conn>()

async function poll(key: string, network: string, id: string): Promise<void> {
  const conn = connections.get(key)
  if (!conn) return
  try {
    const res = await fetch(`${API_BASE}/networks/${network}/pools/${id}`)
    if (!res.ok) return
    const ticker = toTicker((await res.json()) as PoolDetail)
    if (!(ticker.last > 0)) return
    conn.last = ticker
    for (const cb of conn.callbacks) cb(ticker)
  } catch {
    // Transient error — retry on the next interval.
  }
}

/**
 * Subscribe to ticker updates for a pair by polling its most-liquid pool.
 * Returns an unsubscribe function. Connections are shared per pool.
 */
export async function subscribeTicker(
  pair: string,
  callback: (ticker: TickerSnapshot) => void,
  network = 'solana',
): Promise<() => void> {
  const pool = await resolvePool(pair, network)
  if (!pool) return () => {}

  const key = `${pool.network}:${pool.id}`
  let conn = connections.get(key)
  if (!conn) {
    conn = {
      timer: setInterval(
        () => poll(key, pool.network, pool.id),
        POLL_INTERVAL_MS,
      ),
      callbacks: new Set(),
      last: null,
    }
    connections.set(key, conn)
    void poll(key, pool.network, pool.id) // prime immediately
  }

  conn.callbacks.add(callback)
  if (conn.last) callback(conn.last)

  return () => {
    const c = connections.get(key)
    if (!c) return
    c.callbacks.delete(callback)
    if (c.callbacks.size === 0) {
      clearInterval(c.timer)
      connections.delete(key)
    }
  }
}

/** Stop all polling. Call from plugin destroy(). */
export function closeAllConnections(): void {
  for (const [, c] of connections) {
    clearInterval(c.timer)
    c.callbacks.clear()
  }
  connections.clear()
}
