// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `datapi.jup.ag/v1/pools/gems` — the primary feed for three of the four
 * columns, and the reason this board needs no backend of ours.
 *
 * One POST returns three buckets that happen to be named the way the board is:
 * `recent`, `aboutToGraduate` and `graduated`. The field that makes it worth
 * preferring over the published token API is `bondingCurve`: the curve's
 * completion percentage, computed by the venue that runs the curve, rather
 * than reconstructed by us from a market cap and a threshold constant. On a
 * measured sample the two agree to a few percent, which is reassuring and
 * still not a reason to prefer the reconstruction.
 *
 * ## The catch, stated plainly
 *
 * This is jup.ag's own frontend backend. It is undocumented, carries no
 * stability guarantee, and could start refusing foreign origins tomorrow the
 * way pump.fun's does. So it is wired as a PREFERENCE, not a dependency: every
 * caller here falls back to `jupiter-client.ts` on any failure, and the board
 * degrades to reconstructed curve progress instead of going dark. The `source`
 * on every row records which path answered, so a support question about a
 * wrong-looking percentage has an answer.
 *
 * CORS is confirmed: it reflects the caller's `Origin` and answers 200 to the
 * hosted terminal's. `*.jup.ag` is already in the desktop CSP baseline and the
 * Tauri HTTP scope, so this host needed no new grant.
 *
 * ## Two shapes that will bite
 *
 * - `limit` is capped at 30 per bucket and `offset` is ignored, so 30 rows per
 *   column is the ceiling from this source. Asking for 5 also returns 30.
 * - A `graduated` row routinely carries `bondingCurve: null`, `liquidity: null`
 *   and `mcap: null`. It has left the curve, so the curve fields are gone; the
 *   parser treats that as "completed", never as zero.
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

const ENDPOINT = 'https://datapi.jup.ag/v1/pools/gems'

export const GEMS_SOURCE = 'jupiter-gems'

/** The three buckets, in the vocabulary the endpoint uses. */
type GemsBucket = 'recent' | 'aboutToGraduate' | 'graduated'

/** Bucket → the stage a row from it lands in. */
const STAGE_OF: Readonly<Record<GemsBucket, LaunchpadStage>> = {
  recent: 'new',
  aboutToGraduate: 'graduating',
  graduated: 'graduated',
}

export type RawStats = {
  priceChange?: number
  buyVolume?: number
  sellVolume?: number
  numBuys?: number
  numSells?: number
  numTraders?: number
}

export type RawAsset = {
  id?: string
  name?: string
  symbol?: string
  icon?: string
  decimals?: number
  launchpad?: string
  mcap?: number
  fdv?: number
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

export type RawPool = {
  id?: string
  chain?: string
  dex?: string
  type?: string
  createdAt?: string
  liquidity?: number
  volume24h?: number
  /** Curve completion in PERCENT (96.06), or null once it has completed. */
  bondingCurve?: number | null
  baseAsset?: RawAsset
}

type RawResponse = Partial<Record<GemsBucket, { pools?: Array<RawPool> }>>

/** What one bucket read asks for. */
export type GemsQuery = {
  timeframe?: '5m' | '1h' | '6h' | '24h' | '7d'
  limit?: number
  minLiquidity?: number
  minHolderCount?: number
  minMcap?: number
  minVolume24h?: number
  minBondingCurve?: number
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
    // A percentage already, same as the published API. See the note in
    // `jupiter-client.ts`: scaling it here would be a hundredfold error.
    priceChangePercent: numberOrNull(raw.priceChange),
  }
}

function parseAudit(raw: RawAsset['audit']): LaunchpadAudit | null {
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
    // Published as a percentage (22.12); the contract wants a 0..1 ratio.
    topHoldersPercent:
      raw.topHoldersPercentage === undefined
        ? null
        : raw.topHoldersPercentage / 100,
    devMints: numberOrNull(raw.devMints),
    devMigrations: numberOrNull(raw.devMigrations),
  }
}

function parseSocials(raw: RawAsset): LaunchpadSocials {
  return {
    twitter: stringOrNull(raw.twitter),
    telegram: stringOrNull(raw.telegram),
    website: stringOrNull(raw.website),
  }
}

/**
 * Curve progress as a 0..1 ratio.
 *
 * Three cases, and the third is the one worth writing down: a graduated row
 * carries no `bondingCurve` at all, and reading that absence as 0 would put
 * every freshly migrated token at the bottom of a progress sort. A row that
 * has graduated is complete by definition.
 */
function progressOf(pool: RawPool, graduatedAt: string | null): number | null {
  if (graduatedAt) return 1
  const pct = numberOrNull(pool.bondingCurve)
  if (pct === null) return null
  return Math.max(0, Math.min(1, pct / 100))
}

/**
 * Exported as the test seam. The transport is a `restFetch` behind a limiter,
 * which is awkward to stand up in a unit test and is not what is worth
 * pinning: the parsing is.
 */
export function parsePool(
  pool: RawPool,
  stage: LaunchpadStage,
): LaunchpadToken | null {
  const asset = pool.baseAsset
  if (!asset) return null
  // The MINT, not the pool. `pool.id` is the pool address and using it as
  // identity would point the chart and every swap at the wrong account.
  const address = stringOrNull(asset.id)
  if (!address) return null

  const graduatedAt = stringOrNull(asset.graduatedAt)
  const flow: Partial<Record<LaunchpadFlowWindow, LaunchpadFlow>> = {}
  const m5 = parseFlow(asset.stats5m)
  const h1 = parseFlow(asset.stats1h)
  const h6 = parseFlow(asset.stats6h)
  const h24 = parseFlow(asset.stats24h)
  if (m5) flow.m5 = m5
  if (h1) flow.h1 = h1
  if (h6) flow.h6 = h6
  if (h24) flow.h24 = h24

  return {
    chain: stringOrNull(pool.chain) ?? 'solana',
    address,
    symbol: stringOrNull(asset.symbol) ?? address.slice(0, 4),
    name: stringOrNull(asset.name) ?? stringOrNull(asset.symbol) ?? address,
    iconUrl: stringOrNull(asset.icon),
    decimals: numberOrNull(asset.decimals),
    priceUsd: numberOrNull(asset.usdPrice),
    marketCapUsd: numberOrNull(asset.mcap),
    fdvUsd: numberOrNull(asset.fdv),
    // The pool's liquidity leads: the asset-level figure is across every pool
    // it trades in, and on the curve there is only one that matters.
    liquidityUsd: numberOrNull(pool.liquidity) ?? numberOrNull(asset.liquidity),
    holders: numberOrNull(asset.holderCount),
    launchpad: stringOrNull(asset.launchpad),
    createdAt:
      stringOrNull(asset.createdAt) ??
      stringOrNull(asset.firstPool?.createdAt) ??
      stringOrNull(pool.createdAt),
    graduatedAt,
    curveProgress: progressOf(pool, graduatedAt),
    organicScore: numberOrNull(asset.organicScore),
    verified: asset.isVerified === true,
    audit: parseAudit(asset.audit),
    flow,
    socials: parseSocials(asset),
    stage,
    source: GEMS_SOURCE,
  }
}

/**
 * Read one or more buckets in a single POST.
 *
 * Buckets are requested together because the endpoint takes them together:
 * three columns for one round trip is the whole efficiency argument for
 * polling this from every client rather than through a server.
 */
export async function fetchGems(
  buckets: Partial<Record<GemsBucket, GemsQuery>>,
): Promise<Partial<Record<GemsBucket, Array<LaunchpadToken>>>> {
  const body: Record<string, GemsQuery> = {}
  for (const [bucket, query] of Object.entries(buckets)) {
    // 30 is the server's own ceiling; asking for more is silently ignored, so
    // it is clamped here to keep the request honest about what it will get.
    body[bucket] = { timeframe: '24h', limit: 30, ...query }
  }

  const res = await jupiterFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Jupiter gems API ${res.status}`)
  }
  const raw = (await res.json()) as RawResponse

  const out: Partial<Record<GemsBucket, Array<LaunchpadToken>>> = {}
  for (const bucket of Object.keys(buckets) as Array<GemsBucket>) {
    const pools = raw[bucket]?.pools
    if (!Array.isArray(pools)) continue
    const stage = STAGE_OF[bucket]
    out[bucket] = pools
      .map((p) => parsePool(p, stage))
      .filter((t): t is LaunchpadToken => t !== null)
  }
  return out
}
