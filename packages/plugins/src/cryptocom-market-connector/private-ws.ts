// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com Private WebSocket — authenticated connection for real-time
 * order updates and balance changes.
 *
 * Connects to wss://stream.crypto.com/exchange/v1/user (plain JSON).
 * Paper mode connects to wss://uat-stream.3ona.co/exchange/v1/user.
 *
 * Auth: Send {"method":"public/auth",...} once per session with HMAC sig.
 * Heartbeat: server sends {"method":"public/heartbeat","id":N} every 30s,
 *            client responds {"method":"public/respond-heartbeat","id":N}.
 *
 * Private channels:
 * - "user.order" — order status changes
 * - "user.balance" — balance updates
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { fromCryptocomSymbol } from './parser'
import { resolveCryptocomUrls } from './regions'
import { buildWsAuth } from './order-executor'
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

let subMsgId = 200

export class CryptocomPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private connectedPaper = false
  private pendingAuth: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null

  /** Sends the auth frame and waits for the venue's ack. */
  private authenticate(): Promise<void> {
    const creds = this.credentials
    if (!creds)
      return Promise.reject(new Error('cryptocom private: no credentials'))

    return buildWsAuth(creds).then(
      (auth) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingAuth = null
            reject(new Error('cryptocom private: auth timeout'))
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
              id: auth.id,
              method: 'public/auth',
              api_key: auth.api_key,
              sig: auth.sig,
              nonce: auth.nonce,
            }),
          )
        }),
    )
  }

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => {
        this.connectedPaper = this.paper
        return resolveCryptocomUrls(this.paper).wsUserUrl
      },
      onMessage: (data) => this.handleMessage(data as string),
      // The subscribe used to go out on a fixed 1s timer "for auth to
      // complete"; the gate replaces that guess with the actual ack.
      authenticate: () => this.authenticate(),
      // No client ping: the server's public/heartbeat every 30s is the
      // guaranteed inbound signal, so allow two before calling it dead.
      livenessTimeoutMs: 75_000,
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[cryptocom-private-ws] connect failed', err)
      },
      ...options,
    })
  }

  connect(
    credentials: Credentials,
    _country: string,
    paper: boolean,
    cb: OrderUpdateCallback,
    onBalance?: BalanceUpdateCallback,
  ): void {
    const endpointChanged =
      this.release !== null && this.connectedPaper !== paper

    this.credentials = credentials
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
    this.pendingAuth?.reject(new Error('cryptocom private: destroyed'))
    this.session.destroy()
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({
        id: subMsgId++,
        method: 'subscribe',
        params: { channels: ['user.order', 'user.balance'] },
        nonce: Date.now(),
      }),
    )
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    const method = msg['method'] as string | undefined

    // Server heartbeat — must be answered within 5s. Also the inbound
    // signal the liveness watchdog keys off.
    if (method === 'public/heartbeat') {
      this.session.send(
        JSON.stringify({
          id: msg['id'],
          method: 'public/respond-heartbeat',
        }),
      )
      return
    }

    // Auth ack settles the gate; a non-zero code fails it.
    if (method === 'public/auth') {
      const code = Number(msg['code'] ?? 0)
      if (code === 0) this.pendingAuth?.resolve()
      else
        this.pendingAuth?.reject(
          new Error(`cryptocom private: auth failed ${code}`),
        )
      return
    }

    // Push data
    const result = msg['result'] as Record<string, unknown> | undefined
    if (!result) return

    const channel = result['channel'] as string | undefined
    const data = result['data'] as Array<unknown> | undefined
    if (!channel || !data) return

    if (channel === 'user.order') {
      for (const raw of data) {
        this.handleOrderUpdate(raw as Record<string, unknown>)
      }
    } else if (channel === 'user.balance') {
      for (const raw of data) {
        this.handleBalanceUpdate(raw as Record<string, unknown>)
      }
    }
  }

  private handleOrderUpdate(data: Record<string, unknown>): void {
    if (!this.callback) return

    const update: NormalizedOrderUpdate = {
      orderId: String(data['order_id'] ?? ''),
      pair: fromCryptocomSymbol(String(data['instrument_name'] ?? '')),
      side: String(data['side'] ?? 'BUY').toLowerCase() as 'buy' | 'sell',
      type: String(data['type'] ?? 'MARKET').toLowerCase() as
        | 'market'
        | 'limit',
      size: String(data['quantity'] ?? '0'),
      price: String(data['price'] ?? '0'),
      fillSize: String(data['cumulative_quantity'] ?? '0'),
      avgPrice: String(data['avg_price'] ?? '0'),
      status: mapStatus(String(data['status'] ?? '')),
      fee: String(data['cumulative_fee'] ?? '0'),
      feeCcy: String(data['fee_currency'] ?? ''),
      ts: (data['update_time'] as number) ?? Date.now(),
      createdAt: (data['create_time'] as number) ?? Date.now(),
    }

    this.callback(update)
  }

  private handleBalanceUpdate(data: Record<string, unknown>): void {
    if (!this.balanceCallback) return

    const positions = (data['position_balances'] ?? []) as Array<{
      instrument_name: string
      quantity: string
      reserved_qty: string
    }>

    const balances: Array<NormalizedBalance> = positions.map((pos) => {
      const total = Number(pos.quantity)
      const frozen = Number(pos.reserved_qty)
      const available = Math.max(0, total - frozen)
      return {
        currency: pos.instrument_name.toUpperCase(),
        available: String(available),
        frozen: String(frozen),
        total: String(total),
      }
    })

    if (balances.length > 0) {
      this.balanceCallback(balances)
    }
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
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
