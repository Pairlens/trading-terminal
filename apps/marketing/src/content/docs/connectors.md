---
title: Connectors
description: Every exchange connector in the Pairlens crypto trading terminal, 14 spot CEXs, five perpetual futures venues, Alpaca for US equities, Kalshi and Polymarket for event contracts, OpenSea for NFT collections, DEX aggregators, and a cross-chain bridge.
group: builders
order: 4
eyebrow: For builders
updated: 22 AUG 2026
readTime: 5 min read
---

**Trading rather than building?** The short version is that all 23 venues work
in the desktop app and 15 of them work in a browser, and each asset class doc
lists what its own venues support. This page is the developer's view.

Market connectors are plugins that stream data and route orders directly
between your machine and the venue. Pairlens ships with connectors for major
centralized exchanges, five perpetual futures venues, a US equities broker,
two prediction markets, an NFT marketplace, DEX aggregators on Solana and EVM
chains, and a cross-chain bridge.

## Bundled connectors

**Centralized exchanges (14).** OKX, Binance, ByBit, Bitvavo, MEXC, KuCoin,
Gate, Bitget, Coinbase, Kraken, HTX, Crypto.com, Bitfinex, Upbit. Spot only.

**Perpetual futures (5).** Binance Futures, ByBit Futures, OKX Futures, KuCoin
Futures, Kraken Futures, for linear perpetual swaps. See
[perpetual futures](/docs/cex-futures).

**Brokers.** Alpaca, for US equities and ETFs. See
[US equities](/docs/equities).

**Prediction markets.** Kalshi and Polymarket, for event contracts. See
[prediction markets](/docs/prediction-markets).

**NFTs.** OpenSea, for collection data and Seaport order execution. It is the
one connector serving both halves of its asset class, because it is the only
NFT venue that answers market data and accepts a signed order over an API a
browser can call. Reads span Ethereum, Base, Polygon, Arbitrum, Optimism and
Solana; orders are signed on Ethereum and Base only. Bring your own free
OpenSea key. See [NFT collections](/docs/nft-trading).

**DEX.** Jupiter on Solana, plus an EVM DEX connector spanning Ethereum, Base,
Arbitrum, BNB Chain, and Polygon through the KyberSwap aggregator.

**Bridge.** LI.FI, for moving one asset between the five EVM chains and Solana.
It quotes routes and tracks transfers as public reads, and signs with the wallets
the DEX connectors already use: the EVM key for an EVM leg, the Solana key for a
Solana one. See [DEX and wallets](/docs/dex-trading#bridging).

**Solana RPC.** Helius, answering the `rpc:solana` capability that every Solana
read and send in the terminal goes through. Bring your own key, or run keyless
against the public node.

**DEX data.** GeckoTerminal as primary and DexPaprika as fallback, both
read-only.

**NFT data.** CoinGecko NFT, keyless and read-only. It answers a collection's
floor, volume, supply and holders on every chain, and refuses the book, the
tape, items, traits and history rather than returning empty ones, so a fresh
install shows a real floor before anything is configured.

All 23 venues work in the desktop app. In a browser, 15 of them do: Coinbase,
Gate, KuCoin, MEXC, Bitfinex, Kalshi, KuCoin Futures and Kraken Futures serve
REST without CORS headers, so they require the desktop app and refuse cleanly
with a typed error rather than presenting a dead chart. Binance, ByBit and
OKX futures all reach a browser, so three of the five perpetual venues trade
from the hosted terminal.

Every CEX connector is built from one shared factory,
`createCexConnectorPlugin`, which is a base class rather than a plugin itself.
Upbit is the exception on trigger orders: it has none, so stop-loss steps are
refused there rather than faked.

The five futures connectors ride a sibling factory,
`createCcxtFuturesConnectorPlugin`, which reuses the same shell but forks
symbol mapping, the market table and order building. A perpetual symbol carries
a settle currency the spot mapper would drop, and a perpetual order is sized in
contracts rather than in the base asset.

The two prediction connectors ride a separate runtime with the same shape.
Event contracts have no base and quote asset, no spot symbol, and a price that
is a probability rather than an amount of money, so they get their own bridge
instead of bending the spot one.

OpenSea rides neither. An NFT read is a REST snapshot on a timer rather than a
stream, sizes are item counts, and an order is an on-chain Seaport transaction
signed by the user's own wallet key rather than an HMAC over a request body. It
is closer in shape to the DEX connectors than to any CEX.

## Regional routing

Several venues serve different endpoints by region, and some are unavailable in
some countries. Connectors read the user's country setting and route
accordingly. OKX, for example, sends US and Australian users to `us.okx.com`
and EU users to `eea.okx.com`. Where a venue is blocked in the user's region,
the terminal says so explicitly rather than failing opaquely.

## Build your own

Any developer can add a venue by implementing the
[`MarketAdapter`](/docs/marketadapter-api) interface and
[publishing to the registry](/docs/publish-to-registry). Third-party connectors
run sandboxed with an explicit network allowlist and signed packages.

Start from `createCexConnectorPlugin` if your venue looks like a standard CEX.
It handles the parts that are the same everywhere, so what you write is the
parts that are not.
