// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * MEXC Private WebSocket — authenticated connection for real-time order
 * and balance updates via Protobuf WS.
 *
 * Uses the listenKey pattern:
 * 1. POST /api/v3/userDataStream → { listenKey }
 * 2. Connect WS: wss://wbs.mexc.com/ws?listenKey=<key>
 * 3. Renew key via PUT every 30 minutes (expires at 60min)
 * 4. Decode binary Protobuf frames for order/balance events
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolveMexcUrls } from './regions'
import { decodeMexcPush } from './protobuf'
import type { MexcPrivateOrder } from './protobuf'
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

export type MexcPrivateWsOptions = Partial<WsSessionOptions> & {
  /** listenKey fetcher — injectable for tests. Defaults to the REST call. */
  fetchListenKey?: (restBase: string) => Promise<string | null>
}
const LISTEN_KEY_RENEW_MS = 30 * 60 * 1000 // 30 minutes (key expires at 60)
const PING_INTERVAL_MS = 20_000

function mapOrderStatus(status: number): NormalizedOrderUpdate['status'] {
  // MEXC order status: 1=NEW, 2=FILLED, 3=PARTIALLY_FILLED, 4=CANCELED, 5=PARTIALLY_CANCELED
  switch (status) {
    case 2:
      return 'filled'
    case 3:
      return 'partially_filled'
    case 4:
    case 5:
      return 'cancelled'
    default:
      return 'live'
  }
}

function mapTradeType(tradeType: number): 'buy' | 'sell' {
  return tradeType === 2 ? 'sell' : 'buy'
}

function mapOrderType(orderType: number): 'market' | 'limit' {
  // 1=LIMIT_ORDER, 2=POST_ONLY, 3=IMMEDIATE_OR_CANCEL, 4=FILL_OR_KILL, 5=MARKET_ORDER
  return orderType === 5 ? 'market' : 'limit'
}

function normalizePrivateOrder(order: MexcPrivateOrder): NormalizedOrderUpdate {
  return {
    orderId: order.id,
    pair: '', // Will be set from channel/context
    side: mapTradeType(order.tradeType),
    type: mapOrderType(order.orderType),
    size: order.quantity,
    price: order.price,
    fillSize: order.cumulativeQuantity,
    avgPrice: order.avgPrice || '0',
    status: mapOrderStatus(order.status),
    fee: '0',
    feeCcy: '',
    ts: order.createTime || Date.now(),
    createdAt: order.createTime || Date.now(),
  }
}

export class MexcPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private listenKey: string | null = null
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private renewTimer: ReturnType<typeof setInterval> | null = null
  private connectedCountry = ''

  private fetchListenKey: (restBase: string) => Promise<string | null>

  constructor(options?: MexcPrivateWsOptions) {
    const { fetchListenKey, ...sessionOptions } = options ?? {}
    this.fetchListenKey =
      fetchListenKey ?? ((restBase) => this.createListenKey(restBase))
    this.session = new ReconnectingWsSession({
      url: async () => {
        const urls = resolveMexcUrls(this.country)
        if (!urls) throw new Error('mexc private: region unavailable')
        this.connectedCountry = this.country
        const key = await this.fetchListenKey(urls.restBase)
        if (!key) throw new Error('mexc private: failed to obtain listenKey')
        this.listenKey = key
        return `${urls.wsBase}/ws?listenKey=${key}`
      },
      onMessage: (data) => this.handleMessage(data),
      onOpen: () => {
        this.stopRenewTimer()
        const urls = resolveMexcUrls(this.country)
        if (!urls) return
        this.renewTimer = setInterval(() => {
          this.renewListenKey(urls.restBase).catch(() => {})
        }, LISTEN_KEY_RENEW_MS)
      },
      ping: {
        intervalMs: PING_INTERVAL_MS,
        frame: () => JSON.stringify({ method: 'PING' }),
      },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release) console.warn('[mexc-private-ws] connect failed', err)
      },
      ...sessionOptions,
    })
  }

  connect(
    credentials: Credentials,
    country: string,
    _paper: boolean,
    cb: OrderUpdateCallback,
    onBalance?: BalanceUpdateCallback,
  ): void {
    const endpointChanged =
      this.release !== null && this.connectedCountry !== country

    this.credentials = credentials
    this.country = country
    this.callback = cb
    this.balanceCallback = onBalance ?? null

    // Region-blocked: never acquire, so the session stays idle.
    if (!resolveMexcUrls(country)) return

    if (!this.release) {
      this.release = this.session.acquire(
        PRIVATE_KEY,
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

  private stopRenewTimer(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer)
      this.renewTimer = null
    }
  }

  private async createListenKey(restBase: string): Promise<string | null> {
    if (!this.credentials) return null

    try {
      const resp = await fetch(`${restBase}/api/v3/userDataStream`, {
        method: 'POST',
        headers: { 'X-MEXC-APIKEY': this.credentials.apiKey },
      })
      if (!resp.ok) return null
      const json = (await resp.json()) as { listenKey?: string }
      return json.listenKey ?? null
    } catch {
      return null
    }
  }

  private async renewListenKey(restBase: string): Promise<void> {
    if (!this.credentials || !this.listenKey) return
    try {
      await fetch(
        `${restBase}/api/v3/userDataStream?listenKey=${this.listenKey}`,
        {
          method: 'PUT',
          headers: { 'X-MEXC-APIKEY': this.credentials.apiKey },
        },
      )
    } catch {
      // Renewal failed — connection may drop and auto-reconnect
    }
  }

  private handleMessage(data: string | ArrayBuffer): void {
    // JSON text messages are pong/ack — ignore
    if (typeof data === 'string') return

    // Binary protobuf frame
    const msg = decodeMexcPush(data)
    if (!msg) return

    switch (msg.type) {
      case 'privateOrder': {
        if (!this.callback) break
        const normalized = normalizePrivateOrder(msg.data)
        this.callback(normalized)
        break
      }
      case 'privateAccount': {
        if (!this.balanceCallback) break
        const bal = msg.data
        if (Number(bal.balanceAmount) > 0 || Number(bal.frozenAmount) > 0) {
          this.balanceCallback([
            {
              currency: bal.vcoinName,
              available: bal.balanceAmount,
              frozen: bal.frozenAmount,
              total: String(
                Number(bal.balanceAmount) + Number(bal.frozenAmount),
              ),
            },
          ])
        }
        break
      }
      case 'privateDeal': {
        // Trade fills — we can use this to update fee info on existing orders
        // For now, the order update covers status changes
        break
      }
    }
  }
}
