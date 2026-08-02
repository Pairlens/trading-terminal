// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * KuCoin Private WebSocket — authenticated connection for real-time
 * order updates and balance changes.
 *
 * Uses bullet-private token (requires auth headers) instead of bullet-public.
 * Subscribes to /spotMarket/tradeOrdersV2 and /account/balance with
 * privateChannel: "true" (string, not boolean).
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { hmacSign } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolveKucoinTradingBase } from './regions'
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
  passphrase: string
}

type BulletToken = {
  token: string
  endpoint: string
  pingInterval: number
}

const PRIVATE_KEY = 'private'

export type KucoinPrivateWsOptions = Partial<WsSessionOptions> & {
  /** Bullet-token fetcher — injectable for tests. Defaults to the REST POST. */
  fetchPrivateToken?: (
    credentials: Credentials,
    country: string,
    paper: boolean,
  ) => Promise<BulletToken>
}
const TOKEN_REFRESH_INTERVAL = 23 * 60 * 60 * 1000 // ~23h

function mapKucoinOrderStatus(
  status: string,
  msgType: string,
  remainSize: string,
): NormalizedOrderUpdate['status'] {
  if (status === 'done') {
    if (msgType === 'canceled') return 'cancelled'
    return 'filled'
  }
  if (status === 'match') {
    const remain = Number(remainSize || '0')
    if (remain === 0) return 'filled'
    return 'partially_filled'
  }
  return 'live'
}

export class KucoinPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private nextMsgId = 1
  /** Cadence KuCoin asked for with the current token. */
  private pingIntervalMs = 18_000
  private connectedCountry = ''
  private connectedPaper = false

  private fetchPrivateToken: (
    credentials: Credentials,
    country: string,
    paper: boolean,
  ) => Promise<BulletToken>

  constructor(options?: KucoinPrivateWsOptions) {
    const { fetchPrivateToken, ...sessionOptions } = options ?? {}
    this.fetchPrivateToken =
      fetchPrivateToken ??
      ((creds, country, paper) =>
        this.obtainPrivateToken(creds, country, paper))
    // Captured for the ping getter below, which must read the cadence at
    // fire time rather than close over its value at construction.
    const self = this
    this.session = new ReconnectingWsSession({
      // The bullet-private token carries the endpoint AND the ping cadence,
      // so it is fetched here on every connect rather than in a post-open
      // handshake. A failed POST rejects and the session backs off.
      url: async () => {
        const creds = this.credentials
        if (!creds) throw new Error('kucoin private: no credentials')
        this.connectedCountry = this.country
        this.connectedPaper = this.paper
        const token = await this.fetchPrivateToken(
          creds,
          this.country,
          this.paper,
        )
        this.pingIntervalMs = token.pingInterval
        return `${token.endpoint}?token=${token.token}&connectId=kc-priv-${this.nextMsgId++}`
      },
      onMessage: (data) => this.handleMessage(data as string),
      onOpen: () => this.armTokenRefresh(),
      ping: {
        // Read lazily: KuCoin specifies the cadence per token.
        get intervalMs() {
          return self.pingIntervalMs
        },
        frame: () =>
          JSON.stringify({ id: String(this.nextMsgId++), type: 'ping' }),
      },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[kucoin-private-ws] connect failed', err)
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
        {
          state: null,
          subscribe: () => this.sendSubscribe(),
          unsubscribe: () => {},
        },
        () => {},
      )
    }

    if (endpointChanged) this.session.restart()
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    this.release = null
    this.clearTokenRefresh()
    this.session.destroy()
  }

  /** The bullet token expires; recycle the socket well before it does. */
  private armTokenRefresh(): void {
    this.clearTokenRefresh()
    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null
      // restart() re-runs url(), which mints a fresh token.
      this.session.restart()
    }, TOKEN_REFRESH_INTERVAL)
  }

  private clearTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({
        id: String(this.nextMsgId++),
        type: 'subscribe',
        topic: '/spotMarket/tradeOrdersV2',
        privateChannel: 'true',
        response: true,
      }),
    )
    this.session.send(
      JSON.stringify({
        id: String(this.nextMsgId++),
        type: 'subscribe',
        topic: '/account/balance',
        privateChannel: 'true',
        response: true,
      }),
    )
  }

  private async obtainPrivateToken(
    creds: Credentials,
    country: string,
    paper: boolean,
  ): Promise<BulletToken> {
    const restBase = resolveKucoinTradingBase(country, paper)
    const path = '/api/v1/bullet-private'
    const timestamp = Date.now().toString()
    const prehash = `${timestamp}POST${path}`
    const signature = await hmacSign(creds.apiSecret, prehash)
    const encryptedPassphrase = await hmacSign(
      creds.apiSecret,
      creds.passphrase,
    )

    const resp = await fetch(`${restBase}${path}`, {
      method: 'POST',
      headers: {
        'KC-API-KEY': creds.apiKey,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': encryptedPassphrase,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json',
      },
    })

    if (!resp.ok)
      throw new Error(`KuCoin bullet-private failed: ${resp.status}`)

    const json = (await resp.json()) as {
      code: string
      data: {
        token: string
        instanceServers: Array<{
          endpoint: string
          pingInterval: number
          pingTimeout: number
        }>
      }
    }

    if (json.code !== '200000' || !json.data?.token) {
      throw new Error(`KuCoin bullet-private error: ${json.code}`)
    }

    const server = json.data.instanceServers[0]
    if (!server) throw new Error('KuCoin: no instance servers returned')

    return {
      token: json.data.token,
      endpoint: server.endpoint,
      pingInterval: server.pingInterval || 18000,
    }
  }

  private handleMessage(text: string): void {
    let msg: {
      type?: string
      topic?: string
      subject?: string
      data?: Record<string, string>
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Welcome / pong / ack — no action
    if (msg.type === 'welcome' || msg.type === 'pong' || msg.type === 'ack')
      return

    if (msg.type !== 'message' || !msg.topic || !msg.data) return

    // Order updates — /spotMarket/tradeOrdersV2
    if (msg.topic === '/spotMarket/tradeOrdersV2') {
      this.handleOrderUpdate(msg.data)
    }

    // Balance updates — /account/balance
    if (msg.topic === '/account/balance') {
      this.handleBalanceUpdate(msg.data)
    }
  }

  private handleOrderUpdate(d: Record<string, string>): void {
    if (!this.callback) return

    const status = d['status'] ?? 'open'
    const msgType = d['type'] ?? ''
    const remainSize = d['remainSize'] ?? '0'

    // Compute average price from matchPrice/matchSize if available
    const matchPrice = d['matchPrice'] ?? ''
    const filledSize = d['filledSize'] ?? '0'

    this.callback({
      orderId: d['orderId'] ?? '',
      pair: d['symbol'] ?? '',
      side: (d['side'] ?? 'buy') as 'buy' | 'sell',
      type: (d['orderType'] ?? 'market') as 'market' | 'limit',
      size: d['originSize'] ?? '',
      price: d['price'] ?? '',
      fillSize: filledSize,
      avgPrice: matchPrice,
      status: mapKucoinOrderStatus(status, msgType, remainSize),
      fee: '',
      feeCcy: '',
      ts: Number(d['ts'] ?? Date.now()),
      createdAt: Number(d['orderTime'] ?? d['ts'] ?? Date.now()),
    })
  }

  private handleBalanceUpdate(d: Record<string, string>): void {
    if (!this.balanceCallback) return

    this.balanceCallback([
      {
        currency: d['currency'] ?? '',
        available: d['available'] ?? '0',
        frozen: d['hold'] ?? '0',
        total: d['total'] ?? '0',
      },
    ])
  }
}
