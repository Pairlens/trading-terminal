// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate.io Private WebSocket — authenticated connection for real-time
 * order updates and balance changes.
 *
 * Gate.io private WS uses the same URL as public WS, but includes an
 * `auth` object in each subscribe message:
 * {
 *   time, channel, event: "subscribe", payload: [...],
 *   auth: { method: "api_key", KEY: apiKey, SIGN: hmac_sha512_hex(...) }
 * }
 *
 * Auth signature: hmacSha512Hex(secret, 'channel={ch}&event=subscribe&time={ts}')
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { denormalizePair } from './parser'
import { resolveGateWsUrl } from './regions'
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

const PING_INTERVAL = 15_000
const PRIVATE_KEY = 'private'

// ── HMAC-SHA512 helpers (Web Crypto API) ──

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Order status mapping ──

function mapGateOrderEvent(
  status: string,
  finishAs: string,
  left: string,
  filledAmount: string,
): NormalizedOrderUpdate['status'] {
  // Gate.io WS order events: put (new), update (fill), finish (done)
  // Status field: open, closed, cancelled
  if (status === 'cancelled') return 'cancelled'

  if (status === 'closed') {
    if (finishAs === 'filled') return 'filled'
    if (finishAs === 'cancelled' || finishAs === 'reduce_only')
      return 'cancelled'
    return 'filled'
  }

  // Still open — check for partial fill
  if (Number(filledAmount) > 0 && Number(left) > 0) {
    return 'partially_filled'
  }

  return 'live'
}

export class GatePrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  /** Signed subscribe frames, rebuilt by the authenticate gate per connect. */
  private signedSubscribes: Array<string> = []
  private connectedPaper = false

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => {
        this.connectedPaper = this.paper
        return resolveGateWsUrl(this.paper)
      },
      onMessage: (data) => this.handleMessage(data as string),
      // Gate has no separate login step — each subscribe carries its own
      // signature. Signing them here keeps the async work in the gate so the
      // session's subscribe hook stays synchronous, and re-signs on every
      // reconnect (the signature is timestamped and would otherwise go stale).
      authenticate: () => this.signSubscribes(),
      ping: {
        intervalMs: PING_INTERVAL,
        frame: () =>
          JSON.stringify({
            time: Math.floor(Date.now() / 1000),
            channel: 'spot.ping',
          }),
      },
      gracePeriodMs: 0,
      onConnectError: (err) => {
        if (this.release) console.warn('[gate-private-ws] connect failed', err)
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
    this.session.destroy()
  }

  // ── Handshake ──

  private async signSubscribes(): Promise<void> {
    const creds = this.credentials
    if (!creds) throw new Error('gate private: no credentials')
    this.signedSubscribes = [
      await this.signSubscribe(creds, 'spot.orders', ['!all']),
      await this.signSubscribe(creds, 'spot.balances', []),
    ]
  }

  /** Signature covers `channel={ch}&event=subscribe&time={ts}`. */
  private async signSubscribe(
    creds: Credentials,
    channel: string,
    payload: Array<string>,
  ): Promise<string> {
    const time = Math.floor(Date.now() / 1000)
    const sign = await hmacSha512Hex(
      creds.apiSecret,
      `channel=${channel}&event=subscribe&time=${time}`,
    )
    return JSON.stringify({
      time,
      channel,
      event: 'subscribe',
      payload,
      auth: { method: 'api_key', KEY: creds.apiKey, SIGN: sign },
    })
  }

  private sendSubscribe(): void {
    for (const frame of this.signedSubscribes) this.session.send(frame)
  }

  private handleMessage(text: string): void {
    let msg: {
      time?: number
      channel?: string
      event?: string
      result?: unknown
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Pong
    if (msg.channel === 'spot.pong') return

    // Subscription ack
    if (msg.event === 'subscribe' || msg.event === 'unsubscribe') return

    // Data updates
    if (msg.event === 'update' && msg.channel) {
      if (msg.channel === 'spot.orders') {
        this.handleOrderUpdate(msg.result)
      } else if (msg.channel === 'spot.balances') {
        this.handleBalanceUpdate(msg.result)
      }
    }
  }

  private handleOrderUpdate(result: unknown): void {
    if (!this.callback || !Array.isArray(result)) return

    for (const d of result as Array<Record<string, string>>) {
      const status = d['status'] ?? 'open'
      const finishAs = d['finish_as'] ?? ''
      const left = d['left'] ?? '0'
      const filledAmount = d['filled_amount'] ?? '0'

      this.callback({
        orderId: d['id'] ?? '',
        pair: denormalizePair(d['currency_pair'] ?? ''),
        side: (d['side'] ?? 'buy') as 'buy' | 'sell',
        type: (d['type'] ?? 'market') as 'market' | 'limit',
        size: d['amount'] ?? '',
        price: d['price'] ?? '',
        fillSize: filledAmount,
        avgPrice: d['avg_deal_price'] ?? '',
        status: mapGateOrderEvent(status, finishAs, left, filledAmount),
        fee: d['fee'] ?? '',
        feeCcy: d['fee_currency'] ?? '',
        ts: Number(d['update_time_ms'] ?? d['create_time_ms'] ?? Date.now()),
        createdAt: Number(d['create_time_ms'] ?? Date.now()),
      })
    }
  }

  private handleBalanceUpdate(result: unknown): void {
    if (!this.balanceCallback || !Array.isArray(result)) return

    const balances: Array<NormalizedBalance> = (
      result as Array<Record<string, string>>
    ).map((d) => ({
      currency: d['currency'] ?? '',
      available: d['available'] ?? '0',
      frozen: d['freeze'] ?? '0',
      total:
        d['total'] ??
        String(Number(d['available'] ?? 0) + Number(d['freeze'] ?? 0)),
    }))

    this.balanceCallback(balances)
  }
}
