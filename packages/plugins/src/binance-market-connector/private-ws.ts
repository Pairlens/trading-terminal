// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Binance Private WebSocket — authenticated connection for real-time
 * order and balance updates via the User Data Stream.
 *
 * Unlike OKX (direct HMAC login), Binance uses a listenKey pattern:
 * 1. POST /api/v3/userDataStream → { listenKey }
 * 2. Connect WS to wss://stream.binance.com/ws/<listenKey>
 * 3. PUT /api/v3/userDataStream?listenKey=... every 25 minutes to keep alive
 * 4. On close: reconnect with exponential backoff
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolveBinanceTradingUrls } from './regions'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
} from '@pairlens/market-engine/types'

export type OrderUpdateCallback = (update: NormalizedOrderUpdate) => void
export type BalanceUpdateCallback = (updates: Array<NormalizedBalance>) => void

type Credentials = {
  apiKey: string
  apiSecret: string
}

const PRIVATE_KEY = 'private'

export type BinancePrivateWsOptions = Partial<WsSessionOptions> & {
  /** listenKey fetcher — injectable for tests. Defaults to the REST call. */
  fetchListenKey?: () => Promise<string>
}
const LISTEN_KEY_RENEW_INTERVAL = 25 * 60 * 1000 // 25 minutes

function mapBinanceStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'FILLED':
      return 'filled'
    case 'CANCELED':
    case 'EXPIRED':
    case 'REJECTED':
      return 'cancelled'
    case 'PARTIALLY_FILLED':
      return 'partially_filled'
    default:
      return 'live'
  }
}

export class BinancePrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private paper = false
  private listenKey: string | null = null
  private renewTimer: ReturnType<typeof setInterval> | null = null
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private connectedCountry = ''
  private connectedPaper = false

  private fetchListenKey: () => Promise<string>

  constructor(options?: BinancePrivateWsOptions) {
    const { fetchListenKey, ...sessionOptions } = options ?? {}
    this.fetchListenKey = fetchListenKey ?? (() => this.obtainListenKey())
    this.session = new ReconnectingWsSession({
      // The listenKey IS the endpoint, so it is minted here rather than in a
      // post-open handshake. A fresh key per connect is deliberate: a
      // reconnect after a long outage cannot trust the old one to be alive.
      url: async () => {
        this.connectedCountry = this.country
        this.connectedPaper = this.paper
        this.listenKey = await this.fetchListenKey()
        const urls = resolveBinanceTradingUrls(this.country, this.paper)
        return `${urls.wsStream}/ws/${this.listenKey}`
      },
      onMessage: (data) => this.handleMessage(data as string),
      // Rearm the renewal against whichever key this socket was opened with.
      onOpen: () => {
        this.stopRenewTimer()
        this.startRenewTimer()
      },
      // The user-data stream pushes only on account activity and Binance's
      // protocol pings never surface to JS, so there is no inbound signal to
      // distinguish a quiet account from a dead socket. Wake recovery covers
      // the suspend case; no watchdog here on purpose.
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[binance-private-ws] connect failed', err)
      },
      ...sessionOptions,
    })
  }

  connect(
    credentials: Credentials,
    country: string,
    paper: boolean,
    cb: OrderUpdateCallback,
    onBalance?: BalanceUpdateCallback,
  ): void {
    const endpointChanged =
      this.release !== null &&
      (this.connectedCountry !== country || this.connectedPaper !== paper)

    this.credentials = credentials
    this.country = country
    this.paper = paper
    this.callback = cb
    this.balanceCallback = onBalance ?? null

    if (!this.release) {
      this.release = this.session.acquire(
        PRIVATE_KEY,
        // The listenKey stream needs no subscribe frame — the URL selects it.
        { state: null, subscribe: () => {}, unsubscribe: () => {} },
        () => {},
      )
    }

    if (endpointChanged) this.session.restart()
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    this.release = null
    this.stopRenewTimer()
    this.listenKey = null
    this.session.destroy()
  }

  private async obtainListenKey(): Promise<string> {
    if (!this.credentials) throw new Error('No credentials')

    const urls = resolveBinanceTradingUrls(this.country, this.paper)
    const resp = await fetch(`${urls.restBase}/api/v3/userDataStream`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.credentials.apiKey },
    })

    if (!resp.ok) {
      throw new Error(`Failed to obtain listenKey: ${resp.status}`)
    }

    const json = (await resp.json()) as { listenKey: string }
    return json.listenKey
  }

  private async renewListenKey(): Promise<void> {
    if (!this.credentials || !this.listenKey) return

    const urls = resolveBinanceTradingUrls(this.country, this.paper)
    try {
      await fetch(
        `${urls.restBase}/api/v3/userDataStream?listenKey=${this.listenKey}`,
        {
          method: 'PUT',
          headers: { 'X-MBX-APIKEY': this.credentials.apiKey },
        },
      )
    } catch {
      // Renew failure — the stream will expire after 60 min if not renewed.
      // The WS close handler will trigger a full reconnect.
      console.warn('[binance-private-ws] listenKey renewal failed')
    }
  }

  private startRenewTimer(): void {
    this.stopRenewTimer()
    this.renewTimer = setInterval(
      () => this.renewListenKey(),
      LISTEN_KEY_RENEW_INTERVAL,
    )
  }

  private stopRenewTimer(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer)
      this.renewTimer = null
    }
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    const eventType = msg['e'] as string | undefined
    if (!eventType) return

    if (eventType === 'executionReport') {
      this.handleExecutionReport(msg)
      return
    }

    if (eventType === 'outboundAccountPosition') {
      this.handleBalanceUpdate(msg)
      return
    }
  }

  /**
   * Handle executionReport — real-time order updates.
   * Binance uses single-letter fields in the WS payload.
   */
  private handleExecutionReport(msg: Record<string, unknown>): void {
    const cumFilledQty = Number(msg['z'] ?? 0)
    const cumQuoteQty = Number(msg['Z'] ?? 0)
    const status = mapBinanceStatus(String(msg['X'] ?? 'NEW'))

    const avgPrice =
      status === 'filled' && cumFilledQty > 0
        ? (cumQuoteQty / cumFilledQty).toString()
        : String(msg['p'] ?? '0')

    this.callback?.({
      orderId: String(msg['i'] ?? ''),
      pair: String(msg['s'] ?? ''),
      side: String(msg['S'] ?? 'BUY').toLowerCase() as 'buy' | 'sell',
      type: String(msg['o'] ?? 'MARKET').toLowerCase() as 'market' | 'limit',
      size: String(msg['q'] ?? ''),
      price: String(msg['p'] ?? ''),
      fillSize: String(msg['z'] ?? ''),
      avgPrice,
      status,
      fee: String(msg['n'] ?? ''),
      feeCcy: String(msg['N'] ?? ''),
      ts: Number(msg['T'] ?? Date.now()),
      createdAt: Number(msg['O'] ?? Date.now()),
    })
  }

  /**
   * Handle outboundAccountPosition — real-time balance updates.
   * B = array of { a: asset, f: free, l: locked }
   */
  private handleBalanceUpdate(msg: Record<string, unknown>): void {
    const balances = msg['B'] as
      | Array<{ a: string; f: string; l: string }>
      | undefined
    if (!balances || !this.balanceCallback) return

    this.balanceCallback(
      balances.map((b) => ({
        currency: b.a,
        available: b.f,
        frozen: b.l,
        total: (Number(b.f) + Number(b.l)).toString(),
      })),
    )
  }

  // ── Reconnect ────────────────────────────────────────────────────
}
