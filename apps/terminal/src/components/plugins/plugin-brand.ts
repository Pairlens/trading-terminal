// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Per-plugin brand identity for the storefront: monogram initials, brand tint
 * (poster fill + monogram tile), and hero treatments (gradient wash, glow,
 * orb colors) for spotlight-grade plugins.
 *
 * Keyed by manifest id. Unknown plugins (third-party installs) get a
 * deterministic hue derived from their id so every poster still reads as a
 * designed card.
 */

import { BUNDLED_POSTERS } from './plugin-posters'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'

/**
 * Best available brand image for poster art, sharpest first: the high-res
 * poster bundled with the terminal, then the registry entry's `posterImage`
 * (third-party publishers), then the manifest's (usually favicon-sized) icon.
 */
export function pluginPosterSrc(
  entry: RegistryPluginEntry,
): string | undefined {
  return (
    BUNDLED_POSTERS[entry.manifest.id] ??
    entry.posterImage ??
    entry.manifest.icon
  )
}

export type PluginBrand = {
  /** 2–3 letter monogram shown on the poster tile. */
  mono: string
  /** Brand tint — poster gradient + monogram tile background. */
  tint: string
  /** Foreground color for the monogram initials on the tint. */
  fg: string
  /** Diagonal hero-band wash (spotlight + product hero). */
  heroWash: string
  /** Radial glow behind the orb. */
  glow: string
  /** AiOrb color overrides. */
  orbColors?: { c1: string; c2: string; c3: string }
}

type BrandSeed = {
  mono: string
  tint: string
  fg: string
  heroWash?: string
  glow?: string
  orbColors?: { c1: string; c2: string; c3: string }
}

const BRANDS: Record<string, BrandSeed> = {
  'pairlens-core': {
    mono: 'PL',
    tint: '#3b6fed',
    fg: '#ffffff',
    heroWash: 'oklch(20% .1 265)',
    glow: 'oklch(60% .2 265 / .55)',
    orbColors: {
      c1: 'oklch(72% .15 265)',
      c2: 'oklch(60% .2 250)',
      c3: 'oklch(64% .13 290)',
    },
  },
  'pairlens-intelligence': {
    mono: 'IQ',
    tint: '#8b5cf6',
    fg: '#ffffff',
    heroWash: 'oklch(20% .12 315)',
    glow: 'oklch(60% .2 320 / .5)',
    orbColors: {
      c1: 'oklch(72% .16 300)',
      c2: 'oklch(64% .2 322)',
      c3: 'oklch(60% .18 275)',
    },
  },
  'groq-inference': {
    mono: 'GQ',
    tint: '#f55036',
    fg: '#ffffff',
    heroWash: 'oklch(22% .12 40)',
    glow: 'oklch(64% .2 40 / .5)',
    orbColors: {
      c1: 'oklch(74% .16 45)',
      c2: 'oklch(66% .2 30)',
      c3: 'oklch(72% .15 65)',
    },
  },
  'alpaca-market-connector': {
    mono: 'AL',
    tint: '#fcd535',
    fg: '#1a1400',
    heroWash: 'oklch(22% .1 90)',
    glow: 'oklch(72% .16 90 / .5)',
    orbColors: {
      c1: 'oklch(82% .14 92)',
      c2: 'oklch(72% .16 78)',
      c3: 'oklch(80% .12 105)',
    },
  },
  'okx-market-connector': { mono: 'OKX', tint: '#12161f', fg: '#e8ecf4' },
  'binance-market-connector': { mono: 'BN', tint: '#f0b90b', fg: '#1a1400' },
  'bybit-market-connector': { mono: 'BY', tint: '#f7a600', fg: '#1a1200' },
  'bitvavo-market-connector': { mono: 'BV', tint: '#1f5ef5', fg: '#ffffff' },
  'mexc-market-connector': { mono: 'MX', tint: '#00b897', fg: '#04201a' },
  'kucoin-market-connector': { mono: 'KU', tint: '#20d6a0', fg: '#052018' },
  'gate-market-connector': { mono: 'GT', tint: '#d8314b', fg: '#ffffff' },
  'bitget-market-connector': { mono: 'BG', tint: '#00e0d0', fg: '#06201e' },
  'coinbase-market-connector': { mono: 'CB', tint: '#0052ff', fg: '#ffffff' },
  'kraken-market-connector': { mono: 'KR', tint: '#7132f5', fg: '#ffffff' },
  'htx-market-connector': { mono: 'HTX', tint: '#1e88e5', fg: '#ffffff' },
  'cryptocom-market-connector': { mono: 'CRO', tint: '#0a2c6b', fg: '#ffffff' },
  'bitfinex-market-connector': { mono: 'BFX', tint: '#16b157', fg: '#052015' },
  'upbit-market-connector': { mono: 'UP', tint: '#093687', fg: '#ffffff' },
  'openai-inference': { mono: 'AI', tint: '#10a37f', fg: '#ffffff' },
  'anthropic-inference': { mono: 'AN', tint: '#d4a27f', fg: '#201509' },
  'openrouter-inference': { mono: 'OR', tint: '#6467f2', fg: '#ffffff' },
  'jupiter-dex-connector': { mono: 'JUP', tint: '#22c55e', fg: '#04140a' },
  'geckoterminal-data-provider': {
    mono: 'GKO',
    tint: '#8bc34a',
    fg: '#0a1704',
  },
  'dexpaprika-data-provider': { mono: 'DXP', tint: '#e11d48', fg: '#ffffff' },
  'dexscreener-data-provider': { mono: 'DXS', tint: '#5c7cfa', fg: '#04091a' },
  'exa-search': { mono: 'EXA', tint: '#1f6feb', fg: '#ffffff' },
  'tavily-search': { mono: 'TVL', tint: '#0ea5e9', fg: '#04121a' },
  'basic-symbols': { mono: 'SYM', tint: '#64748b', fg: '#ffffff' },
  'dev-starter': { mono: 'DEV', tint: '#a855f7', fg: '#ffffff' },
  'dev-sync': { mono: 'SYN', tint: '#14b8a6', fg: '#04201c' },
}

/** Per-chain EVM DEX connectors share one visual identity. */
const EVM_DEX_BRAND: BrandSeed = { mono: 'EVM', tint: '#627eea', fg: '#ffffff' }

function hashHue(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return ((hash % 360) + 360) % 360
}

function monogramFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function withHero(seed: BrandSeed): PluginBrand {
  return {
    ...seed,
    heroWash:
      seed.heroWash ?? `color-mix(in oklch, ${seed.tint} 30%, oklch(12% 0 0))`,
    glow: seed.glow ?? `color-mix(in oklch, ${seed.tint} 55%, transparent)`,
  }
}

/** Resolve the brand identity for a plugin. Always returns something usable. */
export function pluginBrand(id: string, name: string): PluginBrand {
  const seed =
    BRANDS[id] ?? (id.endsWith('-dex-connector') ? EVM_DEX_BRAND : null)
  if (seed) return withHero(seed)
  const hue = hashHue(id)
  return withHero({
    mono: monogramFor(name),
    tint: `oklch(58% .16 ${hue})`,
    fg: '#ffffff',
  })
}
