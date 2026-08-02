// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ByBit Private WebSocket — authenticated connection for real-time order
 * and balance updates.
 *
 * Connection plumbing (connect gate, jittered backoff with stable-reset,
 * liveness watchdog, suspend/resume recovery, re-auth + resubscribe on every
 * reopen) lives in ReconnectingWsSession. This client owns the ByBit wire
 * format only.
 *
 * - Auth: `{op:"auth"}` signed over `GET/realtime<expires>`, answered with
 *   `{op:"auth", success:true}`. Runs in the session's authenticate gate, so
 *   no subscribe goes out before ByBit has accepted the key.
 * - Ping: client sends `{op:"ping"}` every 20s (ByBit drops connections that
 *   go quiet); the server also pings us, which we answer with a pong.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { resolveBybitTestnetUrls, resolveBybitUrls } from './regions'
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

const PING_INTERVAL_MS = 20_000
const AUTH_TIMEOUT_MS = 10_000
const PRIVATE_KEY = 'private'

function mapBybitStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'Filled':
      return 'filled'
    case 'Cancelled':
    case 'Canceled':
    case 'Deactivated':
    case 'Rejected':
      return 'cancelled'
    case 'PartiallyFilled':
    case 'PartiallyFilledCanceled':
      return 'partially_filled'
    default:
      return 'live'
  }
}

export class BybitPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private pendingAuth: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null
  private connectedCountry = ''
  private connectedPaper = false

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => {
        this.connectedCountry = this.country
        this.connectedPaper = this.paper
        return this.resolveUrl() ?? ''
      },
      onMessage: (data) => this.handleMessage(data as string),
      authenticate: () => this.authenticate(),
      ping: {
        intervalMs: PING_INTERVAL_MS,
        frame: () => JSON.stringify({ op: 'ping' }),
      },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release) console.warn('[bybit-private-ws] connect failed', err)
      },
      ...options,
    })
  }

  /** Null when ByBit is region-blocked for this country (US etc.). */
  private resolveUrl(): string | null {
    if (this.paper) return resolveBybitTestnetUrls().wsPrivate
    return resolveBybitUrls(this.country)?.wsPrivate ?? null
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

    // Region-blocked: never acquire, so the session stays idle rather than
    // retrying an endpoint that does not exist for this user.
    if (!this.resolveUrl()) return

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
    this.pendingAuth?.reject(new Error('bybit private: destroyed'))
    this.session.destroy()
  }

  // ── Handshake ──

  private authenticate(): Promise<void> {
    const creds = this.credentials
    if (!creds)
      return Promise.reject(new Error('bybit private: no credentials'))

    const expires = Date.now() + 10_000

    return hmacSignHex(creds.apiSecret, `GET/realtime${expires}`).then(
      (signature) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingAuth = null
            reject(new Error('bybit private: auth timeout'))
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
              op: 'auth',
              args: [creds.apiKey, expires, signature],
            }),
          )
        }),
    )
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({
        op: 'subscribe',
        args: ['order', 'wallet'],
      }),
    )
  }

  private handleMessage(text: string): void {
    let msg: {
      op?: string
      success?: boolean
      ret_msg?: string
      topic?: string
      data?: unknown
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Server-initiated ping — answer it.
    if (msg.op === 'ping') {
      this.session.send(JSON.stringify({ op: 'pong' }))
      return
    }

    // Reply to our own keepalive. Reaching the session at all is what matters
    // (it feeds the liveness watchdog); nothing else to do.
    if (msg.op === 'pong') return

    // Auth response
    if (msg.op === 'auth') {
      if (msg.success) {
        this.pendingAuth?.resolve()
      } else {
        this.pendingAuth?.reject(
          new Error(`bybit private: auth failed ${msg.ret_msg ?? 'unknown'}`),
        )
      }
      return
    }

    // Topic-based data messages
    if (!msg.topic || !msg.data) return

    if (msg.topic === 'order') {
      this.handleOrderUpdate(msg.data as Array<Record<string, string>>)
      return
    }

    if (msg.topic === 'wallet') {
      this.handleWalletUpdate(msg.data as Array<Record<string, unknown>>)
      return
    }
  }

  private handleOrderUpdate(orders: Array<Record<string, string>>): void {
    for (const d of orders) {
      this.callback?.({
        orderId: d['orderId'] ?? '',
        pair: d['symbol'] ?? '',
        side: (d['side'] ?? 'Buy').toLowerCase() as 'buy' | 'sell',
        type: (d['orderType'] ?? 'Market').toLowerCase() as 'market' | 'limit',
        size: d['qty'] ?? '',
        price: d['price'] ?? '',
        fillSize: d['cumExecQty'] ?? '',
        avgPrice: d['avgPrice'] ?? '',
        status: mapBybitStatus(d['orderStatus'] ?? 'New'),
        fee: d['cumExecFee'] ?? '',
        feeCcy: d['feeCurrency'] ?? '',
        ts: Number(d['updatedTime'] ?? Date.now()),
        createdAt: Number(d['createdTime'] ?? Date.now()),
      })
    }
  }

  private handleWalletUpdate(data: Array<Record<string, unknown>>): void {
    if (!this.balanceCallback) return

    // ByBit wallet WS: data[].coin[] array
    for (const entry of data) {
      const coins = entry['coin'] as
        | Array<{
            coin: string
            availableToWithdraw: string
            availableToTrade?: string
            locked: string
            walletBalance: string
          }>
        | undefined
      if (!coins) continue

      const balances: Array<NormalizedBalance> = coins
        .filter((c) => Number(c.walletBalance ?? 0) > 0)
        .map((c) => ({
          currency: c.coin ?? '',
          available: c.availableToTrade ?? c.availableToWithdraw ?? '0',
          frozen: c.locked ?? '0',
          total: c.walletBalance ?? '0',
        }))

      if (balances.length > 0) {
        this.balanceCallback(balances)
      }
    }
  }
}
