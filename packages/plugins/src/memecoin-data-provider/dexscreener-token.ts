// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One token, from DexScreener, for every chain Jupiter cannot answer for.
 *
 * The Legendary column is cross-chain by construction: it ranks COINS, and its
 * rows are resolved to whichever chain each one trades deepest on, which is
 * Ethereum for PEPE and Solana for BONK. Clicking one opens a memecoin board,
 * and every pane on that board asked `lite-api.jup.ag`, which is a SOLANA
 * token API. So the chart painted and the three panes beside it said the feed
 * had nothing — on the most-clicked rows of the whole board.
 *
 * `token-pairs/v1/{chainId}/{tokenAddress}` closes that: keyless, CORS-open,
 * every chain the terminal routes, and it carries the four windows of buy and
 * sell COUNTS the flow pane is built around. It is the same host the DEX
 * board's reserve supplement already reads, so it shares that provider's
 * process-wide limiter rather than opening a second door onto one budget.
 *
 * ## What it can and cannot say
 *
 * A DexScreener row describes a POOL, so this module answers about the pools a
 * token trades in rather than about the token's mint. Liquidity, volume and
 * the trade counts are summed across every pool on the chain, because a token
 * with three pools traded in all three; price, market cap and the percentage
 * move come from the DEEPEST pool alone, because those are quoted figures and
 * summing or averaging them would invent a number nobody measured.
 *
 * What it cannot say at all is holders, organic score, and the mint and freeze
 * authorities. Those stay null, which the Token Safety pane renders as UNKNOWN
 * rather than as safe — the distinction that pane exists for. On an EVM chain
 * there is no mint authority to revoke in the first place, so an unknown is
 * also the only true answer.
 */
import { dexscreenerFetch } from '../dexscreener-data-provider/rate-limiter'
import type {
  LaunchpadFlow,
  LaunchpadFlowWindow,
  LaunchpadSocials,
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

const BASE = 'https://api.dexscreener.com'

export const DEXSCREENER_SOURCE = 'dexscreener'

/** The windows DexScreener publishes, in this contract's own names. */
const WINDOWS: ReadonlyArray<[LaunchpadFlowWindow, string]> = [
  ['m5', 'm5'],
  ['h1', 'h1'],
  ['h6', 'h6'],
  ['h24', 'h24'],
]

type RawTxns = { buys?: number; sells?: number }

type RawPair = {
  chainId?: string
  dexId?: string
  pairAddress?: string
  baseToken?: { address?: string; name?: string; symbol?: string }
  quoteToken?: { address?: string; name?: string; symbol?: string }
  priceUsd?: string
  txns?: Record<string, RawTxns>
  volume?: Record<string, number>
  priceChange?: Record<string, number>
  liquidity?: { usd?: number }
  fdv?: number
  marketCap?: number
  pairCreatedAt?: number
  info?: {
    imageUrl?: string
    websites?: Array<{ url?: string; label?: string }>
    socials?: Array<{ url?: string; type?: string }>
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function liquidityOf(pair: RawPair): number {
  return numberOrNull(pair.liquidity?.usd) ?? 0
}

/**
 * The socials the row carries, in this contract's three slots.
 *
 * DexScreener publishes an open-ended list of typed links; anything outside
 * the three the panes render is dropped rather than crammed into `website`.
 */
function parseSocials(info: RawPair['info']): LaunchpadSocials {
  const socials = info?.socials ?? []
  const find = (type: string): string | null =>
    stringOrNull(socials.find((s) => s.type === type)?.url)
  return {
    twitter: find('twitter'),
    telegram: find('telegram'),
    website: stringOrNull(info?.websites?.[0]?.url),
  }
}

/**
 * Every pool on this chain whose BASE leg is the token asked about.
 *
 * The endpoint answers with pools the token appears in on either side, so a
 * memecoin quoted against a bigger memecoin brings that other token's pools
 * back too — and their market cap is not this token's. Matching on the base
 * address is what keeps a board about SHIB from quietly reporting WOOF.
 */
export function poolsForToken(
  rows: ReadonlyArray<RawPair>,
  chainId: string,
  address: string,
): Array<RawPair> {
  const wanted = address.toLowerCase()
  return rows
    .filter((row) => (row.chainId ?? chainId) === chainId)
    .filter((row) => (row.baseToken?.address ?? '').toLowerCase() === wanted)
}

/** Buys, sells and volume summed across pools; the move from the deepest one. */
function aggregateFlow(
  pools: ReadonlyArray<RawPair>,
  deepest: RawPair,
): Partial<Record<LaunchpadFlowWindow, LaunchpadFlow>> {
  const flow: Partial<Record<LaunchpadFlowWindow, LaunchpadFlow>> = {}
  for (const [window, key] of WINDOWS) {
    let buys = 0
    let sells = 0
    let volumeUsd = 0
    let seen = false
    for (const pool of pools) {
      const txns = pool.txns?.[key]
      const volume = numberOrNull(pool.volume?.[key])
      if (!txns && volume === null) continue
      seen = true
      buys += txns?.buys ?? 0
      sells += txns?.sells ?? 0
      volumeUsd += volume ?? 0
    }
    if (!seen) continue
    flow[window] = {
      buys,
      sells,
      // DexScreener counts trades per side but publishes ONE volume figure per
      // window, so the split stays at zero rather than being guessed from the
      // count ratio. `volumeUsd` is the field that carries a source with no
      // side split, which is exactly this case.
      buyVolumeUsd: 0,
      sellVolumeUsd: 0,
      volumeUsd,
      traders: null,
      priceChangePercent: numberOrNull(deepest.priceChange?.[key]),
    }
  }
  return flow
}

/** The earliest pool this token trades in, as an ISO stamp. */
function firstPoolIso(pools: ReadonlyArray<RawPair>): string | null {
  let earliest: number | null = null
  for (const pool of pools) {
    const at = numberOrNull(pool.pairCreatedAt)
    if (at === null || at <= 0) continue
    if (earliest === null || at < earliest) earliest = at
  }
  if (earliest === null) return null
  const date = new Date(earliest)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * The pools of one token into a `LaunchpadToken`, or null when none are its.
 *
 * `stage` is `graduated` for every row this parser produces, and that is the
 * honest reading rather than a default: a token with an AMM pool has left its
 * curve, whether it ever had one or was deployed straight onto Uniswap.
 */
export function parseDexscreenerToken(
  rows: ReadonlyArray<RawPair>,
  chainId: string,
  address: string,
  stage: LaunchpadStage = 'graduated',
): LaunchpadToken | null {
  const pools = poolsForToken(rows, chainId, address)
  if (pools.length === 0) return null

  const deepest = pools.reduce((best, pool) =>
    liquidityOf(pool) > liquidityOf(best) ? pool : best,
  )
  const base = deepest.baseToken ?? {}
  const symbol = stringOrNull(base.symbol) ?? address.slice(0, 6)
  const liquidityUsd = pools.reduce((sum, pool) => sum + liquidityOf(pool), 0)

  return {
    chain: chainId,
    // The address the caller asked about, in the casing the row carries: a
    // checksummed EVM address and its lowercase form are the same token, and
    // the row is the source that agrees with the explorers.
    address: stringOrNull(base.address) ?? address,
    symbol,
    name: stringOrNull(base.name) ?? symbol,
    iconUrl: stringOrNull(deepest.info?.imageUrl),
    // Not published by this endpoint. Null, never 18: a wrong decimals count
    // is a wrong order size, and nothing here needs it to render.
    decimals: null,
    priceUsd: numberOrNull(deepest.priceUsd),
    marketCapUsd: numberOrNull(deepest.marketCap),
    fdvUsd: numberOrNull(deepest.fdv),
    liquidityUsd: liquidityUsd > 0 ? liquidityUsd : null,
    holders: null,
    launchpad: null,
    // The first POOL, not the mint. DexScreener never saw the deployment, and
    // for a token that launched on a curve elsewhere the two differ by however
    // long the curve took.
    createdAt: firstPoolIso(pools),
    graduatedAt: null,
    curveProgress: null,
    organicScore: null,
    verified: false,
    audit: null,
    flow: aggregateFlow(pools, deepest),
    socials: parseSocials(deepest.info),
    stage,
    source: DEXSCREENER_SOURCE,
  }
}

/**
 * One token on one chain, or null when DexScreener indexes no pool for it.
 *
 * Null rather than a throw for an empty answer, because an empty answer here
 * IS one: a token with no indexed pool on the chain asked about is a token
 * this board cannot show figures for, and the pane says so in a sentence. A
 * throttle or a 5xx still throws, from the shared transport.
 */
export async function fetchDexscreenerToken(
  chainId: string,
  address: string,
  stage?: LaunchpadStage,
): Promise<LaunchpadToken | null> {
  const url = `${BASE}/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`
  const res = await dexscreenerFetch(url)
  // A 404 is "no such token on this chain", which is an answer, not a failure.
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`DexScreener token API ${res.status} for ${chainId}`)
  }
  const body: unknown = await res.json()
  const rows = Array.isArray(body)
    ? (body as Array<RawPair>)
    : ((body as { pairs?: Array<RawPair> } | null)?.pairs ?? [])
  return parseDexscreenerToken(rows, chainId, address, stage)
}
