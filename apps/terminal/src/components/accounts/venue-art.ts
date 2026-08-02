// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Venue art — bridges the Accounts page to the storefront's brand pipeline.
// Market connector ids double as brand keys, so exchange/broker venues reuse
// the bundled high-res posters and brand tints from the Plugin Store instead
// of maintaining a second visual identity.
// ---------------------------------------------------------------------------

import { pluginBrand } from '../plugins/plugin-brand'
import { BUNDLED_POSTERS } from '../plugins/plugin-posters'
import type { PluginBrand } from '../plugins/plugin-brand'

export function venuePluginId(market: string): string {
  return `${market}-market-connector`
}

/** Brand identity (tint, monogram, glow) for a venue's connector. */
export function venueBrand(market: string, label?: string): PluginBrand {
  return pluginBrand(venuePluginId(market), label ?? market)
}

/** Bundled high-res mark for a venue, if the terminal ships one. */
export function venuePosterSrc(market: string): string | undefined {
  return BUNDLED_POSTERS[venuePluginId(market)]
}

// Wallet chains reuse DEX connector posters where the branding matches the
// chain itself (the Ethereum connector poster is the ETH mark). Chains with
// no matching mark fall back to the tinted monogram tile.
const CHAIN_POSTER_IDS: Record<string, string> = {
  ethereum: 'ethereum-dex-connector',
}

export function chainPosterSrc(chain: string): string | undefined {
  const id = CHAIN_POSTER_IDS[chain]
  return id ? BUNDLED_POSTERS[id] : undefined
}

/** Chain brand tints — official chain colors, monogram fallback. */
export const CHAIN_BRAND: Record<string, { tint: string; mono: string }> = {
  solana: { tint: '#9945ff', mono: 'SOL' },
  ethereum: { tint: '#627eea', mono: 'ETH' },
  bitcoin: { tint: '#f7931a', mono: 'BTC' },
}

export function chainBrand(chain: string): { tint: string; mono: string } {
  return (
    CHAIN_BRAND[chain] ?? {
      tint: 'oklch(58% .16 280)',
      mono: chain.slice(0, 3).toUpperCase(),
    }
  )
}
