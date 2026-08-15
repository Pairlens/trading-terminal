---
title: Trading
description: Connect a venue, place an order that goes straight to the exchange, and keep risk guardrails between you and a bad fill.
group: traders
order: 3
eyebrow: For traders
updated: 15 AUG 2026
readTime: 3 min read
---

Trading in Pairlens always follows the same path: your machine signs the
request with a key from your keychain and sends it straight to the venue. No
order routes through a Pairlens server, and no Pairlens fee is added to
anything.

## In this section

- **[Connect an exchange](/docs/connect-an-exchange).** Add keys the safe way,
  for exchanges, brokers, and on-chain wallets.
- **[Place an order](/docs/place-an-order).** The order ticket, market and
  limit orders, and bracket orders driven by a workflow.
- **[Risk guardrails](/docs/risk-guardrails).** Loss caps, position caps, trade
  caps, and the permissions the AI cannot grant itself.
- **[Paper trading](/docs/paper-trading).** Three different ways to rehearse
  without money at stake.
- **[DEX and wallets](/docs/dex-trading).** Swapping on-chain on Solana and
  five EVM chains.
- **[Prediction markets](/docs/prediction-markets).** Event contracts on Kalshi
  and Polymarket, priced in cents.
- **[Positions and portfolio](/docs/positions-and-portfolio).** Open orders,
  fills, balances, allocation, and the guardrail readout.
- **[Perpetual futures](/docs/cex-futures).** Leverage, reduce-only orders and
  contract sizing on three futures venues.

## The golden rule

The AI augments decisions but never overrides risk limits. Every order, whether
you placed it, a workflow fired it, a bot generated it, or the assistant
proposed it, is checked against your guardrails before it leaves the machine.
