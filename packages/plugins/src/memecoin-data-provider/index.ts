// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `memecoin-data-provider` — the four launchpad columns, from keyless public
 * sources, with no backend of ours in the path.
 *
 * The whole point of routing this through a capability rather than fetching it
 * from a pane is that the source becomes replaceable. `market-data:launchpad`
 * is an open contract: a SolanaTracker or Birdeye provider with a
 * bring-your-own key can declare the same capability at a lower priority
 * number, win resolution, and serve the identical rows without a single pane
 * changing. That is the upgrade path if the keyless feeds ever stop being
 * enough — and it is why the terminal never learns which host answered.
 *
 * ## Sources, and why each one
 *
 * - **New / Graduating / Graduated** — `datapi.jup.ag/v1/pools/gems` primary
 *   (`gems-client.ts`), because it publishes bonding-curve completion computed
 *   by the venue running the curve. Undocumented, so `lite-api.jup.ag`
 *   (`jupiter-client.ts`) is the fallback, with curve progress reconstructed
 *   from a SOL-denominated threshold in `graduation.ts`.
 * - **Legendary** — CoinGecko's `meme-token` category (`coingecko-client.ts`),
 *   because the column is cross-chain and its ranking is market cap, and
 *   DEX-derived market cap is unreliable enough to have reported BONK at over
 *   a trillion dollars.
 *
 * ## Why it throws instead of answering null
 *
 * Same reason the DEX providers do, and the DEX Discovery board is the scar:
 * a `null` from a fallback becomes THE ANSWER, and an empty Graduating column
 * reads as "nothing is graduating right now", which is a sentence a trader
 * will act on. A throw is a failure the plugin manager walks past, and if this
 * provider is the last candidate the message names the read that is missing.
 */
import { fetchLegendary } from './coingecko-client'
import { fetchGems } from './gems-client'
import {
  GRADUATED_MAX_AGE_MS,
  LEGENDARY_MCAP_FLOOR_USD,
  NEW_MAX_AGE_MS,
  ageMsOf,
  curveProgressOf,
  isGraduating,
} from './graduation'
import {
  clearRankedCache,
  fetchRanked,
  fetchRecent,
  fetchSolPriceUsd,
  fetchTokens,
  parseJupiterToken,
} from './jupiter-client'
import type {
  LaunchpadAction,
  LaunchpadListing,
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const memecoinDataProviderManifest: PluginManifest = {
  id: 'memecoin-data-provider',
  name: 'Memecoin Feed',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Launchpad tokens from keyless public sources: new mints and bonding-curve progress from Jupiter, large-cap memecoins from CoinGecko. No API key and no server of ours: every request is metered against the browser that made it.',
  homepage: 'https://jup.ag',
  icon: '/logo512.png',
  metadata: { family: 'memes', assetClass: 'memecoin' },
  // Priority 5 — the only launchpad provider that ships, and deliberately not
  // priority 0: a bring-your-own-key provider with a paid feed should be able
  // to outrank it by declaring a lower number, without this manifest changing.
  capabilities: [
    {
      id: 'market-data:launchpad',
      singleton: false,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {},
}

/** How many rows a column returns. The gems endpoint caps its buckets at 30. */
const COLUMN_LIMIT = 30

/**
 * A token with real buyers, for the New column.
 *
 * The raw feed is seconds old and full of mints with a single holder that will
 * never trade again. Two holders is a very low bar and it is meant to be: the
 * column's job is to be early, so the filter removes only what is provably
 * dead on arrival rather than deciding what is interesting.
 */
const NEW_MIN_HOLDERS = 2

/** Liquidity floor for the Graduating column, in dollars. */
const GRADUATING_MIN_LIQUIDITY = 3_000

/**
 * A graduated token has to still be worth something.
 *
 * The bucket includes migrations whose pool was drained within the minute, and
 * a live read caught one sitting at a market cap of exactly zero. That is a
 * real event and it is not a row: the column is what to look at next, and a
 * token with no market cap and no liquidity is neither.
 */
function hasSubstance(token: LaunchpadToken): boolean {
  return (token.marketCapUsd ?? 0) > 0 || (token.liquidityUsd ?? 0) > 0
}

function byMarketCapDesc(a: LaunchpadToken, b: LaunchpadToken): number {
  return (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0)
}

function byCurveProgressDesc(a: LaunchpadToken, b: LaunchpadToken): number {
  return (b.curveProgress ?? 0) - (a.curveProgress ?? 0)
}

function byNewestFirst(a: LaunchpadToken, b: LaunchpadToken): number {
  return Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')
}

function byGraduatedNewestFirst(a: LaunchpadToken, b: LaunchpadToken): number {
  return Date.parse(b.graduatedAt ?? '') - Date.parse(a.graduatedAt ?? '')
}

// ── The fallback path ────────────────────────────────────────────────
//
// Everything below reconstructs the three launchpad columns from the
// PUBLISHED token API, for the day the gems endpoint stops answering. It is
// deliberately a separate code path rather than a flag on the primary one:
// the two sources agree on the row shape and on nothing else, and folding
// them together is how a fallback quietly stops being tested.

export async function fallbackColumn(
  stage: Exclude<LaunchpadStage, 'legendary'>,
  now: number,
): Promise<Array<LaunchpadToken>> {
  // The SOL price funds every threshold, and losing it is not fatal: without
  // it curve progress is null, which the panes already render as unknown.
  const [solPriceUsd, raws] = await Promise.all([
    fetchSolPriceUsd().catch(() => null),
    stage === 'new'
      ? fetchRecent()
      : fetchRanked().then((m) => [...m.values()]),
  ])

  const rows: Array<LaunchpadToken> = []
  for (const raw of raws) {
    const graduatedAt =
      typeof raw.graduatedAt === 'string' ? raw.graduatedAt : null
    const progress = curveProgressOf({
      launchpad: typeof raw.launchpad === 'string' ? raw.launchpad : null,
      marketCapUsd: typeof raw.mcap === 'number' ? raw.mcap : null,
      solPriceUsd,
      graduatedAt,
    })
    const token = parseJupiterToken(raw, stage, progress)
    if (!token) continue

    if (stage === 'new') {
      const age = ageMsOf(token.createdAt, now)
      if (token.graduatedAt) continue
      if (age === null || age > NEW_MAX_AGE_MS) continue
      if ((token.holders ?? 0) < NEW_MIN_HOLDERS) continue
      rows.push(token)
      continue
    }

    if (stage === 'graduating') {
      if (token.graduatedAt) continue
      if (!isGraduating(token.curveProgress)) continue
      if ((token.liquidityUsd ?? 0) < GRADUATING_MIN_LIQUIDITY) continue
      rows.push(token)
      continue
    }

    // graduated
    const since = ageMsOf(token.graduatedAt, now)
    if (since === null || since > GRADUATED_MAX_AGE_MS) continue
    if (!hasSubstance(token)) continue
    rows.push(token)
  }

  const sorted =
    stage === 'new'
      ? rows.sort(byNewestFirst)
      : stage === 'graduating'
        ? rows.sort(byCurveProgressDesc)
        : rows.sort(byGraduatedNewestFirst)
  return sorted.slice(0, COLUMN_LIMIT)
}

// ── The primary path ─────────────────────────────────────────────────

async function primaryColumn(
  stage: Exclude<LaunchpadStage, 'legendary'>,
  now: number,
): Promise<Array<LaunchpadToken>> {
  if (stage === 'new') {
    const out = await fetchGems({
      recent: { timeframe: '1h', minHolderCount: NEW_MIN_HOLDERS },
    })
    const rows = out.recent ?? []
    return rows
      .filter((t) => !t.graduatedAt)
      .filter((t) => {
        const age = ageMsOf(t.createdAt, now)
        return age === null || age <= NEW_MAX_AGE_MS
      })
      .sort(byNewestFirst)
      .slice(0, COLUMN_LIMIT)
  }

  if (stage === 'graduating') {
    const out = await fetchGems({
      aboutToGraduate: {
        timeframe: '24h',
        minLiquidity: GRADUATING_MIN_LIQUIDITY,
      },
    })
    return (out.aboutToGraduate ?? [])
      .filter((t) => !t.graduatedAt)
      .sort(byCurveProgressDesc)
      .slice(0, COLUMN_LIMIT)
  }

  const out = await fetchGems({ graduated: { timeframe: '24h' } })
  return (out.graduated ?? [])
    .filter(hasSubstance)
    .filter((t) => {
      const since = ageMsOf(t.graduatedAt, now)
      return since === null || since <= GRADUATED_MAX_AGE_MS
    })
    .sort(byGraduatedNewestFirst)
    .slice(0, COLUMN_LIMIT)
}

/**
 * A launchpad column, primary source first.
 *
 * The fallback runs on ANY primary failure, throttles included: a cool-off on
 * `datapi.jup.ag` does not imply one on `lite-api.jup.ag`, they are separate
 * budgets. If both fail the primary error is what surfaces, because that is
 * the one a maintainer needs to see when the undocumented endpoint changes.
 */
async function launchpadColumn(
  stage: Exclude<LaunchpadStage, 'legendary'>,
  now: number,
): Promise<Array<LaunchpadToken>> {
  try {
    const rows = await primaryColumn(stage, now)
    // An empty primary answer is believed for New and Graduated (quiet hours
    // are real) but not for Graduating: that bucket is server-filtered and
    // never legitimately empty, so an empty one means the shape changed.
    if (rows.length > 0 || stage !== 'graduating') return rows
    throw new Error('Jupiter gems returned no graduating pools')
  } catch (primaryError) {
    try {
      return await fallbackColumn(stage, now)
    } catch {
      throw primaryError
    }
  }
}

function listing(
  stage: LaunchpadStage,
  tokens: Array<LaunchpadToken>,
): LaunchpadListing {
  return {
    stage,
    tokens,
    fetchedAt: new Date().toISOString(),
    source: tokens[0]?.source ?? 'none',
  }
}

export function createMemecoinDataProviderPlugin(
  manifest: PluginManifest,
): PluginInstance {
  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params
    if (capability !== 'market-data:launchpad') return null

    const action = String(p['action'] ?? 'new') as LaunchpadAction
    const now = Date.now()

    switch (action) {
      case 'new':
      case 'graduating':
      case 'graduated':
        return listing(action, await launchpadColumn(action, now))
      case 'token': {
        // One mint, for the trade board's own panes. Always the published API
        // rather than the gems endpoint: gems answers in POOLS and a token
        // that has left every ranked bucket is simply absent from it, while
        // `search` answers for any mint that exists.
        const mint = String(p['address'] ?? p['pair'] ?? '').trim()
        if (!mint) throw new Error('Memecoin Feed needs an address to look up')
        const solPriceUsd = await fetchSolPriceUsd().catch(() => null)
        const rows = await fetchTokens([mint])
        const raw = rows[0]
        if (!raw) return null
        const graduatedAt =
          typeof raw.graduatedAt === 'string' ? raw.graduatedAt : null
        return parseJupiterToken(
          raw,
          graduatedAt ? 'graduated' : 'new',
          curveProgressOf({
            launchpad: typeof raw.launchpad === 'string' ? raw.launchpad : null,
            marketCapUsd: typeof raw.mcap === 'number' ? raw.mcap : null,
            solPriceUsd,
            graduatedAt,
          }),
        )
      }
      case 'legendary': {
        const tokens = (await fetchLegendary())
          .filter((t) => (t.marketCapUsd ?? 0) >= LEGENDARY_MCAP_FLOOR_USD)
          .sort(byMarketCapDesc)
        return listing('legendary', tokens)
      }
      default:
        throw new Error(
          `Memecoin Feed does not publish '${action}'. It serves the four launchpad columns.`,
        )
    }
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
    // Nothing streams: the columns are polled by the caller's own query, and
    // this provider owns no socket and no poller of its own.
    subscribe: () => () => {},
    async destroy() {
      clearRankedCache()
    },
  }
}
