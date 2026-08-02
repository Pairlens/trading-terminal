// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit Public WebSocket client — real-time market data.
 *
 * Connects to wss://sg-api.upbit.com/websocket/v1 (JSON objects).
 * Connection plumbing (reconnect backoff, ping, grace-period disconnect,
 * refcounted subscriptions) lives in ReconnectingWsSession; this client owns
 * the Upbit wire format only.
 *
 * Key Upbit WS behaviors:
 * - Single subscription message as JSON array:
 *   [{"ticket":"uuid"}, {"type":"ticker","codes":["USDT-BTC"]}, {"format":"DEFAULT"}]
 * - No incremental unsubscribe, but a subscribe message REPLACES the
 *   connection's whole subscription set — so we re-send the full desired list
 *   on the open socket to change subscriptions instead of reconnecting.
 *   The session's per-key subscribe/unsubscribe hooks therefore both funnel
 *   into a debounced scheduleResync() that rebuilds the full array from a
 *   client-side registry of active descriptors (the session's entry map is
 *   not iterable from outside, so the client mirrors it — descriptors are
 *   added by the subscribe hook and removed by the unsubscribe hook).
 * - Server sends {"status":"UP"} every 10s as keep-alive
 * - 120s idle timeout — must send PING frames (server replies raw "PONG")
 * - Frames may arrive as binary UTF-8 encoded JSON
 * - Full-snapshot orderbook (not incremental)
 * - Candle streaming up to 240m only (no daily WS)
 * - Pair format is QUOTE-BASE (reversed)
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  parseUpbitCandle,
  parseUpbitTicker,
  toUpbitCode,
  toUpbitWsCandle,
} from './parser'
import { fetchUpbitCandles } from './rest-client'
import { resolveUpbitUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const PING_INTERVAL = 30_000
const RESYNC_DEBOUNCE_MS = 50

type CandleSub = {
  pair: string
  code: string
  timeframe: string
  wsType: string
  buffer: CandleBuffer
}

type TickerSub = { pair: string; code: string }
type BookSub = { pair: string; code: string }

/** What each active key contributes to the full subscription array. */
type SubDescriptor =
  | { kind: 'ticker'; code: string }
  | { kind: 'book'; code: string }
  | { kind: 'candle'; code: string; wsType: string }

export class UpbitWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number
  private country = ''
  // Mirror of the session's active keys → descriptors, maintained by the
  // subscribe/unsubscribe hooks. Source of truth for the resync frame and
  // for routing pushes (Upbit codes are looked up here, original loop-and-
  // match semantics preserved).
  private registry = new Map<string, SubDescriptor>()
  private resyncTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveUpbitUrls(this.country).wsPublicUrl,
      onMessage: (data) => this.handleRawMessage(data),
      // Upbit drops the connection after 120s idle — raw PING keep-alive
      ping: { intervalMs: PING_INTERVAL, frame: () => 'PING' },
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
    const code = toUpbitCode(pair)
    const wsType = toUpbitWsCandle(timeframe) ?? 'candle.60m'
    this.country = country

    const key = `candle:${pair}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      // Shared stream: join the live subscription and replay the buffered
      // history so the late subscriber still gets its snapshot.
      const release = this.session.acquire(
        key,
        this.candleSpec(key, existing),
        cb as (data: unknown) => void,
      )
      const candles = existing.buffer.snapshot()
      if (candles.length > 0) cb({ type: 'snapshot', candles })
      return release
    }

    const sub: CandleSub = {
      pair,
      code,
      timeframe,
      wsType,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(key, sub),
      cb as (data: unknown) => void,
    )

    // REST backfill
    backfillCandles({
      fetch: () => fetchUpbitCandles(pair, timeframe, 300, country),
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
    country: string,
    cb: TickerCallback,
  ): () => void {
    const code = toUpbitCode(pair)
    this.country = country
    const key = `ticker:${pair}`
    return this.session.acquire(
      key,
      {
        state: { pair, code } satisfies TickerSub,
        subscribe: (s: TickerSub) => {
          this.registry.set(key, { kind: 'ticker', code: s.code })
          this.scheduleResync()
        },
        unsubscribe: () => {
          this.registry.delete(key)
          this.scheduleResync()
        },
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    country: string,
    cb: OrderbookCallback,
  ): () => void {
    const code = toUpbitCode(pair)
    this.country = country
    const key = `book:${pair}`
    return this.session.acquire(
      key,
      {
        state: { pair, code } satisfies BookSub,
        subscribe: (s: BookSub) => {
          this.registry.set(key, { kind: 'book', code: s.code })
          this.scheduleResync()
        },
        unsubscribe: () => {
          this.registry.delete(key)
          this.scheduleResync()
        },
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.destroyed = true
    if (this.resyncTimer) {
      clearTimeout(this.resyncTimer)
      this.resyncTimer = null
    }
    this.registry.clear()
    this.session.destroy()
  }

  // ── Wire helpers ──

  private candleSpec(key: string, sub: CandleSub) {
    return {
      state: sub,
      // Runs on first acquire and on every (re)open — registry.set is
      // idempotent, and the (re)open call doubles as the revive resync.
      subscribe: (s: CandleSub) => {
        this.registry.set(key, {
          kind: 'candle',
          code: s.code,
          wsType: s.wsType,
        })
        this.scheduleResync()
      },
      unsubscribe: () => {
        this.registry.delete(key)
        this.scheduleResync()
      },
    }
  }

  /**
   * Upbit has no incremental unsubscribe, but a subscribe message REPLACES the
   * connection's whole subscription set — so to change subscriptions we re-send
   * the full desired list on the SAME open socket rather than tearing it down.
   * Debounced to coalesce a burst of sub changes (or the per-entry subscribe
   * calls on a fresh socket) into one re-send. send() no-ops while the socket
   * is still connecting; the on-open subscribe hooks trigger a fresh resync.
   */
  private scheduleResync(): void {
    if (this.destroyed) return
    if (this.resyncTimer) clearTimeout(this.resyncTimer)
    this.resyncTimer = setTimeout(() => {
      this.resyncTimer = null
      // No subs left — the session's grace timer closes the socket. We don't
      // send an empty subscription (Upbit requires at least one type entry).
      if (this.registry.size === 0) return
      this.sendSubscriptions()
    }, RESYNC_DEBOUNCE_MS)
  }

  private sendSubscriptions(): void {
    const msg: Array<unknown> = [{ ticket: `pairlens-${Date.now()}` }]

    // Collect all ticker codes
    const tickerCodes: Array<string> = []
    const bookCodes: Array<string> = []
    const candleGroups = new Map<string, Array<string>>()
    for (const desc of this.registry.values()) {
      if (desc.kind === 'ticker') {
        tickerCodes.push(desc.code)
      } else if (desc.kind === 'book') {
        bookCodes.push(desc.code)
      } else {
        const codes = candleGroups.get(desc.wsType) ?? []
        codes.push(desc.code)
        candleGroups.set(desc.wsType, codes)
      }
    }

    if (tickerCodes.length > 0) {
      msg.push({ type: 'ticker', codes: tickerCodes, is_only_realtime: false })
    }
    if (bookCodes.length > 0) {
      msg.push({ type: 'orderbook', codes: bookCodes, is_only_realtime: false })
    }
    // Candle subscriptions grouped by WS type
    for (const [wsType, codes] of candleGroups) {
      msg.push({ type: wsType, codes, is_only_realtime: false })
    }

    msg.push({ format: 'DEFAULT' })

    this.session.send(JSON.stringify(msg))
  }

  // ── Message handling ──

  private handleRawMessage(data: string | ArrayBuffer): void {
    if (data instanceof ArrayBuffer) {
      // Upbit sends binary frames (UTF-8 encoded JSON, not compressed)
      const text = new TextDecoder().decode(data)
      this.handleMessage(text)
    } else {
      this.handleMessage(data)
    }
  }

  private handleMessage(text: string): void {
    // Upbit sends "PONG" as text response to our PING, or binary pong frames
    if (text === 'PONG' || text === '') return

    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Keep-alive status message
    if (msg['status'] === 'UP') return

    // Error message
    if (msg['error']) return

    const type = msg['type'] as string | undefined
    if (!type) return

    if (type === 'ticker') {
      this.handleTicker(msg)
    } else if (type === 'orderbook') {
      this.handleOrderbook(msg)
    } else if (type.startsWith('candle')) {
      this.handleCandle(msg)
    }
  }

  /** Find the active key for an Upbit code within one descriptor kind. */
  private findKey(
    kind: SubDescriptor['kind'],
    code: string,
    wsType?: string,
  ): string | undefined {
    for (const [key, desc] of this.registry) {
      if (desc.kind !== kind || desc.code !== code) continue
      if (kind === 'candle' && desc.kind === 'candle' && desc.wsType !== wsType)
        continue
      return key
    }
    return undefined
  }

  private handleTicker(msg: Record<string, unknown>): void {
    const code = msg['code'] as string
    if (!code) return

    const key = this.findKey('ticker', code)
    if (!key) return

    // Ticker also has best_ask/bid from trade stream
    const ticker = parseUpbitTicker({
      trade_price: msg['trade_price'] as number,
      opening_price: msg['opening_price'] as number,
      high_price: msg['high_price'] as number,
      low_price: msg['low_price'] as number,
      acc_trade_volume_24h: msg['acc_trade_volume_24h'] as number,
      signed_change_rate: msg['signed_change_rate'] as number,
      timestamp: msg['timestamp'] as number,
      trade_timestamp: msg['trade_timestamp'] as number,
    })
    this.session.emit(key, { type: 'ticker', ticker })
  }

  private handleOrderbook(msg: Record<string, unknown>): void {
    const code = msg['code'] as string
    if (!code) return

    const key = this.findKey('book', code)
    if (!key) return

    const units = (msg['orderbook_units'] ?? []) as Array<{
      ask_price: number
      bid_price: number
      ask_size: number
      bid_size: number
    }>

    const bids: Array<[number, number]> = units.map((u) => [
      u.bid_price,
      u.bid_size,
    ])
    const asks: Array<[number, number]> = units.map((u) => [
      u.ask_price,
      u.ask_size,
    ])

    this.session.emit(key, {
      type: 'snapshot',
      bids,
      asks,
      ts: (msg['timestamp'] as number) ?? Date.now(),
    })
  }

  private handleCandle(msg: Record<string, unknown>): void {
    const code = msg['code'] as string
    const type = msg['type'] as string
    if (!code || !type) return

    const key = this.findKey('candle', code, type)
    if (!key) return
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    const candle = parseUpbitCandle({
      candle_date_time_utc: msg['candle_date_time_utc'] as string,
      timestamp: msg['timestamp'] as number,
      opening_price: msg['opening_price'] as number,
      high_price: msg['high_price'] as number,
      low_price: msg['low_price'] as number,
      trade_price: msg['trade_price'] as number,
      candle_acc_trade_volume: msg['candle_acc_trade_volume'] as number,
    })

    sub.buffer.push(candle)
    this.session.emit(key, { type: 'update', candles: [candle] })
  }
}
