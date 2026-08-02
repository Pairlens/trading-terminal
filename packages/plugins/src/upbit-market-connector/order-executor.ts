// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit authenticated REST client — order execution, balances, history.
 *
 * Auth scheme: JWT Bearer token (HS512)
 * - Header: {"alg": "HS512", "typ": "JWT"}
 * - Payload: { access_key, nonce (UUID), query_hash (SHA-512 of params), query_hash_alg }
 * - Signed with HMAC-SHA512 using API secret
 *
 * Key rules:
 * - Side: "bid" = buy, "ask" = sell
 * - Order types: "limit", "price" (market buy), "market" (market sell), "best"
 * - For market buy: set `price` (total amount), no `volume`
 * - For market sell: set `volume`, no `price`
 * - Pair format: QUOTE-BASE (reversed)
 * - No sandbox/paper trading
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fromUpbitCode, toUpbitCode } from './parser'
import { resolveUpbitUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type Credentials = {
  apiKey: string
  apiSecret: string
}

// ── UUID generator ──

function uuid(): string {
  return crypto.randomUUID()
}

// ── SHA-512 hash ──

async function sha512(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-512', encoder.encode(message))
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── HMAC-SHA512 for JWT signing ──

async function hmacSha512(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  // Base64url encode
  let binary = ''
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── JWT token builder ──

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function buildJwt(
  credentials: Credentials,
  queryHash?: string,
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS512', typ: 'JWT' }))

  const payload: Record<string, string> = {
    access_key: credentials.apiKey,
    nonce: uuid(),
  }
  if (queryHash) {
    payload['query_hash'] = queryHash
    payload['query_hash_alg'] = 'SHA512'
  }

  const payloadB64 = base64url(JSON.stringify(payload))
  const sigInput = `${header}.${payloadB64}`
  const signature = await hmacSha512(credentials.apiSecret, sigInput)

  return `${sigInput}.${signature}`
}

// ── Build WS JWT (for private-ws, no query hash) ──

export async function buildWsJwt(credentials: Credentials): Promise<string> {
  return buildJwt(credentials)
}

// ── Authenticated GET ──

async function upbitAuthGet(
  path: string,
  credentials: Credentials,
  params?: Record<string, string>,
  country = '',
): Promise<unknown> {
  const { restBase } = resolveUpbitUrls(country)

  let qs = ''
  let queryHash: string | undefined
  if (params && Object.keys(params).length > 0) {
    qs = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    queryHash = await sha512(qs)
  }

  const jwt = await buildJwt(credentials, queryHash)

  const url = qs ? `${restBase}${path}?${qs}` : `${restBase}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  })

  if (!res.ok) throw new Error(`Upbit REST ${res.status}`)
  return res.json()
}

// ── Authenticated POST ──

async function upbitAuthPost(
  path: string,
  credentials: Credentials,
  body: Record<string, unknown>,
  country = '',
): Promise<unknown> {
  const { restBase } = resolveUpbitUrls(country)

  // Convert body to query string format for hashing
  const qs = Object.entries(body)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const queryHash = await sha512(qs)
  const jwt = await buildJwt(credentials, queryHash)

  const res = await fetch(`${restBase}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Upbit REST ${res.status}`)
  return res.json()
}

// ── Authenticated DELETE ──

async function upbitAuthDelete(
  path: string,
  credentials: Credentials,
  params: Record<string, string>,
  country = '',
): Promise<unknown> {
  const { restBase } = resolveUpbitUrls(country)

  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const queryHash = await sha512(qs)
  const jwt = await buildJwt(credentials, queryHash)

  const res = await fetch(`${restBase}${path}?${qs}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  })

  if (!res.ok) throw new Error(`Upbit REST ${res.status}`)
  return res.json()
}

// ── Place order ──

export async function placeUpbitOrder(
  params: OrderParams,
  credentials: Credentials,
  country: string,
): Promise<OrderResult> {
  try {
    const market = toUpbitCode(params.pair)

    // Upbit: "bid" = buy, "ask" = sell
    const side = params.side === 'buy' ? 'bid' : 'ask'

    const body: Record<string, unknown> = {
      market,
      side,
    }

    if (params.type === 'market') {
      if (params.side === 'buy') {
        // Market buy: set total price amount
        body['ord_type'] = 'price'
        body['price'] = params.size
      } else {
        // Market sell: set volume
        body['ord_type'] = 'market'
        body['volume'] = params.size
      }
    } else {
      // Limit
      body['ord_type'] = 'limit'
      body['volume'] = params.size
      if (params.price) body['price'] = params.price
    }

    const result = (await upbitAuthPost(
      '/v1/orders',
      credentials,
      body,
      country,
    )) as { uuid?: string }

    return { success: true, orderId: result?.uuid }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Cancel order ──

export async function cancelUpbitOrder(
  orderId: string,
  credentials: Credentials,
  country: string,
): Promise<OrderResult> {
  try {
    await upbitAuthDelete('/v1/order', credentials, { uuid: orderId }, country)
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Fetch balances ──

export async function fetchUpbitBalances(
  credentials: Credentials,
  country: string,
): Promise<Array<NormalizedBalance>> {
  const result = (await upbitAuthGet(
    '/v1/accounts',
    credentials,
    undefined,
    country,
  )) as Array<{
    currency: string
    balance: string
    locked: string
  }>

  return result
    .filter((a) => Number(a.balance) > 0 || Number(a.locked) > 0)
    .map((a) => {
      const available = Number(a.balance)
      const frozen = Number(a.locked)
      return {
        currency: a.currency.toUpperCase(),
        available: String(available),
        frozen: String(frozen),
        total: String(available + frozen),
      }
    })
}

// ── Fetch open orders ──

export async function fetchUpbitOpenOrders(
  credentials: Credentials,
  country: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const result = (await upbitAuthGet(
    '/v1/orders',
    credentials,
    { state: 'wait' },
    country,
  )) as Array<UpbitOrder>

  return result.map(mapUpbitOrder)
}

// ── Fetch order history ──

export async function fetchUpbitOrderHistory(
  credentials: Credentials,
  country: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const result = (await upbitAuthGet(
    '/v1/orders',
    credentials,
    { state: 'done', limit: '50' },
    country,
  )) as Array<UpbitOrder>

  return result.map(mapUpbitOrder)
}

// ── Internal types ──

type UpbitOrder = {
  uuid: string
  market: string
  side: string // "bid" | "ask"
  ord_type: string // "limit" | "price" | "market" | "best"
  price: string | null
  state: string // "wait" | "watch" | "done" | "cancel"
  volume: string | null
  remaining_volume: string | null
  executed_volume: string
  avg_price: string | null
  trades_count: number
  paid_fee: string
  created_at: string
}

function mapUpbitOrder(o: UpbitOrder): NormalizedOrderUpdate {
  const side = o.side === 'bid' ? 'buy' : 'sell'
  const type =
    o.ord_type === 'limit' || o.ord_type === 'best' ? 'limit' : 'market'

  return {
    orderId: o.uuid,
    pair: fromUpbitCode(o.market),
    side: side,
    type: type,
    size: o.volume ?? o.executed_volume ?? '0',
    price: o.price ?? '0',
    fillSize: o.executed_volume ?? '0',
    avgPrice: o.avg_price ?? '0',
    status: mapStatus(o),
    fee: o.paid_fee ?? '0',
    feeCcy: '',
    ts: new Date(o.created_at).getTime(),
    createdAt: new Date(o.created_at).getTime(),
  }
}

function mapStatus(o: UpbitOrder): NormalizedOrderUpdate['status'] {
  switch (o.state) {
    case 'done':
      return 'filled'
    case 'cancel':
      return 'cancelled'
    default:
      // Upbit has no explicit partial state — an open ('wait'/'watch') order
      // with some executed volume is partially filled.
      return Number(o.executed_volume ?? 0) > 0 ? 'partially_filled' : 'live'
  }
}
