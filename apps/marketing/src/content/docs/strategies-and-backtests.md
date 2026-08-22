---
title: Strategies and backtesting
description: Turn an indicator into something that trades, replay it against history with next-bar fills, and read the report honestly.
group: traders
parent: python-scripts
order: 3
eyebrow: For traders
updated: 22 AUG 2026
readTime: 6 min read
---

A strategy is an indicator that also says when to be in the market. Swap
`indicator(` for `strategy(`, return entry and exit signals alongside your
plots, and the workbench replays them into an equity curve, a trade ledger, and
a summary. Then the same script can be deployed as a [bot](/docs/bots).

## The smallest strategy

```python
from pairlens import strategy, series, marker
from pairlens.ta import ema, crossover, crossunder

meta = strategy(
    title='EMA Cross',
    series=[series.line('fast'), series.line('slow')],
    markers=[marker.buy('enter_long'), marker.sell('enter_short')],
    initial_capital=10000.0,
    position_size=1.0,
    fee=0.001,
    stop_loss=0.03,
    take_profit=0.06,
    min_bars=60,
)


def compute(ctx):
    fast, slow = ema(ctx.close, 21), ema(ctx.close, 55)
    return {
        'fast': fast,
        'slow': slow,
        'enter_long': crossover(fast, slow),
        'enter_short': crossunder(fast, slow),
        'position': ...,  # see below
    }
```

## Signalling position

You can express intent four ways, and the backtester reads whichever you
provide:

| Key        | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `position` | Target position per bar: -1 short, 0 flat, +1 long. Wins over everything else  |
| `entries`  | Nonzero means enter. Direction comes from `long` / `short`, defaulting to long |
| `exits`    | Nonzero means flatten                                                          |
| `long`     | Nonzero means be long on this bar                                              |
| `short`    | Nonzero means be short on this bar                                             |

`position` is the clearest when your strategy always knows what it wants to
hold. `entries` and `exits` are the clearest when your strategy thinks in
events. Pick one style and stay in it.

Any array that is missing or shorter than the window reads as zero, so a script
that only fills part of the window degrades to "no signal" instead of throwing.

## Protective exits

Declare them in `meta`, not in `compute()`:

```python
stop_loss=0.03,       # 3% below entry
take_profit=0.06,     # 6% above entry
trailing_stop=0.02,   # 2% off the best price reached
max_bars=48,          # force out after 48 bars
```

All four are fractions of the entry price. They are evaluated per bar against
the held position by `@pairlens/bot-engine/risk`, the exact module a live bot
runs. The backtester does not implement its own stop logic. That is deliberate:
a tester with its own stop would eventually disagree with the bot it is meant
to predict, and the disagreement would first show up on the bar where real
money was at stake.

Write a strategy that has never seen `stop_loss=` and you will meet stops for
the first time with real money on the table. Declare them early.

## The rule that makes the numbers real

**A signal on bar `i` fills at the open of bar `i + 1`.**

Filling at the signal bar's close would let the strategy trade on information
it could not have had, which turns every backtest into fiction. A consequence:
a signal on the very last bar never fills.

Fees and slippage are charged on both legs, in the direction that hurts you.

## Reading the report

Run the script and the **Backtest** panel appears next to the preview chart.

| Metric             | What it tells you                                                  |
| ------------------ | ------------------------------------------------------------------ |
| **Net profit**     | Realized plus unrealized, after fees                               |
| **Buy and hold**   | What doing nothing would have returned over the same window        |
| **Trades**         | Closed round trips, with open positions counted separately         |
| **Win rate**       | Share of closed trades in profit                                   |
| **Profit factor**  | Gross wins divided by gross losses. Below 1.0 means it loses money |
| **Max drawdown**   | The worst peak-to-trough fall in equity                            |
| **Sharpe**         | Return per unit of volatility                                      |
| **Time in market** | Fraction of bars holding a position                                |
| **Fees paid**      | The total your broker made from you                                |
| **Avg bars held**  | How long a typical trade lasts                                     |

Beating buy and hold is the bar that matters in a bull market. A strategy with
a 70% win rate and a profit factor of 0.9 is losing money slowly, and the win
rate is why it feels good while doing it.

## The trade log

Every round trip is listed with direction, entry, exit, size, P&L, and an
**exit reason**:

`signal` (the strategy changed its mind), `stop-loss`, `take-profit`,
`trailing-stop`, `max-bars`, or `open` for the position that ran out of data
rather than out of reasons.

A live bot's event log uses the same words for the same events, so a tester row
and a bot row read identically.

## How to not fool yourself

**Vary the window.** Change the history depth and the pair. A strategy that
only works on 2,000 bars of one symbol found a pattern in that symbol, not in
markets.

**Watch the trade count.** Twelve trades is a story, not a sample.

**Change one parameter at a time.** The parameter panel makes sweeping easy,
which also makes overfitting easy. If the equity curve collapses when a length
goes from 20 to 21, you have fitted noise.

**Look at `lookahead`.** If you used `align(..., lookahead=True)` anywhere, the
backtest is reading the future and the number is meaningless.

**Then paper trade it.** A [bot](/docs/bots) in paper mode running forward on
live data is the only test that cannot be overfitted, because the data has not
happened yet.

## From strategy to bot

Once the numbers hold up, deploy it. The workbench header shows a **Deploy as
bot** button on any strategy script that has run: one click opens the bot
create flow with that script preselected. Pick a market and timeframe, set
sizing and guards, and it starts on paper. Going live is a separate, explicit
gate. The same flow is reachable from **Bots → New bot**, where your
strategies sit next to the ready-made ones. See [bots](/docs/bots).
