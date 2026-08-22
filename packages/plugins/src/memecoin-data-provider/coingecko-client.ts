// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Legendary column: memecoins that outlived their cycle.
 *
 * This one column does not come from Jupiter, and the reason is that it is not
 * a Solana question. DOGE, SHIB and PEPE are the names a trader means by a
 * legendary memecoin, and two of the three are not on Solana at all. CoinGecko
 * publishes a `meme-token` category ranked by market cap, keyless, with
 * `access-control-allow-origin: *`, which is exactly the cross-chain list the
 * column wants.
 *
 * ## Why market cap comes from here and not from a DEX
 *
 * Because DEX-reported market cap is wrong often enough to matter. Measured on
 * a live pair, DexScreener reported BONK's market cap as $1.16 TRILLION — an
 * implied-supply artefact of one pool. A column whose entire ranking is market
 * cap cannot be built on a figure that fails that way, and CoinGecko's is the
 * canonical one.
 *
 * ## The trap this module is shaped around
 *
 * CoinGecko's free tier throttles hard (observed: 429 after four rapid calls,
 * `retry-after: 45`) and — unlike GeckoTerminal — its 429 carries NO
 * `access-control-allow-origin`. In a browser that surfaces as an opaque
 * `TypeError`, not a readable 429, so a naive caller sees "network broken"
 * where the truth is "slow down". Every failure here is therefore classified
 * through `providerThrottleFromNetworkError`, and the column is polled on the
 * order of minutes rather than seconds. Paired with the caller's snapshot
 * cache, a throttled read leaves the previous list on screen instead of
 * emptying the column, which is the outcome that matters: "no legendary
 * memecoins" is a sentence a user would believe.
 */
import { providerThrottleFromNetworkError } from '@pairlens/market-engine/errors'
import { noteProviderThrottled } from '@pairlens/market-engine/provider-throttle'
import {
  COINGECKO_PROVIDER,
  coingeckoFetch,
  coingeckoLimiter,
} from './rate-limiter'
import { resolveLegendaryLinks } from './legendary-links'
import type { LaunchpadToken } from '@pairlens/shared/instrument-types'

const ENDPOINT =
  'https://api.coingecko.com/api/v3/coins/markets' +
  '?vs_currency=usd&category=meme-token&order=market_cap_desc' +
  '&per_page=30&page=1&price_change_percentage=1h,24h'

export const COINGECKO_SOURCE = 'coingecko'

type RawCoin = {
  id?: string
  symbol?: string
  name?: string
  image?: string
  current_price?: number
  market_cap?: number
  fully_diluted_valuation?: number
  total_volume?: number
  price_change_percentage_1h_in_currency?: number
  price_change_percentage_24h_in_currency?: number
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * A CoinGecko row into a `LaunchpadToken`.
 *
 * `chain` starts as `'coingecko'` and `address` as the CoinGecko coin id,
 * because that is what this source actually identifies a row by: the category
 * is cross-chain and DOGE has no contract address at all. `resolveLinks` below
 * then rewrites both for every coin whose real contract we can find, which is
 * what makes a Legendary row openable. Rows it cannot resolve keep the
 * coingecko identity and stay informational, and the pane reads `chain` to
 * tell the two apart.
 *
 * `curveProgress` is null and stays null. These coins never had a curve, and a
 * full progress bar would claim they graduated from one.
 */
function parseCoin(raw: RawCoin): LaunchpadToken | null {
  const id = stringOrNull(raw.id)
  const symbol = stringOrNull(raw.symbol)
  if (!id || !symbol) return null
  const change24h = numberOrNull(raw.price_change_percentage_24h_in_currency)
  const change1h = numberOrNull(raw.price_change_percentage_1h_in_currency)
  const volume = numberOrNull(raw.total_volume) ?? 0

  return {
    chain: COINGECKO_SOURCE,
    address: id,
    symbol: symbol.toUpperCase(),
    name: stringOrNull(raw.name) ?? symbol.toUpperCase(),
    iconUrl: stringOrNull(raw.image),
    decimals: null,
    priceUsd: numberOrNull(raw.current_price),
    marketCapUsd: numberOrNull(raw.market_cap),
    fdvUsd: numberOrNull(raw.fully_diluted_valuation),
    // Exchange-traded volume, not pool liquidity. Left null rather than filled
    // with the volume figure: the column shows volume in its own cell, and a
    // liquidity number that is really a volume number is the kind of quiet
    // mislabel that survives for years.
    liquidityUsd: null,
    holders: null,
    launchpad: null,
    createdAt: null,
    graduatedAt: null,
    curveProgress: null,
    organicScore: null,
    verified: true,
    audit: null,
    // No buy/sell split exists at this level, so the windows carry the move
    // and the total traded volume, with the per-side figures left at zero
    // rather than invented. `volumeUsd` is why that is honest rather than
    // lossy: the column that renders these rows reads the total, never a side.
    flow: {
      h1: {
        buys: 0,
        sells: 0,
        buyVolumeUsd: 0,
        sellVolumeUsd: 0,
        volumeUsd: 0,
        traders: null,
        priceChangePercent: change1h,
      },
      h24: {
        buys: 0,
        sells: 0,
        buyVolumeUsd: 0,
        sellVolumeUsd: 0,
        volumeUsd: volume,
        traders: null,
        priceChangePercent: change24h,
      },
    },
    socials: { twitter: null, telegram: null, website: null },
    stage: 'legendary',
    source: COINGECKO_SOURCE,
  }
}

/**
 * Rewrite the rows we can route onto their real chain and contract.
 *
 * Best-effort by design: the resolution spends a weekly 1 MB read and a daily
 * liquidity tiebreak, and a failure in either is not a reason to lose the
 * column. An unresolved row keeps its coingecko identity, renders exactly as
 * it does today, and simply does not link.
 */
async function resolveLinks(
  tokens: Array<LaunchpadToken>,
): Promise<Array<LaunchpadToken>> {
  try {
    const links = await resolveLegendaryLinks(tokens.map((t) => t.address))
    if (links.size === 0) return tokens
    return tokens.map((token) => {
      const link = links.get(token.address)
      return link
        ? { ...token, chain: link.chain, address: link.address }
        : token
    })
  } catch {
    return tokens
  }
}

export async function fetchLegendary(): Promise<Array<LaunchpadToken>> {
  let res: Response
  try {
    res = await coingeckoFetch(ENDPOINT)
  } catch (err) {
    // The opaque-429 path described in the header. A bare TypeError from this
    // host is far more likely to be a throttle with its CORS headers stripped
    // than a real outage, so it is raised as a retryable throttle and the
    // limiter is held back rather than left to hammer through the cool-off.
    const throttled = providerThrottleFromNetworkError(err, COINGECKO_PROVIDER)
    if (throttled) {
      coingeckoLimiter.cooldown(throttled.retryAfterMs)
      noteProviderThrottled(COINGECKO_PROVIDER, throttled.retryAfterMs)
      throw throttled
    }
    throw err
  }
  if (!res.ok) {
    throw new Error(`CoinGecko ${res.status} for the meme-token category`)
  }
  const body: unknown = await res.json()
  if (!Array.isArray(body)) return []
  const tokens = (body as Array<RawCoin>)
    .map(parseCoin)
    .filter((t): t is LaunchpadToken => t !== null)
  return resolveLinks(tokens)
}
