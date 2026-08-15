---
title: Bots
description: Deploy a Python strategy to a market and let it trade. Sizing, guards, paper mode, the live-arming gate, and the honest limits of running on your own machine.
group: traders
order: 6
eyebrow: For traders
updated: 15 AUG 2026
readTime: 7 min read
---

A bot is one of your [strategy scripts](/docs/strategies-and-backtests)
deployed to a market. It evaluates on that pair's closed candles at the
timeframe you choose, and acts on the entries and exits the script produces.

Open **Bots** in the left nav.

## Bots run on your machine

This is the first thing to understand, and it cuts both ways.

Your strategies execute in Pairlens, on this computer, not on a server we
operate. That is what keeps your keys and your logic yours. The tradeoff is
real: quit Pairlens or let the machine sleep and your bots stop with it, and an
open position is left unwatched until you come back.

The Bots page has a **Keep this computer awake** toggle that blocks idle sleep
while a bot is on. It is desktop-only, because a browser tab cannot make that
promise. Turn it on before you leave a bot running.

If your strategy declares a `stop_loss`, and your venue supports exchange-native
trigger orders, that protection can rest at the exchange and survive the app
closing. Everything else needs Pairlens running.

## Creating a bot

Four steps.

### 1. Strategy

Pick the script the bot will run. The step offers three ways in, so it never
dead-ends:

- **Your strategies.** Scripts declaring `meta = strategy(...)`, because only
  those say when to enter, when to exit, and how much to commit. An
  `indicator(...)` script draws and nothing more, so there is nothing for a
  bot to execute. Scripts you have not run yet are listed but not selectable:
  run them once in the workbench first.
- **Ready-made strategies.** The shipped strategies (EMA cross, RSI reversion,
  breakout) can be created right here. Picking one writes the script into your
  workbench and selects it, code and all, yours to edit afterwards.
- **Write your own.** The link at the bottom opens
  [Indicators & Strategies](/docs/strategies-and-backtests), the Python
  workbench where strategies are written. A strategy script there has a
  **Deploy as bot** button that lands back in this dialog with the script
  preselected.

There is also a fourth way that skips the dialog entirely: the assistant, one
tap away on the sparkle button above the bot list or on its dock from any
page. "Deploy my breakout strategy on OKX BTC-USDT, 1h" creates the bot in one
exchange.

It can start further back than that. A bot is a strategy on a market, so
asking for one you have no script for ("a bot that buys pullbacks in an
uptrend on the 4h") gets both: it writes the strategy, validates it, backtests
it, and deploys the result. When the code needs real work it opens the
workbench and keeps going there, in the same conversation.

Anything it creates arrives in paper mode and switched off, exactly as if you
had walked the steps yourself, and it can never arm a bot. It can also rename
bots, tune strategy params, and set guards on your behalf when you ask, and it
asks you back when a choice is yours to make. See
[Build with AI](/docs/python-scripts#build-with-ai) for how the assistant
works and which AI providers it uses.

### 2. Market

Choose a venue, a pair, and a timeframe. The bot evaluates on that pair's
closed candles at that timeframe. A 1h bot makes at most one decision an hour.

### 3. Sizing

How much the bot commits when the strategy signals an entry:

| Mode                   | Meaning                              |
| ---------------------- | ------------------------------------ |
| **Percent of equity**  | A share of the account, per entry    |
| **Fixed quote amount** | A constant amount in the quote asset |
| **Fixed base amount**  | A constant amount in the base asset  |

### 4. Guards

Limits enforced outside the strategy, by the bot runtime. Leave any blank for
no limit.

| Guard                    | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| **Daily loss cap (%)**   | Stops the bot once today's realized losses reach this share of equity |
| **Max trades per day**   | Stops the bot after this many entries in a rolling 24 hours           |
| **Max position (quote)** | Never hold more than this notional                                    |
| **Cooldown bars**        | Wait this many closed bars after a losing exit before re-entering     |
| **Max losing streak**    | Stops the bot after this many losing trades back to back              |

Cooldown bars and max losing streak are the two that most often turn a
theoretically profitable strategy into a survivable one. A strategy that is
wrong is usually wrong several times in a row.

These are on top of your account-wide
[risk guardrails](/docs/risk-guardrails), not instead of them.

## Paper first

A new bot starts in **Paper** mode. Fills are simulated locally against the
same closed candles the strategy sees, using the fee and slippage the script
declared. Nothing reaches the venue.

Leave it running for a week. The trade ledger and event log fill in, the P&L
chart traces the running total as each round trip closes, and you get to judge
the strategy on data that had not happened when you wrote it.

## Going live

Flip **Live trading** in the bot's settings and an arming dialog appears. It
tells you which venue and which credential will be used, states plainly that
the bot will place real orders from now on with no confirmation per trade, and
repeats the machine caveat.

Then you type **ARM LIVE** to confirm.

If no API credential is stored for that venue, the dialog says so and sends you
to Accounts rather than letting you arm something that cannot trade.

Turning live trading back off stops the bot.

## Watching a bot

The bot detail view has three tabs plus a header.

**Header.** Status (Running, Warming up, Stopped, Error, or Halted by a guard),
current position with unrealized and realized P&L, last bar, last price, venue,
strategy, and timeframe.

**Trades.** The ledger: side, size, entry, exit, exit reason, mode, and P&L.
Above it, a summary strip with closed trade count, win rate, value traded,
average per trade, best, and worst.

**Events.** Signals, orders, and guard blocks, timestamped. When a bot halts,
this is where it says which guard stopped it.

**Settings.** Strategy inputs, sizing, guards, the live toggle, and rename or
delete.

Three charts sit alongside: realized P&L over time, value traded, and trades
per day.

## Halted, and re-arming

When a guard trips, the bot halts rather than quietly continuing. Its status
reads **Halted by a guard** and the event log names the guard. Fix the cause,
or accept it, then **Re-arm** to resume.

That is a deliberate speed bump. A bot that trips its losing-streak guard and
restarts itself is not a guard, it is a delay.

## Managing several

The sidebar lists every bot with its mode and status, and the header summarises
how many are deployed and how many are on. **Stop all** kills every running bot
at once, which is the button you want when something is happening in the market
that your strategies were not written for.

Duplicating a bot copies its configuration, which makes running the same
strategy across three pairs a thirty-second job.

## Deleting

Deleting a bot removes it along with its trade ledger and event log. Any
position it holds at the venue is left untouched, so close the position first
if you meant to close the position.

## Related

- [Strategies and backtesting](/docs/strategies-and-backtests)
- [Python API reference](/docs/python-api)
- [Risk guardrails](/docs/risk-guardrails)
- [Paper trading](/docs/paper-trading)
