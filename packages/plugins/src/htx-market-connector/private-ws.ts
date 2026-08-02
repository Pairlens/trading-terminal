// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX Private WebSocket — authenticated connection for real-time
 * order updates and balance changes.
 *
 * Connects to wss://api.huobi.pro/ws/v2 (plain JSON, NOT gzip).
 *
 * Auth: HMAC-SHA256 with SignatureVersion 2.1 sent as JSON payload.
 * Ping: server sends {"action":"ping","data":{"ts":N}},
 *        client responds {"action":"pong","data":{"ts":N}}.
 *
 * Private channels:
 * - "orders#*" — order status changes (creation, trade, cancellation)
 * - "accounts.update#1" — balance updates when balance or available changes
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { fromHtxSymbol } from './parser'
import { resolveHtxUrls } from './regions'
import { buildWsAuthParams } from './order-executor'
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

const AUTH_TIMEOUT_MS = 10_000
const PRIVATE_KEY = 'private'

export class HtxPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private pendingAuth: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null

  /** Sends the auth frame and waits for the venue's ack. */
  private authenticate(): Promise<void> {
    const creds = this.credentials
    if (!creds) return Promise.reject(new Error('htx private: no credentials'))

    return buildWsAuthParams(creds).then(
      (auth) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingAuth = null
            reject(new Error('htx private: auth timeout'))
          }, AUTH_TIMEOUT_MS)

          this.pendingAuth = {
            resolve: () => {
              clearTimeout(timer)
              this.pendingAuth = null
              resolve()
            },
            reject: (err) => {
              clearTimeout(timer)
              this.pendingAuth = null
              reject(err)
            },
          }

          this.session.send(
            JSON.stringify({
              action: 'req',
              ch: 'auth',
              params: { authType: 'api', ...auth },
            }),
          )
        }),
    )
  }

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => resolveHtxUrls().wsPrivateUrl,
      onMessage: (data) => this.handleMessage(data as string),
      // The subscribes used to go out on a fixed 500ms timer "for auth to
      // complete" — a race that lost on any slow round-trip. The gate makes
      // the ordering real.
      authenticate: () => this.authenticate(),
      // No client ping: HTX pings us every ~5s and we echo the pong, so total
      // silence for a minute means the socket is dead, not the account quiet.
      livenessTimeoutMs: 60_000,
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release) console.warn('[htx-private-ws] connect failed', err)
      },
      ...options,
    })
  }

  connect(
    credentials: Credentials,
    _country: string,
    _paper: boolean,
    cb: OrderUpdateCallback,
    onBalance?: BalanceUpdateCallback,
  ): void {
    this.credentials = credentials
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
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    this.release = null
    this.pendingAuth?.reject(new Error('htx private: destroyed'))
    this.session.destroy()
  }

  private sendSubscribe(): void {
    this.session.send(JSON.stringify({ action: 'sub', ch: 'orders#*' }))
    this.session.send(
      JSON.stringify({ action: 'sub', ch: 'accounts.update#1' }),
    )
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Server ping — echo the pong. Also the inbound signal the liveness
    // watchdog keys off.
    if (msg['action'] === 'ping') {
      this.session.send(JSON.stringify({ action: 'pong', data: msg['data'] }))
      return
    }

    // Auth ack settles the gate; anything non-200 fails it.
    if (msg['action'] === 'req' && msg['ch'] === 'auth') {
      const code = Number(msg['code'] ?? 0)
      if (code === 200) this.pendingAuth?.resolve()
      else
        this.pendingAuth?.reject(
          new Error(
            `htx private: auth failed ${code} ${String(msg['message'] ?? '')}`,
          ),
        )
      return
    }

    if (msg['action'] === 'req' || msg['action'] === 'sub') return

    // Push data
    if (msg['action'] !== 'push') return

    const ch = msg['ch'] as string | undefined
    const data = msg['data'] as Record<string, unknown> | undefined
    if (!ch || !data) return

    if (ch.startsWith('orders#')) {
      this.handleOrderUpdate(data)
    } else if (ch.startsWith('accounts.update')) {
      this.handleBalanceUpdate(data)
    }
  }

  private handleOrderUpdate(data: Record<string, unknown>): void {
    if (!this.callback) return

    const eventType = data['eventType'] as string
    const symbol = (data['symbol'] as string) ?? ''
    const orderId = String(data['orderId'] ?? '')
    const orderStatus = (data['orderStatus'] as string) ?? ''

    // Parse order type: "buy-limit" → side="buy", type="limit"
    const typeStr = (data['type'] as string) ?? 'buy-market'
    const side = typeStr.startsWith('buy') ? 'buy' : 'sell'
    const orderType = typeStr.includes('market') ? 'market' : 'limit'

    const update: NormalizedOrderUpdate = {
      orderId,
      pair: fromHtxSymbol(symbol),
      side: side,
      type: orderType,
      size: String(data['orderSize'] ?? data['orderValue'] ?? '0'),
      price: String(data['orderPrice'] ?? '0'),
      fillSize: String(data['execAmt'] ?? data['tradeVolume'] ?? '0'),
      avgPrice: String(data['tradePrice'] ?? '0'),
      status: mapStatus(orderStatus),
      fee: '0',
      feeCcy: '',
      ts:
        (data['lastActTime'] as number) ??
        (data['tradeTime'] as number) ??
        (data['orderCreateTime'] as number) ??
        Date.now(),
      createdAt: (data['orderCreateTime'] as number) ?? Date.now(),
    }

    // For trade events, use trade-specific fields
    if (eventType === 'trade') {
      update.fillSize = String(data['execAmt'] ?? '0')
      update.avgPrice = String(data['tradePrice'] ?? '0')
    }

    this.callback(update)
  }

  private handleBalanceUpdate(data: Record<string, unknown>): void {
    if (!this.balanceCallback) return

    const currency = ((data['currency'] as string) ?? '').toUpperCase()
    const balance = String(data['balance'] ?? '0')
    const available = String(data['available'] ?? balance)

    const avail = Number(available)
    const total = Number(balance)
    const frozen = Math.max(0, total - avail)

    this.balanceCallback([
      {
        currency,
        available,
        frozen: String(frozen),
        total: balance,
      },
    ])
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'filled':
      return 'filled'
    case 'canceled':
    case 'partial-canceled':
      return 'cancelled'
    case 'partial-filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}
