---
title: Connectors
description: Every exchange connector in the Pairlens crypto trading terminal, 14 CEXs, Alpaca for US equities, and DEX aggregators, plus how to build your own.
group: builders
order: 4
eyebrow: For builders
updated: AUG 2026
readTime: 2 min read
---

Market connectors are plugins that stream data and route orders directly
between your machine and the venue. Pairlens ships with connectors for major
centralized exchanges, a US equities broker, and DEX aggregators on Solana and
EVM chains.

## Bundled connectors

**Centralized exchanges (14).** OKX, Binance, ByBit, Bitvavo, MEXC, KuCoin,
Gate, Bitget, Coinbase, Kraken, HTX, Crypto.com, Bitfinex, Upbit.

**Brokers.** Alpaca, for US equities and ETFs.

**DEX.** Jupiter on Solana, plus an EVM DEX connector spanning Ethereum, Base,
Arbitrum, BNB Chain, and Polygon through the KyberSwap aggregator.

**DEX data.** GeckoTerminal as primary and DexPaprika as fallback, both
read-only.

All 15 venues work in the desktop app. In a browser, 11 of them do: Coinbase,
Gate, KuCoin, and MEXC serve REST without CORS headers and stream no candle
history, so they require the desktop app and refuse cleanly with a clear
message rather than presenting a dead chart.

Most CEX connectors are built from one shared factory,
`createCexConnectorPlugin`, which is a base class rather than a plugin itself.
Upbit is the exception on trigger orders: it has none, so stop-loss steps are
refused there rather than faked.

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
