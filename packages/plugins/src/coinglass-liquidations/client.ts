// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Coinglass v4 REST client, and the two things about it that will bite
 * anyone who writes `if (res.ok)`.
 *
 * **The HTTP status lies.** Coinglass answers `HTTP 200` to a request with no
 * key and to a request with a bad key. The real status is a STRING in the body:
 * `{"code":"401","msg":"API key missing."}`. Measured live, three probes, all
 * 200. So every response goes through `parseEnvelope`, which branches on
 * `code !== '0'` and never on the transport status.
 *
 * **Which failure it is has to be inferred.** Coinglass does not distinguish
 * "your key is wrong" from "your plan does not include this endpoint" — both
 * come back as a non-zero code on the endpoint you called. The discriminator
 * is `/liquidation/exchange-list`, which EVERY plan can call: if that answers
 * and `/liquidation/order` does not, the key is fine and the plan is not. That
 * turns an opaque refusal into "your Coinglass plan does not include
 * liquidation orders; that endpoint starts at Standard", which is the
 * difference between a user fixing it in a minute and filing a bug.
 *
 * Rate limiting is per key and per plan (30/min on Hobbyist through 1200/min on
 * Professional), and the key's real ceiling comes back on every response as
 * `API-KEY-MAX-LIMIT`. The limiter starts pessimistic and widens once the
 * header has been seen, which is the only way to pace correctly without asking
 * the user which plan they bought.
 */
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import { restFetch } from '@pairlens/market-engine/http'
import type { RequestLimiter } from '@pairlens/market-engine/request-limiter'

export const COINGLASS_BASE_URL = 'https://open-api-v4.coinglass.com'

/** Documented header name. Casing is theirs, not ours. */
export const COINGLASS_KEY_HEADER = 'CG-API-KEY'

/**
 * Requests per minute before the key's own ceiling is known.
 *
 * Below the cheapest plan's 30/min, because the cost of guessing high is a 429
 * that takes the whole minute's budget down with it, and the cost of guessing
 * low is a slightly slower first window.
 */
export const DEFAULT_RATE_LIMIT_PER_MIN = 24

/** Fraction of the key's advertised ceiling this client will actually spend. */
const RATE_LIMIT_HEADROOM = 0.8

/** Cool-off applied when Coinglass answers `429`, absent any Retry-After. */
const RATE_LIMIT_COOLDOWN_MS = 30_000

export type CoinglassRefusalReason =
  /** No key configured. The plugin refuses to activate, so this is a backstop. */
  | 'key_missing'
  /** Key present and rejected: `{"code":"400","msg":"Invalid API key provided"}`. */
  | 'key_invalid'
  /** Key works, endpoint is above the plan. Liquidation orders start at Standard. */
  | 'plan_required'
  /** 429, or the key's per-minute ceiling. Same request succeeds later. */
  | 'rate_limited'
  /** Our request was wrong: unknown coin, unknown exchange, bad window. */
  | 'bad_request'
  /** Everything else, including transport failure. */
  | 'upstream'

/**
 * A refusal from Coinglass, carrying enough to act on.
 *
 * Thrown rather than returned. The liquidation hook's typed `unavailable`
 * union has no member for "your key lacks the plan", so a refusal object would
 * either be mislabelled as `not_tracked` (a claim about the VENUE, not the
 * key) or fall through the pane's branches into "nothing was liquidated" —
 * which is the one outcome a refusal must never look like.
 */
export class CoinglassApiError extends Error {
  /** Sentinel for the cross-bundle type guard (survives name mangling). */
  readonly __coinglassApiError = true
  readonly reason: CoinglassRefusalReason
  /** Coinglass's own `code` string, when there was a parseable envelope. */
  readonly code: string | null

  constructor(
    reason: CoinglassRefusalReason,
    message: string,
    code: string | null = null,
  ) {
    super(message)
    this.name = 'CoinglassApiError'
    this.reason = reason
    this.code = code
  }
}

/** True for a `CoinglassApiError`, robust across bundle copies. */
export function isCoinglassApiError(e: unknown): e is CoinglassApiError {
  return (
    e instanceof Error &&
    (e.name === 'CoinglassApiError' ||
      (e as Partial<CoinglassApiError>).__coinglassApiError === true)
  )
}

/** The envelope every v4 endpoint wraps its payload in. */
export type CoinglassEnvelope<T> = {
  code?: unknown
  msg?: unknown
  data?: T
}

/** One row of `/api/futures/liquidation/order`. */
export type CoinglassLiquidationOrder = {
  exchange_name: string
  /** Venue-native pair symbol, e.g. `BTCUSDT`. */
  symbol: string
  base_asset?: string
  price: number
  usd_value: number
  /** Order direction: 1 Buy, 2 Sell. See `mapCoinglassSide`. */
  side: number
  /** Liquidation time, epoch ms. */
  time: number
}

/** One row of `/api/futures/liquidation/exchange-list`. */
export type CoinglassExchangeRow = {
  exchange: string
  liquidation_usd?: number
}

/**
 * Envelope → payload, or a typed refusal.
 *
 * `code` is documented as a string but arrives as a number from at least one
 * endpoint, so it is compared as a string. An unparseable body is `upstream`
 * rather than `bad_request`: we cannot blame our own parameters for a response
 * we could not read.
 */
export function parseEnvelope<T>(
  body: unknown,
  context: { endpoint: string; keyWorks: boolean },
): T {
  if (typeof body !== 'object' || body === null) {
    throw new CoinglassApiError(
      'upstream',
      `Coinglass returned an unreadable response for ${context.endpoint}.`,
    )
  }
  const envelope = body as CoinglassEnvelope<T>
  const code = envelope.code == null ? '' : String(envelope.code)
  const msg = typeof envelope.msg === 'string' ? envelope.msg : ''

  if (code === '0') {
    if (envelope.data === undefined) {
      throw new CoinglassApiError(
        'upstream',
        `Coinglass reported success but sent no data for ${context.endpoint}.`,
        code,
      )
    }
    return envelope.data
  }

  throw refusalFor(code, msg, context)
}

function refusalFor(
  code: string,
  msg: string,
  context: { endpoint: string; keyWorks: boolean },
): CoinglassApiError {
  const detail = msg ? ` (${msg})` : ''

  if (code === '429') {
    return new CoinglassApiError(
      'rate_limited',
      `Coinglass rate limit reached${detail}. The next window retries automatically.`,
      code,
    )
  }
  if (/api key missing/i.test(msg)) {
    return new CoinglassApiError(
      'key_missing',
      'Coinglass received no API key. Add one in the plugin settings.',
      code,
    )
  }
  // A key that has already answered on an all-plans endpoint is a working key,
  // so a refusal here is about entitlement, not authentication.
  if (context.keyWorks) {
    return new CoinglassApiError(
      'plan_required',
      `Your Coinglass plan does not include ${context.endpoint}${detail}. Liquidation orders start at the Standard plan.`,
      code,
    )
  }
  if (code === '401' || /invalid api key|api key/i.test(msg)) {
    return new CoinglassApiError(
      'key_invalid',
      `Coinglass rejected the API key${detail}. Check it in the plugin settings.`,
      code,
    )
  }
  if (code === '400' || code === '422') {
    return new CoinglassApiError(
      'bad_request',
      `Coinglass rejected the request for ${context.endpoint}${detail}.`,
      code,
    )
  }
  return new CoinglassApiError(
    'upstream',
    `Coinglass failed on ${context.endpoint}${detail}.`,
    code,
  )
}

export type CoinglassClient = {
  /** Live exchange spellings, cached for the session. Every plan may call it. */
  exchangeNames: () => Promise<Array<string>>
  /** One page of liquidation prints. Never more than 200 rows come back. */
  liquidationOrders: (query: {
    exchange: string
    /** Coin, e.g. `BTC` — NOT a pair. Rows carry the pair. */
    symbol: string
    minLiquidationUsd: number
    startTime: number
    endTime: number
  }) => Promise<Array<CoinglassLiquidationOrder>>
  /** The key's advertised ceiling and current usage, once a call has run. */
  budget: () => { max: number | null; used: number | null }
}

/**
 * Structural `fetch`, not `typeof fetch`.
 *
 * Bun's global carries a `preconnect` member, so `typeof fetch` refuses every
 * hand-written stub a test could pass. Only the call signature is used here.
 */
export type CoinglassFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type CoinglassClientOptions = {
  apiKey: string
  /** Injected in tests. Defaults to the desktop-routed `restFetch`. */
  fetchImpl?: CoinglassFetch
  /** Injected in tests so pacing never sleeps a suite. */
  limiter?: RequestLimiter
}

/**
 * Rows the response cap allows. Coinglass documents "Max 200 records per
 * request" with no cursor, so a page at exactly this length is evidence the
 * window was truncated, not that it held exactly 200 prints.
 */
export const COINGLASS_PAGE_CAP = 200

export function createCoinglassClient(
  options: CoinglassClientOptions,
): CoinglassClient {
  const { apiKey } = options
  const doFetch = options.fetchImpl ?? restFetch

  let limiter: RequestLimiter =
    options.limiter ??
    createRequestLimiter({
      capacity: DEFAULT_RATE_LIMIT_PER_MIN,
      windowMs: 60_000,
    })
  const limiterInjected = options.limiter != null
  let capacity = DEFAULT_RATE_LIMIT_PER_MIN
  let maxLimit: number | null = null
  let usedLimit: number | null = null

  /**
   * Whether this key has been proven to work at all.
   *
   * Set by the first successful call to ANY endpoint. It is what separates
   * "bad key" from "insufficient plan" on the next failure, and it only ever
   * moves from false to true — a key that worked once is not un-proven by a
   * later refusal.
   */
  let keyWorks = false
  let exchangeNamesPromise: Promise<Array<string>> | null = null

  function noteBudget(headers: Headers): void {
    const rawMax = headers.get('API-KEY-MAX-LIMIT')
    const rawUsed = headers.get('API-KEY-USE-LIMIT')
    const parsedMax = rawMax == null ? NaN : Number(rawMax)
    const parsedUsed = rawUsed == null ? NaN : Number(rawUsed)
    if (Number.isFinite(parsedUsed)) usedLimit = parsedUsed
    if (!Number.isFinite(parsedMax) || parsedMax <= 0) return
    maxLimit = parsedMax
    // The window is sized from the key's own ceiling the first time it is
    // seen. Rebuilt rather than mutated because a sliding window's capacity is
    // fixed at construction; skipped when a test injected its own limiter, so
    // a virtual clock is never swapped out mid-suite.
    const next = Math.max(1, Math.floor(parsedMax * RATE_LIMIT_HEADROOM))
    if (!limiterInjected && next !== capacity) {
      capacity = next
      limiter = createRequestLimiter({ capacity, windowMs: 60_000 })
    }
  }

  async function call<T>(
    path: string,
    search: Record<string, string>,
  ): Promise<T> {
    if (apiKey.trim() === '') {
      throw new CoinglassApiError(
        'key_missing',
        'Coinglass needs an API key. Add one in the plugin settings.',
      )
    }
    await limiter.acquire()

    const url = new URL(path, COINGLASS_BASE_URL)
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await doFetch(url.toString(), {
        method: 'GET',
        headers: { [COINGLASS_KEY_HEADER]: apiKey, accept: 'application/json' },
      })
    } catch (error) {
      throw new CoinglassApiError(
        'upstream',
        `Coinglass could not be reached: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    noteBudget(response.headers)

    // A 429 at the transport layer is real even though the envelope usually
    // carries the code instead; hold every caller back before parsing.
    if (response.status === 429) {
      limiter.cooldown(RATE_LIMIT_COOLDOWN_MS)
      throw new CoinglassApiError(
        'rate_limited',
        'Coinglass rate limit reached. The next window retries automatically.',
        '429',
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new CoinglassApiError(
        'upstream',
        `Coinglass sent a non-JSON response for ${path} (HTTP ${response.status}).`,
      )
    }

    try {
      const data = parseEnvelope<T>(body, { endpoint: path, keyWorks })
      keyWorks = true
      return data
    } catch (error) {
      if (isCoinglassApiError(error) && error.reason === 'rate_limited') {
        limiter.cooldown(RATE_LIMIT_COOLDOWN_MS)
      }
      throw error
    }
  }

  return {
    exchangeNames() {
      // Cached per client instance: the list changes on the order of months
      // and every call spends the same paid budget the prints do.
      exchangeNamesPromise ??= call<Array<CoinglassExchangeRow>>(
        '/api/futures/liquidation/exchange-list',
        { range: '24h' },
      )
        .then((rows) =>
          rows
            .map((row) =>
              typeof row.exchange === 'string' ? row.exchange : '',
            )
            .filter((name) => name !== '' && name.toLowerCase() !== 'all'),
        )
        .catch((error: unknown) => {
          // A failed probe must not be cached as an answer, or a transient
          // outage would pin the plugin into "unknown exchange" for the
          // session.
          exchangeNamesPromise = null
          throw error
        })
      return exchangeNamesPromise
    },

    async liquidationOrders(query) {
      const rows = await call<Array<CoinglassLiquidationOrder>>(
        '/api/futures/liquidation/order',
        {
          exchange: query.exchange,
          symbol: query.symbol,
          min_liquidation_amount: String(query.minLiquidationUsd),
          start_time: String(Math.floor(query.startTime)),
          end_time: String(Math.floor(query.endTime)),
        },
      )
      return Array.isArray(rows) ? rows : []
    },

    budget: () => ({ max: maxLimit, used: usedLimit }),
  }
}
