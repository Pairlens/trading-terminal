// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase Private WebSocket — authenticated connection for real-time order updates.
 *
 * Connects to wss://advanced-trade-ws-user.coinbase.com
 * Auth is embedded in the subscribe message as a JWT (no separate auth step).
 *
 * The `user` channel provides order lifecycle events (snapshot + updates).
 * Coinbase has no dedicated balance push channel — we fetch balances via REST
 * after order fills/cancels and on initial connect.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { createCoinbaseJwt } from './jwt-signer'
import { fetchCoinbaseBalances } from './order-executor'
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

export type CoinbasePrivateWsOptions = Partial<WsSessionOptions> & {
  /** JWT signer — injectable for tests. Defaults to the real EC signer. */
  signJwt?: (apiKey: string, apiSecret: string) => Promise<string>
  /** Balance seed fetch — injectable for tests. Defaults to the REST call. */
  fetchBalances?: typeof fetchCoinbaseBalances
}

export class CoinbasePrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  /** Short-lived JWT, reminted by the authenticate gate per connect. */
  private jwt = ''
  private signJwt: (apiKey: string, apiSecret: string) => Promise<string>
  private fetchBalances: typeof fetchCoinbaseBalances

  constructor(options?: CoinbasePrivateWsOptions) {
    const { signJwt, fetchBalances, ...sessionOptions } = options ?? {}
    this.signJwt = signJwt ?? createCoinbaseJwt
    this.fetchBalances = fetchBalances ?? fetchCoinbaseBalances
    this.session = new ReconnectingWsSession({
      url: () => 'wss://advanced-trade-ws-user.coinbase.com',
      onMessage: (data) => this.handleMessage(data as string),
      // Coinbase carries the JWT inside the subscribe frame. Minting it in
      // the gate keeps the subscribe hook synchronous and guarantees a fresh
      // token on every reconnect — these expire in minutes.
      authenticate: () => this.mintJwt(),
      // No client ping: the heartbeats channel below pushes once a second,
      // which is the guaranteed inbound signal the watchdog needs.
      livenessTimeoutMs: 45_000,
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[coinbase-private-ws] connect failed', err)
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
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    this.release = null
    this.session.destroy()
  }

  // ── Handshake ──

  private async mintJwt(): Promise<void> {
    const creds = this.credentials
    if (!creds) throw new Error('coinbase private: no credentials')
    this.jwt = await this.signJwt(creds.apiKey, creds.apiSecret)
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({ type: 'subscribe', channel: 'user', jwt: this.jwt }),
    )
    this.session.send(
      JSON.stringify({ type: 'subscribe', channel: 'heartbeats' }),
    )

    // Coinbase pushes no balance snapshot on the user channel, so seed it
    // over REST the way the pre-session client did on every (re)connect.
    const creds = this.credentials
    if (this.balanceCallback && creds) {
      this.fetchBalances(creds, this.country, this.paper)
        .then((balances) => this.balanceCallback?.(balances))
        .catch(() => {})
    }
  }

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text) as Record<string, unknown>
    } catch {
      return
    }

    const channel = msg['channel'] as string | undefined
    if (channel !== 'user') return

    const events = msg['events'] as Array<Record<string, unknown>> | undefined
    if (!events) return

    for (const event of events) {
      const orders = event['orders'] as
        | Array<Record<string, unknown>>
        | undefined
      if (!orders) continue

      for (const order of orders) {
        this.handleOrderUpdate(order)
      }
    }
  }

  private handleOrderUpdate(d: Record<string, unknown>): void {
    if (!this.callback) return

    const status = mapStatus(String(d['status'] ?? ''))

    // Extract size from order_configuration or leaves_quantity
    const config = d['order_configuration'] as
      | Record<string, unknown>
      | undefined
    let size = String(d['leaves_quantity'] ?? '0')
    let price = String(d['limit_price'] ?? '0')

    if (config) {
      for (const val of Object.values(config)) {
        const cfg = val as Record<string, string> | undefined
        if (cfg) {
          if (cfg['base_size']) size = cfg['base_size']
          if (cfg['limit_price']) price = cfg['limit_price']
        }
      }
    }

    this.callback({
      orderId: String(d['order_id'] ?? ''),
      pair: String(d['product_id'] ?? ''),
      side: String(d['order_side'] ?? 'BUY').toLowerCase() as 'buy' | 'sell',
      type:
        String(d['order_type'] ?? 'LIMIT').toUpperCase() === 'MARKET'
          ? 'market'
          : 'limit',
      size,
      price,
      fillSize: String(d['cumulative_quantity'] ?? '0'),
      avgPrice: String(d['avg_price'] ?? d['average_filled_price'] ?? '0'),
      status,
      fee: String(d['total_fees'] ?? '0'),
      feeCcy: '',
      ts: parseTs(d['last_fill_time'] ?? d['creation_time']),
      createdAt: parseTs(d['creation_time']),
    })

    // On order fill or cancel, refresh balances via REST
    if (
      (status === 'filled' || status === 'cancelled') &&
      this.balanceCallback &&
      this.credentials
    ) {
      fetchCoinbaseBalances(this.credentials, this.country, this.paper)
        .then((balances) => {
          this.balanceCallback?.(balances)
        })
        .catch(() => {})
    }
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status.toUpperCase()) {
    case 'FILLED':
      return 'filled'
    case 'CANCELLED':
    case 'EXPIRED':
    case 'FAILED':
      return 'cancelled'
    default:
      return 'live'
  }
}

function parseTs(value: unknown): number {
  if (!value || value === '0001-01-01T00:00:00Z') return Date.now()
  const t = new Date(String(value)).getTime()
  return Number.isNaN(t) ? Date.now() : t
}
