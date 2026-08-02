// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo authenticated REST client — order execution, balances, history.
 *
 * Auth scheme (HMAC-SHA256, hex):
 *   signature = HMAC_SHA256(timestamp + method + '/v2' + path + query + body)
 * sent alongside these headers:
 *   Bitvavo-Access-Key, Bitvavo-Access-Signature,
 *   Bitvavo-Access-Timestamp (ms), Bitvavo-Access-Window (ms).
 *
 * GET/DELETE carry params in the query string (part of the signed path); POST
 * carries a JSON body (appended to the signed string). Bitvavo has no testnet
 * or order-validate dry-run, so paper mode is simulated locally and never hits
 * the exchange — the connector only advertises `live` mode, this is a guard.
 */

import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fromMarket, toMarket } from './parser'
import { resolveBitvavoRestBase } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

export type BitvavoCredentials = {
  apiKey: string
  apiSecret: string
}

const ACCESS_WINDOW = '10000'

type RequestOptions = {
  query?: Record<string, string>
  body?: Record<string, unknown>
}

/**
 * Perform a signed Bitvavo REST request. `endpoint` is the path WITHOUT the
 * `/v2` prefix (e.g. '/order'); the prefix is added for both the URL and the
 * signature so the two always agree.
 */
async function bitvavoRequest(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  credentials: BitvavoCredentials,
  opts: RequestOptions = {},
): Promise<unknown> {
  const base = resolveBitvavoRestBase()
  const timestamp = Date.now()

  const query = opts.query
    ? `?${new URLSearchParams(opts.query).toString()}`
    : ''
  const signedPath = `/v2${endpoint}${query}`
  const bodyStr = opts.body ? JSON.stringify(opts.body) : ''

  const signature = await hmacSignHex(
    credentials.apiSecret,
    `${timestamp}${method}${signedPath}${bodyStr}`,
  )

  const headers: Record<string, string> = {
    'Bitvavo-Access-Key': credentials.apiKey,
    'Bitvavo-Access-Signature': signature,
    'Bitvavo-Access-Timestamp': String(timestamp),
    'Bitvavo-Access-Window': ACCESS_WINDOW,
  }
  if (bodyStr) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${base}${signedPath}`, {
    method,
    headers,
    body: bodyStr || undefined,
  })

  const json = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const err = json as { error?: string; errorCode?: number } | null
    throw new Error(err?.error ?? `Bitvavo REST error: ${res.status}`)
  }
  return json
}

// ── Place order ──

export async function placeBitvavoOrder(
  params: OrderParams,
  credentials: BitvavoCredentials,
): Promise<OrderResult> {
  // Bitvavo has no dry-run; simulate paper locally rather than risk a real fill.
  if (params.mode === 'paper') {
    return { success: true, orderId: `paper-${Date.now()}` }
  }

  // Trigger (TP/SL) orders map to Bitvavo's native stop order types.
  // Direction is encoded by the type+side pair; the trigger fires on the
  // last-trade price. Trigger orders always size in base `amount`.
  const trigger = params.trigger
  const orderType = trigger
    ? `${trigger.triggerType === 'sl' ? 'stopLoss' : 'takeProfit'}${
        params.type === 'limit' ? 'Limit' : ''
      }`
    : params.type

  const body: Record<string, unknown> = {
    market: toMarket(params.pair),
    side: params.side,
    orderType,
  }

  if (trigger) {
    body['triggerType'] = 'price'
    body['triggerReference'] = 'lastTrade'
    body['triggerAmount'] = trigger.triggerPrice
    body['amount'] = params.size
    if (params.type === 'limit') {
      body['price'] = params.price ?? trigger.triggerPrice
    }
  } else if (params.type === 'limit') {
    body['amount'] = params.size
    if (params.price) body['price'] = params.price
  } else {
    // Market order: size is denominated in quote when tgtCcy asks for it
    // (e.g. "spend 100 EUR"), otherwise it is a base amount.
    if (params.tgtCcy === 'quote_ccy') body['amountQuote'] = params.size
    else body['amount'] = params.size
  }

  try {
    const result = (await bitvavoRequest('POST', '/order', credentials, {
      body,
    })) as { orderId?: string }
    return { success: true, orderId: result.orderId ?? '' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Cancel order ──

export async function cancelBitvavoOrder(
  orderId: string,
  pair: string,
  credentials: BitvavoCredentials,
): Promise<OrderResult> {
  try {
    await bitvavoRequest('DELETE', '/order', credentials, {
      query: { market: toMarket(pair), orderId },
    })
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Fetch open orders ──

export async function fetchBitvavoOpenOrders(
  credentials: BitvavoCredentials,
  market?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  // /ordersOpen returns every open order when no market is given.
  const query = market ? { market: toMarket(market) } : undefined
  const result = (await bitvavoRequest('GET', '/ordersOpen', credentials, {
    query,
  })) as Array<BitvavoOrder>
  return (Array.isArray(result) ? result : []).map(mapBitvavoOrder)
}

// ── Fetch order history ──

export async function fetchBitvavoOrderHistory(
  credentials: BitvavoCredentials,
  market?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  // /orders REQUIRES a market — without a current pair there is nothing to ask.
  if (!market) return []
  const result = (await bitvavoRequest('GET', '/orders', credentials, {
    query: { market: toMarket(market), limit: '100' },
  })) as Array<BitvavoOrder>
  return (Array.isArray(result) ? result : []).map(mapBitvavoOrder)
}

// ── Fetch balances ──

export async function fetchBitvavoBalances(
  credentials: BitvavoCredentials,
): Promise<Array<NormalizedBalance>> {
  const result = (await bitvavoRequest(
    'GET',
    '/balance',
    credentials,
  )) as Array<{
    symbol?: string
    available?: string
    inOrder?: string
  }>

  const balances: Array<NormalizedBalance> = []
  for (const b of Array.isArray(result) ? result : []) {
    const available = Number(b.available ?? 0)
    const frozen = Number(b.inOrder ?? 0)
    const total = available + frozen
    if (total === 0) continue
    balances.push({
      currency: b.symbol ?? '',
      available: String(available),
      frozen: String(frozen),
      total: String(total),
    })
  }
  return balances
}

// ── Internal types + mapping ──

export type BitvavoOrder = {
  orderId: string
  market: string
  created?: number
  updated?: number
  status: string
  side: 'buy' | 'sell'
  orderType: string
  amount?: string
  amountRemaining?: string
  price?: string
  filledAmount?: string
  filledAmountQuote?: string
  feePaid?: string
  feeCurrency?: string
  triggerPrice?: string
  triggerAmount?: string
}

export function mapBitvavoOrder(o: BitvavoOrder): NormalizedOrderUpdate {
  const filledAmount = Number(o.filledAmount ?? 0)
  const filledQuote = Number(o.filledAmountQuote ?? 0)
  const avgPrice =
    filledAmount > 0 ? String(filledQuote / filledAmount) : o.price || '0'
  // stopLoss[Limit] / takeProfit[Limit] are trigger orders; they share
  // the regular order id space (status 'awaitingTrigger' until fired),
  // so listing and cancel need no separate endpoints.
  const isTrigger =
    o.orderType?.startsWith('stopLoss') || o.orderType?.startsWith('takeProfit')
  const triggerPrice = o.triggerPrice || o.triggerAmount || ''
  return {
    ...(isTrigger
      ? {
          triggerOrder: true,
          ...(triggerPrice ? { triggerPrice } : {}),
        }
      : {}),
    orderId: o.orderId,
    pair: fromMarket(o.market),
    side: o.side ?? 'buy',
    type: isTrigger
      ? o.orderType.endsWith('Limit')
        ? 'limit'
        : 'market'
      : o.orderType === 'limit'
        ? 'limit'
        : 'market',
    size: o.amount ?? '0',
    price: o.price || '0',
    fillSize: o.filledAmount ?? '0',
    avgPrice,
    status: mapBitvavoStatus(o.status),
    fee: o.feePaid ?? '0',
    feeCcy: o.feeCurrency ?? '',
    ts: o.updated ?? o.created ?? Date.now(),
    createdAt: o.created ?? Date.now(),
  }
}

export function mapBitvavoStatus(
  status: string,
): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'filled':
      return 'filled'
    case 'partiallyFilled':
      return 'partially_filled'
    case 'new':
    case 'awaitingTrigger':
      return 'live'
    default:
      // canceled, canceledAuction, canceledIOC/FOK/..., expired, rejected
      return 'cancelled'
  }
}
