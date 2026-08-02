// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * OKX Private WebSocket — authenticated connection for real-time order and
 * balance updates.
 *
 * Connection plumbing (connect gate, jittered backoff with stable-reset,
 * liveness watchdog, suspend/resume recovery, grace-period disconnect,
 * re-login + resubscribe on every reopen) lives in ReconnectingWsSession.
 * This client owns the OKX wire format only: the HMAC login handshake, the
 * orders/balance channel frames, and their normalization.
 *
 * - Login: `{op:"login"}` signed over `<ts>GET/users/self/verify`, answered
 *   with `{event:"login", code:"0"}`. It runs in the session's `authenticate`
 *   gate, so no subscribe frame can go out before OKX has accepted the key,
 *   and a rejected login backs off instead of hot-looping.
 * - Ping: raw string "ping", server replies raw "pong". Required — OKX closes
 *   any connection idle for 30s, and a private socket is idle whenever the
 *   account isn't trading. Without it this socket was reconnecting (and
 *   re-signing a fresh HMAC login) roughly every 30 seconds while idle.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { hmacSign } from '@pairlens/market-engine/hmac-signer'
import { resolveOkxUrls } from './regions'
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

const PING_INTERVAL_MS = 20_000
const LOGIN_TIMEOUT_MS = 10_000
/** The single session key; a private socket has one logical subscription. */
const PRIVATE_KEY = 'private'

function mapOkxState(state: string): NormalizedOrderUpdate['status'] {
  switch (state) {
    case 'filled':
      return 'filled'
    case 'canceled':
      return 'cancelled'
    case 'partially_filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}

export class OkxPrivateWsClient {
  private session: ReconnectingWsSession
  private credentials: Credentials | null = null
  private country = ''
  private paper = false
  private callback: OrderUpdateCallback | null = null
  private balanceCallback: BalanceUpdateCallback | null = null
  /** Held while subscribed; releasing it lets the session close the socket. */
  private release: (() => void) | null = null
  private pendingLogin: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null
  // Endpoint the live socket was built from — a change forces a restart.
  private connectedCountry = ''
  private connectedPaper = false

  constructor(options?: Partial<WsSessionOptions>) {
    this.session = new ReconnectingWsSession({
      url: () => {
        this.connectedCountry = this.country
        this.connectedPaper = this.paper
        const urls = resolveOkxUrls(this.country)
        return this.paper ? urls.wsPrivatePaper : urls.wsPrivate
      },
      onMessage: (data) => this.handleMessage(data as string),
      authenticate: () => this.login(),
      ping: { intervalMs: PING_INTERVAL_MS, frame: () => 'ping' },
      // An authenticated socket must not linger after the last release the way
      // a public one does — there is no re-subscribe churn to amortize here.
      gracePeriodMs: 0,
      onConnectError: (err) => {
        // Teardown rejects the in-flight login deliberately; only a failure
        // while we still want the socket is worth reporting.
        if (this.release) console.warn('[okx-private-ws] connect failed', err)
      },
      ...options,
    })
  }

  /**
   * Start (or update) the private connection. Safe to call repeatedly — the
   * session owns the socket, so this only refreshes credentials/callbacks and
   * restarts when the resolved endpoint would change.
   */
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

    if (!this.release) {
      this.release = this.session.acquire(
        PRIVATE_KEY,
        {
          state: null,
          subscribe: () => this.sendSubscribe(),
          unsubscribe: () => {},
        },
        // Updates are delivered straight to the caller's callbacks from
        // handleMessage; the entry exists to keep the socket alive and to
        // drive resubscribe-on-reopen.
        () => {},
      )
    }

    // url() re-reads country/paper, so a restart is what makes them take hold.
    if (endpointChanged) this.session.restart()
  }

  destroy(): void {
    this.callback = null
    this.balanceCallback = null
    // Clear `release` first: the login rejection below surfaces through
    // onConnectError, which reads it to tell teardown from a real fault.
    this.release = null
    this.failPendingLogin(new Error('okx private: destroyed'))
    this.session.destroy()
  }

  // ── Handshake ──

  /**
   * Runs in the session's authenticate gate on every (re)connect. The
   * signature is re-derived each time, since OKX rejects a stale timestamp.
   */
  private login(): Promise<void> {
    const creds = this.credentials
    if (!creds) return Promise.reject(new Error('okx private: no credentials'))

    const timestamp = Math.floor(Date.now() / 1000).toString()

    return hmacSign(creds.apiSecret, `${timestamp}GET/users/self/verify`).then(
      (sign) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingLogin = null
            reject(new Error('okx private: login timeout'))
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

  private failPendingLogin(err: Error): void {
    this.pendingLogin?.reject(err)
  }

  private sendSubscribe(): void {
    this.session.send(
      JSON.stringify({
        op: 'subscribe',
        args: [
          { channel: 'orders', instType: 'SPOT' },
          { channel: 'balance_and_position' },
        ],
      }),
    )
  }

  // ── Wire messages ──

  private handleMessage(text: string): void {
    // Keepalive reply — a raw string, not JSON.
    if (text === 'pong') return

    let msg: {
      event?: string
      code?: string
      msg?: string
      arg?: { channel?: string }
      data?: Array<Record<string, string>>
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    if (msg.event === 'login') {
      if (msg.code === '0') {
        this.pendingLogin?.resolve()
      } else {
        this.pendingLogin?.reject(
          new Error(`okx private: login failed ${msg.code} ${msg.msg ?? ''}`),
        )
      }
      return
    }

    // OKX reports some auth failures as a bare error frame rather than a
    // login event. Failing fast beats waiting out the login timeout.
    if (msg.event === 'error' && this.pendingLogin) {
      this.pendingLogin.reject(
        new Error(`okx private: login failed ${msg.code} ${msg.msg ?? ''}`),
      )
      return
    }

    if (msg.arg?.channel === 'orders' && msg.data) {
      for (const d of msg.data) {
        this.callback?.({
          orderId: d['ordId'] ?? '',
          pair: d['instId'] ?? '',
          side: (d['side'] ?? 'buy') as 'buy' | 'sell',
          type: (d['ordType'] ?? 'market') as 'market' | 'limit',
          size: d['sz'] ?? '',
          price: d['px'] ?? '',
          fillSize: d['fillSz'] ?? '',
          avgPrice: d['avgPx'] ?? '',
          status: mapOkxState(d['state'] ?? 'live'),
          fee: d['fee'] ?? '',
          feeCcy: d['feeCcy'] ?? '',
          ts: Number(d['uTime'] ?? Date.now()),
          createdAt: Number(d['cTime'] ?? Date.now()),
        })
      }
    }

    if (msg.arg?.channel === 'balance_and_position' && msg.data) {
      const balData = (
        msg.data as unknown as Array<{
          balData?: Array<Record<string, string>>
        }>
      )[0]?.balData
      if (balData && this.balanceCallback) {
        this.balanceCallback(
          balData
            .filter((d) => Number(d['cashBal'] ?? 0) > 0)
            .map((d) => ({
              currency: d['ccy'] ?? '',
              available: d['availBal'] ?? '0',
              frozen: d['frozenBal'] ?? '0',
              total: d['cashBal'] ?? '0',
            })),
        )
      }
    }
  }
}
