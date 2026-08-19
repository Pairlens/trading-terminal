// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a DEX pair key reads in a ticker slot.
 *
 * A DEX pair key carries a contract address in its base leg — that is
 * deliberate, because a token's identity is `(chain, address)` and never its
 * ticker, and hundreds of tokens are called PEPE. But
 * `0xdac17f958d2ee523a2206206994597c13d831ec7-USDC` is not a ticker. It ran
 * the header title 480px wide, clipped the marquee chips to a run of hex, and
 * told the reader nothing: that address is USDT, and every surface that
 * displayed it had already been told so.
 *
 * Three tiers, in order:
 *
 *  1. The ticker the user saw, from the token directory. `USDT-USDC`, which is
 *     what a CEX pair looks like, because there is no reason for a DEX pair to
 *     read differently once we can name the token.
 *  2. `0xdac1…1ec7` when nothing is pinned — a cold link, a fresh profile.
 *     Both ends, because that is how addresses are compared by eye and a
 *     leading-only cut makes every token from one deployer identical.
 *  3. The leg verbatim when it is not an address at all, which is the CEX and
 *     equities case and must stay untouched.
 *
 * The chain is NOT folded into the ticker. It is a separate field on the
 * result, so a surface that already names the venue (the chart header, which
 * carries a `DEX · Ethereum` badge, and the search rows, which carry
 * `TokenIdentityBadge`) does not say it twice, while a surface that lists
 * several chains at once (watchlist, recents) can put `WETH-USDC · BASE`
 * beside `WETH-USDC · ARB` and have the two rows mean different things.
 */
import { isTokenAddress } from '@pairlens/shared/market-ref'

import type { PoolStats } from '@pairlens/shared/instrument-types'

import type { TokenDirectoryEntry } from '@/stores/token-directory-store'
import { dexChain } from '@/lib/dex/chain-catalog'
import { truncateAddress } from '@/lib/dex/pool-math'

/** `0x532f…-WETH` → `['0x532f…', 'WETH']`. The base leg is the address. */
export function splitDexPairKey(pairKey: string): [string, string] {
  const at = pairKey.lastIndexOf('-')
  return at === -1
    ? [pairKey, '']
    : [pairKey.slice(0, at), pairKey.slice(at + 1)]
}

export type TokenTicker = {
  /** What the base leg renders as: a ticker, or a shortened address. */
  label: string
  /** True while the label is still an address, so it can render as one. */
  isAddress: boolean
}

/**
 * The base leg of a pair key, made readable.
 *
 * `entry` is the directory pin for that address, or null when there is none.
 * A non-address leg returns unchanged — this is safe to call on every pair key
 * in the terminal, which is what keeps the one ticker renderer branch-free.
 */
export function tokenTicker(
  base: string,
  entry: TokenDirectoryEntry | null,
): TokenTicker {
  if (!isTokenAddress(base)) return { label: base, isAddress: false }
  if (entry?.symbol) return { label: entry.symbol, isAddress: false }
  return { label: truncateAddress(base, 6, 4), isAddress: true }
}

/**
 * The chain's short name for a ticker suffix: `ETH`, `BASE`, `SOL`.
 *
 * Falls back to the market id upper-cased, so a third-party DEX connector the
 * chain catalog has never heard of still labels its rows.
 */
export function chainAbbr(market: string | undefined): string | null {
  if (!market) return null
  return dexChain(market)?.abbr ?? market.toUpperCase()
}

/**
 * What a resolved pool teaches us about the pair key that asked for it.
 *
 * The last gap in DEX ticker display: a pair opened from a shared link or a
 * bookmark has no directory pin, so its header reads `0xdac1…1ec7-USDC` until
 * the user re-picks it out of search. The pool read every on-chain pane
 * already makes knows the answer — the provider resolved that exact address
 * and told us what it trades as.
 *
 * The orientation guard is the whole risk. Providers return the POOL's own
 * base and quote, which need not be the legs that were asked for; a flipped
 * pool hands back `baseSymbol` for the QUOTE token and would label the row
 * with the wrong ticker. Requiring the pool's quote to be the quote we asked
 * for pins the orientation, and anything else learns nothing rather than
 * guessing.
 */
export function learnedTokenPin(
  market: string | undefined,
  pairKey: string | undefined,
  stats: Pick<PoolStats, 'baseSymbol' | 'quoteSymbol'> | null,
): TokenDirectoryEntry | null {
  if (!market || !pairKey || !stats?.baseSymbol || !stats.quoteSymbol)
    return null
  const [address, quote] = splitDexPairKey(pairKey)
  if (!quote || !isTokenAddress(address)) return null
  // A provider that answers with an address for a symbol has told us nothing.
  if (isTokenAddress(stats.baseSymbol)) return null
  if (stats.quoteSymbol.toUpperCase() !== quote.toUpperCase()) return null
  return { chain: market, address, symbol: stats.baseSymbol }
}
