// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { hmacSign } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { normalizePair } from './parser'
import { resolveKucoinTradingBase } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type KucoinCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
}

/**
 * Build signed headers for KuCoin API requests.
 *
 * KuCoin auth uses HMAC-SHA256 base64 (same algo as OKX):
 * - Prehash: {timestamp}{METHOD}{endpoint}{body}
 * - Passphrase: double-encrypted with hmacSign(apiSecret, passphrase)
 * - Headers: KC-API-KEY, KC-API-SIGN, KC-API-TIMESTAMP, KC-API-PASSPHRASE, KC-API-KEY-VERSION
 */
async function buildSignedHeaders(
  creds: KucoinCredentials,
  method: string,
  path: string,
  body: string,
  paper: boolean,
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString()
  const prehash = `${timestamp}${method}${path}${body}`
  const signature = await hmacSign(creds.apiSecret, prehash)

  // Passphrase is double-encrypted: hmacSign(secret, passphrase)
  const encryptedPassphrase = await hmacSign(creds.apiSecret, creds.passphrase)

  const headers: Record<string, string> = {
    'KC-API-KEY': creds.apiKey,
    'KC-API-SIGN': signature,
    'KC-API-TIMESTAMP': timestamp,
    'KC-API-PASSPHRASE': encryptedPassphrase,
    'KC-API-KEY-VERSION': '2',
    'Content-Type': 'application/json',
  }

  // Paper mode header (KuCoin sandbox doesn't use a header — it uses a different base URL)
  // The paper flag is handled at the URL level via resolveKucoinRestBase
  void paper

  return headers
}

/** Resolve REST base for authenticated requests (respects paper mode). */
function resolveAuthRestBase(country: string, paper: boolean): string {
  return resolveKucoinTradingBase(country, paper)
}

// ── Place order ─────────────────────────────────────────────────────

/** Place an order on KuCoin via the high-frequency (HF) endpoint.
 * Trigger (TP/SL) orders route to the stop-order endpoint instead —
 * since the 2024 account unification both draw from the same spot
 * trading account. */
export async function placeKucoinOrder(
  params: OrderParams,
  credentials: KucoinCredentials,
  country: string,
): Promise<OrderResult> {
  const paper = params.mode === 'paper'
  const restBase = resolveAuthRestBase(country, paper)
  const trigger = params.trigger
  const path = trigger ? '/api/v1/stop-order' : '/api/v1/hf/orders'
  const symbol = normalizePair(params.pair)

  const orderBody: Record<string, string> = {
    clientOid:
      params.clientOrderId ??
      `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    type: params.type,
    side: params.side,
  }

  if (trigger) {
    // KuCoin stop orders take an explicit trigger direction:
    // 'loss' fires when price falls to ≤ stopPrice, 'entry' when it
    // rises to ≥ stopPrice. The direction follows from what the trigger
    // means for the order's side (sl+sell / tp+buy cross downwards).
    const crossesDown =
      (trigger.triggerType === 'sl') === (params.side === 'sell')
    orderBody['stopPrice'] = trigger.triggerPrice
    orderBody['stop'] = crossesDown ? 'loss' : 'entry'
    orderBody['tradeType'] = 'TRADE'
  }

  if (params.type === 'limit') {
    orderBody['price'] = params.price ?? trigger?.triggerPrice ?? '0'
    orderBody['size'] = params.size
  } else {
    // Market order
    if (params.side === 'buy' && params.tgtCcy === 'quote_ccy') {
      // Market buy with quote currency uses 'funds' param
      orderBody['funds'] = params.size
    } else {
      orderBody['size'] = params.size
    }
  }

  const body = JSON.stringify(orderBody)
  const headers = await buildSignedHeaders(
    credentials,
    'POST',
    path,
    body,
    paper,
  )

  try {
    const resp = await fetch(`${restBase}${path}`, {
      method: 'POST',
      headers,
      body,
    })

    const json = (await resp.json()) as {
      code: string
      msg: string
      data: { orderId?: string }
    }

    if (json.code !== '200000') {
      const errorMsg = json.msg || `KuCoin error ${json.code}`
      console.warn(
        `[kucoin-order] rejected: ${errorMsg} (${restBase}, paper=${paper})`,
      )
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId: json.data?.orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ────────────────────────────────────────────────────

/** Cancel a KuCoin order. Symbol is REQUIRED for cancel on KuCoin
 * (regular orders); stop orders cancel by id via their own endpoint. */
export async function cancelKucoinOrder(
  orderId: string,
  pair: string,
  credentials: KucoinCredentials,
  country: string,
  mode: 'paper' | 'live',
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  const paper = mode === 'paper'
  const restBase = resolveAuthRestBase(country, paper)
  const symbol = normalizePair(pair)
  const path = opts?.trigger
    ? `/api/v1/stop-order/${orderId}`
    : `/api/v1/hf/orders/${orderId}?symbol=${symbol}`

  const headers = await buildSignedHeaders(
    credentials,
    'DELETE',
    path,
    '',
    paper,
  )

  try {
    const resp = await fetch(`${restBase}${path}`, {
      method: 'DELETE',
      headers,
    })

    const json = (await resp.json()) as { code: string; msg: string }
    if (json.code !== '200000') {
      return { success: false, error: `${json.code}: ${json.msg}` }
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

function mapKucoinOrderStatus(
  status: string,
  type: string,
  remainSize: string,
): NormalizedOrderUpdate['status'] {
  // KuCoin HF order statuses: new, open, match, done
  // done + type=canceled → cancelled
  // done + type=filled → filled
  // match with remainSize=0 → filled
  // new/open → live

  if (status === 'done') {
    if (type === 'canceled') return 'cancelled'
    return 'filled'
  }

  if (status === 'match') {
    const remain = Number(remainSize || '0')
    if (remain === 0) return 'filled'
    return 'partially_filled'
  }

  return 'live'
}

type KucoinOrderRecord = Record<string, string>

function normalizeKucoinOrder(d: KucoinOrderRecord): NormalizedOrderUpdate {
  return {
    orderId: d['id'] ?? d['orderId'] ?? '',
    pair: d['symbol'] ?? '',
    side: (d['side'] ?? 'buy') as 'buy' | 'sell',
    type: (d['type'] ?? 'market') as 'market' | 'limit',
    size: d['size'] ?? d['originSize'] ?? '',
    price: d['price'] ?? '',
    fillSize: d['dealSize'] ?? d['filledSize'] ?? '',
    avgPrice:
      d['dealFunds'] && d['dealSize']
        ? String(
            Number(d['dealSize']) > 0
              ? Number(d['dealFunds']) / Number(d['dealSize'])
              : 0,
          )
        : (d['matchPrice'] ?? ''),
    status: mapKucoinOrderStatus(
      d['status'] ?? 'open',
      d['type'] ?? '',
      d['remainSize'] ?? d['size'] ?? '',
    ),
    fee: d['fee'] ?? '',
    feeCcy: d['feeCurrency'] ?? '',
    ts: Number(d['createdAt'] ?? Date.now()),
    createdAt: Number(d['createdAt'] ?? Date.now()),
  }
}

// ── Fetch balances ──────────────────────────────────────────────────

/** Fetch trade account balances. Only 'trade' type accounts can place orders. */
export async function fetchKucoinBalances(
  credentials: KucoinCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  const restBase = resolveAuthRestBase(country, paper)
  const path = '/api/v1/accounts?type=trade'
  const headers = await buildSignedHeaders(credentials, 'GET', path, '', paper)

  try {
    const resp = await fetch(`${restBase}${path}`, { headers })
    const json = (await resp.json()) as {
      code: string
      data: Array<Record<string, string>>
    }
    if (json.code !== '200000') return []
    return (json.data ?? [])
      .filter((d) => Number(d['balance'] ?? 0) > 0)
      .map((d) => ({
        currency: d['currency'] ?? '',
        available: d['available'] ?? '0',
        frozen: d['holds'] ?? '0',
        total: d['balance'] ?? '0',
      }))
  } catch {
    return []
  }
}

// ── Fetch orders ────────────────────────────────────────────────────

/** Fetch active (open) HF orders. */
/** Normalize a resting stop order (from /api/v1/stop-order — separate
 * id space; cancel goes through the stop-order endpoint). */
function normalizeKucoinStopOrder(d: KucoinOrderRecord): NormalizedOrderUpdate {
  return {
    triggerOrder: true,
    ...(d['stopPrice'] ? { triggerPrice: d['stopPrice'] } : {}),
    orderId: d['id'] ?? '',
    pair: d['symbol'] ?? '',
    side: (d['side'] ?? 'buy') as 'buy' | 'sell',
    type: (d['type'] ?? 'market') as 'market' | 'limit',
    size: d['size'] ?? '',
    price: d['price'] ?? '',
    fillSize: '',
    avgPrice: '',
    status: 'live',
    fee: '',
    feeCcy: '',
    ts: Number(d['createdAt'] ?? Date.now()),
    createdAt: Number(d['createdAt'] ?? Date.now()),
  }
}

export async function fetchKucoinOpenOrders(
  credentials: KucoinCredentials,
  country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveAuthRestBase(country, paper)
  const symbol = pair ? normalizePair(pair) : ''
  const path = symbol
    ? `/api/v1/hf/orders/active?symbol=${symbol}`
    : '/api/v1/hf/orders/active?symbol=BTC-USDT' // KuCoin requires symbol

  const get = async (p: string): Promise<unknown> => {
    const headers = await buildSignedHeaders(credentials, 'GET', p, '', paper)
    const resp = await fetch(`${restBase}${p}`, { headers })
    return resp.json()
  }

  try {
    // Un-triggered stop orders live behind a separate paginated endpoint.
    const stopPath = `/api/v1/stop-order?pageSize=100${symbol ? `&symbol=${symbol}` : ''}`
    const [regularJson, stopJson] = await Promise.all([
      get(path) as Promise<{ code: string; data: Array<KucoinOrderRecord> }>,
      (
        get(stopPath) as Promise<{
          code: string
          data: { items?: Array<KucoinOrderRecord> }
        }>
      ).catch(() => ({
        code: '',
        data: {} as { items?: Array<KucoinOrderRecord> },
      })),
    ])
    const regular =
      regularJson.code === '200000'
        ? (regularJson.data ?? []).map(normalizeKucoinOrder)
        : []
    const stops =
      stopJson.code === '200000'
        ? (stopJson.data.items ?? []).map(normalizeKucoinStopOrder)
        : []
    return [...regular, ...stops]
  } catch {
    return []
  }
}

/** Fetch HF order history (filled/cancelled). */
export async function fetchKucoinOrderHistory(
  credentials: KucoinCredentials,
  country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveAuthRestBase(country, paper)
  const symbol = pair ? normalizePair(pair) : ''
  const path = symbol
    ? `/api/v1/hf/orders/done?symbol=${symbol}&limit=50`
    : '/api/v1/hf/orders/done?symbol=BTC-USDT&limit=50' // KuCoin requires symbol
  const headers = await buildSignedHeaders(credentials, 'GET', path, '', paper)

  try {
    const resp = await fetch(`${restBase}${path}`, { headers })
    const json = (await resp.json()) as {
      code: string
      data: Array<KucoinOrderRecord>
    }
    if (json.code !== '200000') return []
    return (json.data ?? []).map(normalizeKucoinOrder)
  } catch {
    return []
  }
}
