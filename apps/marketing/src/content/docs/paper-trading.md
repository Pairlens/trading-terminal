---
title: Paper trading
description: Paper trading in Pairlens, three ways, using exchange demo environments, bot paper mode, and co-pilot paper trades. What each simulates and which to use.
group: traders
parent: trading
order: 4
eyebrow: For traders
updated: AUG 2026
readTime: 3 min read
---

"Paper" means three different things in Pairlens depending on where you are.
They are worth telling apart, because they simulate different amounts of
reality.

## 1. A paper credential

When you connect an exchange, the wizard asks for a trading mode. Choosing
**Paper** points the credential at that exchange's own demo environment, using
demo keys you generate on the venue's site.

This is the most faithful rehearsal available. Orders are really submitted, the
exchange really matches them, and you find out whether your key permissions,
symbol precision, and minimum order sizes are right before real money is
involved. Alpaca is the easiest place to start: free paper keys in minutes.
Kalshi has a demo environment too, so
[event contracts](/docs/prediction-markets) can be rehearsed the same way, and
so do Binance Futures and Kraken Futures for
[perpetuals](/docs/cex-futures).

Not every venue offers a demo environment. Where one exists, Pairlens tells you
which endpoint the mode uses. On-chain wallets, Polymarket, and KuCoin Futures
are live only, because the contracts being signed against are the real ones. A
paper credential on one of those is refused with a message rather than quietly
routed to production.

The ticket shows a **PAPER** badge on the submit button whenever the selected
account is a paper credential.

## 2. Bot paper mode

A [bot](/docs/bots) starts in paper mode and stays there until you explicitly
arm it for live trading. In paper mode the bot's fills are simulated locally
against the same closed candles the strategy sees, using the fee and slippage
your strategy declared.

Nothing reaches the venue. That is the point: you can leave a bot running for a
week, watch its trade ledger and realized P&L fill in, and decide from evidence
rather than from a backtest curve.

Going live is a separate, deliberate gate. You type **ARM LIVE** to confirm.

## 3. Co-pilot paper trades

The AI's order proposals default to paper on the confirmation card, and
**Settings → Risk Management** lets you auto-approve paper trades so the
co-pilot can act without interrupting you. Live auto-approval is a separate
grant, per exchange, that you can only give from a live order card.

## Which to use

| You want to test                       | Use                                           |
| -------------------------------------- | --------------------------------------------- |
| Whether your keys and sizing are right | A paper credential                            |
| Whether a strategy makes money         | A bot in paper mode                           |
| Whether you trust the AI's suggestions | Co-pilot paper trades                         |
| Whether a setup would have worked      | [Backtesting](/docs/strategies-and-backtests) |

## What is not simulated

Paper fills, whether from a venue's demo environment or a bot, do not model
your own market impact. If your live size would move the book, expect the real
fill to be worse. Slippage settings help you model this deliberately rather
than being surprised by it.
