---
title: Connectors
description: Every exchange connector in the Pairlens crypto trading terminal, 14 spot CEXs, three perpetual futures venues, Alpaca for US equities, Kalshi and Polymarket for event contracts, and DEX aggregators.
group: builders
order: 4
eyebrow: For builders
updated: AUG 2026
readTime: 4 min read
---

Market connectors are plugins that stream data and route orders directly
between your machine and the venue. Pairlens ships with connectors for major
centralized exchanges, three perpetual futures venues, a US equities broker,
two prediction markets, and DEX aggregators on Solana and EVM chains.

## Bundled connectors

**Centralized exchanges (14).** OKX, Binance, ByBit, Bitvavo, MEXC, KuCoin,
Gate, Bitget, Coinbase, Kraken, HTX, Crypto.com, Bitfinex, Upbit. Spot only.

**Perpetual futures (3).** Binance Futures, KuCoin Futures, Kraken Futures, for
linear perpetual swaps. See [perpetual futures](/docs/cex-futures).

**Brokers.** Alpaca, for US equities and ETFs.

**Prediction markets.** Kalshi and Polymarket, for event contracts. See
[prediction markets](/docs/prediction-markets).

**DEX.** Jupiter on Solana, plus an EVM DEX connector spanning Ethereum, Base,
Arbitrum, BNB Chain, and Polygon through the KyberSwap aggregator.

**DEX data.** GeckoTerminal as primary and DexPaprika as fallback, both
read-only.

All 20 venues work in the desktop app. In a browser, 12 of them do: Coinbase,
Gate, KuCoin, MEXC, Bitfinex, Kalshi, KuCoin Futures, and Kraken Futures serve
REST without CORS headers, so they require the desktop app and refuse cleanly
with a clear message rather than presenting a dead chart. Binance Futures is
the one perpetual venue a browser can reach.

Every CEX connector is built from one shared factory,
`createCexConnectorPlugin`, which is a base class rather than a plugin itself.
Upbit is the exception on trigger orders: it has none, so stop-loss steps are
refused there rather than faked.

The three futures connectors ride a sibling factory,
`createCcxtFuturesConnectorPlugin`, which reuses the same shell but forks
symbol mapping, the market table and order building. A perpetual symbol carries
a settle currency the spot mapper would drop, and a perpetual order is sized in
contracts rather than in the base asset.

The two prediction connectors ride a separate runtime with the same shape.
Event contracts have no base and quote asset, no spot symbol, and a price that
is a probability rather than an amount of money, so they get their own bridge
instead of bending the spot one.

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
