// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * OKX public market-data client — candles on the business WS endpoint,
 * ticker/orderbook on the public WS endpoint.
 *
 * Connection plumbing (reconnect backoff, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession — one session per endpoint. This client owns the
 * OKX wire format, the local orderbook (checksum + sequence-gap validated),
 * and region-change restarts.
 *
 * - Ping: client sends the raw string "ping", server replies raw "pong" (not
 *   JSON). Required — OKX closes a connection that has been idle for 30s, and
 *   the pong is also what arms the session's liveness watchdog.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  mapOkxChannelToTimeframe,
  mapTimeframeToOkxChannel,
  normalizePair,
  parseOkxCandleRow,
  parseOkxTicker,
  parseOkxTrade,
} from './parser'
import { fetchOkxCandles } from './rest-client'
import { hasSeqGap, okxBookChecksum } from './orderbook'
import { resolveOkxUrls } from './regions'
import type { RawLevel } from './orderbook'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

// OKX drops connections idle for 30s; stay comfortably inside that.
const PING_INTERVAL_MS = 20_000

type CandleSub = {
  pair: string
  timeframe: string
  buffer: CandleBuffer
}

type TickerSub = { pair: string }

type TradeSub = { pair: string }

/** Local orderbook state for incremental `books` channel. */
type LocalBook = {
  // price → raw [px, sz] strings. Raw strings are kept so the OKX checksum,
  // which is computed over the exact exchange byte representation, can be
  // reproduced from the merged book.
  bids: Map<number, RawLevel>
  asks: Map<number, RawLevel>
}

type BookSub = {
  pair: string
  book: LocalBook
  lastSeqId: number | null
}

export class OkxWsClient {
  private country = ''
  private businessSession: ReconnectingWsSession
  private publicSession: ReconnectingWsSession
  // Country each session last connected with — a change forces a restart so
  // the regional endpoint from resolveOkxUrls takes effect.
  private businessCountry = ''
  private publicCountry = ''
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.businessSession = new ReconnectingWsSession({
      url: () => {
        this.businessCountry = this.country
        return resolveOkxUrls(this.country).wsBusiness
      },
      onMessage: (data) => this.handleBusinessMessage(data as string),
      ping: { intervalMs: PING_INTERVAL_MS, frame: () => 'ping' },
      ...sessionOverrides,
    })
    this.publicSession = new ReconnectingWsSession({
      url: () => {
        this.publicCountry = this.country
        return resolveOkxUrls(this.country).wsPublic
      },
      onMessage: (data) => this.handlePublicMessage(data as string),
      ping: { intervalMs: PING_INTERVAL_MS, frame: () => 'ping' },
      onConnectError: (err) =>
        console.error('[okx-public-ws] connectWs failed', err),
      ...sessionOverrides,
    })
  }

  // ── Candle subscriptions ──

  subscribeCandles(
    pair: string,
    timeframe: string,
    country: string,
    cb: CandleCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    const key = `candle:${normalized}:${timeframe}`

    const existing = this.businessSession.getState<CandleSub>(key)
    if (existing) {
      const release = this.businessSession.acquire(
        key,
        this.candleSpec(existing),
        cb as (data: unknown) => void,
      )
      const candles = existing.buffer.snapshot()
      if (candles.length > 0) cb({ type: 'snapshot', candles })
      return release
    }

    const sub: CandleSub = {
      pair: normalized,
      timeframe,
      buffer: new CandleBuffer(),
    }
    const release = this.businessSession.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // Backfill historical candles via REST; WS delivers live updates
    backfillCandles({
      fetch: () => fetchOkxCandles(normalized, timeframe, 300, country),
      isLive: () => this.businessSession.getState(key) !== undefined,
      apply: (candles) => {
        sub.buffer.load(candles)
        this.businessSession.emit(key, {
          type: 'snapshot',
          candles: sub.buffer.snapshot(),
        })
      },
      retryDelayMs: this.backfillRetryDelayMs,
    })

    return release
  }

  private candleSpec(sub: CandleSub) {
    return {
      state: sub,
      subscribe: (s: CandleSub) =>
        this.sendBusiness('subscribe', s.pair, s.timeframe),
      unsubscribe: (s: CandleSub) =>
        this.sendBusiness('unsubscribe', s.pair, s.timeframe),
    }
  }

  // ── Ticker subscriptions ──

  subscribeTicker(
    pair: string,
    country: string,
    cb: TickerCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    return this.publicSession.acquire(
      `ticker:${normalized}`,
      {
        state: { pair: normalized } satisfies TickerSub,
        subscribe: (s: TickerSub) =>
          this.sendPublic('subscribe', 'tickers', s.pair),
        unsubscribe: (s: TickerSub) =>
          this.sendPublic('unsubscribe', 'tickers', s.pair),
      },
      cb as (data: unknown) => void,
    )
  }

  // ── Orderbook subscriptions ──

  subscribeOrderbook(
    pair: string,
    country: string,
    cb: OrderbookCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    const key = `book:${normalized}`
    const sub = this.publicSession.getState<BookSub>(key) ?? {
      pair: normalized,
      book: {
        bids: new Map<number, RawLevel>(),
        asks: new Map<number, RawLevel>(),
      },
      lastSeqId: null,
    }
    return this.publicSession.acquire(
      key,
      {
        state: sub,
        subscribe: (s: BookSub) =>
          this.sendPublic('subscribe', 'books', s.pair),
        unsubscribe: (s: BookSub) =>
          this.sendPublic('unsubscribe', 'books', s.pair),
        // Clear local state — a fresh snapshot follows the resubscribe
        revive: (s: BookSub) => {
          s.book.bids.clear()
          s.book.asks.clear()
          s.lastSeqId = null
        },
      },
      cb as (data: unknown) => void,
    )
  }

  // ── Trade subscriptions ──

  subscribeTrades(
    pair: string,
    country: string,
    cb: TradesCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    return this.publicSession.acquire(
      `trades:${normalized}`,
      {
        state: { pair: normalized } satisfies TradeSub,
        subscribe: (s: TradeSub) =>
          this.sendPublic('subscribe', 'trades', s.pair),
        unsubscribe: (s: TradeSub) =>
          this.sendPublic('unsubscribe', 'trades', s.pair),
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.businessSession.destroy()
    this.publicSession.destroy()
  }

  // ── Region handling ──

  private setCountry(country: string): void {
    this.country = country
    // Restart any session that connected under a different region so it
    // picks up the regional endpoint. url() re-reads this.country.
    if (this.businessSession.isOpen && this.businessCountry !== country) {
      this.businessSession.restart()
    }
    if (this.publicSession.isOpen && this.publicCountry !== country) {
      this.publicSession.restart()
    }
  }

  // ── Wire helpers ──

  private sendBusiness(op: string, pair: string, timeframe: string): void {
    const channel = mapTimeframeToOkxChannel(timeframe)
    if (!channel) return
    this.businessSession.send(
      JSON.stringify({ op, args: [{ channel, instId: pair }] }),
    )
  }

  private sendPublic(op: string, channel: string, pair: string): void {
    this.publicSession.send(
      JSON.stringify({ op, args: [{ channel, instId: pair }] }),
    )
  }

  // ── Business WS messages (candles) ──

  private handleBusinessMessage(text: string): void {
    // Keepalive reply — a raw string, not JSON. Reaching the session at all is
    // what matters (it feeds the liveness watchdog); nothing else to do.
    if (text === 'pong') return

    let msg: {
      arg?: { channel?: string; instId?: string }
      data?: Array<Array<unknown>>
      event?: string
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    if (!msg.arg?.channel || !msg.arg.instId || !msg.data) return

    const timeframe = mapOkxChannelToTimeframe(msg.arg.channel)
    if (!timeframe) return

    const pair = normalizePair(msg.arg.instId)
    const key = `candle:${pair}:${timeframe}`
    const sub = this.businessSession.getState<CandleSub>(key)
    if (!sub) return

    for (const row of msg.data) {
      const parsed = parseOkxCandleRow(row)
      if (!parsed) continue

      const [candle] = parsed
      sub.buffer.push(candle)

      // Always emit as 'update' — 'snapshot' is reserved for the REST history backfill
      this.businessSession.emit(key, { type: 'update', candles: [candle] })
    }
  }

  // ── Public WS messages (ticker, orderbook) ──

  private handlePublicMessage(text: string): void {
    if (text === 'pong') return

    let msg: {
      arg?: { channel?: string; instId?: string }
      data?: Array<Record<string, string>>
      action?: string
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    if (!msg.arg?.channel || !msg.data) return
    const pair = normalizePair(msg.arg.instId ?? '')

    if (msg.arg.channel === 'tickers') {
      if (!msg.data[0]) return
      this.publicSession.emit(`ticker:${pair}`, {
        type: 'ticker' as const,
        ticker: parseOkxTicker(msg.data[0]),
      })
    } else if (msg.arg.channel === 'trades') {
      // OKX batches executions into one frame and orders them newest-first;
      // the tape wants oldest-first so consumers can append in arrival order.
      const trades = []
      for (let i = msg.data.length - 1; i >= 0; i--) {
        const trade = parseOkxTrade(msg.data[i])
        if (trade) trades.push(trade)
      }
      if (trades.length === 0) return
      this.publicSession.emit(`trades:${pair}`, {
        type: 'update' as const,
        trades,
      })
    } else if (msg.arg.channel === 'books') {
      const key = `book:${pair}`
      const sub = this.publicSession.getState<BookSub>(key)
      if (!sub || !msg.data[0]) return
      const d = msg.data[0] as unknown as {
        bids: Array<Array<string>>
        asks: Array<Array<string>>
        ts: string
        checksum?: number
        seqId?: number
        prevSeqId?: number
      }
      const isSnapshot = msg.action === 'snapshot'

      // Sequence-gap detection: if an update's prevSeqId doesn't chain onto the
      // last applied seqId, we missed a message — rebuild from a fresh snapshot.
      if (
        !isSnapshot &&
        typeof d.prevSeqId === 'number' &&
        typeof d.seqId === 'number' &&
        hasSeqGap(d.prevSeqId, d.seqId, sub.lastSeqId)
      ) {
        this.rebuildBook(sub)
        return
      }

      // Maintain local orderbook state
      if (isSnapshot) {
        sub.book.bids.clear()
        sub.book.asks.clear()
      }

      // Apply levels: size=0 means remove, otherwise upsert (keep raw strings)
      for (const lvl of d.bids) {
        const price = Number(lvl[0])
        if (Number(lvl[1]) === 0) sub.book.bids.delete(price)
        else sub.book.bids.set(price, [lvl[0], lvl[1]])
      }
      for (const lvl of d.asks) {
        const price = Number(lvl[0])
        if (Number(lvl[1]) === 0) sub.book.asks.delete(price)
        else sub.book.asks.set(price, [lvl[0], lvl[1]])
      }

      // Sorted views: bids descending, asks ascending
      const bidLevels = Array.from(sub.book.bids.entries()).sort(
        (a, b) => b[0] - a[0],
      )
      const askLevels = Array.from(sub.book.asks.entries()).sort(
        (a, b) => a[0] - b[0],
      )

      // Integrity: reproduce OKX's CRC32 over the top 25 raw levels. A mismatch
      // means our local book desynced — discard and rebuild from a snapshot.
      // OKX pushes `checksum: 0` when no checksum is provided for the frame
      // (observed live on the public books channel) — treating 0 as a real
      // checksum put the book in a permanent unsubscribe/resubscribe rebuild
      // loop that rate-limited the whole connection.
      if (typeof d.checksum === 'number' && d.checksum !== 0) {
        const rawBids = bidLevels.slice(0, 25).map(([, raw]) => raw)
        const rawAsks = askLevels.slice(0, 25).map(([, raw]) => raw)
        if (okxBookChecksum(rawBids, rawAsks) !== d.checksum) {
          this.rebuildBook(sub)
          return
        }
      }

      if (typeof d.seqId === 'number') sub.lastSeqId = d.seqId

      this.publicSession.emit(key, {
        type: 'snapshot',
        bids: bidLevels.map(([price, raw]) => [price, Number(raw[1])]),
        asks: askLevels.map(([price, raw]) => [price, Number(raw[1])]),
        ts: Number(d.ts),
      })
    }
  }

  /**
   * Discard a desynced local book and re-subscribe to receive a fresh
   * snapshot. Triggered by a sequence gap or checksum mismatch.
   */
  private rebuildBook(sub: BookSub): void {
    sub.book.bids.clear()
    sub.book.asks.clear()
    sub.lastSeqId = null
    this.sendPublic('unsubscribe', 'books', sub.pair)
    this.sendPublic('subscribe', 'books', sub.pair)
  }
}
