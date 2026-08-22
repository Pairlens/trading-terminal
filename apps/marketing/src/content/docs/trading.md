---
title: Trading
description: How an order actually reaches an exchange, why nothing routes through a Pairlens server, and where to go for each kind of market.
group: traders
order: 3
eyebrow: For traders
updated: 22 AUG 2026
readTime: 3 min read
---

## What happens when you press Buy

You fill in an order. Your machine checks it against your own risk limits,
signs it with a key stored on your device, and sends it to the exchange. The
exchange matches it against somebody else's order and tells you what you got.

That is the whole path. No Pairlens server sees the order, no Pairlens fee is
added, and nothing sits between you and the venue that could delay or alter it.
Your funds stay wherever they already are: on the exchange, or in your own
wallet.

## Before your first real order

Three things, in this order:

1. **[Connect an exchange](/docs/connect-an-exchange)** in paper mode first.
2. **[Set your risk guardrails](/docs/risk-guardrails).** A daily loss cap and a
   position cap take two minutes and are the difference between a bad trade and
   a bad month.
3. **[Place a practice order](/docs/paper-trading)** and watch what happens to
   it. Learn where the fill shows up, where the position shows up, and how to
   close it.

## In this section

- **[Connect an exchange](/docs/connect-an-exchange).** Adding keys the safe
  way, for exchanges, brokers and wallets.
- **[Place an order](/docs/place-an-order).** Market versus limit, sizing, and
  bracket orders.
- **[Risk guardrails](/docs/risk-guardrails).** Loss caps, position caps, trade
  caps, and what the AI is not allowed to do.
- **[Paper trading](/docs/paper-trading).** Three ways to rehearse with no money
  at stake.
- **[Positions and portfolio](/docs/positions-and-portfolio).** What you hold,
  what is still working, and what it is worth.

And then, per market type:

- **[Perpetual futures](/docs/cex-futures).** Leverage, funding and liquidation.
- **[US equities](/docs/equities).** Stocks and ETFs, with market hours.
- **[DEX and wallets](/docs/dex-trading).** Swapping on-chain from your own
  wallet.
- **[Memecoins](/docs/memecoins).** The launchpad end of on-chain trading.
- **[Prediction markets](/docs/prediction-markets).** Contracts that pay out on
  an event.
- **[NFT collections](/docs/nft-trading).** A collection traded as a market.

## The golden rule

Every order is checked against your guardrails before it leaves your machine.
That is true whether you typed it, a workflow fired it, a bot generated it, or
the AI assistant proposed it.

The assistant can analyse, warn and propose. It cannot raise your limits, and it
cannot place a live order you did not approve.
