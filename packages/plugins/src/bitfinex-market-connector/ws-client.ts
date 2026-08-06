// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex Public WebSocket client — real-time market data.
 *
 * Connects to wss://api-pub.bitfinex.com/ws/2 (plain JSON + arrays).
 * Connection plumbing (reconnect backoff, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the Bitfinex wire format and the
 * chanId routing table.
 *
 * Key Bitfinex WS behaviors:
 * - Event messages are JSON objects (subscribe, info, error)
 * - Data messages are positional ARRAYS: [CHANNEL_ID, ...DATA]
 * - Heartbeat: [CHANNEL_ID, "hb"] every ~15s per channel
 * - Candle OCHLV order: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
 * - Orderbook: AMOUNT sign encodes side (positive=bid, negative=ask)
 * - Orderbook: COUNT=0 means delete the price level
 * - Subscribe: {"event":"subscribe","channel":"ticker","symbol":"tBTCUST"}
 * - Subscribed: {"event":"subscribed","channel":"ticker","chanId":123,"symbol":"tBTCUST"}
 * - Unsubscribe: {"event":"unsubscribe","chanId":123}
 *
 * chanId lifecycle: the server assigns a numeric chanId per subscription via
 * the 'subscribed' event; data frames carry only that id. The chanMap
 * (chanId → session key) lives here. On reconnect the per-entry revive hooks
 * run BEFORE the resubscribe frames go out, dropping every stale chanId so a
 * reused id on the fresh socket can never route to the wrong key.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { latencyMonitor } from '@pairlens/market-engine/latency'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  fromBfxSymbol,
  fromBfxTimeframe,
  parseBfxCandle,
  parseBfxTicker,
  parseBfxTrade,
  toBfxSymbol,
  toBfxTimeframe,
} from './parser'
import { fetchBfxCandles } from './rest-client'
import { resolveBfxUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

type CandleSub = {
  pair: string
  symbol: string
  timeframe: string
  bfxTimeframe: string
  buffer: CandleBuffer
  chanId?: number
}

type TickerSub = {
  pair: string
  symbol: string
  chanId?: number
}

type BookSub = {
  pair: string
  symbol: string
  chanId?: number
  bids: Map<number, [number, number]> // price → [count, amount]
  asks: Map<number, [number, number]>
}

type TradeSub = {
  pair: string
  symbol: string
  chanId?: number
}

type ChanState = { chanId?: number }

/**
 * Latency-probe cadence. Not a keepalive — the server's own heartbeats already
 * hold the socket open — so it is paced to be a cheap measurement rather than
 * to beat an idle timeout.
 */
const PING_INTERVAL_MS = 20_000

export class BfxWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number

  /** Client id echoed back on the pong; only its presence is used. */
  private pingCid = 0

  // Map chanId → subscription key for routing data messages
  private chanMap = new Map<number, { type: string; key: string }>()

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveBfxUrls().wsPublicUrl,
      onMessage: (data) => this.handleMessage(data as string),
      // The socket does not NEED this ping — Bitfinex heartbeats
      // ([chanId,"hb"]) already keep it alive, and they arrive every ~15s per
      // channel whether or not the market moves. It is here for the round-trip
      // measurement: a heartbeat the server sends unprompted can be timed
      // against nothing, whereas {event:'ping', cid} comes back as
      // {event:'pong', cid} and closes a trip we opened.
      ping: {
        intervalMs: PING_INTERVAL_MS,
        frame: () => JSON.stringify({ event: 'ping', cid: ++this.pingCid }),
      },
      // Keep the explicit watchdog: the heartbeats remain the guaranteed
      // inbound signal, and deriving a timeout from the ping interval instead
      // would arm a tighter trigger than this venue has ever needed.
      livenessTimeoutMs: 60_000,
      onLatencySample: (rttMs) => latencyMonitor.record('bitfinex', rttMs),
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
    const symbol = toBfxSymbol(pair)
    const bfxTimeframe = toBfxTimeframe(timeframe)
    if (!bfxTimeframe) throw new Error(`Unsupported timeframe: ${timeframe}`)

    const key = `candle:${pair}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      // Shared stream: join the live subscription and replay the buffered
      // history so the late subscriber still gets its snapshot.
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
      symbol,
      timeframe,
      bfxTimeframe,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill
    backfillCandles({
      fetch: () => fetchBfxCandles(pair, timeframe, 300),
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
    const symbol = toBfxSymbol(pair)
    const key = `ticker:${pair}`
    const sub = this.session.getState<TickerSub>(key) ?? { pair, symbol }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) =>
          this.session.send(
            JSON.stringify({
              event: 'subscribe',
              channel: 'ticker',
              symbol: s.symbol,
            }),
          ),
        unsubscribe: (s) => this.releaseChan(s),
        revive: (s) => this.dropChan(s),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const symbol = toBfxSymbol(pair)
    const key = `book:${pair}`
    const sub = this.session.getState<BookSub>(key) ?? {
      pair,
      symbol,
      bids: new Map<number, [number, number]>(),
      asks: new Map<number, [number, number]>(),
    }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) =>
          this.session.send(
            JSON.stringify({
              event: 'subscribe',
              channel: 'book',
              symbol: s.symbol,
              prec: 'P0',
              freq: 'F0',
              len: '25',
            }),
          ),
        unsubscribe: (s) => this.releaseChan(s),
        // Reset chanId + local book on reconnect — fresh 'subscribed' event
        // and snapshot follow the resubscribe
        revive: (s) => {
          this.dropChan(s)
          s.bids.clear()
          s.asks.clear()
        },
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeTrades(
    pair: string,
    _country: string,
    cb: TradesCallback,
  ): () => void {
    const symbol = toBfxSymbol(pair)
    const key = `trades:${pair}`
    const sub = this.session.getState<TradeSub>(key) ?? { pair, symbol }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) =>
          this.session.send(
            JSON.stringify({
              event: 'subscribe',
              channel: 'trades',
              symbol: s.symbol,
            }),
          ),
        unsubscribe: (s) => this.releaseChan(s),
        revive: (s) => this.dropChan(s),
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.session.destroy()
    this.chanMap.clear()
  }

  // ── Wire helpers ──

  private candleSpec(sub: CandleSub) {
    return {
      state: sub,
      subscribe: (s: CandleSub) =>
        this.session.send(
          JSON.stringify({
            event: 'subscribe',
            channel: 'candles',
            key: `trade:${s.bfxTimeframe}:${s.symbol}`,
          }),
        ),
      unsubscribe: (s: CandleSub) => this.releaseChan(s),
      revive: (s: CandleSub) => this.dropChan(s),
    }
  }

  /** Wire unsubscribe by chanId (only if the server assigned one). */
  private releaseChan(state: ChanState): void {
    if (state.chanId === undefined) return
    this.session.send(
      JSON.stringify({ event: 'unsubscribe', chanId: state.chanId }),
    )
    this.chanMap.delete(state.chanId)
    state.chanId = undefined
  }

  /** Forget a stale chanId (reconnect) without sending anything. */
  private dropChan(state: ChanState): void {
    if (state.chanId === undefined) return
    this.chanMap.delete(state.chanId)
    state.chanId = undefined
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Event messages are objects
    if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
      this.handleEvent(msg as Record<string, unknown>)
      return
    }

    // Data messages are arrays: [CHANNEL_ID, ...DATA]
    if (Array.isArray(msg) && msg.length >= 2) {
      this.handleData(msg)
    }
  }

  private handleEvent(evt: Record<string, unknown>): void {
    const event = evt['event'] as string

    if (event === 'pong') {
      this.session.notePong()
      return
    }
    if (event === 'subscribed') {
      this.handleSubscribed(evt)
    }
    // info, error, unsubscribed — no action needed
  }

  private handleSubscribed(evt: Record<string, unknown>): void {
    const chanId = evt['chanId'] as number
    const channel = evt['channel'] as string
    const symbol = (evt['symbol'] as string) ?? ''
    const bfxKey = (evt['key'] as string) ?? ''

    if (channel === 'candles') {
      // bfxKey = "trade:1h:tBTCUST"
      const parts = bfxKey.split(':')
      if (parts.length < 3) return
      const timeframe = fromBfxTimeframe(parts[1])
      if (!timeframe) return
      const pair = fromBfxSymbol(parts.slice(2).join(':'))
      const key = `candle:${pair}:${timeframe}`
      const sub = this.session.getState<CandleSub>(key)
      if (!sub) return
      sub.chanId = chanId
      this.chanMap.set(chanId, { type: 'candles', key })
    } else if (channel === 'ticker') {
      const key = `ticker:${fromBfxSymbol(symbol)}`
      const sub = this.session.getState<TickerSub>(key)
      if (!sub) return
      sub.chanId = chanId
      this.chanMap.set(chanId, { type: 'ticker', key })
    } else if (channel === 'book') {
      const key = `book:${fromBfxSymbol(symbol)}`
      const sub = this.session.getState<BookSub>(key)
      if (!sub) return
      sub.chanId = chanId
      this.chanMap.set(chanId, { type: 'book', key })
    } else if (channel === 'trades') {
      const key = `trades:${fromBfxSymbol(symbol)}`
      const sub = this.session.getState<TradeSub>(key)
      if (!sub) return
      sub.chanId = chanId
      this.chanMap.set(chanId, { type: 'trades', key })
    }
  }

  private handleData(msg: Array<unknown>): void {
    const chanId = msg[0] as number
    const payload = msg[1]

    // Heartbeat
    if (payload === 'hb') return

    const mapping = this.chanMap.get(chanId)
    if (!mapping) return

    if (mapping.type === 'candles') {
      this.handleCandleData(mapping.key, payload)
    } else if (mapping.type === 'ticker') {
      this.handleTickerData(mapping.key, payload as Array<number>)
    } else if (mapping.type === 'book') {
      this.handleBookData(mapping.key, payload)
    } else if (mapping.type === 'trades') {
      this.handleTradeData(mapping.key, msg)
    }
  }

  /**
   * Trade frames come in two shapes:
   *   snapshot: [chanId, [[ID, MTS, AMOUNT, PRICE], ...]]
   *   update:   [chanId, 'te'|'tu', [ID, MTS, AMOUNT, PRICE]]
   *
   * 'te' (executed) and 'tu' (updated) describe the SAME execution — Bitfinex
   * sends both. Only 'te' is taken, or every print would appear twice.
   */
  private handleTradeData(key: string, msg: Array<unknown>): void {
    const second = msg[1]

    if (Array.isArray(second)) {
      // Snapshot — newest-first, so reverse for chronological append.
      const trades = []
      for (let i = second.length - 1; i >= 0; i--) {
        const trade = parseBfxTrade(second[i] as Array<number>)
        if (trade) trades.push(trade)
      }
      if (trades.length === 0) return
      this.session.emit(key, { type: 'update', trades })
      return
    }

    if (second !== 'te') return
    const trade = parseBfxTrade(msg[2] as Array<number>)
    if (!trade) return
    this.session.emit(key, { type: 'update', trades: [trade] })
  }

  private handleCandleData(key: string, payload: unknown): void {
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    if (!Array.isArray(payload)) return

    // Snapshot: [[MTS, O, C, H, L, V], ...]
    // Update: [MTS, O, C, H, L, V]
    if (Array.isArray(payload[0])) {
      // Snapshot — already have REST backfill, but process if buffer empty
      const candles = (payload as Array<Array<number>>).map(parseBfxCandle)
      if (sub.buffer.snapshot().length === 0) {
        // Sort chronologically (Bitfinex snapshots are newest-first)
        candles.reverse()
        sub.buffer.load(candles)
        this.session.emit(key, { type: 'snapshot', candles })
      }
    } else {
      // Single candle update
      const candle = parseBfxCandle(payload as Array<number>)
      sub.buffer.push(candle)
      this.session.emit(key, { type: 'update', candles: [candle] })
    }
  }

  private handleTickerData(key: string, payload: Array<number>): void {
    if (!this.session.getState(key)) return

    // Ticker: [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, VOLUME, HIGH, LOW]
    if (!Array.isArray(payload) || payload.length < 10) return

    this.session.emit(key, { type: 'ticker', ticker: parseBfxTicker(payload) })
  }

  private handleBookData(key: string, payload: unknown): void {
    const sub = this.session.getState<BookSub>(key)
    if (!sub) return

    if (!Array.isArray(payload)) return

    // Snapshot: [[PRICE, COUNT, AMOUNT], ...]
    // Update: [PRICE, COUNT, AMOUNT]
    if (Array.isArray(payload[0])) {
      // Snapshot
      sub.bids.clear()
      sub.asks.clear()
      for (const entry of payload as Array<Array<number>>) {
        this.applyBookEntry(sub, entry)
      }
    } else {
      // Single update
      this.applyBookEntry(sub, payload as Array<number>)
    }

    this.emitBook(key, sub)
  }

  private applyBookEntry(sub: BookSub, entry: Array<number>): void {
    const [price, count, amount] = entry
    if (price === undefined || count === undefined || amount === undefined)
      return

    if (count === 0) {
      // Delete the price level
      if (amount > 0) {
        sub.bids.delete(price)
      } else {
        sub.asks.delete(price)
      }
    } else {
      // Add or update
      if (amount > 0) {
        sub.bids.set(price, [count, amount])
      } else {
        sub.asks.set(price, [count, Math.abs(amount)])
      }
    }
  }

  private emitBook(key: string, sub: BookSub): void {
    // Convert maps to sorted arrays
    const bids: Array<[number, number]> = Array.from(sub.bids.entries())
      .map(([price, [, amount]]) => [price, amount] as [number, number])
      .sort((a, b) => b[0] - a[0]) // desc by price
      .slice(0, 25)

    const asks: Array<[number, number]> = Array.from(sub.asks.entries())
      .map(([price, [, amount]]) => [price, amount] as [number, number])
      .sort((a, b) => a[0] - b[0]) // asc by price
      .slice(0, 25)

    this.session.emit(key, { type: 'snapshot', bids, asks, ts: Date.now() })
  }
}
