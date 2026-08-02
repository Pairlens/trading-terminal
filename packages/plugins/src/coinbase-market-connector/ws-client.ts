// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase Public WebSocket client — market data (candles, ticker, orderbook).
 *
 * Connects to wss://advanced-trade-ws.coinbase.com (no auth for public channels).
 * Connection plumbing (reconnect backoff, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the Coinbase wire format only.
 *
 * Key Coinbase WS behaviors:
 * - Must subscribe within 5 seconds of connecting
 * - `heartbeats` channel prevents idle disconnection
 * - `ticker` channel provides real-time price on each trade
 * - `level2` channel provides orderbook snapshots + incremental updates
 *   (subscribe name is "level2", but response channel is "l2_data")
 * - WS candles are 5-min only — we use ticker for real-time candle price
 *   updates at any timeframe, with periodic REST sync for volume accuracy
 *
 * Resubscribe batching: on a live socket each new subscription sends its own
 * single-pair frame, but on every (re)open the original client resubscribed
 * with ONE batched frame per channel (heartbeats, then all ticker pairs, then
 * all level2 pairs). To keep those frames byte-identical, `onOpen` builds the
 * batched frames from a client-side registry and the per-entry subscribe
 * hooks no-op for the session's post-open resubscribe loop.
 *
 * The ticker wire channel is shared demand: candle subscriptions (synthetic
 * candles are built from ticker pushes) and ticker subscriptions both need a
 * pair's ticker channel, so the unsubscribe frame is only sent when the LAST
 * session key demanding that pair releases.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import { normalizePair, parseCoinbaseTicker, timeframeToMs } from './parser'
import { fetchCoinbaseCandles } from './rest-client'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const REST_SYNC_INTERVAL = 15_000

type CandleSub = {
  pair: string
  timeframe: string
  country: string
  buffer: CandleBuffer
  // Synthetic candle state — built from ticker price updates
  currentCandle: {
    ts: number
    open: number
    high: number
    low: number
    close: number
    volume: number
  } | null
  currentBucketMs: number
}

type TickerSub = { pair: string }

type LocalBook = {
  bids: Map<number, number>
  asks: Map<number, number>
}

type BookSub = {
  pair: string
  book: LocalBook
}

export class CoinbaseWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number
  // pair → session keys (candle + ticker) demanding the pair's ticker channel.
  // Gates the ticker unsubscribe frame and feeds the batched on-open frame.
  private tickerDemand = new Map<string, Set<string>>()
  private bookPairs = new Set<string>()
  // Per-candle-entry REST volume-sync timers (also cleared on destroy, since
  // session.destroy() drops entries without running unsubscribe hooks).
  private restSyncTimers = new Map<string, ReturnType<typeof setInterval>>()
  // True while onOpen's batched resubscribe covers the session's per-entry
  // subscribe loop — the per-entry hooks must not duplicate those frames.
  private suppressEntrySubscribes = false

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => 'wss://advanced-trade-ws.coinbase.com',
      onMessage: (data) => this.handleMessage(data as string),
      // No ping frame — the heartbeats channel keeps the connection alive.
      // It also pushes once a second regardless of market activity, so total
      // silence for this long means the socket is dead, not the market quiet.
      livenessTimeoutMs: 45_000,
      onOpen: () => this.resubscribeBatched(),
      ...sessionOverrides,
    })
  }

  // ── Public subscribe methods ──

  subscribeCandles(
    pair: string,
    timeframe: string,
    country: string,
    cb: CandleCallback,
  ): () => void {
    const normalized = normalizePair(pair)
    const key = `candle:${normalized}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      // Shared stream: join the live subscription and replay the buffered
      // history so the late subscriber still gets its snapshot (the
      // in-progress synthetic candle arrives with the next ticker push).
      const release = this.session.acquire(
        key,
        this.candleSpec(existing, key),
        cb as (data: unknown) => void,
      )
      const candles = existing.buffer.snapshot()
      if (candles.length > 0) cb({ type: 'snapshot', candles })
      return release
    }

    const sub: CandleSub = {
      pair: normalized,
      timeframe,
      country,
      buffer: new CandleBuffer(),
      currentCandle: null,
      currentBucketMs: 0,
    }
    this.addTickerDemand(normalized, key)
    const release = this.session.acquire(
      key,
      this.candleSpec(sub, key),
      cb as (data: unknown) => void,
    )
    this.startRestSync(key, sub)

    // REST backfill historical candles
    backfillCandles({
      fetch: () => fetchCoinbaseCandles(normalized, timeframe, 300),
      isLive: () => this.session.getState(key) !== undefined,
      apply: (candles) => {
        sub.buffer.load(candles)
        this.session.emit(key, {
          type: 'snapshot',
          candles: sub.buffer.snapshot(),
        })
      },
      retryDelayMs: this.backfillRetryDelayMs,
    })

    return release
  }

  subscribeTicker(
    pair: string,
    _country: string,
    cb: TickerCallback,
  ): () => void {
    const normalized = normalizePair(pair)
    const key = `ticker:${normalized}`
    this.addTickerDemand(normalized, key)
    const sub = this.session.getState<TickerSub>(key) ?? { pair: normalized }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => {
          if (this.suppressEntrySubscribes) return
          this.sendWs({
            type: 'subscribe',
            channel: 'ticker',
            product_ids: [s.pair],
          })
        },
        unsubscribe: (s) => {
          if (this.removeTickerDemand(s.pair, key)) {
            this.sendWs({
              type: 'unsubscribe',
              channel: 'ticker',
              product_ids: [s.pair],
            })
          }
        },
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const normalized = normalizePair(pair)
    const key = `book:${normalized}`
    const sub = this.session.getState<BookSub>(key) ?? {
      pair: normalized,
      book: {
        bids: new Map<number, number>(),
        asks: new Map<number, number>(),
      },
    }
    this.bookPairs.add(normalized)

    // No REST overlay: Coinbase's level2 channel delivers a full snapshot then
    // incremental updates. A late REST snapshot merged on top would re-add
    // levels the WS book already removed and overwrite fresh sizes with stale
    // ones (those stale levels then linger until the next full snapshot).

    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => {
          if (this.suppressEntrySubscribes) return
          this.sendWs({
            type: 'subscribe',
            channel: 'level2',
            product_ids: [s.pair],
          })
        },
        unsubscribe: (s) => {
          this.bookPairs.delete(s.pair)
          this.sendWs({
            type: 'unsubscribe',
            channel: 'level2',
            product_ids: [s.pair],
          })
        },
        // Reset local book on reconnect — a fresh snapshot follows
        revive: (s) => {
          s.book.bids.clear()
          s.book.asks.clear()
        },
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    for (const timer of this.restSyncTimers.values()) clearInterval(timer)
    this.restSyncTimers.clear()
    this.tickerDemand.clear()
    this.bookPairs.clear()
    this.session.destroy()
  }

  // ── Subscription specs / demand registry ──

  private candleSpec(sub: CandleSub, key: string) {
    return {
      state: sub,
      // Candles ride the ticker channel — synthetic candles are built
      // client-side from ticker price pushes.
      subscribe: (s: CandleSub) => {
        if (this.suppressEntrySubscribes) return
        this.sendWs({
          type: 'subscribe',
          channel: 'ticker',
          product_ids: [s.pair],
        })
      },
      unsubscribe: (s: CandleSub) => {
        this.stopRestSync(key)
        // Unsubscribe ticker for this pair if no longer needed
        if (this.removeTickerDemand(s.pair, key)) {
          this.sendWs({
            type: 'unsubscribe',
            channel: 'ticker',
            product_ids: [s.pair],
          })
        }
      },
    }
  }

  private addTickerDemand(pair: string, key: string): void {
    let keys = this.tickerDemand.get(pair)
    if (!keys) {
      keys = new Set()
      this.tickerDemand.set(pair, keys)
    }
    keys.add(key)
  }

  /** Returns true when the pair's ticker channel has no remaining demand. */
  private removeTickerDemand(pair: string, key: string): boolean {
    const keys = this.tickerDemand.get(pair)
    if (!keys) return true
    keys.delete(key)
    if (keys.size > 0) return false
    this.tickerDemand.delete(pair)
    return true
  }

  // ── (Re)open batching ──

  private resubscribeBatched(): void {
    // The session fires every entry's subscribe hook right after onOpen; the
    // batched frames below already cover them, so the hooks no-op until this
    // synchronous resubscribe pass completes.
    this.suppressEntrySubscribes = true
    queueMicrotask(() => {
      this.suppressEntrySubscribes = false
    })

    // Heartbeats — keep connection alive
    this.sendWs({ type: 'subscribe', channel: 'heartbeats' })

    // Ticker channel — needed by both candle and ticker subs (candle-demand
    // pairs first, matching the original resubscribeAll union order)
    const candlePairs: Array<string> = []
    const tickerOnlyPairs: Array<string> = []
    for (const [pair, keys] of this.tickerDemand) {
      const hasCandle = [...keys].some((k) => k.startsWith('candle:'))
      if (hasCandle) candlePairs.push(pair)
      else tickerOnlyPairs.push(pair)
    }
    const tickerPairs = [...candlePairs, ...tickerOnlyPairs]
    if (tickerPairs.length > 0) {
      this.sendWs({
        type: 'subscribe',
        channel: 'ticker',
        product_ids: tickerPairs,
      })
    }

    // Level2 channel — orderbook (local books are cleared by the per-entry
    // revive hooks before any fresh snapshot is processed)
    if (this.bookPairs.size > 0) {
      this.sendWs({
        type: 'subscribe',
        channel: 'level2',
        product_ids: [...this.bookPairs],
      })
    }
  }

  private sendWs(msg: Record<string, unknown>): void {
    this.session.send(JSON.stringify(msg))
  }

  // ── REST sync for candle volume ──

  private startRestSync(key: string, sub: CandleSub): void {
    if (this.restSyncTimers.has(key)) return
    this.restSyncTimers.set(
      key,
      setInterval(() => {
        fetchCoinbaseCandles(sub.pair, sub.timeframe, 2)
          .then((candles) => {
            if (!this.session.getState(key)) return
            for (const c of candles) sub.buffer.push(c)
            // Sync current candle volume from REST
            if (candles.length > 0 && sub.currentCandle) {
              const latest = candles[candles.length - 1]
              if (latest.ts === sub.currentBucketMs) {
                sub.currentCandle.volume = latest.volume
              }
            }
            this.session.emit(key, { type: 'update', candles })
          })
          .catch(() => {})
      }, REST_SYNC_INTERVAL),
    )
  }

  private stopRestSync(key: string): void {
    const timer = this.restSyncTimers.get(key)
    if (timer) {
      clearInterval(timer)
      this.restSyncTimers.delete(key)
    }
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text) as Record<string, unknown>
    } catch {
      return
    }

    const channel = msg['channel'] as string | undefined
    const events = msg['events'] as Array<Record<string, unknown>> | undefined
    if (!events) return

    if (channel === 'ticker') {
      this.handleTickerEvents(events)
    } else if (channel === 'l2_data') {
      this.handleL2Events(events)
    }
    // heartbeats: no action needed
  }

  private handleTickerEvents(events: Array<Record<string, unknown>>): void {
    for (const event of events) {
      const tickers = event['tickers'] as
        | Array<Record<string, string>>
        | undefined
      if (!tickers) continue

      for (const ticker of tickers) {
        const productId = ticker['product_id']
        if (!productId) continue

        const price = Number(ticker['price'] ?? 0)
        if (price <= 0) continue

        // Update candle subs — use ticker price for real-time candle updates
        for (const key of this.tickerDemand.get(productId) ?? []) {
          if (!key.startsWith('candle:')) continue
          const sub = this.session.getState<CandleSub>(key)
          if (sub) this.updateSyntheticCandle(key, sub, price)
        }

        // Update ticker subs
        const tickerKey = `ticker:${productId}`
        if (this.session.getState(tickerKey)) {
          this.session.emit(tickerKey, {
            type: 'ticker',
            ticker: parseCoinbaseTicker(ticker),
          })
        }
      }
    }
  }

  private updateSyntheticCandle(
    key: string,
    sub: CandleSub,
    price: number,
  ): void {
    const now = Date.now()
    const tfMs = timeframeToMs(sub.timeframe)
    const bucketStart = Math.floor(now / tfMs) * tfMs

    if (!sub.currentCandle || sub.currentBucketMs !== bucketStart) {
      // New candle bucket — finalize previous
      if (sub.currentCandle && sub.currentBucketMs > 0) {
        sub.buffer.push({
          ts: sub.currentBucketMs,
          open: sub.currentCandle.open,
          high: sub.currentCandle.high,
          low: sub.currentCandle.low,
          close: sub.currentCandle.close,
          volume: sub.currentCandle.volume,
        })
      }

      sub.currentBucketMs = bucketStart
      sub.currentCandle = {
        ts: bucketStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      }
    } else {
      sub.currentCandle.close = price
      sub.currentCandle.high = Math.max(sub.currentCandle.high, price)
      sub.currentCandle.low = Math.min(sub.currentCandle.low, price)
    }

    this.session.emit(key, {
      type: 'update',
      candles: [
        {
          ts: sub.currentCandle.ts,
          open: sub.currentCandle.open,
          high: sub.currentCandle.high,
          low: sub.currentCandle.low,
          close: sub.currentCandle.close,
          volume: sub.currentCandle.volume,
        },
      ],
    })
  }

  private handleL2Events(events: Array<Record<string, unknown>>): void {
    for (const event of events) {
      const productId = event['product_id'] as string | undefined
      if (!productId) continue

      const key = `book:${productId}`
      const sub = this.session.getState<BookSub>(key)
      if (!sub) continue

      const eventType = event['type'] as string | undefined
      const updates = event['updates'] as
        | Array<Record<string, string>>
        | undefined
      if (!updates) continue

      if (eventType === 'snapshot') {
        sub.book.bids.clear()
        sub.book.asks.clear()
      }

      for (const u of updates) {
        const price = Number(u['price_level'])
        const qty = Number(u['new_quantity'])
        const side = u['side'] // 'bid' or 'offer'

        if (Number.isNaN(price) || Number.isNaN(qty)) continue

        if (side === 'bid') {
          if (qty === 0) sub.book.bids.delete(price)
          else sub.book.bids.set(price, qty)
        } else if (side === 'offer' || side === 'ask') {
          if (qty === 0) sub.book.asks.delete(price)
          else sub.book.asks.set(price, qty)
        }
      }

      this.emitBook(key, sub)
    }
  }

  private emitBook(key: string, sub: BookSub): void {
    const sortedBids = Array.from(sub.book.bids.entries())
      .map(([price, size]) => [price, size] as [number, number])
      .sort((a, b) => b[0] - a[0])
    const sortedAsks = Array.from(sub.book.asks.entries())
      .map(([price, size]) => [price, size] as [number, number])
      .sort((a, b) => a[0] - b[0])

    this.session.emit(key, {
      type: 'snapshot',
      bids: sortedBids,
      asks: sortedAsks,
      ts: Date.now(),
    })
  }
}
