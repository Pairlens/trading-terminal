// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Jupiter's PUBLISHED Token API v2 — the fallback path for all three
 * launchpad columns.
 *
 * The primary path is `gems-client.ts`, which reads jup.ag's own frontend
 * backend and gets bonding-curve progress computed server-side. That endpoint
 * is undocumented, so this module exists to make its disappearance a
 * degradation rather than an outage: `lite-api.jup.ag` is documented, keyless,
 * reflects the caller's `Origin`, and carries the same row shape minus the one
 * field that matters, `bondingCurve`. That field is reconstructed from market
 * cap against a SOL-denominated threshold in `graduation.ts`.
 *
 * The launchpads' own APIs were the obvious first choice and are not usable
 * from a browser: `frontend-api-v3.pump.fun` answers 403 to any origin but its
 * own, so a client-side board cannot read it at all. That is an origin
 * allowlist rather than a bot block, which means it would work behind the
 * desktop app's native HTTP and never in the hosted web terminal — a split
 * this board deliberately avoids.
 *
 * ## Where each column comes from here
 *
 * There is no published endpoint for "tokens about to graduate", so Graduating
 * is DERIVED: pool the ranked lists, keep the rows that carry a launchpad and
 * no `graduatedAt`, and rank them by reconstructed curve progress. That is why
 * this client pools several endpoints into one map rather than calling one per
 * column — the marginal cost is small against a per-IP budget, and the
 * alternative is a Graduating column with four rows in it.
 */
import { jupiterFetch } from './rate-limiter'
import type {
  LaunchpadAudit,
  LaunchpadFlow,
  LaunchpadFlowWindow,
  LaunchpadSocials,
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

const BASE = 'https://lite-api.jup.ag/tokens/v2'

/** Wrapped SOL, whose price converts every SOL-denominated threshold. */
export const SOL_MINT = 'So11111111111111111111111111111111111111112'

export const JUPITER_SOURCE = 'jupiter'

/** The chain every row from this source is on. */
const CHAIN = 'solana'

type RawStats = {
  buyVolume?: number
  sellVolume?: number
  numBuys?: number
  numSells?: number
  numTraders?: number
  priceChange?: number
}

type RawToken = {
  id?: string
  name?: string
  symbol?: string
  icon?: string
  decimals?: number
  launchpad?: string
  fdv?: number
  mcap?: number
  usdPrice?: number
  liquidity?: number
  holderCount?: number
  organicScore?: number
  isVerified?: boolean
  twitter?: string
  telegram?: string
  website?: string
  createdAt?: string
  graduatedAt?: string
  graduatedPool?: string
  firstPool?: { id?: string; createdAt?: string }
  audit?: {
    mintAuthorityDisabled?: boolean
    freezeAuthorityDisabled?: boolean
    topHoldersPercentage?: number
    devMints?: number
    devMigrations?: number
  }
  stats5m?: RawStats
  stats1h?: RawStats
  stats6h?: RawStats
  stats24h?: RawStats
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function parseFlow(raw: RawStats | undefined): LaunchpadFlow | undefined {
  if (!raw) return undefined
  return {
    buys: raw.numBuys ?? 0,
    sells: raw.numSells ?? 0,
    buyVolumeUsd: raw.buyVolume ?? 0,
    sellVolumeUsd: raw.sellVolume ?? 0,
    volumeUsd: (raw.buyVolume ?? 0) + (raw.sellVolume ?? 0),
    traders: numberOrNull(raw.numTraders),
    // Already a percentage on both Jupiter APIs (27.75 means +27.75%), which
    // is worth stating because the neighbouring `topHoldersPercentage` is the
    // same scale and the contract wants that one as a 0..1 ratio. Scaling this
    // one too would have put every move off by a factor of a hundred.
    priceChangePercent: numberOrNull(raw.priceChange),
  }
}

/**
 * The audit, or null when the source published none.
 *
 * Deliberately NOT defaulted to "safe". A missing `mintAuthorityDisabled` is
 * not a disabled mint authority, and the safety pane paints an unknown as an
 * unknown for exactly that reason.
 */
function parseAudit(raw: RawToken['audit']): LaunchpadAudit | null {
  if (!raw) return null
  return {
    mintAuthorityDisabled:
      typeof raw.mintAuthorityDisabled === 'boolean'
        ? raw.mintAuthorityDisabled
        : null,
    freezeAuthorityDisabled:
      typeof raw.freezeAuthorityDisabled === 'boolean'
        ? raw.freezeAuthorityDisabled
        : null,
    topHoldersPercent:
      raw.topHoldersPercentage === undefined
        ? null
        : raw.topHoldersPercentage / 100,
    devMints: numberOrNull(raw.devMints),
    devMigrations: numberOrNull(raw.devMigrations),
  }
}

function parseSocials(raw: RawToken): LaunchpadSocials {
  return {
    twitter: stringOrNull(raw.twitter),
    telegram: stringOrNull(raw.telegram),
    website: stringOrNull(raw.website),
  }
}

/**
 * One raw row into a `LaunchpadToken`, with `stage` left for the caller to
 * decide: the same token is a New row and a Graduating row depending on which
 * column asked, and the classifier needs a SOL price this parser does not have.
 */
export function parseJupiterToken(
  raw: RawToken,
  stage: LaunchpadStage,
  curveProgress: number | null,
): LaunchpadToken | null {
  const address = stringOrNull(raw.id)
  if (!address) return null
  const flow: Partial<Record<LaunchpadFlowWindow, LaunchpadFlow>> = {}
  const m5 = parseFlow(raw.stats5m)
  const h1 = parseFlow(raw.stats1h)
  const h6 = parseFlow(raw.stats6h)
  const h24 = parseFlow(raw.stats24h)
  if (m5) flow.m5 = m5
  if (h1) flow.h1 = h1
  if (h6) flow.h6 = h6
  if (h24) flow.h24 = h24

  return {
    chain: CHAIN,
    address,
    symbol: stringOrNull(raw.symbol) ?? address.slice(0, 4),
    name: stringOrNull(raw.name) ?? stringOrNull(raw.symbol) ?? address,
    iconUrl: stringOrNull(raw.icon),
    decimals: numberOrNull(raw.decimals),
    priceUsd: numberOrNull(raw.usdPrice),
    marketCapUsd: numberOrNull(raw.mcap),
    fdvUsd: numberOrNull(raw.fdv),
    liquidityUsd: numberOrNull(raw.liquidity),
    holders: numberOrNull(raw.holderCount),
    launchpad: stringOrNull(raw.launchpad),
    // `firstPool.createdAt` is the pool, `createdAt` is the mint. They agree
    // for a launchpad token and the mint is the one a trader means by "age",
    // so it leads and the pool is the fallback.
    createdAt:
      stringOrNull(raw.createdAt) ?? stringOrNull(raw.firstPool?.createdAt),
    graduatedAt: stringOrNull(raw.graduatedAt),
    curveProgress,
    organicScore: numberOrNull(raw.organicScore),
    verified: raw.isVerified === true,
    audit: parseAudit(raw.audit),
    flow,
    socials: parseSocials(raw),
    stage,
    source: JUPITER_SOURCE,
  }
}

async function readList(path: string): Promise<Array<RawToken>> {
  const res = await jupiterFetch(`${BASE}${path}`)
  if (!res.ok) {
    throw new Error(`Jupiter token API ${res.status} for ${path}`)
  }
  const body: unknown = await res.json()
  return Array.isArray(body) ? (body as Array<RawToken>) : []
}

/** The 30 most recently minted tokens. The New column's own feed. */
export function fetchRecent(): Promise<Array<RawToken>> {
  return readList('/recent')
}

/**
 * The ranked lists, pooled and de-duplicated by mint.
 *
 * Three rankings rather than one because they disagree, which is the point:
 * `toptraded` is absolute volume and is dominated by the majors, `toptrending`
 * leans recent, and `toporganicscore` is bot-filtered and is where a
 * pre-graduation token with real buyers actually surfaces. Pooling them is
 * what makes the Graduating column non-empty on a quiet hour.
 */
/**
 * A short-lived cache in front of the ranked pool, with in-flight collapse.
 *
 * Two columns fall back to the same read: Graduating wants pre-graduation rows
 * and Graduated wants post-graduation ones, and they come out of one pooled
 * map. Without this the degraded path costs six requests per column per cycle
 * against a budget of forty a minute, which is the difference between a
 * fallback that works and one that throttles itself the moment it engages.
 *
 * The TTL is deliberately shorter than the fastest column's refresh, so a
 * cache hit only ever collapses the two columns of ONE cycle rather than
 * serving a stale answer into the next.
 */
const RANKED_TTL_MS = 10_000
let rankedCache: { at: number; value: Map<string, RawToken> } | null = null
let rankedInFlight: Promise<Map<string, RawToken>> | null = null

/** Test seam: a shared module cache would otherwise leak between cases. */
export function clearRankedCache(): void {
  rankedCache = null
  rankedInFlight = null
}

export function fetchRanked(
  intervals: ReadonlyArray<string> = ['5m', '1h', '24h'],
): Promise<Map<string, RawToken>> {
  const now = Date.now()
  if (rankedCache && now - rankedCache.at < RANKED_TTL_MS) {
    return Promise.resolve(rankedCache.value)
  }
  if (rankedInFlight) return rankedInFlight
  rankedInFlight = readRanked(intervals)
    .then((value) => {
      rankedCache = { at: Date.now(), value }
      return value
    })
    .finally(() => {
      rankedInFlight = null
    })
  return rankedInFlight
}

async function readRanked(
  intervals: ReadonlyArray<string>,
): Promise<Map<string, RawToken>> {
  const paths = intervals.flatMap((i) => [
    `/toptrending/${i}?limit=100`,
    `/toporganicscore/${i}?limit=100`,
  ])
  const pooled = new Map<string, RawToken>()
  const results = await Promise.allSettled(paths.map((p) => readList(p)))
  let ok = 0
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    ok += 1
    for (const token of result.value) {
      const id = stringOrNull(token.id)
      // Last write wins, and every list carries the same fields, so which one
      // wins only decides freshness by a second or two.
      if (id) pooled.set(id, token)
    }
  }
  // Every read failing is a failure, not an empty market. Refusing here is
  // what stops "no tokens are graduating" from being latched as an answer.
  if (ok === 0 && paths.length > 0) {
    const first = results[0]
    throw first?.status === 'rejected'
      ? (first.reason as Error)
      : new Error('Jupiter token API returned nothing')
  }
  return pooled
}

/** Full rows for specific mints, for the token lookup a trade board needs. */
export async function fetchTokens(
  mints: ReadonlyArray<string>,
): Promise<Array<RawToken>> {
  if (mints.length === 0) return []
  // The search endpoint takes a comma-separated mint list and answers with the
  // same row shape as the ranked lists, which is what makes one parser enough.
  return readList(`/search?query=${mints.join(',')}`)
}

/**
 * SOL in dollars, for converting the SOL-denominated graduation thresholds.
 *
 * Read from the same API as everything else rather than a price oracle: it is
 * one more row from a host already open, and a threshold and a market cap that
 * disagree about the price of SOL would put the progress bar off by whatever
 * the two sources differ by.
 */
/**
 * Cached, because this is the most-repeated request in the provider and the
 * one with the least reason to be.
 *
 * It funds a THRESHOLD conversion: the graduation target is 413 SOL, and the
 * dollar figure it becomes moves by fractions of a percent over a minute. Every
 * column cycle and every token lookup was re-asking for it, which on a memecoin
 * board is a request every few seconds spent on a number that had not changed.
 *
 * A minute is well inside the precision the curve percentage needs (a 1% move
 * in SOL shifts reconstructed progress by well under a point) and it is the
 * difference between the fallback path fitting in the budget and tripping it.
 */
const SOL_PRICE_TTL_MS = 60_000
let solPriceCache: { at: number; value: number | null } | null = null
let solPriceInFlight: Promise<number | null> | null = null

/** Test seam, same reason as the ranked cache: the module outlives a case. */
export function clearSolPriceCache(): void {
  solPriceCache = null
  solPriceInFlight = null
}

export function fetchSolPriceUsd(): Promise<number | null> {
  const now = Date.now()
  if (solPriceCache && now - solPriceCache.at < SOL_PRICE_TTL_MS) {
    return Promise.resolve(solPriceCache.value)
  }
  if (solPriceInFlight) return solPriceInFlight
  solPriceInFlight = fetchTokens([SOL_MINT])
    .then((rows) => {
      const value = numberOrNull(rows[0]?.usdPrice)
      // A failed read is not cached: the next caller should retry rather than
      // inherit a null threshold for a minute.
      solPriceCache = { at: Date.now(), value }
      return value
    })
    .finally(() => {
      solPriceInFlight = null
    })
  return solPriceInFlight
}
