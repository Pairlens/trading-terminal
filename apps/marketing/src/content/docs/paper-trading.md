---
title: Paper trading
description: Practising without money at risk. The three kinds of paper trading in Pairlens, what each one actually simulates, and the one thing none of them can model.
group: traders
parent: trading
order: 4
eyebrow: For traders
updated: 22 AUG 2026
readTime: 4 min read
---

## Why rehearse at all

Trading has two separate skills, and paper trading only teaches one of them.

The first is mechanical: knowing what a market order does to your fill, where a
position shows up afterwards, which button closes it, whether your key has the
right permissions, and what happens when you fat-finger a size. Practice
teaches this perfectly, and getting it wrong with real money is expensive and
completely avoidable.

The second is emotional: staying disciplined when it is your money. Paper
trading cannot teach that, because nothing is at stake. Traders who are
brilliant on paper and reckless live are not a myth.

So use paper trading for the mechanics, then start live with sizes small enough
that the emotions stay quiet.

"Paper" means three different things in Pairlens depending on where you are, and
they simulate different amounts of reality.

## 1. A paper credential

When you connect an exchange, the wizard asks for a trading mode. **Paper**
points at that exchange's own practice environment, using demo keys you generate
on the venue's own site.

This is the most faithful rehearsal available, because it is barely a
simulation. Orders are really submitted, the exchange really matches them, and
you find out whether your key permissions, minimum order sizes and decimal
precision are right before real money is involved.

Alpaca is the easiest place to start: free practice keys in minutes. Kalshi has
a practice environment too, and so do Binance, ByBit, OKX and Kraken for
[perpetual futures](/docs/cex-futures).

Not every venue offers one. On-chain wallets, Polymarket and KuCoin Futures are
live only, because the contracts being signed against are the real ones. Asking
for a paper credential there is refused with a message rather than quietly sent
to production.

The ticket shows a **PAPER** badge on the submit button whenever the selected
account is a practice one.

## 2. Bot paper mode

A [bot](/docs/bots) starts in paper mode and stays there until you explicitly
arm it. In paper mode its fills are simulated on your machine against the same
closed candles the strategy sees, using the fee and slippage you declared.

Nothing reaches the exchange. That is the point: you can leave a bot running for
a week, watch its trade log and its running profit and loss fill in, and decide
from evidence rather than from a backtest curve that already knows the answer.

Going live is a separate, deliberate gate. You type **ARM LIVE** to confirm.

## 3. Assistant paper trades

The AI's order proposals default to paper on the confirmation card, and
**Settings → Risk Management** lets you auto-approve practice trades so the
assistant can act without interrupting you. Live auto-approval is a separate
grant, per exchange, and you can only give it from a live order card.

## Which to use

| You want to test                       | Use                                           |
| -------------------------------------- | --------------------------------------------- |
| Whether your keys and sizing are right | A paper credential                            |
| Whether a strategy makes money         | A bot in paper mode                           |
| Whether you trust the AI's suggestions | Assistant paper trades                        |
| Whether a setup would have worked      | [Backtesting](/docs/strategies-and-backtests) |
| What a setup felt like as it happened  | [Bar replay](/docs/chart-panel#bar-replay)    |

## The one thing none of them simulate

**Your own market impact.** Practice fills assume the market absorbs your order
without noticing. If your live size is large enough to move the book, your real
fill will be worse than your practice one, and on a thin market it can be much
worse.

Slippage settings let you model this deliberately rather than discover it. And
[the order book](/docs/order-book) tells you, before you trade, whether your
size is big enough for this to matter.
