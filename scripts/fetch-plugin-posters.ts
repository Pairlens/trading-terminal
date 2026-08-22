// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fetch high-resolution brand marks for the bundled plugins' store posters.
 *
 * For each plugin we walk a source chain: an explicit OVERRIDE, the venue's
 * CoinGecko exchange art, the site's own apple-touch-icon, and finally
 * Google's favicon service (256px). Images smaller than MIN_EDGE are
 * discarded — the store then falls back to `manifest.icon` / monograms.
 *
 * Clearbit's logo CDN used to lead that chain. HubSpot retired it, so the
 * host no longer resolves at all; four marks (Alpaca and three EVM chains)
 * silently dropped out of the map on the next bare run while their PNGs
 * stayed on disk. Anything that reads like a general-purpose logo CDN belongs
 * in OVERRIDES with a pinned URL instead.
 *
 * Output:
 *   apps/terminal/public/posters/<plugin-id>.png          (the images)
 *   apps/terminal/src/components/plugins/plugin-posters.ts (generated map)
 *
 * Re-run manually when adding a bundled plugin:
 *   bun scripts/fetch-plugin-posters.ts
 *
 * Pass plugin ids to refresh just those, merging into the map the repo
 * already ships:
 *   bun scripts/fetch-plugin-posters.ts kalshi-market-connector
 * A bare run re-derives every mark from live CDNs, so a venue whose logo
 * moved (or whose CDN is unreachable from the machine running this) silently
 * changes or drops out. Refresh one id when you only added one plugin.
 *
 * The marks identify the third-party venues/providers a connector integrates
 * with (nominative use); they remain trademarks of their respective owners.
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const OUT_DIR = join(ROOT, 'apps/terminal/public/posters')
const CHAIN_DIR = join(ROOT, 'apps/terminal/public/chains')
const MAP_FILE = join(
  ROOT,
  'apps/terminal/src/components/plugins/plugin-posters.ts',
)
const MIN_EDGE = 96
/** Posters render at ≤210px; anything larger than this is wasted bytes. */
const MAX_EDGE = 512

/** plugin id → brand domain */
const DOMAINS: Record<string, string> = {
  'opensea-nft-connector': 'opensea.io',
  'coingecko-nft-provider': 'coingecko.com',
  'okx-market-connector': 'okx.com',
  'binance-market-connector': 'binance.com',
  'bybit-market-connector': 'bybit.com',
  'bitvavo-market-connector': 'bitvavo.com',
  'mexc-market-connector': 'mexc.com',
  'kucoin-market-connector': 'kucoin.com',
  'gate-market-connector': 'gate.io',
  'bitget-market-connector': 'bitget.com',
  'coinbase-market-connector': 'coinbase.com',
  'kraken-market-connector': 'kraken.com',
  'htx-market-connector': 'htx.com',
  'cryptocom-market-connector': 'crypto.com',
  'bitfinex-market-connector': 'bitfinex.com',
  'upbit-market-connector': 'upbit.com',
  'alpaca-market-connector': 'alpaca.markets',
  'groq-inference': 'groq.com',
  'openai-inference': 'openai.com',
  'anthropic-inference': 'anthropic.com',
  'openrouter-inference': 'openrouter.ai',
  'jupiter-dex-connector': 'jup.ag',
  'ethereum-dex-connector': 'ethereum.org',
  'base-dex-connector': 'base.org',
  'arbitrum-dex-connector': 'arbitrum.io',
  'bsc-dex-connector': 'bnbchain.org',
  'polygon-dex-connector': 'polygon.technology',
  'geckoterminal-data-provider': 'geckoterminal.com',
  'dexpaprika-data-provider': 'dexpaprika.com',
  'dexscreener-data-provider': 'dexscreener.com',
  'coinglass-liquidations': 'coinglass.com',
  'lifi-bridge-connector': 'li.fi',
  'helius-rpc-provider': 'helius.dev',
  // Both prediction venues refuse direct image fetches (kalshi.com resets the
  // TLS handshake, polymarket.com sits behind bot protection), so the Google
  // favicon fallback is the one source that resolves them. It returns their
  // current app marks at 192px and 180px.
  'kalshi-market-connector': 'kalshi.com',
  'polymarket-market-connector': 'polymarket.com',
  'exa-search': 'exa.ai',
  'tavily-search': 'tavily.com',
}

/**
 * Direct high-res sources for brands whose sites expose no large favicon:
 * CoinGecko exchange art, Trust Wallet chain logos, project logo CDNs.
 */
const OVERRIDES: Record<string, string> = {
  // Verified GitHub org avatars. OpenSea's site sits behind bot protection and
  // CoinGecko's apple-touch-icon is below MIN_EDGE, so neither reaches a mark
  // large enough through the normal chain.
  'opensea-nft-connector':
    'https://avatars.githubusercontent.com/ProjectOpenSea?s=512',
  'coingecko-nft-provider':
    'https://avatars.githubusercontent.com/coingecko?s=512',
  // crypto.com's own favicon is a tiny mark upscaled; the Cronos chain logo
  // is the same brand hexagon at genuine resolution.
  'cryptocom-market-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/info/logo.png',
  'jupiter-dex-connector':
    'https://cryptologos.cc/logos/jupiter-ag-jup-logo.png?v=040',
  // Trust Wallet's Base entry is a plain blue square, not the ring-and-bar
  // mark; base-org's avatar is the real one.
  'base-dex-connector':
    'https://avatars.githubusercontent.com/u/108554348?s=512',
  'arbitrum-dex-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  'bsc-dex-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
  // Verified GitHub org avatars — the only 460px source these publish.
  // DexScreener's site is behind Cloudflare bot protection, so neither the
  // apple-touch-icon nor the favicon service reaches anything large enough to
  // clear MIN_EDGE.
  'dexscreener-data-provider':
    'https://avatars.githubusercontent.com/u/99915600?s=512',
  'lifi-bridge-connector':
    'https://avatars.githubusercontent.com/u/85288935?s=512',
  // Bitget's own site serves no usable mark and CoinGecko answers JPEG, which
  // pngSize cannot measure. CoinMarketCap's exchange art is the same cyan
  // mark at more than the poster renders.
  'bitget-market-connector':
    'https://s2.coinmarketcap.com/static/img/exchanges/200x200/513.png',
  // GeckoTerminal serves no apple-touch-icon at the root; the marked-up path
  // is where the 180px app icon lives.
  'geckoterminal-data-provider':
    'https://www.geckoterminal.com/images/icons/180x180.png',
}

/**
 * Plugin ids that wear another plugin's mark. A perpetual-futures venue is
 * the same brand as its spot venue, and shipping the mark twice under two
 * names would be two copies of one PNG in the bundle.
 */
const POSTER_ALIASES: Record<string, string> = {
  'binance-futures-market-connector': 'binance-market-connector',
  'bybit-futures-market-connector': 'bybit-market-connector',
  'okx-futures-market-connector': 'okx-market-connector',
  'kucoin-futures-market-connector': 'kucoin-market-connector',
  'kraken-futures-market-connector': 'kraken-market-connector',
}

/** CoinGecko exchange ids — resolved via their API to "large" images. */
const COINGECKO_EXCHANGES: Record<string, string> = {
  'bybit-market-connector': 'bybit_spot',
  // Both venues answer every icon path on their own domain with HTML, so
  // without these they fell through to the favicon service and shipped 128px
  // and 144px of real detail against a 152px render.
  'htx-market-connector': 'huobi',
  'kucoin-market-connector': 'kucoin',
  'gate-market-connector': 'gate',
  'bitfinex-market-connector': 'bitfinex',
  // Clearbit still serves Coinbase's retired Material-era app icon — a
  // squared blue tile with a long shadow — which looked nothing like the mark
  // the venue picker gets from the manifest, so the same exchange appeared
  // twice on one screen wearing two different logos. 'gdax' is CoinGecko's id
  // for Coinbase Exchange and resolves to the current round mark.
  'coinbase-market-connector': 'gdax',
}

/**
 * Pairlens's own plugins reuse the logo already shipped in public/. Every
 * first-party id belongs here — a Pairlens plugin has no brand to fetch, and
 * one left out falls through to a monogram tile that reads as a third-party
 * stub in a grid where its siblings wear the logo.
 */
/**
 * Chain marks, which are not plugin marks: the DEX chain rail lists chains
 * whose connector may not even be installed, and Solana's connector is
 * Jupiter, an aggregator whose own logo is not the chain's. Written to
 * `public/chains/` and referenced by literal path from `lib/dex/chain-catalog.ts`,
 * so no generated map and no collision with the poster orphan check.
 *
 * Every EVM chain reads its mark off its connector's poster instead, through
 * `EVM_CHAINS` — Solana is the one chain with nowhere else to look.
 */
const CHAIN_MARKS: Record<string, string> = {
  solana:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
}

const LOCAL_POSTERS: Record<string, string> = {
  'pairlens-core': '/logo512.png',
  'pairlens-intelligence': '/logo512.png',
  'pairlens-predictions': '/logo512.png',
  'pairlens-cex-futures': '/logo512.png',
  'pairlens-dex': '/logo512.png',
  'pairlens-equities': '/logo512.png',
  'pairlens-community': '/logo512.png',
  'user-indicators': '/logo512.png',
  'basic-symbols': '/logo512.png',
}

/**
 * Brand marks committed to the repo rather than fetched, because no source
 * publishes them usably. Alpaca's favicon is 48px and its icon paths answer
 * HTML; tavily.com's apple-touch-icon sits behind a content hash that changes
 * on every deploy. Both were previously taken from GitHub org avatars, which
 * gave Alpaca a soft mark and Tavily a photograph that weighed 104 KB against
 * 23 KB for the flat logo committed here.
 *
 * These ids are NEVER fetched and never rewritten: a run that re-derived them
 * would trade 512px art for whatever a favicon service upscales that day,
 * which is the silent downgrade the rest of this file exists to prevent.
 */
const VENDORED_POSTERS: Record<string, string> = {
  'alpaca-market-connector': '/posters/alpaca-market-connector.png',
  'tavily-search': '/posters/tavily-search.png',
}

function pngSize(buf: Uint8Array): { w: number; h: number } | null {
  // PNG: 8-byte signature, IHDR width/height at offsets 16/20 (big-endian).
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return null
  }
  const view = new DataView(buf.buffer, buf.byteOffset)
  return { w: view.getUint32(16), h: view.getUint32(20) }
}

async function fetchImage(url: string): Promise<Uint8Array | null> {
  // One retry, because a miss here is silent and lasting: the plugin drops to
  // the next source (often a favicon service that upscales), the committed
  // PNG changes, and nothing in the diff says a CDN blinked. Seen live -
  // raw.githubusercontent.com refused one id inside a batch and served it
  // fine on its own a second later.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) continue
      const type = res.headers.get('content-type') ?? ''
      if (!type.startsWith('image/')) return null
      return new Uint8Array(await res.arrayBuffer())
    } catch {
      // Retry once, then let the next source have it.
    }
  }
  return null
}

async function coingeckoImage(exchangeId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/exchanges/${exchangeId}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as { image?: string }
    // API returns the "small" rendition; the "large" one lives next to it.
    return data.image?.replace('/small/', '/large/') ?? null
  } catch {
    return null
  }
}

async function bestMark(
  id: string,
  domain: string,
): Promise<Uint8Array | null> {
  const sources: Array<string> = []
  if (OVERRIDES[id]) sources.push(OVERRIDES[id])
  if (COINGECKO_EXCHANGES[id]) {
    const url = await coingeckoImage(COINGECKO_EXCHANGES[id])
    if (url) sources.push(url)
  }
  sources.push(
    `https://${domain}/apple-touch-icon.png`,
    `https://www.${domain}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
  )
  for (const url of sources) {
    const buf = await fetchImage(url)
    if (!buf) continue
    const size = pngSize(buf)
    if (size && size.w >= MIN_EDGE && size.h >= MIN_EDGE) return buf
  }
  return null
}

/** Plugin ids named on the command line; empty means every bundled plugin. */
const only = new Set(Bun.argv.slice(2))

await mkdir(OUT_DIR, { recursive: true })
await mkdir(CHAIN_DIR, { recursive: true })
const posters: Record<string, string> = {
  ...LOCAL_POSTERS,
  ...VENDORED_POSTERS,
}
const skipped: Array<string> = []

// Chain marks ride along: same fetch, same size floor, different directory.
// Named on the command line as `chain:<id>`, so they never collide with a
// plugin id and a plugin-only run leaves them alone.
for (const [chain, url] of Object.entries(CHAIN_MARKS)) {
  if (only.size > 0 && !only.has(`chain:${chain}`)) continue
  const buf = await fetchImage(url)
  const size = buf ? pngSize(buf) : null
  if (!buf || !size || size.w < MIN_EDGE || size.h < MIN_EDGE) {
    skipped.push(`chain:${chain} (${url})`)
    continue
  }
  await Bun.write(join(CHAIN_DIR, `${chain}.png`), buf)
  console.log(`✓ chain:${chain} (${size.w}×${size.h})`)
}

// A filtered run keeps every poster it is not refreshing, so the map that
// lands is the shipped one plus the ids asked for.
if (only.size > 0) {
  const { BUNDLED_POSTERS } = (await import(MAP_FILE)) as {
    BUNDLED_POSTERS: Record<string, string>
  }
  // LOCAL_POSTERS re-applied on top: this file is the source of truth for
  // where a first-party mark lives, and the shipped map may predate an entry.
  Object.assign(posters, BUNDLED_POSTERS, LOCAL_POSTERS)
}

for (const [id, domain] of Object.entries(DOMAINS)) {
  if (only.size > 0 && !only.has(id)) continue
  if (VENDORED_POSTERS[id]) {
    console.log(`• ${id} ← committed art (not fetched)`)
    continue
  }
  const buf = await bestMark(id, domain)
  if (!buf) {
    skipped.push(`${id} (${domain})`)
    continue
  }
  const file = `${id}.png`
  const path = join(OUT_DIR, file)
  await Bun.write(path, buf)
  let size = pngSize(buf)!
  if (size.w > MAX_EDGE || size.h > MAX_EDGE) {
    // macOS sips keeps this script dependency-free; posters never render
    // larger than ~210px so 512px retains full sharpness.
    const resample = Bun.spawnSync([
      'sips',
      '--resampleHeightWidthMax',
      String(MAX_EDGE),
      path,
    ])
    if (resample.exitCode === 0) {
      size = pngSize(new Uint8Array(await Bun.file(path).arrayBuffer())) ?? size
    }
  }
  posters[id] = `/posters/${file}`
  console.log(`✓ ${id} ← ${domain} (${size.w}×${size.h})`)
}

// Aliases resolve last so they pick up whatever this run wrote for the venue
// they borrow from. An alias whose source never landed is dropped rather than
// pointing the map at a file that is not in public/.
for (const [id, source] of Object.entries(POSTER_ALIASES)) {
  if (posters[source]) posters[id] = posters[source]
  else skipped.push(`${id} (alias of ${source}, which has no poster)`)
}

if (skipped.length > 0) {
  console.log(
    `\nSkipped (no image ≥ ${MIN_EDGE}px — store falls back to manifest.icon):`,
  )
  for (const s of skipped) console.log(`  ✗ ${s}`)
}

const sorted = Object.fromEntries(
  Object.entries(posters).sort(([a], [b]) => a.localeCompare(b)),
)
// The header is emitted here so a regenerated map passes `license-headers`
// without a second command.
const module = `// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Generated by scripts/fetch-plugin-posters.ts — do not edit by hand.
// High-res poster art for bundled plugins, served from the terminal bundle.
// Brand marks identify the integrated venues/providers (nominative use) and
// remain trademarks of their respective owners.

export const BUNDLED_POSTERS: Record<string, string> = ${JSON.stringify(sorted, null, 2)}
`
await Bun.write(MAP_FILE, module)
Bun.spawnSync(['bunx', 'prettier', '--write', MAP_FILE], { cwd: ROOT })
console.log(
  `\nWrote ${Object.keys(sorted).length} entries to plugin-posters.ts`,
)
