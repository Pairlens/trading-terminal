// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex Private WebSocket — authenticated connection for real-time
 * order updates and balance changes.
 *
 * Connects to wss://api.bitfinex.com/ws/2 (same array-based protocol).
 *
 * Auth: Send {"event":"auth",...} with HMAC-SHA384 signature once.
 * All account data arrives on channel 0: [0, TYPE, DATA]
 *
 * Account event types:
 * - "os" — order snapshot (array of order arrays)
 * - "on" — new order
 * - "ou" — order update
 * - "oc" — order cancel / filled
 * - "ws" — wallet snapshot (array of wallet arrays)
 * - "wu" — wallet update (single wallet array)
 * - "hb" — heartbeat
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { fromBfxSymbol } from './parser'
import { resolveBfxUrls } from './regions'
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

export class BfxPrivateWsClient {
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

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => resolveBfxUrls().wsAuthUrl,
      onMessage: (data) => this.handleMessage(data as string),
      // Bitfinex has no separate subscribe: the auth frame's `filter` names
      // the channels, so authenticating IS subscribing. The session's
      // subscribe hook is therefore a no-op and this gate does the work.
      authenticate: () => this.authenticate(),
      // No client ping: Bitfinex sends [chanId,"hb"] every ~15s whether or
      // not the account is active, so a minute of silence means a dead socket.
      livenessTimeoutMs: 60_000,
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release) console.warn('[bfx-private-ws] connect failed', err)
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
        { state: null, subscribe: () => {}, unsubscribe: () => {} },
        () => {},
      )
    }
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    this.release = null
    this.pendingAuth?.reject(new Error('bfx private: destroyed'))
    this.session.destroy()
  }

  // ── Handshake ──

  private authenticate(): Promise<void> {
    const creds = this.credentials
    if (!creds) return Promise.reject(new Error('bfx private: no credentials'))

    return buildWsAuth(creds).then(
      (auth) =>
        new Promise<void>((resolve, reject) => {
          // Only ever clear OUR entry. The session abandons a login whose
          // socket was retired and reconnects straight away, so this login can
          // still be pending when the next one installs itself here. Clearing
          // unconditionally — which the timeout below is late enough to do —
          // would strand that newer login waiting for an ack it can no longer
          // resolve, until its own timeout.
          const forget = () => {
            clearTimeout(timer)
            if (this.pendingAuth === entry) this.pendingAuth = null
          }
          const timer = setTimeout(() => {
            forget()
            reject(new Error('bfx private: auth timeout'))
          }, AUTH_TIMEOUT_MS)

          const entry = {
            resolve: () => {
              forget()
              resolve()
            },
            reject: (err: Error) => {
              forget()
              reject(err)
            },
          }
          this.pendingAuth = entry

          this.session.send(
            JSON.stringify({
              event: 'auth',
              apiKey: auth.apiKey,
              authNonce: auth.authNonce,
              authPayload: auth.authPayload,
              authSig: auth.authSig,
              filter: ['trading', 'wallet'],
            }),
          )
        }),
    )
  }

  private handleMessage(text: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Event messages. The auth ack settles the gate; everything else
    // (info, conf, ...) is ignored as before.
    if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
      const event = msg as { event?: string; status?: string; msg?: string }
      if (event.event === 'auth') {
        if (event.status === 'OK') this.pendingAuth?.resolve()
        else
          this.pendingAuth?.reject(
            new Error(`bfx private: auth failed ${event.msg ?? event.status}`),
          )
      }
      return
    }

    // Data messages: [0, TYPE, DATA]
    if (!Array.isArray(msg) || msg.length < 3) return

    const chanId = msg[0] as number
    if (chanId !== 0) return // account data is always on channel 0

    const type = msg[1] as string
    const data = msg[2]

    if (type === 'hb') return // heartbeat

    // Order events
    if (type === 'on' || type === 'ou' || type === 'oc') {
      this.handleOrderUpdate(data as Array<unknown>)
    } else if (type === 'os') {
      // Order snapshot — array of order arrays
      for (const order of data as Array<Array<unknown>>) {
        this.handleOrderUpdate(order)
      }
    } else if (type === 'wu') {
      this.handleWalletUpdate(data as Array<unknown>)
    } else if (type === 'ws') {
      // Wallet snapshot — array of wallet arrays
      this.handleWalletSnapshot(data as Array<Array<unknown>>)
    }
  }

  private handleOrderUpdate(order: Array<unknown>): void {
    if (!this.callback) return

    const amountOrig = Number(order[7] ?? 0)
    const amount = Number(order[6] ?? 0)
    const side = amountOrig > 0 ? 'buy' : 'sell'
    const typeStr = (order[8] as string) ?? ''
    const orderType = typeStr.includes('MARKET') ? 'market' : 'limit'
    const statusStr = (order[13] as string) ?? ''

    const update: NormalizedOrderUpdate = {
      orderId: String(order[0]),
      pair: fromBfxSymbol(String(order[3] ?? '')),
      side: side,
      type: orderType,
      size: String(Math.abs(amountOrig)),
      price: String(order[16] ?? '0'),
      fillSize: String(Math.abs(amountOrig) - Math.abs(amount)),
      avgPrice: String(order[17] ?? '0'),
      status: mapOrderStatus(statusStr),
      fee: '0',
      feeCcy: '',
      ts: (order[5] as number) ?? Date.now(),
      createdAt: (order[4] as number) ?? Date.now(),
    }

    this.callback(update)
  }

  private handleWalletUpdate(wallet: Array<unknown>): void {
    if (!this.balanceCallback) return

    // [TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE]
    const type = wallet[0] as string
    if (type !== 'exchange') return

    const currency = (wallet[1] as string).toUpperCase()
    const total = Number(wallet[2] ?? 0)
    const available = Number(wallet[4] ?? total)
    const frozen = Math.max(0, total - available)

    this.balanceCallback([
      {
        currency,
        available: String(available),
        frozen: String(frozen),
        total: String(total),
      },
    ])
  }

  private handleWalletSnapshot(wallets: Array<Array<unknown>>): void {
    if (!this.balanceCallback) return

    const balances: Array<NormalizedBalance> = []
    for (const wallet of wallets) {
      const type = wallet[0] as string
      if (type !== 'exchange') continue

      const currency = (wallet[1] as string).toUpperCase()
      const total = Number(wallet[2] ?? 0)
      const available = Number(wallet[4] ?? total)
      if (total === 0 && available === 0) continue

      const frozen = Math.max(0, total - available)
      balances.push({
        currency,
        available: String(available),
        frozen: String(frozen),
        total: String(total),
      })
    }

    if (balances.length > 0) {
      this.balanceCallback(balances)
    }
  }
}

function mapOrderStatus(status: string): NormalizedOrderUpdate['status'] {
  if (status.startsWith('EXECUTED')) return 'filled'
  if (status.startsWith('CANCELED') || status.startsWith('RSN_DUST'))
    return 'cancelled'
  if (status.startsWith('PARTIALLY FILLED')) return 'partially_filled'
  return 'live'
}
