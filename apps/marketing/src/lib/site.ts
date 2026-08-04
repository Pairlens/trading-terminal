// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Shared marketing-site constants: nav, footer, external links, venue brand
// hues, and SEO defaults. Single source of truth for the chrome.

export const SITE = {
  name: 'Pairlens',
  tagline: 'The terminal that never touches your money.',
  description:
    'A free, source-available, AI-native trading terminal. Run it in your browser or install it on your desktop, and trade crypto and stocks on 15+ exchanges, brokers and DEXs. Your keys, any venue, any country. No middleman, no lock-in.',
  url: 'https://pairlens.finance',
  repo: 'https://github.com/Pairlens/trading-terminal',
  chartsRepo: 'https://github.com/Pairlens/fast-financial-charts',
  /**
   * The hosted terminal. This is the site's primary call to action: every
   * "Launch terminal" button points here, and the desktop installers on
   * /install are the second path rather than the only one.
   */
  launchUrl: 'https://terminal.pairlens.finance',
  x: 'https://x.com/pairlens',
} as const

/** Marketing top-nav (landing / docs chrome). */
export const NAV = [
  { label: 'Features', href: '/#features' },
  { label: 'Intelligence', href: '/intelligence' },
  { label: 'Charts', href: '/charts' },
  { label: 'Licensing', href: '/licensing' },
  // Deep-link straight to the quickstart: /docs is a static meta-refresh
  // redirect page, and routing through it flashes a blank page mid-navigation.
  { label: 'Docs', href: '/docs/quickstart' },
  { label: 'Affiliates', href: '/affiliates' },
] as const

/** The 56px app/docs header nav (Documentation · Guides · SDK · API · Affiliates). */
export const APP_NAV = [
  { label: 'Documentation', href: '/docs/quickstart', key: 'documentation' },
  { label: 'Guides', href: '/docs/trading', key: 'guides' },
  { label: 'SDK', href: '/docs/plugin-sdk', key: 'sdk' },
  { label: 'API', href: '/docs/cli-reference', key: 'api' },
  { label: 'Affiliates', href: '/affiliates', key: 'affiliates' },
] as const

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Launch terminal', href: SITE.launchUrl },
      { label: 'Download for desktop', href: '/install' },
      { label: 'Terminal', href: '/#features' },
      { label: 'Co-pilot', href: '/#features' },
      { label: 'Intelligence', href: '/intelligence' },
      { label: 'Workflows', href: '/docs/build-a-workflow' },
      { label: 'Connectors', href: '/docs/connectors' },
    ],
  },
  {
    title: 'Source',
    links: [
      { label: 'GitHub', href: SITE.repo },
      { label: 'Fast Financial Charts', href: '/charts' },
      { label: 'Plugin SDK', href: '/docs/plugin-sdk' },
      { label: 'Licensing', href: '/licensing' },
      { label: 'Security', href: `${SITE.repo}/blob/main/SECURITY.md` },
      { label: 'Contributing', href: `${SITE.repo}/blob/main/CONTRIBUTING.md` },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Docs', href: '/docs/quickstart' },
      { label: 'Registry', href: '/docs/registry' },
      { label: 'Changelog', href: `${SITE.repo}/releases` },
      { label: 'llms.txt (for AI agents)', href: '/llms.txt' },
    ],
  },
] as const

/**
 * The legal rail shown in the bottom bar of every footer. Kept out of
 * `FOOTER_COLUMNS` on purpose: privacy and terms belong on the fine-print
 * line where people look for them, not in a product column.
 */
export const FOOTER_LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Licensing', href: '/licensing' },
] as const

/**
 * Real logos are bundled under `public/venues/<id>.png` — venues/exchanges,
 * AI providers, and assets (crypto + stocks), fetched from the same
 * CoinMarketCap / official / favicon sources the terminal's plugins use.
 * `LOGO_IDS` gates which ids have one — anything missing falls back to a
 * brand-hued monogram chip via `<VenueIcon>`.
 */
export const LOGO_IDS = new Set([
  // venues / exchanges
  'binance',
  'okx',
  'coinbase',
  'bybit',
  'bitvavo',
  'kraken',
  'kucoin',
  'gate',
  'bitget',
  'htx',
  'mexc',
  'cryptocom',
  'bitfinex',
  'upbit',
  'jupiter',
  'alpaca',
  // AI providers (brains)
  'groq',
  'openai',
  'anthropic',
  'openrouter',
  'tavily',
  'exa',
  // assets (crypto + stocks)
  'btc',
  'eth',
  'sol',
  'tsla',
  'aapl',
  'doge',
])

export type Venue = {
  /** Matches the bundled logo filename `public/venues/<id>.png`. */
  id: string
  name: string
  mono: string
  hue: string
}

/** Venues shown in the landing marquee. */
export const VENUES: Array<Venue> = [
  { id: 'binance', name: 'Binance', mono: 'BN', hue: 'oklch(0.82 0.16 85)' },
  { id: 'okx', name: 'OKX', mono: 'OK', hue: 'oklch(0.86 0 0)' },
  { id: 'coinbase', name: 'Coinbase', mono: 'CB', hue: 'oklch(0.62 0.18 258)' },
  { id: 'bybit', name: 'Bybit', mono: 'BY', hue: 'oklch(0.78 0.16 75)' },
  { id: 'kraken', name: 'Kraken', mono: 'KR', hue: 'oklch(0.62 0.16 285)' },
  { id: 'kucoin', name: 'KuCoin', mono: 'KC', hue: 'oklch(0.74 0.15 175)' },
  { id: 'gate', name: 'Gate.io', mono: 'GT', hue: 'oklch(0.64 0.2 25)' },
  { id: 'bitget', name: 'Bitget', mono: 'BG', hue: 'oklch(0.72 0.14 205)' },
  { id: 'htx', name: 'HTX', mono: 'HT', hue: 'oklch(0.64 0.2 25)' },
  { id: 'mexc', name: 'MEXC', mono: 'MX', hue: 'oklch(0.62 0.17 258)' },
  {
    id: 'cryptocom',
    name: 'Crypto.com',
    mono: 'CR',
    hue: 'oklch(0.6 0.16 258)',
  },
  { id: 'bitfinex', name: 'Bitfinex', mono: 'BF', hue: 'oklch(0.72 0.16 150)' },
  { id: 'upbit', name: 'Upbit', mono: 'UP', hue: 'oklch(0.66 0.17 258)' },
  { id: 'alpaca', name: 'Alpaca', mono: 'AL', hue: 'oklch(0.78 0.13 85)' },
  { id: 'jupiter', name: 'Jupiter', mono: 'JU', hue: 'oklch(0.74 0.15 45)' },
]

/**
 * Asset classes a venue can route. Mirrors the terminal's assetClass routing:
 * a crypto CEX/DEX only trades coins, the equities broker only trades stocks.
 * Drives which slot-machine combinations are valid — no "Binance + TSLA" or
 * "Alpaca + BTC" nonsense desks.
 */
export type AssetClass = 'crypto' | 'equity'

export type DeskVenue = Venue & { classes: ReadonlyArray<AssetClass> }
export type DeskBrain = { id: string; name: string; mono: string; hue: string }
export type DeskAsset = {
  id: string
  name: string
  mono: string
  hue: string
  class: AssetClass
}

/** Slot-machine pools for the "build your desk" plugin store. */
export const DESK_POOLS: {
  venue: ReadonlyArray<DeskVenue>
  brain: ReadonlyArray<DeskBrain>
  asset: ReadonlyArray<DeskAsset>
} = {
  venue: [
    // prettier-ignore
    { id: 'binance', name: 'Binance', mono: 'BN', hue: 'oklch(0.82 0.16 85)', classes: ['crypto'] },
    // prettier-ignore
    { id: 'coinbase', name: 'Coinbase', mono: 'CB', hue: 'oklch(0.62 0.18 258)', classes: ['crypto'] },
    // prettier-ignore
    { id: 'okx', name: 'OKX', mono: 'OK', hue: 'oklch(0.86 0 0)', classes: ['crypto'] },
    // prettier-ignore
    { id: 'kraken', name: 'Kraken', mono: 'KR', hue: 'oklch(0.62 0.16 285)', classes: ['crypto'] },
    // prettier-ignore
    { id: 'jupiter', name: 'Jupiter', mono: 'JU', hue: 'oklch(0.74 0.15 45)', classes: ['crypto'] },
    // prettier-ignore
    { id: 'alpaca', name: 'Alpaca', mono: 'AL', hue: 'oklch(0.78 0.13 85)', classes: ['equity'] },
    // prettier-ignore
    { id: 'bybit', name: 'Bybit', mono: 'BY', hue: 'oklch(0.78 0.16 75)', classes: ['crypto'] },
  ],
  brain: [
    { id: 'groq', name: 'Groq', mono: 'GQ', hue: 'oklch(0.64 0.2 25)' },
    { id: 'openai', name: 'OpenAI', mono: 'AI', hue: 'oklch(0.74 0.15 175)' },
    {
      id: 'anthropic',
      name: 'Anthropic',
      mono: 'AN',
      hue: 'oklch(0.72 0.13 45)',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      mono: 'OR',
      hue: 'oklch(0.7 0.14 258)',
    },
    { id: 'tavily', name: 'Tavily', mono: 'TV', hue: 'oklch(0.72 0.14 205)' },
    { id: 'exa', name: 'Exa', mono: 'EX', hue: 'oklch(0.7 0.16 320)' },
  ],
  asset: [
    // prettier-ignore
    { id: 'btc', name: 'BTC', mono: 'B', hue: 'oklch(0.78 0.15 65)', class: 'crypto' },
    // prettier-ignore
    { id: 'eth', name: 'ETH', mono: 'E', hue: 'oklch(0.7 0.12 285)', class: 'crypto' },
    // prettier-ignore
    { id: 'sol', name: 'SOL', mono: 'S', hue: 'oklch(0.72 0.16 320)', class: 'crypto' },
    // prettier-ignore
    { id: 'tsla', name: 'TSLA', mono: 'T', hue: 'oklch(0.64 0.2 25)', class: 'equity' },
    // prettier-ignore
    { id: 'aapl', name: 'AAPL', mono: 'A', hue: 'oklch(0.82 0 0)', class: 'equity' },
    // prettier-ignore
    { id: 'doge', name: 'DOGE', mono: 'D', hue: 'oklch(0.82 0.16 85)', class: 'crypto' },
  ],
}

/** Brand mark (monogram + hue) per claimable affiliate venue id. */
export const VENUE_BRAND: Record<string, { mono: string; hue: string }> = {
  okx: { mono: 'OK', hue: 'oklch(0.86 0 0)' },
  binance: { mono: 'BN', hue: 'oklch(0.82 0.16 85)' },
  bybit: { mono: 'BY', hue: 'oklch(0.78 0.16 75)' },
  bitvavo: { mono: 'BV', hue: 'oklch(0.66 0.17 258)' },
  mexc: { mono: 'MX', hue: 'oklch(0.62 0.17 258)' },
  kucoin: { mono: 'KC', hue: 'oklch(0.74 0.15 175)' },
  gate: { mono: 'GT', hue: 'oklch(0.64 0.2 25)' },
  bitget: { mono: 'BG', hue: 'oklch(0.72 0.14 205)' },
  coinbase: { mono: 'CB', hue: 'oklch(0.62 0.18 258)' },
  kraken: { mono: 'KR', hue: 'oklch(0.62 0.16 285)' },
  htx: { mono: 'HT', hue: 'oklch(0.64 0.2 25)' },
  cryptocom: { mono: 'CR', hue: 'oklch(0.6 0.16 258)' },
  bitfinex: { mono: 'BF', hue: 'oklch(0.72 0.16 150)' },
}

/**
 * Fine-print risk & liability disclaimer rendered in every footer (all pages).
 * Written to shield the project/contributors from liability and set out the
 * user's responsibilities under EU/US expectations for a self-custody,
 * source-available trading tool: not advice, no custody, risk warning + past-
 * performance, "as is"/no-warranty, verify-your-own-executions, and user-borne
 * tax/regulatory compliance. Not legal advice — have counsel review for your
 * jurisdiction before relying on it.
 */
export const LEGAL_DISCLAIMER = {
  heading: 'Risk disclosure & terms',
  body: [
    'Pairlens is source-available software, not a broker, exchange, custodian, or financial adviser. Nothing in or provided through the terminal is financial, investment, legal, or tax advice, or a solicitation or recommendation to buy or sell any asset. The terminal never takes custody of your funds, keys, or credentials and places no trades on your behalf; it connects directly from your own device to the third-party venues and services you choose.',
    'Trading and investing carry risk. The value of your investments may rise or fall, and losses of some or all of the capital you invest may occur; digital assets in particular are highly volatile and may be illiquid. Past performance is no guarantee of future results.',
    'The terminal is provided free of charge, under a source-available license, on an "as is" and "as available" basis, without warranties or guarantees of any kind, whether express or implied. It is in active development and may contain errors; always confirm independently, on the exchange you are using, that each order has been executed as intended. To the fullest extent permitted by applicable law, the authors and contributors accept no liability for any loss or damage arising from your use of the terminal.',
    'You are solely responsible for your use of the terminal, for meeting your own tax obligations, and for complying with all laws and regulations that apply to you. The terminal is not directed at, and may not be used by, any person in any jurisdiction where such use would be contrary to law or regulation.',
  ],
} as const

/**
 * Per-OS installers. The release workflow uploads version-less alias copies
 * of every installer (`Pairlens-macOS-AppleSilicon.dmg`, ...), so
 * `releases/latest/download/<alias>` is an evergreen direct-download URL:
 * one click saves the right build, and the link survives every version bump.
 * `href` is the build the big button downloads; `alts` are the same OS's
 * other formats, offered as small links next to it. `icon` maps to a bundled
 * glyph in `components/marketing/os/<icon>.svg`.
 */
export type OsIcon = 'apple' | 'windows' | 'linux'

/** Evergreen direct-download URL for a release-asset alias. */
export const downloadAsset = (alias: string) =>
  `${SITE.repo}/releases/latest/download/${alias}`

export const INSTALLERS: ReadonlyArray<{
  os: string
  icon: OsIcon
  tagline: string
  formats: ReadonlyArray<string>
  href: string
  alts: ReadonlyArray<{ label: string; href: string }>
}> = [
  {
    os: 'macOS',
    icon: 'apple',
    tagline: 'Apple silicon & Intel',
    formats: ['.dmg'],
    href: downloadAsset('Pairlens-macOS-AppleSilicon.dmg'),
    alts: [
      { label: 'Intel Mac', href: downloadAsset('Pairlens-macOS-Intel.dmg') },
    ],
  },
  {
    os: 'Windows',
    icon: 'windows',
    tagline: 'Windows 10 & 11 · 64-bit',
    formats: ['.exe', '.msi'],
    href: downloadAsset('Pairlens-Windows-Setup.exe'),
    alts: [
      { label: '.msi installer', href: downloadAsset('Pairlens-Windows.msi') },
    ],
  },
  {
    os: 'Linux',
    icon: 'linux',
    tagline: 'Debian · Ubuntu · Fedora',
    formats: ['.AppImage', '.deb', '.rpm'],
    href: downloadAsset('Pairlens-Linux.AppImage'),
    alts: [
      { label: '.deb', href: downloadAsset('Pairlens-Linux.deb') },
      { label: '.rpm', href: downloadAsset('Pairlens-Linux.rpm') },
    ],
  },
]

/**
 * The less-prominent "build from source" path on the install page. Mirrors the
 * repo's real dev flow: `dev:desktop` builds the Tauri app (needs the Rust
 * toolchain); plain `dev` serves the terminal in the browser without it.
 */
export const BUILD_FROM_SOURCE = {
  steps: [
    { cmd: `git clone ${SITE.repo}`, note: 'Clone the monorepo' },
    {
      cmd: 'cd pairlens && bun install',
      note: 'Install workspace dependencies',
    },
    {
      cmd: 'bun run dev:desktop',
      note: 'Launch the Tauri desktop app (requires the Rust toolchain)',
    },
  ],
  browserHint: {
    cmd: 'bun run dev',
    note: 'serves the terminal at localhost:3000, no Rust required',
  },
} as const
