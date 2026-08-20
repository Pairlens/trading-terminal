// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fetch high-resolution brand marks for the bundled plugins' store posters.
 *
 * For each plugin we walk a source chain, sharpest and most trustworthy
 * first, and take the first image at least MIN_EDGE across. Anything smaller
 * is discarded and the store falls back to `manifest.icon` / monograms.
 *
 * ORDER IS THE QUALITY CONTROL, not pixel dimensions. The last resort,
 * Google's favicon service, answers `sz=256` by UPSCALING whatever tiny
 * favicon the site ships, so it always passes a size check while looking
 * blocky at poster scale. That is how Crypto.com shipped as a 64px favicon
 * blown up to a 256px canvas. Keep real sources ahead of it, and check a
 * regenerated poster by eye rather than by its header.
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
const MAP_FILE = join(
  ROOT,
  'apps/terminal/src/components/plugins/plugin-posters.ts',
)
const MIN_EDGE = 96
/** Posters render at ≤210px; anything larger than this is wasted bytes. */
const MAX_EDGE = 512

/** plugin id → brand domain */
const DOMAINS: Record<string, string> = {
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
  // Both prediction venues refuse direct image fetches (kalshi.com resets the
  // TLS handshake, polymarket.com sits behind bot protection), so the Google
  // favicon fallback is the one source that resolves them. It returns their
  // current app marks at 192px and 180px.
  'kalshi-market-connector': 'kalshi.com',
  'polymarket-market-connector': 'polymarket.com',
  'exa-search': 'exa.ai',
  'tavily-search': 'tavily.com',
  'helius-rpc-provider': 'helius.dev',
}

/**
 * Plugins that wear another plugin's mark: a futures connector is the same
 * venue as its spot sibling, so it reuses that poster rather than fetching
 * the brand twice. Without these the futures cards fell back to
 * `manifest.icon`, which for Binance is a 32px favicon — the blockiest art
 * in the store, against a 152px render.
 */
const POSTER_ALIASES: Record<string, string> = {
  'binance-futures-market-connector': 'binance-market-connector',
  'bybit-futures-market-connector': 'bybit-market-connector',
  'okx-futures-market-connector': 'okx-market-connector',
  'kucoin-futures-market-connector': 'kucoin-market-connector',
  'kraken-futures-market-connector': 'kraken-market-connector',
}

/**
 * Direct high-res sources for brands whose sites expose no large favicon:
 * CoinGecko exchange art, Trust Wallet chain logos, project logo CDNs.
 */
const OVERRIDES: Record<string, string> = {
  // crypto.com's own favicon is a tiny mark upscaled; the Cronos chain logo
  // is the same brand hexagon at genuine resolution.
  'cryptocom-market-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/info/logo.png',
  // Bitget's own site serves no usable mark and CoinGecko answers JPEG,
  // which this script cannot size. CoinMarketCap's 200px exchange art is the
  // same cyan mark at more than the poster renders.
  'bitget-market-connector':
    'https://s2.coinmarketcap.com/static/img/exchanges/200x200/513.png',
  'jupiter-dex-connector':
    'https://cryptologos.cc/logos/jupiter-ag-jup-logo.png?v=040',
  'base-dex-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  'arbitrum-dex-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  'bsc-dex-connector':
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
}

/** CoinGecko exchange ids — resolved via their API to "large" images. */
const COINGECKO_EXCHANGES: Record<string, string> = {
  'bybit-market-connector': 'bybit_spot',
  // Both venues' own sites answer the poster fetch with HTML, so without
  // these they fell through to a Google-upscaled favicon and shipped at
  // 128px and 144px of real detail against a 152px render.
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

/** Pairlens's own plugins reuse the logo already shipped in public/. */
const LOCAL_POSTERS: Record<string, string> = {
  'pairlens-core': '/logo512.png',
  'pairlens-intelligence': '/logo512.png',
}

/**
 * Brands with no fetchable mark, committed to the repo instead.
 *
 * Both sites answer every icon path with HTML, and Google's favicon service
 * reports a true 16px favicon for them however large a size you ask for — so
 * every source in the chain either fails or returns something far too small
 * for a poster. These are NEVER fetched and never rewritten: a run that
 * re-derived them would replace a 512px mark with a 48px favicon, which is
 * the silent downgrade this whole file is trying not to repeat.
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
  // its `manifest.icon` (often a 32px favicon), the poster map loses the
  // entry, and nothing about the committed result says a CDN blinked. Seen
  // live — raw.githubusercontent.com refused one id in a batch and served it
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
    // Clearbit's logo CDN used to lead this chain at 512px. It was retired
    // (every request now answers a short text body), which is what quietly
    // demoted several venues to the upscaling fallback below.
    `https://${domain}/apple-touch-icon.png`,
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
const posters: Record<string, string> = {
  ...LOCAL_POSTERS,
  ...VENDORED_POSTERS,
}
const skipped: Array<string> = []

// A filtered run keeps every poster it is not refreshing, so the map that
// lands is the shipped one plus the ids asked for.
if (only.size > 0) {
  const { BUNDLED_POSTERS } = (await import(MAP_FILE)) as {
    BUNDLED_POSTERS: Record<string, string>
  }
  Object.assign(posters, BUNDLED_POSTERS)
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

if (skipped.length > 0) {
  console.log(
    `\nSkipped (no image ≥ ${MIN_EDGE}px — store falls back to manifest.icon):`,
  )
  for (const s of skipped) console.log(`  ✗ ${s}`)
}

// Aliases resolve against whatever the run produced, so a venue that lost its
// poster does not leave its futures sibling pointing at a missing file.
for (const [alias, source] of Object.entries(POSTER_ALIASES)) {
  const poster = posters[source]
  if (poster) posters[alias] = poster
  else delete posters[alias]
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
