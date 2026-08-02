// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com authenticated REST client — order execution, balances, history.
 *
 * Auth scheme (HMAC-SHA256):
 * 1. Sort params keys alphabetically, concatenate key+value pairs
 * 2. Build payload: method + id + api_key + paramString + nonce
 * 3. HMAC-SHA256(secret, payload) → hex-encoded
 *
 * All private endpoints use POST with JSON body containing auth fields.
 * Paper trading: use UAT sandbox URLs (uat-api.3ona.co).
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fromCryptocomSymbol, toCryptocomSymbol } from './parser'
import { resolveCryptocomRestBase } from './regions'
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

// ── HMAC-SHA256 hex signer ──

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Build sorted param string ──

function sortedParamString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((k) => {
      const v = params[k]
      if (typeof v === 'object' && v !== null) return `${k}${JSON.stringify(v)}`
      return `${k}${v}`
    })
    .join('')
}

// ── Sign a request ──

async function signRequest(
  method: string,
  id: number,
  apiKey: string,
  apiSecret: string,
  params: Record<string, unknown>,
  nonce: number,
): Promise<string> {
  const paramStr = sortedParamString(params)
  const payload = `${method}${id}${apiKey}${paramStr}${nonce}`
  return hmacHex(apiSecret, payload)
}

// ── Build WS auth message params (for private-ws) ──

export async function buildWsAuth(credentials: Credentials): Promise<{
  api_key: string
  sig: string
  id: number
  nonce: number
}> {
  const id = 1
  const nonce = Date.now()
  const sig = await signRequest(
    'public/auth',
    id,
    credentials.apiKey,
    credentials.apiSecret,
    {},
    nonce,
  )
  return { api_key: credentials.apiKey, sig, id, nonce }
}

// ── Authenticated POST ──

let requestId = 100

async function cryptocomPost(
  method: string,
  credentials: Credentials,
  params: Record<string, unknown>,
  paper: boolean,
): Promise<unknown> {
  const base = resolveCryptocomRestBase(paper)
  const id = requestId++
  const nonce = Date.now()

  const sig = await signRequest(
    method,
    id,
    credentials.apiKey,
    credentials.apiSecret,
    params,
    nonce,
  )

  const body = {
    id,
    method,
    api_key: credentials.apiKey,
    params,
    sig,
    nonce,
  }

  const res = await fetch(`${base}/exchange/v1/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Crypto.com REST ${res.status}`)

  const json = (await res.json()) as {
    code: number
    result?: unknown
    message?: string
  }

  if (json.code !== 0) {
    throw new Error(json.message ?? `Crypto.com error code ${json.code}`)
  }

  return json.result
}

// ── Place order ──

export async function placeCryptocomOrder(
  params: OrderParams,
  credentials: Credentials,
  paper: boolean,
): Promise<OrderResult> {
  try {
    const instrument = toCryptocomSymbol(params.pair)
    const trigger = params.trigger

    if (trigger) {
      // Trigger (TP/SL) orders live in Crypto.com's Advanced Order
      // Management API (the STOP_*/TAKE_PROFIT_* types were removed from
      // private/create-order). ref_price is the trigger price; direction
      // is encoded by the type+side pair.
      const type =
        trigger.triggerType === 'sl'
          ? params.type === 'limit'
            ? 'STOP_LIMIT'
            : 'STOP_LOSS'
          : params.type === 'limit'
            ? 'TAKE_PROFIT_LIMIT'
            : 'TAKE_PROFIT'

      const reqParams: Record<string, unknown> = {
        instrument_name: instrument,
        side: params.side.toUpperCase(),
        type,
        ref_price: trigger.triggerPrice,
      }
      if (params.type === 'limit') {
        reqParams['price'] = params.price ?? trigger.triggerPrice
        reqParams['quantity'] = params.size
      } else if (params.side === 'sell') {
        reqParams['quantity'] = params.size
      } else {
        // Market-execution buy triggers take notional (quote) —
        // approximate via the trigger price, where the order executes.
        reqParams['notional'] = String(
          Number(
            (Number(params.size) * Number(trigger.triggerPrice)).toPrecision(
              12,
            ),
          ),
        )
      }

      const result = (await cryptocomPost(
        'private/advanced/create-order',
        credentials,
        reqParams,
        paper,
      )) as { order_id?: string; client_oid?: string }

      return { success: true, orderId: result?.order_id }
    }

    const reqParams: Record<string, unknown> = {
      instrument_name: instrument,
      side: params.side.toUpperCase(), // BUY / SELL
      type: params.type.toUpperCase(), // LIMIT / MARKET
    }

    if (params.type === 'market' && params.side === 'buy') {
      // Market buy: specify notional (quote currency amount)
      if (params.tgtCcy === 'quote_ccy') {
        reqParams['notional'] = params.size
      } else {
        reqParams['quantity'] = params.size
      }
    } else {
      reqParams['quantity'] = params.size
    }

    if (params.type === 'limit' && params.price) {
      reqParams['price'] = params.price
    }

    const result = (await cryptocomPost(
      'private/create-order',
      credentials,
      reqParams,
      paper,
    )) as { order_id?: string; client_oid?: string }

    return { success: true, orderId: result?.order_id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Cancel order ──

export async function cancelCryptocomOrder(
  orderId: string,
  pair: string,
  credentials: Credentials,
  paper: boolean,
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  try {
    // Trigger orders were created via the Advanced Order Management API
    // and cancel through its counterpart.
    await cryptocomPost(
      opts?.trigger ? 'private/advanced/cancel-order' : 'private/cancel-order',
      credentials,
      {
        order_id: orderId,
        instrument_name: toCryptocomSymbol(pair),
      },
      paper,
    )
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Fetch balances ──

export async function fetchCryptocomBalances(
  credentials: Credentials,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  const result = (await cryptocomPost(
    'private/user-balance',
    credentials,
    {},
    paper,
  )) as {
    data?: Array<{
      position_balances?: Array<{
        instrument_name: string
        quantity: string
        reserved_qty: string
      }>
    }>
  }

  const balances: Array<NormalizedBalance> = []
  const positions = result?.data?.[0]?.position_balances ?? []

  for (const pos of positions) {
    const total = Number(pos.quantity)
    const frozen = Number(pos.reserved_qty)
    if (total === 0 && frozen === 0) continue

    const available = Math.max(0, total - frozen)
    balances.push({
      currency: pos.instrument_name.toUpperCase(),
      available: String(available),
      frozen: String(frozen),
      total: String(total),
    })
  }

  return balances
}

// ── Fetch open orders ──

/** Normalize an open advanced (trigger) order — cancel routes through
 * private/advanced/cancel-order. */
function mapAdvancedOrder(d: Record<string, unknown>): NormalizedOrderUpdate {
  const orderType = String(d['order_type'] ?? d['type'] ?? '')
  return {
    triggerOrder: true,
    ...(d['ref_price'] ? { triggerPrice: String(d['ref_price']) } : {}),
    orderId: String(d['order_id'] ?? ''),
    pair: fromCryptocomSymbol(String(d['instrument_name'] ?? '')),
    side: String(d['side'] ?? 'BUY').toLowerCase() as 'buy' | 'sell',
    type:
      orderType.endsWith('_LIMIT') || orderType === 'STOP_LIMIT'
        ? 'limit'
        : 'market',
    size: String(d['quantity'] ?? ''),
    price: String(d['limit_price'] ?? d['price'] ?? ''),
    fillSize: '0',
    avgPrice: '0',
    status: 'live',
    fee: '0',
    feeCcy: '',
    ts: Number(d['update_time'] ?? d['create_time'] ?? Date.now()),
    createdAt: Number(d['create_time'] ?? Date.now()),
  }
}

export async function fetchCryptocomOpenOrders(
  credentials: Credentials,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const params: Record<string, unknown> = { page_size: 50 }
  if (pair) params['instrument_name'] = toCryptocomSymbol(pair)

  // Trigger orders were placed via the Advanced Order Management API and
  // are listed there; some may surface in the regular list too, so
  // de-dup by order_id (advanced wins — it carries the trigger marking).
  const [result, advanced] = await Promise.all([
    cryptocomPost(
      'private/get-open-orders',
      credentials,
      params,
      paper,
    ) as Promise<{ data?: Array<CryptocomOrder> }>,
    (
      cryptocomPost(
        'private/advanced/get-open-orders',
        credentials,
        pair ? { instrument_name: toCryptocomSymbol(pair) } : {},
        paper,
      ) as Promise<{ data?: Array<Record<string, unknown>> }>
    ).catch(() => ({ data: [] as Array<Record<string, unknown>> })),
  ])

  // The advanced endpoint can also carry attach legs / non-trigger
  // entries — only STOP_*/TAKE_* types are trigger orders.
  const advancedOrders = (advanced?.data ?? [])
    .filter((d) => {
      const t = String(d['order_type'] ?? d['type'] ?? '')
      return t.startsWith('STOP_') || t.startsWith('TAKE_')
    })
    .map(mapAdvancedOrder)
  const advancedIds = new Set(advancedOrders.map((o) => o.orderId))
  const regular = (result?.data ?? [])
    .filter((o) => !advancedIds.has(o.order_id))
    .map(mapOrder)

  return [...regular, ...advancedOrders]
}

// ── Fetch order history ──

export async function fetchCryptocomOrderHistory(
  credentials: Credentials,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const params: Record<string, unknown> = { page_size: 50 }
  if (pair) params['instrument_name'] = toCryptocomSymbol(pair)

  const result = (await cryptocomPost(
    'private/get-order-history',
    credentials,
    params,
    paper,
  )) as { data?: Array<CryptocomOrder> }

  return (result?.data ?? []).map(mapOrder)
}

// ── Internal types ──

type CryptocomOrder = {
  order_id: string
  instrument_name: string
  side: string // "BUY" | "SELL"
  type: string // "LIMIT" | "MARKET"
  price: string
  quantity: string
  cumulative_quantity: string
  avg_price: string
  status: string // "NEW" | "FILLED" | "PARTIALLY_FILLED" | "CANCELED" | "EXPIRED" | "REJECTED"
  fee_currency: string
  cumulative_fee: string
  create_time: number
  update_time: number
}

function mapOrder(o: CryptocomOrder): NormalizedOrderUpdate {
  return {
    orderId: o.order_id,
    pair: fromCryptocomSymbol(o.instrument_name),
    side: o.side.toLowerCase() as 'buy' | 'sell',
    type: o.type.toLowerCase() as 'market' | 'limit',
    size: o.quantity,
    price: o.price || '0',
    fillSize: o.cumulative_quantity || '0',
    avgPrice: o.avg_price || '0',
    status: mapStatus(o.status),
    fee: o.cumulative_fee || '0',
    feeCcy: o.fee_currency || '',
    ts: o.update_time,
    createdAt: o.create_time,
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'FILLED':
      return 'filled'
    case 'CANCELED':
    case 'EXPIRED':
    case 'REJECTED':
      return 'cancelled'
    case 'PARTIALLY_FILLED':
      return 'partially_filled'
    default:
      return 'live'
  }
}
