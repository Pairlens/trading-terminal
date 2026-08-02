// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate.io Order Executor — authenticated REST endpoints for trading.
 *
 * Gate.io uses HMAC-SHA512 (NOT SHA256) for authentication.
 * Credentials are just apiKey + apiSecret — no passphrase.
 *
 * Signature prehash (newline-separated):
 *   {METHOD}\n{URL_PATH}\n{QUERY_STRING}\n{SHA512_HEX(body)}\n{TIMESTAMP}
 *
 * Body is first SHA-512 hashed (hex), then included in the signature string.
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { denormalizePair, normalizePair } from './parser'
import { resolveGateRestBase } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type GateCredentials = {
  apiKey: string
  apiSecret: string
}

// ── HMAC-SHA512 helpers (Web Crypto API) ──

async function sha512Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-512',
    new TextEncoder().encode(message),
  )
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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

/**
 * Build signed headers for Gate.io API requests.
 *
 * Gate.io auth headers: KEY, Timestamp, SIGN
 * Prehash: {METHOD}\n{URL_PATH}\n{QUERY_STRING}\n{SHA512_HEX(body)}\n{TIMESTAMP}
 */
async function buildSignedHeaders(
  creds: GateCredentials,
  method: string,
  path: string,
  queryString: string,
  body: string,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyHash = await sha512Hex(body)
  const prehash = `${method}\n${path}\n${queryString}\n${bodyHash}\n${timestamp}`
  const signature = await hmacSha512Hex(creds.apiSecret, prehash)

  return {
    KEY: creds.apiKey,
    Timestamp: timestamp,
    SIGN: signature,
    'Content-Type': 'application/json',
  }
}

/** Split a full URL path into path and query string components. */
function splitPathQuery(fullPath: string): [string, string] {
  const qIdx = fullPath.indexOf('?')
  if (qIdx < 0) return [fullPath, '']
  return [fullPath.slice(0, qIdx), fullPath.slice(qIdx + 1)]
}

// ── Place order ─────────────────────────────────────────────────────

/** Place an order on Gate.io via POST /spot/orders. */
export async function placeGateOrder(
  params: OrderParams,
  credentials: GateCredentials,
  _country: string,
): Promise<OrderResult> {
  const paper = params.mode === 'paper'
  const restBase = resolveGateRestBase(paper)
  const symbol = normalizePair(params.pair)
  const trigger = params.trigger

  let urlPath: string
  let fetchPath: string
  let orderBody: Record<string, unknown>

  if (trigger) {
    // Trigger (TP/SL) orders use Gate's price-triggered order API. The
    // trigger direction is explicit: rule '<=' fires on a fall to the
    // trigger price (sl+sell / tp+buy), '>=' on a rise.
    urlPath = '/api/v4/spot/price_orders'
    fetchPath = '/spot/price_orders'
    const crossesDown =
      (trigger.triggerType === 'sl') === (params.side === 'sell')

    // put.amount is base units for limit orders and market sells; market
    // buys spend quote — approximate via the trigger price, where the
    // order will execute.
    const amount =
      params.type === 'market' && params.side === 'buy'
        ? String(
            Number(
              (Number(params.size) * Number(trigger.triggerPrice)).toPrecision(
                12,
              ),
            ),
          )
        : params.size

    const put: Record<string, unknown> = {
      type: params.type,
      side: params.side,
      amount,
      account: 'normal',
      time_in_force: params.type === 'limit' ? 'gtc' : 'ioc',
    }
    if (params.type === 'limit') {
      put['price'] = params.price ?? trigger.triggerPrice
    }

    orderBody = {
      market: symbol,
      trigger: {
        price: trigger.triggerPrice,
        rule: crossesDown ? '<=' : '>=',
        expiration: 30 * 86400, // auto-cancel after 30 days (API max)
      },
      put,
    }
  } else {
    urlPath = '/api/v4/spot/orders'
    fetchPath = '/spot/orders'
    orderBody = {
      currency_pair: symbol,
      side: params.side,
      type: params.type,
      account: 'spot',
    }

    if (params.type === 'limit') {
      orderBody['price'] = params.price ?? '0'
      orderBody['amount'] = params.size
      orderBody['time_in_force'] = 'gtc'
    } else {
      // Market order — Gate takes quote amount for buys, base for sells,
      // both in `amount`
      orderBody['amount'] = params.size
    }
  }

  const body = JSON.stringify(orderBody)
  const headers = await buildSignedHeaders(
    credentials,
    'POST',
    urlPath,
    '',
    body,
  )

  try {
    const resp = await fetch(`${restBase}${fetchPath}`, {
      method: 'POST',
      headers,
      body,
    })

    const json = (await resp.json()) as Record<string, unknown>

    // Error responses have `label` field
    if (json['label']) {
      const errorMsg = String(
        json['message'] ?? json['label'] ?? 'Unknown error',
      )
      console.warn(`[gate-order] rejected: ${errorMsg} (paper=${paper})`)
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId: String(json['id'] ?? '') }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ────────────────────────────────────────────────────

/** Cancel a Gate.io order. DELETE /spot/orders/{orderId}?currency_pair={pair} */
export async function cancelGateOrder(
  orderId: string,
  pair: string,
  credentials: GateCredentials,
  _country: string,
  mode: 'paper' | 'live',
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  const paper = mode === 'paper'
  const restBase = resolveGateRestBase(paper)
  const symbol = normalizePair(pair)
  // Price-triggered orders have their own id space and cancel endpoint
  // (no currency_pair scoping).
  const urlPath = opts?.trigger
    ? `/api/v4/spot/price_orders/${orderId}`
    : `/api/v4/spot/orders/${orderId}`
  const queryString = opts?.trigger ? '' : `currency_pair=${symbol}`

  const headers = await buildSignedHeaders(
    credentials,
    'DELETE',
    urlPath,
    queryString,
    '',
  )

  try {
    const resp = await fetch(
      `${restBase}${urlPath.replace('/api/v4', '')}${
        queryString ? `?${queryString}` : ''
      }`,
      {
        method: 'DELETE',
        headers,
      },
    )

    const json = (await resp.json()) as Record<string, unknown>
    if (json['label']) {
      return {
        success: false,
        error: String(json['message'] ?? json['label']),
      }
    }
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Normalize order records ─────────────────────────────────────────

function mapGateOrderStatus(
  status: string,
  finishAs: string,
): NormalizedOrderUpdate['status'] {
  // Gate.io statuses: open, closed, cancelled
  // closed + finish_as=filled → filled
  // closed + finish_as=cancelled → cancelled
  // closed + finish_as=reduce_only → cancelled
  // open → live

  if (status === 'cancelled') return 'cancelled'

  if (status === 'closed') {
    if (finishAs === 'filled') return 'filled'
    if (finishAs === 'cancelled' || finishAs === 'reduce_only')
      return 'cancelled'
    return 'filled'
  }

  return 'live'
}

type GateOrderRecord = Record<string, string>

function normalizeGateOrder(d: GateOrderRecord): NormalizedOrderUpdate {
  const filledAmount = d['filled_amount'] ?? d['filled_total'] ?? '0'
  const avgDealPrice = d['avg_deal_price'] ?? ''
  const left = d['left'] ?? '0'
  const amount = d['amount'] ?? '0'

  // Determine partial fill status
  let status = mapGateOrderStatus(d['status'] ?? 'open', d['finish_as'] ?? '')
  if (status === 'live' && Number(filledAmount) > 0 && Number(left) > 0) {
    status = 'partially_filled'
  }

  return {
    orderId: d['id'] ?? '',
    pair: denormalizePair(d['currency_pair'] ?? ''),
    side: (d['side'] ?? 'buy') as 'buy' | 'sell',
    type: (d['type'] ?? 'market') as 'market' | 'limit',
    size: amount,
    price: d['price'] ?? '',
    fillSize: filledAmount,
    avgPrice: avgDealPrice,
    status,
    fee: d['fee'] ?? '',
    feeCcy: d['fee_currency'] ?? '',
    ts: Number(d['update_time_ms'] ?? d['create_time_ms'] ?? Date.now()),
    createdAt: Number(d['create_time_ms'] ?? Date.now()),
  }
}

// ── Fetch balances ──────────────────────────────────────────────────

/** Fetch spot account balances. GET /spot/accounts */
export async function fetchGateBalances(
  credentials: GateCredentials,
  _country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  const restBase = resolveGateRestBase(paper)
  const urlPath = '/api/v4/spot/accounts'

  const headers = await buildSignedHeaders(credentials, 'GET', urlPath, '', '')

  try {
    const resp = await fetch(`${restBase}/spot/accounts`, { headers })
    const json = (await resp.json()) as unknown

    // Error check
    if (json && typeof json === 'object' && 'label' in json) return []

    const accounts = json as Array<Record<string, string>>
    return accounts
      .filter(
        (d) => Number(d['available'] ?? 0) > 0 || Number(d['locked'] ?? 0) > 0,
      )
      .map((d) => ({
        currency: d['currency'] ?? '',
        available: d['available'] ?? '0',
        frozen: d['locked'] ?? '0',
        total: String(Number(d['available'] ?? 0) + Number(d['locked'] ?? 0)),
      }))
  } catch {
    return []
  }
}

// ── Fetch orders ────────────────────────────────────────────────────

/** Fetch open orders. GET /spot/orders?status=open&currency_pair={pair} */
/** Normalize a running price-triggered order (separate id space; cancel
 * goes through DELETE /spot/price_orders/{id}). */
function normalizeGatePriceOrder(
  d: Record<string, unknown>,
): NormalizedOrderUpdate {
  const trigger = (d['trigger'] ?? {}) as Record<string, string>
  const put = (d['put'] ?? {}) as Record<string, string>
  return {
    triggerOrder: true,
    ...(trigger['price'] ? { triggerPrice: trigger['price'] } : {}),
    orderId: String(d['id'] ?? ''),
    pair: denormalizePair(String(d['market'] ?? '')),
    side: (put['side'] ?? 'buy') as 'buy' | 'sell',
    type: (put['type'] ?? 'limit') as 'market' | 'limit',
    size: put['amount'] ?? '',
    price: put['type'] === 'limit' ? (put['price'] ?? '') : '',
    fillSize: '',
    avgPrice: '',
    status: 'live',
    fee: '',
    feeCcy: '',
    ts: Number(d['ctime'] ?? 0) * 1000 || Date.now(),
    createdAt: Number(d['ctime'] ?? 0) * 1000 || Date.now(),
  }
}

export async function fetchGateOpenOrders(
  credentials: GateCredentials,
  _country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveGateRestBase(paper)
  const symbol = pair ? normalizePair(pair) : 'BTC_USDT'

  const get = async (
    urlPath: string,
    queryString: string,
  ): Promise<unknown> => {
    const headers = await buildSignedHeaders(
      credentials,
      'GET',
      urlPath,
      queryString,
      '',
    )
    const resp = await fetch(
      `${restBase}${urlPath.replace('/api/v4', '')}?${queryString}`,
      { headers },
    )
    return resp.json()
  }

  try {
    // Price-triggered orders don't appear in /spot/orders — query their
    // dedicated endpoint alongside (all markets, running only).
    const [regularJson, triggerJson] = await Promise.all([
      get('/api/v4/spot/orders', `currency_pair=${symbol}&status=open`),
      get('/api/v4/spot/price_orders', 'status=open').catch(() => []),
    ])

    const regular =
      regularJson && typeof regularJson === 'object' && 'label' in regularJson
        ? []
        : (regularJson as Array<GateOrderRecord>).map(normalizeGateOrder)
    const triggers = Array.isArray(triggerJson)
      ? triggerJson.map((d) =>
          normalizeGatePriceOrder(d as Record<string, unknown>),
        )
      : []
    return [...regular, ...triggers]
  } catch {
    return []
  }
}

/** Fetch order history (finished). GET /spot/orders?status=finished&currency_pair={pair}&limit=50 */
export async function fetchGateOrderHistory(
  credentials: GateCredentials,
  _country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveGateRestBase(paper)
  const symbol = pair ? normalizePair(pair) : 'BTC_USDT'
  const urlPath = '/api/v4/spot/orders'
  const queryString = `currency_pair=${symbol}&status=finished&limit=50`
  const [path, qs] = splitPathQuery(`${urlPath}?${queryString}`)

  const headers = await buildSignedHeaders(credentials, 'GET', path, qs, '')

  try {
    const resp = await fetch(`${restBase}/spot/orders?${queryString}`, {
      headers,
    })
    const json = (await resp.json()) as unknown

    if (json && typeof json === 'object' && 'label' in json) return []

    const orders = json as Array<GateOrderRecord>
    return orders.map(normalizeGateOrder)
  } catch {
    return []
  }
}
