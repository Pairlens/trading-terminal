// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken Private WebSocket — authenticated connection for real-time
 * order updates (executions) and balance changes.
 *
 * Connects to wss://ws-auth.kraken.com/v2.
 * Auth: obtain a WS token via REST POST /0/private/GetWebSocketsToken,
 * then pass the token in every private subscription's params.
 * Token is valid for 15 min before first use, then indefinitely while
 * a private subscription is maintained.
 *
 * Private channels:
 * - "executions" — order status changes + trade fills
 * - "balances" — balance updates on trades/deposits/withdrawals
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { fromWsPair } from './parser'
import { resolveKrakenUrls } from './regions'
import { getWsToken } from './order-executor'
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

const PING_INTERVAL = 20_000
const PRIVATE_KEY = 'private'

export type KrakenPrivateWsOptions = Partial<WsSessionOptions> & {
  /** WS-token fetcher — injectable for tests. Defaults to the REST call. */
  fetchWsToken?: (credentials: Credentials) => Promise<string>
}

export class KrakenPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  /** REST-issued WS token, refreshed by the authenticate gate per connect. */
  private wsToken = ''
  private fetchWsToken: (credentials: Credentials) => Promise<string>

  constructor(options?: KrakenPrivateWsOptions) {
    const { fetchWsToken, ...sessionOptions } = options ?? {}
    this.fetchWsToken = fetchWsToken ?? getWsToken
    this.session = new ReconnectingWsSession({
      url: () => resolveKrakenUrls().wsPrivateUrl,
      onMessage: (data) => this.handleMessage(data as string),
      // Kraken authenticates by token rather than a WS login frame. Fetching
      // it in the gate means every reconnect gets a fresh one and no
      // subscribe goes out before it is in hand; a REST failure rejects and
      // the session backs off.
      authenticate: () => this.refreshToken(),
      ping: {
        intervalMs: PING_INTERVAL,
        frame: () => JSON.stringify({ method: 'ping' }),
      },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release)
          console.warn('[kraken-private-ws] connect failed', err)
      },
      ...sessionOptions,
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
    this.session.destroy()
  }

  // ── Handshake ──

  private async refreshToken(): Promise<void> {
    const creds = this.credentials
    if (!creds) throw new Error('kraken private: no credentials')
    this.wsToken = await this.fetchWsToken(creds)
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({
        method: 'subscribe',
        params: {
          channel: 'executions',
          token: this.wsToken,
          snap_orders: true,
          snap_trades: false,
          order_status: true,
        },
      }),
    )
    this.session.send(
      JSON.stringify({
        method: 'subscribe',
        params: { channel: 'balances', token: this.wsToken, snapshot: true },
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

    // Ack or pong
    const method = msg['method'] as string | undefined
    if (method === 'pong' || method === 'subscribe') return

    // Heartbeat
    if (msg['channel'] === 'heartbeat') return

    const channel = msg['channel'] as string | undefined
    const data = msg['data'] as Array<unknown> | undefined
    if (!channel || !data || data.length === 0) return

    if (channel === 'executions') {
      this.handleExecutions(data)
    } else if (channel === 'balances') {
      this.handleBalances(msg['type'] as string, data)
    }
  }

  private handleExecutions(data: Array<unknown>): void {
    if (!this.callback) return

    for (const item of data) {
      const d = item as {
        order_id: string
        exec_type?: string
        order_type: string
        symbol: string
        side: string
        order_qty?: number
        limit_price?: number
        cum_qty?: number
        avg_price?: number
        order_status: string
        fee_usd_equiv?: number
        fees?: Array<{ asset: string; qty: number }>
        timestamp: string
      }

      const feeLine = d.fees?.[0]

      this.callback({
        orderId: d.order_id,
        pair: fromWsPair(d.symbol ?? ''),
        side: (d.side ?? 'buy') as 'buy' | 'sell',
        type: d.order_type === 'limit' ? 'limit' : 'market',
        size: String(d.order_qty ?? 0),
        price: String(d.limit_price ?? 0),
        fillSize: String(d.cum_qty ?? 0),
        avgPrice: String(d.avg_price ?? 0),
        status: mapOrderStatus(d.order_status),
        fee: String(feeLine?.qty ?? d.fee_usd_equiv ?? 0),
        feeCcy: feeLine?.asset ?? 'USD',
        ts: new Date(d.timestamp).getTime(),
        createdAt: new Date(d.timestamp).getTime(),
      })
    }
  }

  private handleBalances(type: string, data: Array<unknown>): void {
    if (!this.balanceCallback) return

    if (type === 'snapshot') {
      // Snapshot: array of { asset, balance, wallets: [...] }
      const balances: Array<NormalizedBalance> = []
      for (const item of data) {
        const d = item as {
          asset: string
          balance: number
          wallets?: Array<{ type: string; balance: number }>
        }
        if (d.balance === 0) continue
        balances.push({
          currency: d.asset,
          available: String(d.balance),
          frozen: '0',
          total: String(d.balance),
        })
      }
      this.balanceCallback(balances)
    } else {
      // Update: array of ledger entries with { asset, balance, amount, ... }
      const balances: Array<NormalizedBalance> = []
      for (const item of data) {
        const d = item as {
          asset: string
          balance: number
          amount: number
        }
        balances.push({
          currency: d.asset,
          available: String(d.balance),
          frozen: '0',
          total: String(d.balance),
        })
      }
      this.balanceCallback(balances)
    }
  }
}

function mapOrderStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'filled':
      return 'filled'
    case 'canceled':
    case 'expired':
      return 'cancelled'
    case 'partially_filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}
