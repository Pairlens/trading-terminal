// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How NFT numbers are written, in one place.
 *
 * A pure leaf module: no React, no i18n runtime. Every NFT pane spends the
 * same three formats, so a floor reads identically in the rankings table, the
 * ladder and the ticket. Two panes rounding the same 0.0451 ETH to "0.05" and
 * "0.045" is how a board loses the reader's trust in the arithmetic.
 *
 * Prices are native-currency by contract (see `nft-types.ts`), so the currency
 * ticker travels with every number rather than being assumed to be ETH. It is
 * assumed to be ETH exactly nowhere: Solana collections quote in SOL, and a
 * Polygon floor labelled "ETH" is wrong by two orders of magnitude.
 */

/**
 * A price in its settlement currency.
 *
 * Sub-unit prices are the common case on NFT markets, and cutting them to two
 * decimals collapses a whole tier of collections onto "0.01". So the precision
 * follows the magnitude: four decimals below 1, three below 10, two above.
 */
export function formatNftPrice(
  value: number | undefined | null,
  currency?: string,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs < 1 ? 4 : abs < 10 ? 3 : 2
  const body = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
  return currency ? `${body} ${currency}` : body
}

/** A USD figure, compacted, for volumes and market caps. */
export function formatNftUsd(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000) {
    return `$${value.toLocaleString(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    })}`
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

/** A count: supply, holders, listings. */
export function formatNftCount(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  })
}

/**
 * A signed percentage move from a fraction. Returns null rather than "0.0%"
 * for an absent input, because a collection whose floor did not move and one
 * whose move the provider did not publish are different facts.
 */
export function formatNftChange(
  fraction: number | undefined | null,
): string | null {
  if (fraction == null || !Number.isFinite(fraction)) return null
  const pct = fraction * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(pct >= 100 || pct <= -100 ? 0 : 1)}%`
}

/**
 * The share of supply currently listed. The single best read on whether a
 * floor is real: 2% listed is a floor with conviction behind it, 30% listed is
 * an exit queue.
 */
export function listedRatio(
  listedCount: number | undefined,
  totalSupply: number | undefined,
): number | null {
  if (!listedCount || !totalSupply) return null
  return listedCount / totalSupply
}

/** `#1234` for a token id, truncated when a chain uses long ids. */
export function formatTokenId(tokenId: string): string {
  if (tokenId.length <= 10) return `#${tokenId}`
  return `#${tokenId.slice(0, 4)}…${tokenId.slice(-4)}`
}

/** `0xdac1…1ec7` for an address, the same elision the DEX panes use. */
export function shortenAddress(address: string | undefined): string {
  if (!address) return '—'
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
