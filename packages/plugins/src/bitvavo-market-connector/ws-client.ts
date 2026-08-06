// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo public WebSocket client — real-time candles, ticker, and order book.
 *
 * Connects to wss://ws.bitvavo.com/v2/. Connection plumbing (reconnect backoff,
 * keepalive, grace-period disconnect, refcounted subscriptions, resubscribe on
 * open) lives in ReconnectingWsSession; this client owns the Bitvavo wire
 * format only.
 *
 * Bitvavo WS shape:
 * - Subscribe:   { action: 'subscribe',   channels: [{ name, ..opts, markets }] }
 * - Unsubscribe: { action: 'unsubscribe', channels: [{ name, ..opts, markets }] }
 * - Keepalive:   { action: 'getTime' }  (weight 1; replies { action, response })
 * - Push:        { event: 'candle'|'ticker24h'|'book', ... }
 *
 * Two Bitvavo quirks drive the design:
 * 1. The `candles` channel streams only live bars — no historical snapshot — so
 *    deep history comes from REST backfill (the first WS bar also opens the
 *    chart's snapshot gate if backfill is slow/failed).
 * 2. The `book` channel streams full-depth deltas with NO snapshot. The book is
 *    synced the canonical way: subscribe (buffer deltas) → getBook (snapshot) →
 *    replay buffered deltas whose nonce is past the snapshot → apply live.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { latencyMonitor } from '@pairlens/market-engine/latency'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  fromMarket,
  parseBitvavoBookLevels,
  parseBitvavoCandle,
  parseBitvavoTicker,
  parseBitvavoTrade,
  toInterval,
  toMarket,
} from './parser'
import { fetchBitvavoCandles } from './rest-client'
import { resolveBitvavoWsUrl } from './regions'
import type {
  Candle,
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const KEEPALIVE_INTERVAL = 25_000
const BACKFILL_LIMIT = 300
// Bitvavo streams the FULL book as deltas; keep only a bounded working depth so
// the sort on each update stays cheap and the backing maps stay small. The
// panel never shows more than a couple dozen levels, so this is generous.
const BOOK_DEPTH = 50
// Cap the pre-snapshot delta buffer so a lost/errored getBook reply (socket
// stays up, so no reconnect resets it) can't grow it without bound. On
// overflow we drop the oldest and re-request the snapshot.
const MAX_PENDING_DELTAS = 250

type CandleSub = {
  pair: string // Pairlens: BTC-EUR
  market: string // Bitvavo: BTC-EUR
  timeframe: string
  interval: string
  buffer: CandleBuffer
  seeded: boolean
}

type TickerSub = { pair: string; market: string }

type TradeSub = { pair: string; market: string }

type BookDelta = {
  nonce: number
  bids?: Array<[string, string]>
  asks?: Array<[string, string]>
}

type BookSub = {
  pair: string
  market: string
  bids: Map<number, number>
  asks: Map<number, number>
  nonce: number
  synced: boolean
  pending: Array<BookDelta>
}

export class BitvavoWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveBitvavoWsUrl(),
      onMessage: (data) => this.handleMessage(data as string),
      ping: {
        intervalMs: KEEPALIVE_INTERVAL,
        frame: () => JSON.stringify({ action: 'getTime' }),
      },
      onLatencySample: (rttMs) => latencyMonitor.record('bitvavo', rttMs),
      ...sessionOverrides,
    })
  }

  // ── Public subscribe methods ──

  subscribeCandles(
    pair: string,
    timeframe: string,
    _country: string,
    cb: CandleCallback,
  ): () => void {
    const market = toMarket(pair)
    const interval = toInterval(timeframe)
    if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

    const key = `candles:${pair}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      // Shared stream: join the live subscription and replay buffered history.
      const release = this.session.acquire(
        key,
        this.candleSpec(existing),
        cb as (data: unknown) => void,
      )
      const candles = existing.buffer.snapshot()
      if (candles.length > 0) cb({ type: 'snapshot', candles })
      return release
    }

    const sub: CandleSub = {
      pair,
      market,
      timeframe,
      interval,
      buffer: new CandleBuffer(),
      seeded: false,
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill for deep history — the candle channel carries no snapshot.
    // The WS live bar independently opens the chart's snapshot gate (see
    // handleCandle) so a failed backfill never strands the chart blank.
    backfillCandles({
      fetch: () => fetchBitvavoCandles(pair, timeframe, BACKFILL_LIMIT, ''),
      isLive: () => this.session.getState(key) !== undefined,
      apply: (candles) => {
        sub.buffer.load(candles)
        sub.seeded = true
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
    const market = toMarket(pair)
    const key = `ticker:${pair}`
    const sub = this.session.getState<TickerSub>(key) ?? { pair, market }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => this.sendSubscribe('ticker24h', s.market),
        unsubscribe: (s) => this.sendUnsubscribe('ticker24h', s.market),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const market = toMarket(pair)
    const key = `book:${pair}`
    const sub =
      this.session.getState<BookSub>(key) ?? this.freshBook(pair, market)
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => {
          // Buffer deltas first, then request the snapshot.
          this.sendSubscribe('book', s.market)
          this.sendGetBook(s.market)
        },
        unsubscribe: (s) => this.sendUnsubscribe('book', s.market),
        // Reset local book on reconnect — a fresh getBook snapshot follows.
        revive: (s) => this.resetBook(s),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeTrades(
    pair: string,
    _country: string,
    cb: TradesCallback,
  ): () => void {
    const market = toMarket(pair)
    // Keyed by the venue market id, since that is what the push carries.
    const key = `trades:${market}`
    const sub = this.session.getState<TradeSub>(key) ?? { pair, market }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => this.sendSubscribe('trades', s.market),
        unsubscribe: (s) => this.sendUnsubscribe('trades', s.market),
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.session.destroy()
  }

  // ── Wire helpers ──

  private candleSpec(sub: CandleSub) {
    return {
      state: sub,
      subscribe: (s: CandleSub) =>
        this.sendSubscribe('candles', s.market, { interval: [s.interval] }),
      unsubscribe: (s: CandleSub) =>
        this.sendUnsubscribe('candles', s.market, { interval: [s.interval] }),
    }
  }

  private freshBook(pair: string, market: string): BookSub {
    return {
      pair,
      market,
      bids: new Map<number, number>(),
      asks: new Map<number, number>(),
      nonce: 0,
      synced: false,
      pending: [],
    }
  }

  private resetBook(s: BookSub): void {
    s.bids.clear()
    s.asks.clear()
    s.nonce = 0
    s.synced = false
    s.pending = []
  }

  private sendSubscribe(
    channel: string,
    market: string,
    extra?: Record<string, unknown>,
  ): void {
    this.session.send(
      JSON.stringify({
        action: 'subscribe',
        channels: [{ name: channel, ...extra, markets: [market] }],
      }),
    )
  }

  private sendUnsubscribe(
    channel: string,
    market: string,
    extra?: Record<string, unknown>,
  ): void {
    this.session.send(
      JSON.stringify({
        action: 'unsubscribe',
        channels: [{ name: channel, ...extra, markets: [market] }],
      }),
    )
  }

  private sendGetBook(market: string): void {
    this.session.send(JSON.stringify({ action: 'getBook', market }))
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Action responses (getTime keepalive, getBook snapshot).
    const action = msg['action'] as string | undefined
    if (action === 'getBook') {
      this.handleBookSnapshot(
        msg['response'] as
          | {
              market: string
              nonce: number
              bids?: Array<[string, string]>
              asks?: Array<[string, string]>
            }
          | undefined,
      )
      return
    }
    // getTime IS the keepalive, so its ack closes the round trip.
    if (action === 'getTime') {
      this.session.notePong()
      return
    }
    if (action) return // other action acks — nothing to do

    const event = msg['event'] as string | undefined
    switch (event) {
      case 'candle':
        this.handleCandle(msg)
        break
      case 'ticker24h':
        this.handleTicker(msg['data'] as Array<unknown> | undefined)
        break
      case 'book':
        this.handleBookDelta(msg)
        break
      case 'trade':
        this.handleTrade(msg)
        break
      // 'subscribed' / 'unsubscribed' / 'authenticate' / 'error' — ignored.
      default:
        break
    }
  }

  private handleTrade(msg: Record<string, unknown>): void {
    // Bitvavo pushes the trade fields on the event itself, not under `data`.
    const market = String(msg['market'] ?? '')
    const trade = parseBitvavoTrade(msg)
    if (!market || !trade) return
    this.session.emit(`trades:${market}`, { type: 'update', trades: [trade] })
  }

  private handleCandle(msg: Record<string, unknown>): void {
    const market = String(msg['market'] ?? '')
    const interval = String(msg['interval'] ?? '')
    const rows = msg['candle'] as Array<Array<string | number>> | undefined
    if (!market || !interval || !Array.isArray(rows)) return

    const pair = fromMarket(market)
    const tf = this.tfForInterval(interval)
    if (!tf) return

    const key = `candles:${pair}:${tf}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    const changed: Array<Candle> = []
    for (const row of rows) {
      const candle = parseBitvavoCandle(row)
      if (!candle) continue
      sub.buffer.push(candle)
      changed.push(candle)
    }
    if (changed.length === 0) return

    if (!sub.seeded) {
      // Backfill hasn't landed yet — open the chart's snapshot gate from the
      // WS bar so live data still renders (mirrors the REST snapshot).
      sub.seeded = true
      this.session.emit(key, {
        type: 'snapshot',
        candles: sub.buffer.snapshot(),
      })
    } else {
      // Emit the candle(s) that actually changed, keyed by ts — a late confirm
      // for a just-closed bar mutates that bar in the buffer (not the tail), so
      // emitting the tail would swallow the correction. The consumer upserts by
      // ts, so a push dropped as stale is harmless.
      this.session.emit(key, { type: 'update', candles: changed })
    }
  }

  private tfForInterval(interval: string): string | undefined {
    // Bitvavo interval strings equal Pairlens timeframes for supported values.
    return toInterval(interval) ? interval : undefined
  }

  private handleTicker(data: Array<unknown> | undefined): void {
    if (!Array.isArray(data)) return
    for (const item of data) {
      const d = item as { market?: string } & Record<string, unknown>
      const market = String(d.market ?? '')
      if (!market) continue
      const key = `ticker:${fromMarket(market)}`
      if (!this.session.getState(key)) continue
      this.session.emit(key, {
        type: 'ticker',
        ticker: parseBitvavoTicker(
          d as Parameters<typeof parseBitvavoTicker>[0],
        ),
      })
    }
  }

  private handleBookSnapshot(
    response:
      | {
          market: string
          nonce: number
          bids?: Array<[string, string]>
          asks?: Array<[string, string]>
        }
      | undefined,
  ): void {
    if (!response?.market) return
    const key = `book:${fromMarket(response.market)}`
    const sub = this.session.getState<BookSub>(key)
    if (!sub) return

    sub.bids.clear()
    sub.asks.clear()
    for (const [p, s] of parseBitvavoBookLevels(response.bids)) {
      if (s > 0) sub.bids.set(p, s)
    }
    for (const [p, s] of parseBitvavoBookLevels(response.asks)) {
      if (s > 0) sub.asks.set(p, s)
    }
    sub.nonce = Number(response.nonce) || 0
    sub.synced = true

    // Replay deltas buffered while the snapshot was in flight. Bitvavo nonces
    // are strictly contiguous per market (verified live), so discard any at/
    // under the snapshot nonce and apply the rest in order. A gap means the
    // buffer is missing a delta — rebuild from a fresh snapshot rather than
    // applying a discontinuous one.
    const pending = sub.pending.sort((a, b) => a.nonce - b.nonce)
    sub.pending = []
    for (const delta of pending) {
      if (delta.nonce <= sub.nonce) continue
      if (delta.nonce !== sub.nonce + 1) {
        this.resyncBook(sub)
        return
      }
      this.applyBookDelta(sub, delta)
    }

    this.emitBook(key, sub)
  }

  private handleBookDelta(msg: Record<string, unknown>): void {
    const market = String(msg['market'] ?? '')
    if (!market) return
    const key = `book:${fromMarket(market)}`
    const sub = this.session.getState<BookSub>(key)
    if (!sub) return

    const delta: BookDelta = {
      nonce: Number(msg['nonce']) || 0,
      bids: msg['bids'] as Array<[string, string]> | undefined,
      asks: msg['asks'] as Array<[string, string]> | undefined,
    }

    // Before the snapshot lands, buffer deltas so none are lost (the canonical
    // sync order: subscribe → buffer → getBook snapshot → replay → live).
    if (!sub.synced) {
      sub.pending.push(delta)
      if (sub.pending.length > MAX_PENDING_DELTAS) {
        // getBook likely never arrived (dropped/errored) — bound the buffer and
        // re-request the snapshot so the stream can recover.
        sub.pending.splice(0, sub.pending.length - MAX_PENDING_DELTAS)
        this.sendGetBook(sub.market)
      }
      return
    }

    if (delta.nonce <= sub.nonce) return // stale/duplicate
    if (delta.nonce !== sub.nonce + 1) {
      // A missed delta has silently diverged the local book — discard it and
      // rebuild from a fresh snapshot (nonces are strictly +1 per market).
      this.resyncBook(sub, delta)
      return
    }
    this.applyBookDelta(sub, delta)
    this.emitBook(key, sub)
  }

  /**
   * Discard a diverged book and request a fresh snapshot. Deltas arriving
   * before it lands buffer via the unsynced path; `trigger` (the delta that
   * exposed the gap) is preserved so it isn't lost.
   */
  private resyncBook(sub: BookSub, trigger?: BookDelta): void {
    this.resetBook(sub)
    if (trigger) sub.pending.push(trigger)
    this.sendGetBook(sub.market)
  }

  private applyBookDelta(sub: BookSub, delta: BookDelta): void {
    for (const [price, size] of parseBitvavoBookLevels(delta.bids)) {
      if (size === 0) sub.bids.delete(price)
      else sub.bids.set(price, size)
    }
    for (const [price, size] of parseBitvavoBookLevels(delta.asks)) {
      if (size === 0) sub.asks.delete(price)
      else sub.asks.set(price, size)
    }
    sub.nonce = delta.nonce
  }

  private emitBook(key: string, sub: BookSub): void {
    const bids: Array<[number, number]> = Array.from(sub.bids.entries()).sort(
      (a, b) => b[0] - a[0],
    )
    const asks: Array<[number, number]> = Array.from(sub.asks.entries()).sort(
      (a, b) => a[0] - b[0],
    )
    // Prune the backing maps to a bounded working depth so they never grow
    // with the full book and the per-delta sort stays cheap.
    if (bids.length > BOOK_DEPTH) {
      for (const [price] of bids.slice(BOOK_DEPTH)) sub.bids.delete(price)
      bids.length = BOOK_DEPTH
    }
    if (asks.length > BOOK_DEPTH) {
      for (const [price] of asks.slice(BOOK_DEPTH)) sub.asks.delete(price)
      asks.length = BOOK_DEPTH
    }
    this.session.emit(key, { type: 'snapshot', bids, asks, ts: Date.now() })
  }
}
