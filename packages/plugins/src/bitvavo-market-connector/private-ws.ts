// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo private WebSocket — authenticated `account` channel for real-time
 * order lifecycle updates.
 *
 * Connects to wss://ws.bitvavo.com/v2/ (same endpoint as public), then:
 *   1. sends { action: 'authenticate', key, signature, timestamp }
 *      where signature = HMAC_SHA256(`${timestamp}GET/v2/websocket`) hex.
 *   2. subscribes { action: 'subscribe', channels: [{ name: 'account', markets }] }.
 *
 * Bitvavo's `account` channel is PER-MARKET — there is no account-wide order
 * stream, and the connector's private-WS contract carries no pair. So the
 * subscribed market is set lazily via setMarket(), called from placeOrder: a
 * fill can only occur on a market you have an order on, and that is exactly
 * when the market becomes known.
 *
 * Order events carry CUMULATIVE filledAmount/filledAmountQuote, which is what
 * the position ledger's applyFill expects — so updates are emitted from `order`
 * events only; per-fill `fill` events are ignored to avoid double counting.
 * Bitvavo pushes no balance stream, so balances are refreshed over REST on
 * authenticate and (debounced) after each order update.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { toMarket } from './parser'
import { resolveBitvavoWsUrl } from './regions'
import { fetchBitvavoBalances, mapBitvavoOrder } from './order-executor'
import type { BitvavoCredentials, BitvavoOrder } from './order-executor'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
} from '@pairlens/market-engine/types'

export type OrderUpdateCallback = (update: NormalizedOrderUpdate) => void
export type BalanceUpdateCallback = (updates: Array<NormalizedBalance>) => void

const AUTH_TIMEOUT_MS = 10_000
const KEEPALIVE_INTERVAL = 25_000
const PRIVATE_KEY = 'private'
const BALANCE_DEBOUNCE = 1_000

export class BitvavoPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: BitvavoCredentials | null = null
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Market the account channel should follow (set by placeOrder). */
  private currentMarket: string | null = null
  /** Market the live socket is actually subscribed to. */
  private subscribedMarket: string | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private balanceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAuth: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => resolveBitvavoWsUrl(),
      onMessage: (data) => this.handleMessage(data as string),
      authenticate: () => this.authenticate(),
      // getTime doubles as the keepalive; its response is the inbound signal
      // the liveness watchdog keys off.
      ping: {
        intervalMs: KEEPALIVE_INTERVAL,
        frame: () => JSON.stringify({ action: 'getTime' }),
      },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[bitvavo-private-ws] connect failed', err)
      },
      ...options,
    })
  }

  connect(
    credentials: BitvavoCredentials,
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
          // A fresh socket holds no subscription, so forget which market the
          // old one was following or the resubscribe would be skipped.
          revive: () => {
            this.subscribedMarket = null
          },
          unsubscribe: () => {},
        },
        () => {},
      )
    }
  }

  /**
   * Point the account subscription at `pair`. Called by placeOrder so live
   * order/fill events stream for the market being traded.
   */
  setMarket(pair: string): void {
    const market = toMarket(pair)
    if (this.currentMarket === market) return
    this.currentMarket = market
    this.syncAccountSubscription()
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    this.release = null
    this.subscribedMarket = null
    if (this.balanceTimer) {
      clearTimeout(this.balanceTimer)
      this.balanceTimer = null
    }
    this.pendingAuth?.reject(new Error('bitvavo private: destroyed'))
    this.session.destroy()
  }

  // ── Handshake ──

  private authenticate(): Promise<void> {
    const creds = this.credentials
    if (!creds)
      return Promise.reject(new Error('bitvavo private: no credentials'))

    const timestamp = Date.now()

    return hmacSignHex(creds.apiSecret, `${timestamp}GET/v2/websocket`).then(
      (signature) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingAuth = null
            reject(new Error('bitvavo private: auth timeout'))
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
              action: 'authenticate',
              key: creds.apiKey,
              signature,
              timestamp,
            }),
          )
        }),
    )
  }

  private sendSubscribe(): void {
    this.syncAccountSubscription()
    this.scheduleBalanceRefresh()
  }

  private syncAccountSubscription(): void {
    if (!this.session.isOpen || !this.currentMarket) return
    if (this.subscribedMarket === this.currentMarket) return
    if (this.subscribedMarket) {
      this.session.send(
        JSON.stringify({
          action: 'unsubscribe',
          channels: [{ name: 'account', markets: [this.subscribedMarket] }],
        }),
      )
    }
    this.session.send(
      JSON.stringify({
        action: 'subscribe',
        channels: [{ name: 'account', markets: [this.currentMarket] }],
      }),
    )
    this.subscribedMarket = this.currentMarket
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Action responses (getTime keepalive, authenticate).
    const action = msg['action'] as string | undefined
    if (action) return

    const event = msg['event'] as string | undefined
    if (event === 'authenticate') {
      if (msg['authenticated'] === true) this.pendingAuth?.resolve()
      else this.pendingAuth?.reject(new Error('bitvavo private: auth rejected'))
      return
    }

    if (event === 'order') {
      if (!this.callback) return
      this.callback(mapBitvavoOrder(msg as unknown as BitvavoOrder))
      this.scheduleBalanceRefresh()
      return
    }
    // 'fill' events are per-fill increments; the ledger wants cumulative
    // fills, which `order` events already carry — so fills are ignored here.
  }

  private scheduleBalanceRefresh(): void {
    if (!this.balanceCallback || this.balanceTimer) return
    this.balanceTimer = setTimeout(() => {
      this.balanceTimer = null
      void this.refreshBalances()
    }, BALANCE_DEBOUNCE)
  }

  private async refreshBalances(): Promise<void> {
    if (!this.credentials || !this.balanceCallback) return
    try {
      const balances = await fetchBitvavoBalances(this.credentials)
      this.balanceCallback?.(balances)
    } catch {
      // Best-effort — a failed refresh just leaves the last known balances.
    }
  }
}
