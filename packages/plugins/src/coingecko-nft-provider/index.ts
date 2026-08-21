// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `coingecko-nft-provider` — a collection's headline numbers, with no key at
 * all.
 *
 * It exists for one moment: a fresh install, nothing configured, someone opens
 * a collection. Without this, every NFT pane on that board says "add an API
 * key" and the terminal has nothing to show for an asset class it claims to
 * support. CoinGecko's NFT contract endpoint is keyless and sends
 * `access-control-allow-origin: *`, so a browser can read a floor, a 24h
 * volume, a supply and a holder count for any collection it indexes, on any
 * chain including Solana. That is enough to make a cold board real.
 *
 * ## What it deliberately does NOT serve, and why it throws instead
 *
 * Rankings, listings, offers, the tape, items, traits and history. CoinGecko
 * publishes rankings at `/nfts/markets` and floor history at
 * `/nfts/{id}/market_chart`, and both are Analyst-tier: verified 401 with
 * `error_code 10005` on a keyless call. The rest it simply does not have.
 *
 * Every one of those actions THROWS rather than returning null. The plugin
 * manager walks its fallback chain on a thrown error and stops on a returned
 * value, so a null here would be an ANSWER: it would tell the board this
 * collection has no listings, and the board would draw an empty ladder over a
 * collection with two hundred of them. The DexScreener provider's header
 * records the same bug from the DEX side; this is the same rule, applied to a
 * provider that covers even less.
 *
 * Priority 6, one step behind OpenSea's 5. When a key is configured OpenSea
 * answers everything and this plugin is never reached; when it is not, this is
 * what stands between the user and a blank pane.
 */
import { providerThrottleFromNetworkError } from '@pairlens/market-engine/errors'
import { restFetch } from '@pairlens/market-engine/http'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'

import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type {
  NftChain,
  NftCollectionSummary,
} from '@pairlens/shared/nft-types'

const PROVIDER = 'coingecko'
const API_BASE = 'https://api.coingecko.com/api/v3'

/**
 * CoinGecko's own asset-platform ids, which are not our chain slugs and are not
 * anybody else's either. Polygon is `polygon-pos` and Optimism is
 * `optimistic-ethereum`, both of which are the sort of thing that silently
 * returns a 404 and reads as "this collection does not exist".
 */
const PLATFORM: Readonly<Record<NftChain, string>> = {
  ethereum: 'ethereum',
  base: 'base',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  solana: 'solana',
}

/**
 * The free tier is roughly 30 calls a minute across every CoinGecko surface the
 * terminal uses, and the news and top-coins panes are already spending it. A
 * collection read is one request and it is cached for a minute upstream, so a
 * conservative window here costs nothing and keeps a board opening off the
 * limit.
 */
const limiter = createRequestLimiter({ capacity: 20, windowMs: 60_000 })

export const coingeckoNftManifest: PluginManifest = {
  id: 'coingecko-nft-provider',
  name: 'CoinGecko NFT',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Keyless floor price, volume, supply and holders for any indexed collection, on every chain CoinGecko covers. The fallback that makes a cold NFT board real.',
  homepage: 'https://coingecko.com',
  icon: '/posters/coingecko-nft-provider.png',
  metadata: {
    assetClass: 'nft',
    family: 'nfts',
    gradient: 'from-lime-400 to-green-500',
    abbr: 'CG',
  },
  capabilities: [
    {
      id: 'market-data:nft',
      singleton: false,
      markets: ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism', 'solana'],
      // One behind OpenSea. This is the provider of last resort, not a peer.
      priority: 6,
      streaming: false,
    },
  ],
  config: {},
}

type CoinGeckoNft = {
  id?: string
  web_slug?: string
  contract_address?: string
  asset_platform_id?: string
  name?: string
  symbol?: string
  image?: { small?: string; small_2x?: string }
  description?: string
  native_currency_symbol?: string
  floor_price?: { native_currency?: number; usd?: number }
  market_cap?: { native_currency?: number; usd?: number }
  volume_24h?: { native_currency?: number; usd?: number }
  floor_price_24h_percentage_change?: { native_currency?: number; usd?: number }
  volume_24h_percentage_change?: { native_currency?: number; usd?: number }
  number_of_unique_addresses?: number
  total_supply?: number
  one_day_sales?: number
  explorers?: Array<{ name?: string; link?: string }>
}

/**
 * The refusal. A throw, so the manager keeps walking; a message that names what
 * this provider is, so a pane surfacing it tells the user something they can
 * act on rather than "request failed".
 */
function unsupported(action: string): never {
  throw new Error(
    `CoinGecko serves collection state only, not '${action}'. Add an OpenSea key in Accounts for the book, the tape and history.`,
  )
}

async function fetchCollection(
  chain: NftChain,
  contract: string,
): Promise<NftCollectionSummary | null> {
  const platform = PLATFORM[chain]
  if (!platform) unsupported('collection')

  await limiter.acquire()
  let response: Response
  try {
    response = await restFetch(
      `${API_BASE}/nfts/${platform}/contract/${contract}`,
      { headers: { accept: 'application/json' } },
    )
  } catch (err) {
    // CoinGecko answers a 429 without CORS headers, so a browser sees a bare
    // TypeError with no status. Classifying it here is what keeps a rate limit
    // from reading as "no such collection".
    throw providerThrottleFromNetworkError(err, PROVIDER)
  }

  // A genuine 404 is an ANSWER: CoinGecko does not index this contract. It is
  // the one case in this file that returns null rather than throwing, because
  // the walk should stop, and "we could not find it" is what the pane should
  // say.
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`CoinGecko REST error: ${response.status}`)

  const raw = (await response.json()) as CoinGeckoNft
  return toSummary(chain, contract, raw)
}

/**
 * Percentage changes arrive as PERCENTAGES here and travel as FRACTIONS in the
 * wire contract. Getting that wrong renders a 3% move as 300%, which looks like
 * a data outage rather than a unit bug, so the conversion lives in one place.
 */
function toFraction(pct: number | undefined): number | undefined {
  return pct == null || !Number.isFinite(pct) ? undefined : pct / 100
}

export function toSummary(
  chain: NftChain,
  contract: string,
  raw: CoinGeckoNft,
): NftCollectionSummary {
  return {
    chain,
    contract,
    slug: raw.web_slug ?? raw.id,
    name: raw.name ?? contract,
    imageUrl: raw.image?.small_2x ?? raw.image?.small,
    priceCurrency: raw.native_currency_symbol?.toUpperCase() ?? 'ETH',
    floorPrice: raw.floor_price?.native_currency,
    floorPriceUsd: raw.floor_price?.usd,
    floorChange24h: toFraction(
      raw.floor_price_24h_percentage_change?.native_currency,
    ),
    volume24h: raw.volume_24h?.native_currency,
    volume24hUsd: raw.volume_24h?.usd,
    volumeChange24h: toFraction(
      raw.volume_24h_percentage_change?.native_currency,
    ),
    marketCap: raw.market_cap?.native_currency,
    marketCapUsd: raw.market_cap?.usd,
    totalSupply: raw.total_supply,
    ownerCount: raw.number_of_unique_addresses,
    sales24h: raw.one_day_sales,
    description: raw.description,
    externalUrl: raw.explorers?.[0]?.link,
  }
}

export function createCoingeckoNftPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      if (params.capability !== 'market-data:nft') {
        throw new Error(
          `coingecko-nft-provider: unsupported capability '${params.capability}'`,
        )
      }
      const action = String(params.params['action'] ?? '')
      if (action !== 'collection') unsupported(action || 'unknown')

      const chain = params.params['market'] as NftChain | undefined
      const contract = params.params['contract'] as string | undefined
      if (!chain || !contract) unsupported('collection')

      return await fetchCollection(chain, contract)
    },
  }
}
