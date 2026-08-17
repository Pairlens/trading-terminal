---
title: DEX and wallets
description: Swap on-chain from the same crypto trading terminal, on Solana via Jupiter and five EVM chains via KyberSwap, with pool stats and a quoted route in place of a fabricated order book, and your private key stored only on your device.
group: traders
parent: trading
order: 5
eyebrow: For traders
updated: 17 AUG 2026
readTime: 9 min read
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
is stored exactly like an exchange API key: in the OS keychain on desktop, in
your encrypted vault in a browser, and never on a Pairlens server.

The five EVM chains share one wallet entry, because one EVM private key
controls the same address on all of them. Solana needs its own.

Import a key you are comfortable putting on a trading machine. A hot wallet
funded with what you intend to trade is the sane setup. Do not import the key
that holds everything you own.

## Finding a pool

The **DEX** tab on Discovery is chain first, then pool.

**Chains** is the rail down the left: every chain the terminal knows, with gas,
liquidity and a day's volume beside it. Chains you have no connector for still
appear, dimmed, with an install link, because a chain that is simply absent
looks like a gap in the product while a dimmed row is an answer. The volume
column says what it covers: DexPaprika publishes chain-wide totals and is
reachable from the desktop app, and in a browser the same figure can only be
summed over the pools the provider sampled, so the subtitle switches to say so
rather than passing a top-20 sum off as a chain's whole day.

**Pool Map** ranks the selected chain's pools by turnover, a day's volume
against the liquidity backing it, not by volume alone. Volume alone puts the
deepest pools on top, which is where they always are and says nothing;
turnover is what separates a pool actually trading from a pool merely large. A
click selects, a double click opens the pair, and both pin the base token's
contract address rather than its ticker, because a pool map is exactly where
two tokens with the same symbol turn up next to each other.

**Liquidity Flow** charts net taker flow through the selected pool in
five-minute buckets, with the biggest single swaps beside it as evidence. The
name is careful: neither provider has a liquidity-flow endpoint, so nothing
here measures deposits or withdrawals. What it measures is the money that
crossed the pool, buy notional minus sell notional, which is the number that
moves price.

**Pool Detail** is the selected pool at a glance, one click from its chart and
a swap. It shows only what the provider actually published, so turnover
collapses without a liquidity figure and the fee tier collapses on a venue that
labels none, rather than filling the space with dashes.

## What replaces the order book

The on-chain pair layout ships with no order book and no depth curve, and that
is a decision rather than an omission. The data providers synthesize a bid and
an ask around the pool price, so a book drawn from them would be fabricated
depth. Three panels do the job an AMM can actually support.

**Pool Stats** sits under the chart: value locked, both reserves where a
provider publishes them, a day's volume, the fee tier, and price impact at
$1,000, $10,000 and $100,000. Those impact rows are live aggregator quotes at
each notional, not reserve math, which is why one can beat the pool's own
curve: the router may split across pools this panel never read.

**On-chain Trades** is the tape, every swap through the pool as it confirms.
The counterparty column is an address and nothing else. No wallet-labelling
source is connected, and a badge reading "market maker" would be a guess about
who is on the other side of your trade, so the address links to the chain's
explorer and you can decide for yourself.

**Route** shows how the aggregator would split a swap across pools, so the
slippage figure on the ticket has a stated cause. It quotes a probe size of
$1,000, $10,000 or $100,000, labelled as such, rather than reading the ticket's
own amount. Everything on it is a real quote through the same endpoint an order
would take, and nothing on that path signs anything.

## The same token on every chain

On the **Cross-Chain** board, the **Chain Ladder** prices the token on every
chain a connector reaches and ranks by what lands: output value minus the
aggregator's own gas estimate. That last column is the point. The deepest pool
is routinely not the best fill, since Ethereum wins on impact and loses on gas
below a few hundred thousand dollars and the ladder flips above that, and
comparing raw quotes would hide exactly that.

Cross-chain identity is the honest limit, and the ladder states it. There is no
canonical mapping from a token on one chain to "the same" token on another,
because bridged, wrapped and native versions are different contracts. A row is
quoted only where that chain's own resolver finds a pool for the pair, and a
chain where it does not is drawn dimmed and says so rather than being quietly
dropped.

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
chart streaming over a WebSocket. Pairlens paces its own requests to stay inside
GeckoTerminal's free tier, so opening a board across five chains queues instead
of tripping the limit. When a provider throttles anyway, the pane says it is
rate limited and keeps retrying: a limit is never reported as a pair the venue
does not carry.

**Providers disagree on what they publish.** GeckoTerminal reports value locked
as one USD figure and nothing per side; DexPaprika reports both reserves and
the buy and sell split. Every field a provider does not publish reads as absent
rather than as zero, because halving a USD figure to fake two reserves would be
inventing a constant-product pool that a concentrated-liquidity venue is not.

## What is not here yet

The LP side of a pool is a frame, not a feature. **LP Position**, **Fee
Accrual** and **Manage Liquidity** ship as panels and the **Liquidity** board
arranges them, but no DEX connector can read a wallet's pool position and none
exposes a liquidity action, so all three say what they would show and name the
source that would fill them. A range, a time-in-range percentage and an
impermanent-loss figure are numbers people close real positions on, and an
invented one is worse than an empty pane.

Bridging is the same story. **Bridge Route** and **In Flight** are frames: the
DEX connectors route within one chain, KyberSwap across a chain's pools and
Jupiter across Solana's, and nothing in the app quotes a cross-chain transfer
or watches one confirm. What is answerable today is one panel away, in the
chain ladder.

## Guardrails still apply

[Risk guardrails](/docs/risk-guardrails) are enforced on on-chain orders the
same as anywhere else. Position caps, trade caps, and loss caps do not care
which venue you are hitting.
