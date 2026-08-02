// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex authenticated REST client — order execution, balances, history.
 *
 * Auth scheme (HMAC-SHA384):
 * 1. Nonce: microsecond timestamp, ever-increasing
 * 2. Payload: `/api/v2${path}${nonce}${body}`
 * 3. HMAC-SHA384(secret, payload) → hex
 *
 * Headers: bfx-apikey, bfx-nonce, bfx-signature
 *
 * Key rules:
 * - Amount: positive = buy, negative = sell (string)
 * - Order type for spot: "EXCHANGE LIMIT", "EXCHANGE MARKET"
 * - All auth endpoints use POST (even reads like wallets)
 * - No sandbox/paper trading available
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fromBfxSymbol, toBfxSymbol } from './parser'
import { resolveBfxUrls } from './regions'
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

// ── Nonce generator (microseconds, ever-increasing) ──

let lastNonce = Date.now() * 1000

function nextNonce(): string {
  const now = Date.now() * 1000
  lastNonce = lastNonce < now ? now : lastNonce + 1
  return lastNonce.toString()
}

// ── HMAC-SHA384 hex signer ──

async function hmacSha384Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-384' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Build WS auth message (for private-ws) ──

export async function buildWsAuth(credentials: Credentials): Promise<{
  apiKey: string
  authNonce: string
  authPayload: string
  authSig: string
}> {
  const authNonce = nextNonce()
  const authPayload = `AUTH${authNonce}`
  const authSig = await hmacSha384Hex(credentials.apiSecret, authPayload)
  return {
    apiKey: credentials.apiKey,
    authNonce,
    authPayload,
    authSig,
  }
}

// ── Authenticated POST ──

async function bfxAuthPost(
  path: string,
  credentials: Credentials,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { restAuthBase } = resolveBfxUrls()
  const nonce = nextNonce()
  const bodyStr = JSON.stringify(body)

  const sigPayload = `/api/v2${path}${nonce}${bodyStr}`
  const signature = await hmacSha384Hex(credentials.apiSecret, sigPayload)

  const res = await fetch(`${restAuthBase}/v2${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bfx-nonce': nonce,
      'bfx-apikey': credentials.apiKey,
      'bfx-signature': signature,
    },
    body: bodyStr,
  })

  if (!res.ok) throw new Error(`Bitfinex REST ${res.status}`)

  const json = await res.json()

  // Error responses are arrays: [error_code, error_id, error_message]
  if (Array.isArray(json) && json[0] === 'error') {
    throw new Error(json[2] ?? `Bitfinex error ${json[1]}`)
  }

  return json
}

// ── Place order ──

export async function placeBfxOrder(
  params: OrderParams,
  credentials: Credentials,
): Promise<OrderResult> {
  try {
    const symbol = toBfxSymbol(params.pair)

    // Bitfinex: positive amount = buy, negative = sell
    const amount = params.side === 'sell' ? `-${params.size}` : params.size

    // Trigger (TP/SL) orders: stop-losses map to Bitfinex's native stop
    // types (price = trigger price, price_aux_limit = post-trigger limit).
    // Bitfinex stops only fire on adverse crosses (a sell stop triggers on
    // a fall), so a take-profit cannot be a STOP — it rests as a plain
    // EXCHANGE LIMIT at the trigger price instead, which carries the same
    // exit semantics on spot.
    const trigger = params.trigger
    const orderType =
      trigger?.triggerType === 'sl'
        ? params.type === 'limit'
          ? 'EXCHANGE STOP LIMIT'
          : 'EXCHANGE STOP'
        : trigger
          ? 'EXCHANGE LIMIT'
          : params.type === 'market'
            ? 'EXCHANGE MARKET'
            : 'EXCHANGE LIMIT'

    const body: Record<string, unknown> = {
      type: orderType,
      symbol,
      amount,
    }

    if (trigger?.triggerType === 'sl') {
      body['price'] = trigger.triggerPrice
      if (params.type === 'limit' && params.price) {
        body['price_aux_limit'] = params.price
      }
    } else if (trigger) {
      body['price'] = params.price ?? trigger.triggerPrice
    } else if (params.type === 'limit' && params.price) {
      body['price'] = params.price
    }

    const result = (await bfxAuthPost(
      '/auth/w/order/submit',
      credentials,
      body,
    )) as Array<unknown>

    // Response: [MTS, TYPE, MSG_ID, null, [ORDER_ARRAY], CODE, STATUS, TEXT]
    const status = result[6] as string
    if (status === 'SUCCESS') {
      const orderArr = result[4] as Array<unknown>
      const orderId = Array.isArray(orderArr)
        ? String(Array.isArray(orderArr[0]) ? orderArr[0][0] : orderArr[0])
        : undefined
      return { success: true, orderId }
    }

    return { success: false, error: String(result[7] ?? 'Order failed') }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Cancel order ──

export async function cancelBfxOrder(
  orderId: string,
  credentials: Credentials,
): Promise<OrderResult> {
  try {
    await bfxAuthPost('/auth/w/order/cancel', credentials, {
      id: Number(orderId),
    })
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Fetch balances ──

export async function fetchBfxBalances(
  credentials: Credentials,
): Promise<Array<NormalizedBalance>> {
  const result = (await bfxAuthPost(
    '/auth/r/wallets',
    credentials,
    {},
  )) as Array<Array<unknown>>

  const balances: Array<NormalizedBalance> = []

  for (const wallet of result) {
    // [TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE]
    const type = wallet[0] as string
    if (type !== 'exchange') continue // only spot wallets

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

  return balances
}

// ── Fetch open orders ──

export async function fetchBfxOpenOrders(
  credentials: Credentials,
): Promise<Array<NormalizedOrderUpdate>> {
  const result = (await bfxAuthPost(
    '/auth/r/orders',
    credentials,
    {},
  )) as Array<Array<unknown>>

  return result.map(mapBfxOrder)
}

// ── Fetch order history ──

export async function fetchBfxOrderHistory(
  credentials: Credentials,
): Promise<Array<NormalizedOrderUpdate>> {
  const result = (await bfxAuthPost('/auth/r/orders/hist', credentials, {
    limit: 50,
  })) as Array<Array<unknown>>

  return result.map(mapBfxOrder)
}

// ── Map Bitfinex order array to NormalizedOrderUpdate ──

function mapBfxOrder(o: Array<unknown>): NormalizedOrderUpdate {
  // Order array: [ID, GID, CID, SYMBOL, MTS_CREATE, MTS_UPDATE, AMOUNT, AMOUNT_ORIG,
  //               TYPE, TYPE_PREV, _FLAGS, _FLAGS, STATUS, _placeholder, _placeholder,
  //               _placeholder, PRICE, PRICE_AVG, ...]
  const amountOrig = Number(o[7] ?? 0)
  const amount = Number(o[6] ?? 0)
  const side = amountOrig > 0 ? 'buy' : 'sell'
  const typeStr = (o[8] as string) ?? ''
  const orderType = typeStr.includes('MARKET') ? 'market' : 'limit'
  const statusStr = (o[13] as string) ?? ''
  // For STOP orders PRICE (o[16]) is the trigger price and
  // PRICE_AUX_LIMIT (o[19]) the post-trigger limit price.
  const isStop = typeStr.includes('STOP')

  return {
    ...(isStop
      ? { triggerOrder: true, triggerPrice: String(o[16] ?? '') }
      : {}),
    orderId: String(o[0]),
    pair: fromBfxSymbol(String(o[3] ?? '')),
    side: side,
    type: isStop ? (typeStr.includes('LIMIT') ? 'limit' : 'market') : orderType,
    size: String(Math.abs(amountOrig)),
    price: isStop ? String(o[19] ?? '0') : String(o[16] ?? '0'),
    fillSize: String(Math.abs(amountOrig) - Math.abs(amount)),
    avgPrice: String(o[17] ?? '0'),
    status: mapStatus(statusStr),
    fee: '0',
    feeCcy: '',
    ts: (o[5] as number) ?? Date.now(),
    createdAt: (o[4] as number) ?? Date.now(),
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
  if (status.startsWith('EXECUTED')) return 'filled'
  if (status.startsWith('CANCELED') || status.startsWith('RSN_DUST'))
    return 'cancelled'
  if (status.startsWith('PARTIALLY FILLED')) return 'partially_filled'
  return 'live'
}
