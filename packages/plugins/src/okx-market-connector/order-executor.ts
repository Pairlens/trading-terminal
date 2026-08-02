// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { hmacSign } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { normalizePair } from './parser'
import { resolveOkxUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

/** Resolve the REST base URL for OKX API calls. */
function resolveRestBase(country: string): string {
  return resolveOkxUrls(country).restBase
}

type OkxCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
}

/** Sign and execute an OKX REST order. */
export async function placeOkxOrder(
  params: OrderParams,
  credentials: OkxCredentials,
  country: string,
): Promise<OrderResult> {
  if (params.trigger) {
    return placeOkxAlgoOrder(params, credentials, country)
  }

  const path = '/api/v5/trade/order'
  const body = JSON.stringify({
    instId: normalizePair(params.pair),
    tdMode: 'cash',
    side: params.side,
    ordType: params.type,
    sz: params.size,
    ...(params.clientOrderId ? { clOrdId: params.clientOrderId } : {}),
    ...(params.tgtCcy ? { tgtCcy: params.tgtCcy } : {}),
    ...(params.price ? { px: params.price } : {}),
  })

  return postOkxOrder(path, body, credentials, country, params, 'ordId')
}

/**
 * Exchange-native TP/SL via OKX algo orders (ordType 'conditional').
 * The order rests on OKX and activates when the last price crosses the
 * trigger — execution is market (ordPx -1) or limit at params.price.
 */
async function placeOkxAlgoOrder(
  params: OrderParams,
  credentials: OkxCredentials,
  country: string,
): Promise<OrderResult> {
  const trigger = params.trigger!
  const path = '/api/v5/trade/order-algo'
  const execPx = params.type === 'limit' && params.price ? params.price : '-1'
  const triggerSide =
    trigger.triggerType === 'tp'
      ? {
          tpTriggerPx: trigger.triggerPrice,
          tpOrdPx: execPx,
          tpTriggerPxType: 'last',
        }
      : {
          slTriggerPx: trigger.triggerPrice,
          slOrdPx: execPx,
          slTriggerPxType: 'last',
        }

  const body = JSON.stringify({
    instId: normalizePair(params.pair),
    tdMode: 'cash',
    side: params.side,
    ordType: 'conditional',
    sz: params.size,
    ...triggerSide,
    ...(params.clientOrderId ? { algoClOrdId: params.clientOrderId } : {}),
  })

  return postOkxOrder(path, body, credentials, country, params, 'algoId')
}

/** POST a (signed) order body and normalize the OKX response envelope. */
async function postOkxOrder(
  path: string,
  body: string,
  credentials: OkxCredentials,
  country: string,
  params: OrderParams,
  idField: 'ordId' | 'algoId',
): Promise<OrderResult> {
  const restBase = resolveRestBase(country)
  const headers = await buildSignedHeaders(
    credentials,
    'POST',
    path,
    body,
    params.mode === 'paper',
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
      data: Array<{
        ordId?: string
        algoId?: string
        sCode?: string
        sMsg?: string
      }>
    }

    const data = json.data?.[0]
    if (json.code !== '0' || (data?.sCode && data.sCode !== '0')) {
      const errorMsg = data?.sMsg || json.msg || `OKX error ${json.code}`
      console.warn(
        `[okx-order] rejected: ${errorMsg} (${restBase}, paper=${params.mode === 'paper'})`,
      )
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId: data?.[idField] }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

/** Cancel an OKX order. Trigger (algo) orders live in a separate id
 * space and must go through cancel-algos. */
export async function cancelOkxOrder(
  orderId: string,
  pair: string,
  credentials: OkxCredentials,
  country: string,
  mode: 'paper' | 'live',
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  const restBase = resolveRestBase(country)
  const path = opts?.trigger
    ? '/api/v5/trade/cancel-algos'
    : '/api/v5/trade/cancel-order'
  const body = JSON.stringify(
    opts?.trigger
      ? [{ instId: normalizePair(pair), algoId: orderId }]
      : { instId: normalizePair(pair), ordId: orderId },
  )

  const headers = await buildSignedHeaders(
    credentials,
    'POST',
    path,
    body,
    mode === 'paper',
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
      data?: Array<{ sCode?: string; sMsg?: string }>
    }
    const item = json.data?.[0]
    if (json.code !== '0' || (item?.sCode && item.sCode !== '0')) {
      return {
        success: false,
        error: item?.sMsg || `${json.code}: ${json.msg}`,
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

async function buildSignedHeaders(
  creds: OkxCredentials,
  method: string,
  path: string,
  body: string,
  paper: boolean,
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/(\.\d{3})\d*Z/, '$1Z')
  const prehash = `${timestamp}${method}${path}${body}`
  const signature = await hmacSign(creds.apiSecret, prehash)

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': creds.apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': creds.passphrase,
    'Content-Type': 'application/json',
  }

  if (paper) {
    headers['x-simulated-trading'] = '1'
  }

  return headers
}

// ── Normalize OKX order record to NormalizedOrderUpdate ───────────────

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

type OkxOrderRecord = Record<string, string>

function normalizeOkxOrder(d: OkxOrderRecord): NormalizedOrderUpdate {
  return {
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
  }
}

// ── Fetch balances ────────────────────────────────────────────────────

/** Fetch account balances (unified account, spot/cash). */
export async function fetchOkxBalances(
  credentials: OkxCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  const restBase = resolveRestBase(country)
  const path = '/api/v5/account/balance'
  const headers = await buildSignedHeaders(credentials, 'GET', path, '', paper)

  try {
    const resp = await fetch(`${restBase}${path}`, { headers })
    const json = (await resp.json()) as {
      code: string
      data: Array<{ details: Array<Record<string, string>> }>
    }
    if (json.code !== '0') return []
    const details = json.data?.[0]?.details ?? []
    return details
      .filter((d) => Number(d['eq'] ?? 0) > 0)
      .map((d) => ({
        currency: d['ccy'] ?? '',
        available: d['availEq'] ?? '0',
        frozen: d['frozenBal'] ?? '0',
        total: d['eq'] ?? '0',
      }))
  } catch {
    return []
  }
}

// ── Fetch orders ──────────────────────────────────────────────────────

/** Normalize a pending conditional (TP/SL) algo order. algoId doubles
 * as the cancellable order id (via cancel-algos). */
function normalizeOkxAlgoOrder(d: OkxOrderRecord): NormalizedOrderUpdate {
  const triggerPrice = d['slTriggerPx'] || d['tpTriggerPx'] || ''
  const execPx = d['slOrdPx'] || d['tpOrdPx'] || ''
  const isMarketExec = execPx === '-1' || execPx === ''
  return {
    triggerOrder: true,
    ...(triggerPrice ? { triggerPrice } : {}),
    orderId: d['algoId'] ?? '',
    pair: d['instId'] ?? '',
    side: (d['side'] ?? 'buy') as 'buy' | 'sell',
    type: isMarketExec ? 'market' : 'limit',
    size: d['sz'] ?? '',
    price: isMarketExec ? '' : execPx,
    fillSize: '',
    avgPrice: '',
    status: 'live',
    fee: '',
    feeCcy: '',
    ts: Number(d['cTime'] ?? Date.now()),
    createdAt: Number(d['cTime'] ?? Date.now()),
  }
}

/** Fetch open (pending) orders, including resting conditional (TP/SL)
 * algo orders which OKX keeps behind a separate endpoint. */
export async function fetchOkxOpenOrders(
  credentials: OkxCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveRestBase(country)

  const fetchList = async (path: string): Promise<Array<OkxOrderRecord>> => {
    const headers = await buildSignedHeaders(
      credentials,
      'GET',
      path,
      '',
      paper,
    )
    const resp = await fetch(`${restBase}${path}`, { headers })
    const json = (await resp.json()) as {
      code: string
      data: Array<OkxOrderRecord>
    }
    return json.code === '0' ? (json.data ?? []) : []
  }

  try {
    const [regular, algos] = await Promise.all([
      fetchList('/api/v5/trade/orders-pending?instType=SPOT'),
      fetchList(
        '/api/v5/trade/orders-algo-pending?ordType=conditional&instType=SPOT',
      ).catch(() => []),
    ])
    return [
      ...regular.map(normalizeOkxOrder),
      ...algos.map(normalizeOkxAlgoOrder),
    ]
  } catch {
    return []
  }
}

/** Fetch recent order history (filled, cancelled — last 7 days). */
export async function fetchOkxOrderHistory(
  credentials: OkxCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveRestBase(country)
  const path = '/api/v5/trade/orders-history?instType=SPOT&limit=50'
  const headers = await buildSignedHeaders(credentials, 'GET', path, '', paper)

  try {
    const resp = await fetch(`${restBase}${path}`, { headers })
    const json = (await resp.json()) as {
      code: string
      data: Array<OkxOrderRecord>
    }
    if (json.code !== '0') return []
    return (json.data ?? []).map(normalizeOkxOrder)
  } catch {
    return []
  }
}
