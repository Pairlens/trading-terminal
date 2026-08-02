// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget Order Executor — HMAC-SHA256 authenticated REST endpoints for trading.
 *
 * Auth headers: ACCESS-KEY, ACCESS-SIGN, ACCESS-TIMESTAMP, ACCESS-PASSPHRASE
 * Pre-sign: timestamp + METHOD + requestPath + queryString + body
 * Signature: base64(hmac-sha256(pre-sign, secretKey))
 *
 * Paper trading: add `paptrading: 1` header to all requests.
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { denormalizePair, normalizePair } from './parser'
import { buildBitgetHeaders, resolveBitgetRestBase } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type BitgetCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
}

// ── HMAC-SHA256 Base64 helper ──

async function hmacSha256Base64(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  let binary = ''
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Build Bitget signed headers. */
async function buildSignedHeaders(
  creds: BitgetCredentials,
  method: string,
  path: string,
  queryString: string,
  body: string,
  paper: boolean,
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString()
  const qs = queryString ? `?${queryString}` : ''
  const preSign = `${timestamp}${method.toUpperCase()}${path}${qs}${body}`
  const signature = await hmacSha256Base64(creds.apiSecret, preSign)

  return buildBitgetHeaders(paper, {
    'ACCESS-KEY': creds.apiKey,
    'ACCESS-SIGN': signature,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': creds.passphrase,
  })
}

/** Authenticated fetch helper. */
async function bitgetFetch(
  path: string,
  method: string,
  creds: BitgetCredentials,
  paper: boolean,
  body?: string,
): Promise<Response> {
  const restBase = resolveBitgetRestBase()
  const fullPath = `/api/v2/spot${path}`
  const [basePath, qs] = fullPath.includes('?')
    ? [fullPath.split('?')[0], fullPath.split('?')[1]]
    : [fullPath, '']

  const headers = await buildSignedHeaders(
    creds,
    method,
    basePath,
    qs,
    body ?? '',
    paper,
  )

  return fetch(`${restBase}${path}`, {
    method,
    headers,
    body: method !== 'GET' ? body : undefined,
  })
}

// ── Place order ──

export async function placeBitgetOrder(
  params: OrderParams,
  credentials: BitgetCredentials,
  _country: string,
): Promise<OrderResult> {
  const paper = params.mode === 'paper'
  const symbol = normalizePair(params.pair)
  const trigger = params.trigger

  let path: string
  let orderBody: Record<string, string>

  if (trigger) {
    // Trigger (TP/SL) orders use Bitget's spot plan-order API. Direction
    // is inferred by the venue from triggerPrice vs the market price at
    // placement. planType 'amount' sizes in base units for both sides.
    // The plan endpoint takes no force/timeInForce field.
    path = '/trade/place-plan-order'
    orderBody = {
      symbol,
      side: params.side,
      orderType: params.type,
      size: params.size,
      planType: 'amount',
      triggerPrice: trigger.triggerPrice,
      triggerType: 'fill_price',
    }
    if (params.type === 'limit') {
      orderBody['executePrice'] = params.price ?? trigger.triggerPrice
    }
  } else {
    path = '/trade/place-order'
    orderBody = {
      symbol,
      side: params.side,
      orderType: params.type,
      size: params.size,
    }
    if (params.type === 'limit') {
      orderBody['price'] = params.price ?? '0'
      orderBody['force'] = 'gtc'
    }
  }

  const body = JSON.stringify(orderBody)

  try {
    const resp = await bitgetFetch(path, 'POST', credentials, paper, body)
    const json = (await resp.json()) as {
      code?: string
      msg?: string
      data?: { orderId?: string }
    }

    if (json.code !== '00000') {
      return { success: false, error: json.msg ?? 'Order failed' }
    }

    return { success: true, orderId: json.data?.orderId ?? '' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ──

export async function cancelBitgetOrder(
  orderId: string,
  pair: string,
  credentials: BitgetCredentials,
  _country: string,
  mode: 'paper' | 'live',
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  const paper = mode === 'paper'
  const symbol = normalizePair(pair)
  const body = JSON.stringify({ symbol, orderId })

  try {
    // Plan (trigger) orders have a dedicated cancel endpoint.
    const resp = await bitgetFetch(
      opts?.trigger ? '/trade/cancel-plan-order' : '/trade/cancel-order',
      'POST',
      credentials,
      paper,
      body,
    )
    const json = (await resp.json()) as {
      code?: string
      msg?: string
    }

    if (json.code !== '00000') {
      return { success: false, error: json.msg ?? 'Cancel failed' }
    }
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Fetch balances ──

export async function fetchBitgetBalances(
  credentials: BitgetCredentials,
  _country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  try {
    const resp = await bitgetFetch('/account/assets', 'GET', credentials, paper)
    const json = (await resp.json()) as {
      code?: string
      data?: Array<Record<string, string>>
    }
    if (json.code !== '00000' || !json.data) return []

    return json.data
      .filter(
        (d) =>
          Number(d['available'] ?? 0) > 0 ||
          Number(d['frozen'] ?? 0) > 0 ||
          Number(d['locked'] ?? 0) > 0,
      )
      .map((d) => {
        const avail = Number(d['available'] ?? 0)
        const frozen = Number(d['frozen'] ?? 0) + Number(d['locked'] ?? 0)
        return {
          currency: d['coin'] ?? '',
          available: String(avail),
          frozen: String(frozen),
          total: String(avail + frozen),
        }
      })
  } catch {
    return []
  }
}

// ── Fetch open orders ──

/** Normalize a pending plan (trigger) order — separate id space; cancel
 * goes through cancel-plan-order. */
function normalizeBitgetPlanOrder(
  d: Record<string, unknown>,
): NormalizedOrderUpdate {
  const orderType = String(d['orderType'] ?? 'market')
  return {
    triggerOrder: true,
    ...(d['triggerPrice'] ? { triggerPrice: String(d['triggerPrice']) } : {}),
    orderId: String(d['orderId'] ?? ''),
    pair: denormalizePair(String(d['symbol'] ?? '')),
    side: String(d['side'] ?? 'buy') as 'buy' | 'sell',
    type: orderType === 'limit' ? 'limit' : 'market',
    size: String(d['size'] ?? ''),
    price: orderType === 'limit' ? String(d['executePrice'] ?? '') : '',
    fillSize: '',
    avgPrice: '',
    status: 'live',
    fee: '',
    feeCcy: '',
    ts: Number(d['uTime'] ?? d['cTime'] ?? Date.now()),
    createdAt: Number(d['cTime'] ?? Date.now()),
  }
}

export async function fetchBitgetOpenOrders(
  credentials: BitgetCredentials,
  _country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  try {
    const qs = pair ? `?symbol=${normalizePair(pair)}` : ''
    // Plan (trigger) orders live behind a separate endpoint with a
    // nested orderList payload.
    const [regularResp, planResp] = await Promise.all([
      bitgetFetch(`/trade/unfilled-orders${qs}`, 'GET', credentials, paper),
      bitgetFetch(
        `/trade/current-plan-order${qs}`,
        'GET',
        credentials,
        paper,
      ).catch(() => null),
    ])

    const json = (await regularResp.json()) as {
      code?: string
      data?: Array<Record<string, unknown>>
    }
    const regular =
      json.code === '00000' && json.data
        ? json.data.map(normalizeBitgetOrder)
        : []

    let plans: Array<NormalizedOrderUpdate> = []
    if (planResp) {
      const planJson = (await planResp.json()) as {
        code?: string
        data?: { orderList?: Array<Record<string, unknown>> }
      }
      if (planJson.code === '00000' && planJson.data?.orderList) {
        plans = planJson.data.orderList.map(normalizeBitgetPlanOrder)
      }
    }

    return [...regular, ...plans]
  } catch {
    return []
  }
}

// ── Fetch order history ──

export async function fetchBitgetOrderHistory(
  credentials: BitgetCredentials,
  _country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  try {
    const symbol = pair ? normalizePair(pair) : 'BTCUSDT'
    const resp = await bitgetFetch(
      `/trade/history-orders?symbol=${symbol}&limit=50`,
      'GET',
      credentials,
      paper,
    )
    const json = (await resp.json()) as {
      code?: string
      data?: Array<Record<string, unknown>>
    }
    if (json.code !== '00000' || !json.data) return []

    return json.data.map(normalizeBitgetOrder)
  } catch {
    return []
  }
}

// ── Order normalization ──

function normalizeBitgetOrder(
  d: Record<string, unknown>,
): NormalizedOrderUpdate {
  return {
    orderId: String(d['orderId'] ?? ''),
    pair: denormalizePair(String(d['symbol'] ?? '')),
    side: String(d['side'] ?? 'buy') as 'buy' | 'sell',
    type: String(d['orderType'] ?? 'market') as 'market' | 'limit',
    size: String(d['size'] ?? '0'),
    price: String(d['price'] ?? '0'),
    fillSize: String(d['baseVolume'] ?? '0'),
    avgPrice: String(d['priceAvg'] ?? '0'),
    status: mapBitgetStatus(String(d['status'] ?? '')),
    fee: extractFee(d['feeDetail']),
    feeCcy: extractFeeCcy(d['feeDetail']),
    ts: Number(d['uTime'] ?? d['cTime'] ?? Date.now()),
    createdAt: Number(d['cTime'] ?? Date.now()),
  }
}

function mapBitgetStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'filled':
      return 'filled'
    case 'cancelled':
      return 'cancelled'
    case 'partially_filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}

function extractFee(feeDetail: unknown): string {
  if (!feeDetail || typeof feeDetail !== 'object') return '0'
  const obj = feeDetail as Record<string, Record<string, string>>
  for (const val of Object.values(obj)) {
    if (val['totalFee']) return val['totalFee']
  }
  return '0'
}

function extractFeeCcy(feeDetail: unknown): string {
  if (!feeDetail || typeof feeDetail !== 'object') return ''
  const obj = feeDetail as Record<string, Record<string, string>>
  for (const key of Object.keys(obj)) {
    return key
  }
  return ''
}
