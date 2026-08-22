// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning a Legendary row into something you can actually open.
 *
 * The Legendary column ranks coins, not contracts: CoinGecko's `meme-token`
 * category answers with a coin id (`gigachad-2`) and a market cap, and neither
 * of those is something a chart or a swap ticket can use. This module closes
 * that gap without guessing.
 *
 * ## Why not match on the ticker
 *
 * Because tickers are the one thing memecoins reliably collide on. A symbol
 * search for GIGACHAD returns `gigachad-2` (the $1.9M-liquidity Solana token
 * people mean), `gigachad-eth` and `gigachadgpt`, and picking wrong points a
 * swap at a different asset with the same name. CoinGecko already knows which
 * contract belongs to which coin id, and the row already carries the coin id,
 * so the mapping is a LOOKUP rather than a heuristic.
 *
 * ## The trap: a coin lists many chains, and most of them are bridges
 *
 * `/coins/list?include_platform=true` gives every contract CoinGecko knows for
 * a coin. BONK lists eight, PEPE four. Only one of them is the real market and
 * the rest are bridged wrappers with a rounding error of liquidity. Measured:
 * BONK is $2.2M on Solana against $123k on BNB Chain; PEPE is $32.6M on
 * Ethereum against $355k on Arbitrum.
 *
 * No static chain-preference order can get this right, and it is worth being
 * precise about why, because "prefer Solana, then Ethereum" looks like it
 * would: BONK is Solana-native and SPX6900 is Ethereum-native, so any fixed
 * order sends one of them to a wrapper. The disambiguator has to be a
 * measurement, and the honest one is **liquidity**: whichever contract has the
 * deepest pools is the market people mean. DexScreener answers that for up to
 * 30 addresses across every chain in a single keyless request.
 *
 * ## Cost, and why it is paid rarely
 *
 * The platform map is ~1.1 MB gzipped, which is far too much to spend on a
 * five-minute poll. It is cached in memory for a week and the liquidity pick
 * for a day: which chain a large-cap memecoin trades deepest on is not a
 * figure that moves hourly.
 *
 * An in-memory cache alone is not enough, and the reason is worth stating
 * because the TTLs make it look like it would be: a module cache dies with the
 * page, so a plain reload would re-spend the whole 1.1 MB. What survives is
 * therefore the ANSWER rather than the map, in localStorage: a few dozen
 * resolved rows, about 2 KB, keyed by the coin ids it covers. A reload with
 * the same board costs nothing, and a coin that entered the ranking since is
 * what triggers a fresh resolution.
 *
 * The persistence is best-effort on purpose. This module also runs in the CLI
 * and under bun's test runner, where there is no `localStorage` at all, and a
 * storage failure must degrade to the in-memory path rather than take the
 * column down.
 */
import { restFetch } from '@pairlens/market-engine/http'
import { coingeckoFetch } from './rate-limiter'

/**
 * CoinGecko asset-platform id → the Pairlens market that trades it.
 *
 * Deliberately only the chains a connector actually serves. A coin whose sole
 * contract is on a chain we cannot route stays informational, which is the
 * honest outcome: an unroutable link is worse than no link.
 */
export const PLATFORM_TO_MARKET: Readonly<Record<string, string>> = {
  solana: 'jupiter',
  ethereum: 'ethereum',
  base: 'base',
  'arbitrum-one': 'arbitrum',
  'binance-smart-chain': 'bsc',
  'polygon-pos': 'polygon',
}

/** The chain slug a resolved row carries, keyed by the market that serves it. */
export const MARKET_TO_CHAIN: Readonly<Record<string, string>> = {
  jupiter: 'solana',
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  polygon: 'polygon',
}

/** Where a Legendary row can be opened. */
export type LegendaryLink = {
  /** Chain slug, for the row's own identity. */
  chain: string
  /** Pairlens market id, for the URL. */
  market: string
  address: string
}

const PLATFORM_MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000
const LINK_TTL_MS = 24 * 60 * 60 * 1000

/** DexScreener takes at most 30 comma-separated addresses per request. */
const DEXSCREENER_BATCH = 30

type PlatformMap = Map<string, Record<string, string>>

let platformCache: { at: number; value: PlatformMap } | null = null
let platformInFlight: Promise<PlatformMap> | null = null
let linkCache: { at: number; value: Map<string, LegendaryLink> } | null = null
/** Which coin ids the cached run covered, resolved or not. See below. */
let attemptedIds = new Set<string>()

/** Bump when the shape below changes; a stale entry is then simply ignored. */
const STORE_KEY = 'pairlens:memecoin-legendary-links.v1'

type StoredLinks = {
  at: number
  ids: Array<string>
  links: Array<[string, LegendaryLink]>
}

function loadPersisted(): void {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as StoredLinks
    if (!parsed?.at || Date.now() - parsed.at > LINK_TTL_MS) return
    if (!Array.isArray(parsed.links) || !Array.isArray(parsed.ids)) return
    linkCache = { at: parsed.at, value: new Map(parsed.links) }
    attemptedIds = new Set(parsed.ids)
  } catch {
    // No storage, quota, or a corrupt entry. The in-memory path still works.
  }
}

function persist(ids: ReadonlyArray<string>): void {
  if (!linkCache) return
  try {
    const payload: StoredLinks = {
      at: linkCache.at,
      ids: [...ids],
      links: [...linkCache.value],
    }
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(payload))
  } catch {
    // Same reasoning as above: persistence is an optimisation, not a contract.
  }
}

/** Test seam: these caches are module-scoped and would leak between cases. */
export function clearLegendaryCaches(): void {
  platformCache = null
  platformInFlight = null
  linkCache = null
  attemptedIds = new Set()
  try {
    globalThis.localStorage?.removeItem(STORE_KEY)
  } catch {
    // Nothing to clear.
  }
}

type RawListEntry = { id?: string; platforms?: Record<string, string | null> }

async function readPlatformMap(): Promise<PlatformMap> {
  const res = await coingeckoFetch(
    'https://api.coingecko.com/api/v3/coins/list?include_platform=true',
  )
  if (!res.ok) throw new Error(`CoinGecko coin list ${res.status}`)
  const body: unknown = await res.json()
  const map: PlatformMap = new Map()
  if (!Array.isArray(body)) return map
  for (const raw of body as Array<RawListEntry>) {
    const id = raw.id
    if (!id || !raw.platforms) continue
    const usable: Record<string, string> = {}
    for (const [platform, address] of Object.entries(raw.platforms)) {
      // Only chains we route, and only non-empty addresses: CoinGecko carries
      // `"": ""` for coins with a native chain and no contract (DOGE).
      if (address && PLATFORM_TO_MARKET[platform]) usable[platform] = address
    }
    if (Object.keys(usable).length > 0) map.set(id, usable)
  }
  return map
}

function platformMap(): Promise<PlatformMap> {
  const now = Date.now()
  if (platformCache && now - platformCache.at < PLATFORM_MAP_TTL_MS) {
    return Promise.resolve(platformCache.value)
  }
  if (platformInFlight) return platformInFlight
  platformInFlight = readPlatformMap()
    .then((value) => {
      platformCache = { at: Date.now(), value }
      return value
    })
    .finally(() => {
      platformInFlight = null
    })
  return platformInFlight
}

type RawPair = {
  chainId?: string
  baseToken?: { address?: string }
  liquidity?: { usd?: number }
}

/** One contract a coin might be traded at. */
export type LinkCandidate = {
  coinId: string
  market: string
  chain: string
  address: string
}

/** `chain:address`, lowercased. Never the address alone — see below. */
export function depthKey(chain: string, address: string): string {
  return `${chain}:${address.toLowerCase()}`
}

/**
 * Pooled liquidity per (chain, token address).
 *
 * Keyed on BOTH halves, which is not fussiness: the same EVM address is
 * routinely deployed on several chains, and DexScreener answers for all of
 * them at once. Querying PEPE's Ethereum contract returns $32.6M on Ethereum
 * AND $37k on PulseChain under the identical address. Summing those into one
 * number is the bridged-wrapper mistake this whole module exists to avoid,
 * one level down.
 *
 * DexScreener is called directly rather than through the DEX provider plugin
 * on purpose: this is a tiebreak, not a pool read, and routing it through
 * capability resolution would make the Legendary column depend on the DEX
 * family being installed. The two families have to be independently droppable.
 */
async function liquidityByChainAddress(
  candidates: ReadonlyArray<{ chain: string; address: string }>,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  // Batched per chain. A mixed batch is not merely untidy: a Solana mint sent
  // alongside EVM addresses comes back with no pairs at all, so the token that
  // needed the tiebreak most is the one that silently scores zero.
  const byChain = new Map<string, Array<string>>()
  for (const candidate of candidates) {
    const list = byChain.get(candidate.chain)
    if (list) list.push(candidate.address)
    else byChain.set(candidate.chain, [candidate.address])
  }

  for (const [chain, addresses] of byChain) {
    for (let i = 0; i < addresses.length; i += DEXSCREENER_BATCH) {
      const batch = addresses.slice(i, i + DEXSCREENER_BATCH)
      const res = await restFetch(
        `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`,
      )
      if (!res.ok) continue
      const body = (await res.json()) as { pairs?: Array<RawPair> | null }
      for (const pair of body.pairs ?? []) {
        // Only pairs actually ON the chain we asked about. This is where the
        // cross-chain address collision is dropped.
        if (pair.chainId !== chain) continue
        const address = pair.baseToken?.address
        const usd = pair.liquidity?.usd
        if (!address || typeof usd !== 'number') continue
        const key = depthKey(chain, address)
        totals.set(key, (totals.get(key) ?? 0) + usd)
      }
    }
  }
  return totals
}

/**
 * The deepest candidate per coin. Pure, so the rule is testable without a
 * network round trip.
 *
 * Two decisions live here. The winner is the contract with the most pooled
 * liquidity ON ITS OWN CHAIN, which is what stops a bridged wrapper taking a
 * link. And a coin whose every candidate measured zero is REFUSED rather than
 * resolved: with one candidate there was nothing to break, so believe it, but
 * with several, picking the first one CoinGecko happened to list is exactly
 * how a wrapper with no pools wins.
 */
export function pickDeepest(
  candidates: ReadonlyArray<LinkCandidate>,
  depths: ReadonlyMap<string, number>,
): Map<string, LegendaryLink> {
  const best = new Map<string, { link: LegendaryLink; depth: number }>()
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    counts.set(candidate.coinId, (counts.get(candidate.coinId) ?? 0) + 1)
    const depth = depths.get(depthKey(candidate.chain, candidate.address)) ?? 0
    const current = best.get(candidate.coinId)
    if (current && current.depth >= depth) continue
    best.set(candidate.coinId, {
      depth,
      link: {
        chain: candidate.chain,
        market: candidate.market,
        address: candidate.address,
      },
    })
  }

  const resolved = new Map<string, LegendaryLink>()
  for (const [coinId, entry] of best) {
    if (entry.depth <= 0 && (counts.get(coinId) ?? 0) > 1) continue
    resolved.set(coinId, entry.link)
  }
  return resolved
}

/**
 * Coin id → where to open it, for the ids currently on the board.
 *
 * Returns only what it could resolve. A coin with no contract on a chain we
 * route (DOGE has no contract at all; some list only a brokerage) is simply
 * absent, and the caller leaves that row informational.
 */
export async function resolveLegendaryLinks(
  coinIds: ReadonlyArray<string>,
): Promise<Map<string, LegendaryLink>> {
  // A reload starts with an empty module cache, so the persisted answer is
  // read back before deciding anything.
  if (!linkCache) loadPersisted()

  const now = Date.now()
  if (linkCache && now - linkCache.at < LINK_TTL_MS) {
    // A cached answer still has to cover the ids being asked about: the
    // category re-ranks, so a coin that entered the board today would
    // otherwise stay unlinked until the cache expired. `attempted` rather than
    // `resolved`, because a coin we tried and could not resolve (DOGE) must
    // count as covered or every call would re-run the whole resolution for it.
    if (coinIds.every((id) => attemptedIds.has(id))) return linkCache.value
  }

  const platforms = await platformMap()

  // Every candidate contract for every coin on the board, flattened once so
  // the liquidity read is a couple of requests rather than one per coin.
  const candidates: Array<LinkCandidate> = []
  for (const coinId of coinIds) {
    const byPlatform = platforms.get(coinId)
    if (!byPlatform) continue
    for (const [platform, address] of Object.entries(byPlatform)) {
      const market = PLATFORM_TO_MARKET[platform]
      const chain = market ? MARKET_TO_CHAIN[market] : undefined
      if (!market || !chain) continue
      candidates.push({ coinId, market, chain, address })
    }
  }
  if (candidates.length === 0) {
    const empty = new Map<string, LegendaryLink>()
    linkCache = { at: Date.now(), value: empty }
    attemptedIds = new Set(coinIds)
    persist(coinIds)
    return empty
  }

  let depths: Map<string, number>
  try {
    depths = await liquidityByChainAddress(candidates)
  } catch {
    // The tiebreak failed, not the mapping. A coin with exactly one candidate
    // needs no tiebreak, so those still resolve; the multi-chain ones are left
    // out rather than resolved by a coin flip.
    depths = new Map()
  }

  const resolved = pickDeepest(candidates, depths)

  linkCache = { at: Date.now(), value: resolved }
  attemptedIds = new Set(coinIds)
  persist(coinIds)
  return resolved
}
