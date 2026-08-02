// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget Private WebSocket — authenticated connection for real-time
 * order updates and balance changes.
 *
 * Connects to wss://ws.bitget.com/v2/ws/private (or wspap for paper).
 * Auth: send login op with HMAC-SHA256 signature of timestamp + "GET" + "/user/verify".
 * WS login timestamp is in SECONDS (not ms like REST).
 *
 * Connection plumbing (connect gate, jittered backoff with stable-reset,
 * liveness watchdog, suspend/resume recovery, re-login + resubscribe on every
 * reopen) lives in ReconnectingWsSession; this client owns the wire format.
 *
 * The login used to be fire-and-forget — the subscribe frames went out in the
 * same turn, racing Bitget's `{event:"login"}` ack. Running it in the
 * session's authenticate gate makes the ordering explicit.
 *
 * Private channels:
 * - "orders" with instId "default" — all order updates
 * - "account" with coin "default" — all balance updates
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { denormalizePair } from './parser'
import { resolveBitgetUrls } from './regions'
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

const PING_INTERVAL = 20_000
const LOGIN_TIMEOUT_MS = 10_000
const PRIVATE_KEY = 'private'

// ── HMAC-SHA256 Base64 ──

async function hmacSha256Base64(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  let binary = ''
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b)
  return btoa(binary)
}

export class BitgetPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private pendingLogin: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null
  private connectedPaper = false

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => {
        this.connectedPaper = this.paper
        return resolveBitgetUrls(this.paper).wsPrivateUrl
      },
      onMessage: (data) => this.handleMessage(data as string),
      authenticate: () => this.login(),
      // Raw "ping" string; Bitget replies with a raw "pong".
      ping: { intervalMs: PING_INTERVAL, frame: () => 'ping' },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[bitget-private-ws] connect failed', err)
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
    this.pendingLogin?.reject(new Error('bitget private: destroyed'))
    this.session.destroy()
  }

  // ── Handshake ──

  private login(): Promise<void> {
    const creds = this.credentials
    if (!creds)
      return Promise.reject(new Error('bitget private: no credentials'))

    // WS login timestamp is in SECONDS.
    const timestamp = Math.floor(Date.now() / 1000).toString()

    return hmacSha256Base64(
      creds.apiSecret,
      `${timestamp}GET/user/verify`,
    ).then(
      (sign) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingLogin = null
            reject(new Error('bitget private: login timeout'))
          }, LOGIN_TIMEOUT_MS)

          this.pendingLogin = {
            resolve: () => {
              clearTimeout(timer)
              this.pendingLogin = null
              resolve()
            },
            reject: (err) => {
              clearTimeout(timer)
              this.pendingLogin = null
              reject(err)
            },
          }

          this.session.send(
            JSON.stringify({
              op: 'login',
              args: [
                {
                  apiKey: creds.apiKey,
                  passphrase: creds.passphrase,
                  timestamp,
                  sign,
                },
              ],
            }),
          )
        }),
    )
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({
        op: 'subscribe',
        args: [{ instType: 'SPOT', channel: 'orders', instId: 'default' }],
      }),
    )
    this.session.send(
      JSON.stringify({
        op: 'subscribe',
        args: [{ instType: 'SPOT', channel: 'account', coin: 'default' }],
      }),
    )
  }

  private handleMessage(text: string): void {
    if (text === 'pong') return

    let msg: {
      action?: string
      arg?: { channel?: string }
      data?: Array<unknown>
      event?: string
      msg?: string
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    if (msg.event === 'login') {
      this.pendingLogin?.resolve()
      return
    }
    if (msg.event === 'error') {
      // Bitget reports a bad key as an error frame — fail the gate rather
      // than waiting out the login timeout.
      this.pendingLogin?.reject(
        new Error(`bitget private: login failed ${msg.msg ?? ''}`),
      )
      return
    }
    if (msg.event === 'subscribe') return

    const channel = msg.arg?.channel
    const data = msg.data
    if (!channel || !data || data.length === 0) return

    if (channel === 'orders') {
      this.handleOrderUpdate(data as Array<Record<string, string>>)
    } else if (channel === 'account') {
      this.handleBalanceUpdate(data as Array<Record<string, string>>)
    }
  }

  private handleOrderUpdate(orders: Array<Record<string, string>>): void {
    if (!this.callback) return

    for (const d of orders) {
      this.callback({
        orderId: d['orderId'] ?? '',
        pair: denormalizePair(d['instId'] ?? d['symbol'] ?? ''),
        side: (d['side'] ?? 'buy') as 'buy' | 'sell',
        type: (d['orderType'] ?? 'market') as 'market' | 'limit',
        size: d['size'] ?? d['newSize'] ?? '0',
        price: d['price'] ?? '0',
        fillSize: d['accBaseVolume'] ?? d['baseVolume'] ?? '0',
        avgPrice: d['priceAvg'] ?? '0',
        status: mapStatus(d['status'] ?? ''),
        fee: d['fillFee'] ?? '0',
        feeCcy: d['fillFeeCoin'] ?? '',
        ts: Number(d['uTime'] ?? d['cTime'] ?? Date.now()),
        createdAt: Number(d['cTime'] ?? Date.now()),
      })
    }
  }

  private handleBalanceUpdate(accounts: Array<Record<string, string>>): void {
    if (!this.balanceCallback) return

    const balances: Array<NormalizedBalance> = accounts.map((d) => {
      const avail = Number(d['available'] ?? 0)
      const frozen = Number(d['frozen'] ?? 0) + Number(d['locked'] ?? 0)
      return {
        currency: d['coin'] ?? '',
        available: String(avail),
        frozen: String(frozen),
        total: String(avail + frozen),
      }
    })

    this.balanceCallback(balances)
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'filled':
      return 'filled'
    case 'cancelled':
      return 'cancelled'
    case 'partially_filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}
