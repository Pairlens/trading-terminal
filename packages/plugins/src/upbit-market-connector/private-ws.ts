// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit Private WebSocket — authenticated connection for real-time
 * order updates.
 *
 * Connects to wss://sg-api.upbit.com/websocket/v1/private with JWT auth.
 *
 * Auth: Include Authorization header with JWT when connecting.
 * Since standard WebSocket API doesn't support custom headers,
 * Upbit may require the JWT in the connection URL or first message.
 * We use the REST API for order status polling as a fallback.
 *
 * Private channels:
 * - "myOrder" — order status changes
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { fromUpbitCode } from './parser'
import { resolveUpbitUrls } from './regions'
import { buildWsJwt } from './order-executor'
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

const PING_INTERVAL = 30_000
const PRIVATE_KEY = 'private'

export class UpbitPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private callback: OrderUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private connectedCountry = ''

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      // Upbit authenticates via a JWT in the query string, so there is no
      // post-open handshake — url() is async and mints a fresh token per
      // connect. A signing failure rejects and the session backs off.
      url: async () => {
        const creds = this.credentials
        if (!creds) throw new Error('upbit private: no credentials')
        this.connectedCountry = this.country
        const { wsPrivateUrl } = resolveUpbitUrls(this.country)
        return `${wsPrivateUrl}?token=${await buildWsJwt(creds)}`
      },
      onMessage: (data) => {
        const text =
          data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data
        this.handleMessage(text)
      },
      ping: { intervalMs: PING_INTERVAL, frame: () => 'PING' },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release) console.warn('[upbit-private-ws] connect failed', err)
      },
      ...options,
    })
  }

  connect(
    credentials: Credentials,
    country: string,
    _paper: boolean,
    cb: OrderUpdateCallback,
    _onBalance?: BalanceUpdateCallback,
  ): void {
    const endpointChanged =
      this.release !== null && this.connectedCountry !== country

    this.credentials = credentials
    this.country = country
    this.callback = cb

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
    this.release = null
    this.session.destroy()
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify([
        { ticket: `pairlens-priv-${Date.now()}` },
        { type: 'myOrder' },
        { format: 'DEFAULT' },
      ]),
    )
  }

  private handleMessage(text: string): void {
    if (text === 'PONG' || text === '') return

    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    if (msg['status'] === 'UP') return
    if (msg['error']) return

    const type = msg['type'] as string | undefined
    if (type === 'myOrder') {
      this.handleOrderUpdate(msg)
    }
  }

  private handleOrderUpdate(msg: Record<string, unknown>): void {
    if (!this.callback) return

    const side = (msg['ask_bid'] as string) === 'BID' ? 'buy' : 'sell'
    const ordType = (msg['order_type'] as string) ?? 'limit'
    const type = ordType === 'limit' || ordType === 'best' ? 'limit' : 'market'

    const update: NormalizedOrderUpdate = {
      orderId: String(msg['uuid'] ?? ''),
      pair: fromUpbitCode(String(msg['code'] ?? '')),
      side: side,
      type: type,
      size: String(msg['volume'] ?? '0'),
      price: String(msg['price'] ?? '0'),
      fillSize: String(msg['executed_volume'] ?? '0'),
      avgPrice: String(msg['avg_price'] ?? '0'),
      status: mapOrderStatus(String(msg['state'] ?? '')),
      fee: String(msg['trade_fee'] ?? '0'),
      feeCcy: '',
      ts: (msg['trade_timestamp'] as number) ?? Date.now(),
      createdAt: (msg['order_timestamp'] as number) ?? Date.now(),
    }

    this.callback(update)
  }
}

function mapOrderStatus(state: string): NormalizedOrderUpdate['status'] {
  switch (state) {
    case 'done':
    case 'trade':
      return 'filled'
    case 'cancel':
      return 'cancelled'
    default:
      return 'live'
  }
}
