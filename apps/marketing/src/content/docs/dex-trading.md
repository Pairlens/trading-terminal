---
title: DEX and wallets
description: Swap on-chain from the same terminal, on Solana and five EVM chains, with your private key in the OS keychain and routing across every DEX on the chain.
group: traders
parent: trading
order: 5
eyebrow: For traders
updated: AUG 2026
readTime: 4 min read
---

On-chain markets work like any other market in Pairlens. Same chart, same
ticket, same guardrails. What changes is where the order goes and what secret
signs it.

## Supported chains

**Solana**, routed through Jupiter.

**Ethereum, Base, Arbitrum, BNB Chain, and Polygon**, each a separate market
routed through the KyberSwap aggregator, which quotes across every DEX on that
chain and picks the best path.

Price and liquidity data for on-chain pairs comes from read-only data
providers, GeckoTerminal first with DexPaprika as a fallback.

## Adding a wallet

**Accounts → Connect Account → Crypto Wallet.** You import a private key, which
goes into the OS keychain exactly like an exchange API key and never reaches a
Pairlens server.

The five EVM chains share one wallet entry, because one EVM private key
controls the same address on all of them. Solana needs its own.

Import a key you are comfortable putting on a trading machine. A hot wallet
funded with what you intend to trade is the sane setup. Do not import the key
that holds everything you own.

## Placing a swap

Select an on-chain pair and the ticket adjusts:

**Market swaps** get a **Slippage** row: 0.1%, 0.5%, 1%, and 3%. Tight slippage
protects you from a bad fill but gets your transaction reverted more often on a
volatile pair. On a thin memecoin, 0.1% will simply fail.

**Limit orders** appear where the chain supports resting orders. They fill at
your price, so there is no slippage tolerance to set.

**No Workflow tab.** Bracket orders need exchange-native trigger orders, which
on-chain venues do not provide.

The submit button carries an **ON-CHAIN** badge and holds for the full live
duration, because an on-chain swap is irreversible the moment it lands.

## What is different from a CEX

**Gas.** Every EVM swap costs the chain's native token. Keep some ETH, BNB, or
POL in the wallet or the transaction cannot be sent.

**Finality, not fills.** A swap either lands or reverts. There is no partial
fill and no resting state to cancel for a market swap.

**Token identity matters.** Anyone can mint a token called anything. Pairlens
pins the addresses of well-known tokens so you get the real one, but a pair you
searched up yourself deserves a look at its contract address before you trade
it.

**Data-provider rate limits.** On-chain price data comes from public APIs with
request limits, so a page full of on-chain panels updates less often than a CEX
chart streaming over a WebSocket.

## Guardrails still apply

[Risk guardrails](/docs/risk-guardrails) are enforced on on-chain orders the
same as anywhere else. Position caps, trade caps, and loss caps do not care
which venue you are hitting.
