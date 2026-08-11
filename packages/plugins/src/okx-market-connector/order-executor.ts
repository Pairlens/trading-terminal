// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { hmacSign } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { normalizePair } from './parser'
import { resolveOkxTradingCountry, resolveOkxUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

/**
 * Resolve the REST base URL for credentialed OKX calls. The credential's
 * account entity (see `OkxEntity` in ./regions) overrides country routing —
 * the key only exists on the entity the account was registered with.
 */
function resolveRestBase(country: string, credentials: OkxCredentials): string {
  return resolveOkxUrls(resolveOkxTradingCountry(credentials.entity, country))
    .restBase
}

type OkxCredentials = {
  apiKey: string
  apiSecret: string
  passphrase: string
  /** Account's home entity override ('global' | 'eea' | 'us'); '' = by country. */
  entity?: string
}

/** OKX error code for "API key doesn't exist". */
const OKX_KEY_NOT_FOUND = '50119'

/**
 * 50119 against the wrong regional entity reads like a typo'd key, and OKX
 * keys exist on exactly one entity (www / eea / us — the one the account was
 * registered with). Say what actually happened and how to fix it, naming the
 * host so the mismatch is visible.
 */
function describeOkxError(
  code: string | undefined,
  message: string,
  restBase: string,
): string {
  if (code !== OKX_KEY_NOT_FOUND) return message
  const host = restBase.replace(/^https?:\/\//, '').replace(/^\/__okx-/, 'okx ')
  return (
    `OKX rejected this API key on ${host} (50119: API key doesn't exist). ` +
    `OKX keys only work on the regional entity where the account was created — ` +
    `if this account was registered on a different OKX entity (Global, EEA or US), ` +
    `reconnect it and pick that entity under "OKX account entity".`
  )
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
  const restBase = resolveRestBase(country, credentials)
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
      const errorMsg = describeOkxError(
        data?.sCode !== '0' ? (data?.sCode ?? json.code) : json.code,
        data?.sMsg || json.msg || `OKX error ${json.code}`,
        restBase,
      )
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
  const restBase = resolveRestBase(country, credentials)
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
        error: describeOkxError(
          item?.sCode && item.sCode !== '0' ? item.sCode : json.code,
          item?.sMsg || `${json.code}: ${json.msg}`,
          restBase,
        ),
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
  const restBase = resolveRestBase(country, credentials)
  const path = '/api/v5/account/balance'
  const headers = await buildSignedHeaders(credentials, 'GET', path, '', paper)

  try {
    const resp = await fetch(`${restBase}${path}`, { headers })
    const json = (await resp.json()) as {
      code: string
      msg?: string
      data: Array<{ details: Array<Record<string, string>> }>
    }
    if (json.code !== '0') {
      // Read paths swallow errors by contract (an empty account and a failed
      // fetch both render as "no balances") — an entity mismatch would be
      // invisible, so at least say so where it can be diagnosed.
      if (json.code === OKX_KEY_NOT_FOUND) {
        console.warn(
          `[okx-balances] ${describeOkxError(json.code, json.msg ?? '', restBase)}`,
        )
      }
      return []
    }
    const details = json.data?.[0]?.details ?? []
    return details
      .filter((d) => Number(d['eq'] ?? 0) > 0)
      .map((d) => ({
        currency: d['ccy'] ?? '',
        // Cash (spot) accounts leave availEq empty — availBal carries the
        // spendable balance there. availEq only populates on margin/unified.
        available: d['availBal'] || d['availEq'] || '0',
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
  const restBase = resolveRestBase(country, credentials)

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
  const restBase = resolveRestBase(country, credentials)
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
