// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX authenticated REST client — order execution, balances, history.
 *
 * Auth scheme (HMAC-SHA256, SignatureVersion 2):
 * 1. Build pre-sign: METHOD\nHOST\nPATH\nSORTED_URL_ENCODED_PARAMS
 * 2. HMAC-SHA256(secret, preSign) → base64 → Signature param
 *
 * All private endpoints are authenticated via URL query params.
 * GET: all params in URL, no body.
 * POST: auth params in URL, business params as JSON body.
 *
 * Account ID must be fetched from GET /v1/account/accounts (spot type).
 *
 * No paper trading — HTX has no public testnet.
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fromHtxSymbol, toHtxSymbol } from './parser'
import { resolveHtxRestBase } from './regions'
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

const API_HOST = 'api.huobi.pro'

// ── Cached account ID ──

let cachedAccountId: string | null = null

// ── UTC timestamp in ISO 8601 format (no timezone) ──

function utcTimestamp(): string {
  return new Date().toISOString().slice(0, 19)
}

// ── HMAC-SHA256 signer ──

async function htxSign(
  method: string,
  path: string,
  params: Record<string, string>,
  secret: string,
): Promise<string> {
  // Sort params by key (ASCII), URL-encode keys and values
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')

  const preSign = `${method}\n${API_HOST}\n${path}\n${sortedParams}`

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(preSign))

  let binary = ''
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b)
  return btoa(binary)
}

// ── Build authenticated URL ──

async function buildAuthUrl(
  method: string,
  path: string,
  credentials: Credentials,
  extraParams?: Record<string, string>,
): Promise<string> {
  const base = resolveHtxRestBase()
  const params: Record<string, string> = {
    AccessKeyId: credentials.apiKey,
    SignatureMethod: 'HmacSHA256',
    SignatureVersion: '2',
    Timestamp: utcTimestamp(),
    ...extraParams,
  }

  const signature = await htxSign(method, path, params, credentials.apiSecret)
  params['Signature'] = signature

  const qs = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')

  return `${base}${path}?${qs}`
}

// ── Authenticated GET ──

async function htxGet(
  path: string,
  credentials: Credentials,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = await buildAuthUrl('GET', path, credentials, params)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTX REST ${res.status}`)

  const json = (await res.json()) as {
    status: string
    data?: unknown
    'err-code'?: string
    'err-msg'?: string
  }
  if (json.status !== 'ok') {
    throw new Error(json['err-msg'] ?? json['err-code'] ?? 'HTX API error')
  }
  return json.data
}

// ── Authenticated POST ──

async function htxPost(
  path: string,
  credentials: Credentials,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = await buildAuthUrl('POST', path, credentials)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTX REST ${res.status}`)

  const json = (await res.json()) as {
    status: string
    data?: unknown
    'err-code'?: string
    'err-msg'?: string
  }
  if (json.status !== 'ok') {
    throw new Error(json['err-msg'] ?? json['err-code'] ?? 'HTX API error')
  }
  return json.data
}

// ── Get spot account ID (cached) ──

async function getSpotAccountId(credentials: Credentials): Promise<string> {
  if (cachedAccountId) return cachedAccountId

  const accounts = (await htxGet(
    '/v1/account/accounts',
    credentials,
  )) as Array<{ id: number; type: string; state: string }>

  const spot = accounts.find((a) => a.type === 'spot' && a.state === 'working')
  if (!spot) throw new Error('No active spot account found')

  cachedAccountId = String(spot.id)
  return cachedAccountId
}

// ── WS auth signature (for private-ws) ──

export async function buildWsAuthParams(credentials: Credentials): Promise<{
  accessKey: string
  signatureMethod: string
  signatureVersion: string
  timestamp: string
  signature: string
}> {
  const timestamp = utcTimestamp()
  const params: Record<string, string> = {
    accessKey: credentials.apiKey,
    signatureMethod: 'HmacSHA256',
    signatureVersion: '2.1',
    timestamp,
  }

  const signature = await htxSign(
    'GET',
    '/ws/v2',
    params,
    credentials.apiSecret,
  )

  return {
    accessKey: credentials.apiKey,
    signatureMethod: 'HmacSHA256',
    signatureVersion: '2.1',
    timestamp,
    signature,
  }
}

// ── Place order ──

/** POST to an HTX v2 endpoint. v2 responses use {code, data, message}
 * instead of v1's {status, data, err-msg}. */
async function htxPostV2(
  path: string,
  credentials: Credentials,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = await buildAuthUrl('POST', path, credentials)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTX REST ${res.status}`)

  const json = (await res.json()) as {
    code?: number
    data?: unknown
    message?: string
  }
  if (json.code !== 200) {
    throw new Error(json.message ?? `HTX error ${json.code ?? 'unknown'}`)
  }
  return json.data
}

export async function placeHtxOrder(
  params: OrderParams,
  credentials: Credentials,
): Promise<OrderResult> {
  try {
    const accountId = await getSpotAccountId(credentials)
    const symbol = toHtxSymbol(params.pair)
    const trigger = params.trigger

    if (trigger) {
      // Trigger (TP/SL) orders use HTX's algo-order API. Direction is
      // inferred by the venue from stopPrice vs market price at placement.
      // clientOrderId is mandatory here (unlike regular orders) and is
      // also how the algo order is addressed afterwards.
      const clientOrderId =
        params.clientOrderId ??
        `pl${Date.now()}${Math.random().toString(36).slice(2, 8)}`

      const body: Record<string, unknown> = {
        accountId,
        symbol,
        orderSide: params.side,
        orderType: params.type,
        clientOrderId,
        stopPrice: trigger.triggerPrice,
      }
      if (params.type === 'limit') {
        body['orderPrice'] = params.price ?? trigger.triggerPrice
        body['orderSize'] = params.size
      } else if (params.side === 'sell') {
        body['orderSize'] = params.size
      } else {
        // Market buys take quote value — approximate via the trigger
        // price, where the order will execute.
        body['orderValue'] = String(
          Number(
            (Number(params.size) * Number(trigger.triggerPrice)).toPrecision(
              12,
            ),
          ),
        )
      }

      const data = (await htxPostV2('/v2/algo-orders', credentials, body)) as {
        clientOrderId?: string
      } | null
      return { success: true, orderId: data?.clientOrderId ?? clientOrderId }
    }

    // HTX order type: buy-market, sell-market, buy-limit, sell-limit
    const orderType =
      params.type === 'market'
        ? `${params.side}-market`
        : `${params.side}-limit`

    const body: Record<string, unknown> = {
      'account-id': accountId,
      symbol,
      type: orderType,
      amount: params.size,
      source: 'spot-api',
    }

    if (params.type === 'limit' && params.price) {
      body['price'] = params.price
    }

    const orderId = (await htxPost(
      '/v1/order/orders/place',
      credentials,
      body,
    )) as string

    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Cancel order ──

export async function cancelHtxOrder(
  orderId: string,
  credentials: Credentials,
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  try {
    if (opts?.trigger) {
      // Algo (trigger) orders are addressed by clientOrderId and cancel
      // through the v2 algo endpoint.
      await htxPostV2('/v2/algo-orders/cancellation', credentials, {
        clientOrderIds: [orderId],
      })
      return { success: true, orderId }
    }
    await htxPost(`/v1/order/orders/${orderId}/submitcancel`, credentials, {})
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Fetch balances ──

export async function fetchHtxBalances(
  credentials: Credentials,
): Promise<Array<NormalizedBalance>> {
  const accountId = await getSpotAccountId(credentials)
  const result = (await htxGet(
    `/v1/account/accounts/${accountId}/balance`,
    credentials,
  )) as {
    list: Array<{
      currency: string
      type: string // "trade" | "frozen"
      balance: string
    }>
  }

  // Aggregate trade + frozen per currency
  const map = new Map<string, { available: number; frozen: number }>()

  for (const item of result.list) {
    const ccy = item.currency.toUpperCase()
    const amt = Number(item.balance)
    if (amt === 0) continue

    const entry = map.get(ccy) ?? { available: 0, frozen: 0 }
    if (item.type === 'trade') {
      entry.available += amt
    } else if (item.type === 'frozen') {
      entry.frozen += amt
    }
    map.set(ccy, entry)
  }

  const balances: Array<NormalizedBalance> = []
  for (const [currency, { available, frozen }] of map) {
    const total = available + frozen
    if (total === 0) continue
    balances.push({
      currency,
      available: String(available),
      frozen: String(frozen),
      total: String(total),
    })
  }

  return balances
}

// ── Fetch open orders ──

/** GET from an HTX v2 endpoint ({code, data} envelope, like htxPostV2). */
async function htxGetV2(
  path: string,
  credentials: Credentials,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = await buildAuthUrl('GET', path, credentials, params)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTX REST ${res.status}`)

  const json = (await res.json()) as {
    code?: number
    data?: unknown
    message?: string
  }
  if (json.code !== 200) {
    throw new Error(json.message ?? `HTX error ${json.code ?? 'unknown'}`)
  }
  return json.data
}

type HtxAlgoOrder = Record<string, unknown>

/** Normalize an un-triggered algo (conditional) order. clientOrderId is
 * the cancellation handle, so it doubles as the order id. */
function mapHtxAlgoOrder(d: HtxAlgoOrder): NormalizedOrderUpdate {
  const orderType = String(d['orderType'] ?? 'market')
  return {
    triggerOrder: true,
    ...(d['stopPrice'] ? { triggerPrice: String(d['stopPrice']) } : {}),
    orderId: String(d['clientOrderId'] ?? ''),
    pair: fromHtxSymbol(String(d['symbol'] ?? '')),
    side: String(d['orderSide'] ?? 'buy') as 'buy' | 'sell',
    type: orderType === 'limit' ? 'limit' : 'market',
    size: String(d['orderSize'] ?? d['orderValue'] ?? ''),
    price: orderType === 'limit' ? String(d['orderPrice'] ?? '') : '',
    fillSize: '',
    avgPrice: '',
    status: 'live',
    fee: '',
    feeCcy: '',
    ts: Number(d['orderOrigTime'] ?? Date.now()),
    createdAt: Number(d['orderOrigTime'] ?? Date.now()),
  }
}

export async function fetchHtxOpenOrders(
  credentials: Credentials,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const accountId = await getSpotAccountId(credentials)
  const params: Record<string, string> = {
    'account-id': accountId,
    size: '50',
  }
  if (pair) params['symbol'] = toHtxSymbol(pair)

  // Un-triggered conditional orders never appear in openOrders — they
  // live behind the v2 algo endpoint until they fire.
  const algoParams: Record<string, string> = { accountId }
  if (pair) algoParams['symbol'] = toHtxSymbol(pair)

  const [orders, algos] = await Promise.all([
    htxGet('/v1/order/openOrders', credentials, params) as Promise<
      Array<HtxOrder>
    >,
    (
      htxGetV2('/v2/algo-orders/opening', credentials, algoParams) as Promise<
        Array<HtxAlgoOrder>
      >
    ).catch(() => [] as Array<HtxAlgoOrder>),
  ])

  return [...orders.map(mapHtxOrder), ...(algos ?? []).map(mapHtxAlgoOrder)]
}

// ── Fetch order history ──

export async function fetchHtxOrderHistory(
  credentials: Credentials,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const params: Record<string, string> = { size: '50' }
  if (pair) params['symbol'] = toHtxSymbol(pair)

  const orders = (await htxGet(
    '/v1/order/history',
    credentials,
    params,
  )) as Array<HtxOrder>

  return orders.map(mapHtxOrder)
}

// ── Internal types ──

type HtxOrder = {
  id: number
  symbol: string
  type: string // "buy-limit", "sell-market", etc.
  amount: string
  price: string
  state: string // "submitted", "partial-filled", "filled", "canceled", "partial-canceled"
  'filled-amount': string
  'filled-cash-amount': string
  'filled-fees': string
  'created-at': number
  'finished-at'?: number
}

function mapHtxOrder(o: HtxOrder): NormalizedOrderUpdate {
  const [side, orderType] = parseOrderType(o.type)
  return {
    orderId: String(o.id),
    pair: fromHtxSymbol(o.symbol),
    side,
    type: orderType,
    size: o.amount,
    price: o.price || '0',
    fillSize: o['filled-amount'] || '0',
    avgPrice:
      Number(o['filled-amount']) > 0
        ? String(Number(o['filled-cash-amount']) / Number(o['filled-amount']))
        : '0',
    status: mapStatus(o.state),
    fee: o['filled-fees'] || '0',
    feeCcy: '',
    ts: o['finished-at'] ?? o['created-at'],
    createdAt: o['created-at'],
  }
}

function parseOrderType(htxType: string): ['buy' | 'sell', 'market' | 'limit'] {
  const side = htxType.startsWith('buy') ? 'buy' : 'sell'
  const type = htxType.includes('market') ? 'market' : 'limit'
  return [side, type]
}

function mapStatus(state: string): NormalizedOrderUpdate['status'] {
  switch (state) {
    case 'filled':
      return 'filled'
    case 'canceled':
    case 'partial-canceled':
      return 'cancelled'
    case 'partial-filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}
