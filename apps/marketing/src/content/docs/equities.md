---
title: US equities
description: Trade US stocks and ETFs through Alpaca from the same terminal, with a session clock off the broker's own calendar, Level 1 quotes, an out-of-hours ticket that goes limit-only, and a per-symbol position card.
group: traders
parent: trading
order: 9
eyebrow: For traders
updated: 17 AUG 2026
readTime: 9 min read
---

A stock is the one instrument in Pairlens that keeps office hours. Everything
else trades continuously, and the terminal is built for that: a chart, a book,
a tape, the same guarded ticket. What changes here is the clock and the quote.
The market is open, closed, or in one of two thin sessions either side of the
bell, and the ticket accepts different orders in each. The feed carries top of
book rather than depth, so the pane beside the chart is a quote, not a ladder.

## One venue

**Alpaca.** US equities and ETFs, connected with an API Key ID and a Secret
Key. It runs anywhere, browser and desktop alike, and it issues paper
credentials that trade against its own simulated brokerage with real market
data behind them.

|                | Alpaca                                           |
| -------------- | ------------------------------------------------ |
| Where it runs  | Anywhere                                         |
| Connects with  | API Key ID and Secret Key                        |
| Instruments    | US stocks and ETFs                               |
| Market data    | Requires your keys. The free entitlement is IEX  |
| Order types    | Market, limit, and workflow brackets             |
| Extended hours | Limit orders only                                |
| Fractional     | Yes, on market and limit orders, day orders only |
| Paper mode     | Yes, Alpaca's own paper account                  |
| Timeframes     | 1m through 1M                                    |

One thing about Alpaca is unlike every crypto exchange in the box: it gates
**market data** on your API keys too. There is no public feed to fall back on,
so a stock chart shows nothing until a credential exists. In a browser the
credential vault is sealed when the page loads, which means the first
subscription lands before any key is available; the terminal notices and
resubscribes the moment you unlock, rather than leaving the pane spinning for
the rest of the session.

## Connecting

**Accounts → Connect Account → Alpaca.** Paste the Key ID and the Secret Key,
and pick **Paper** or **Live**. Paper points at Alpaca's paper endpoint, which
is a real brokerage simulation rather than a local fake, so orders route, rest,
fill and appear in your positions exactly as live ones do. Either way the
secret goes into your OS keychain on desktop or your encrypted vault in a
browser, and never to a Pairlens server. See
[connect an exchange](/docs/connect-an-exchange).

## Finding a stock

Stocks live in the shared instrument catalog rather than in a venue-scoped
list, so they are searchable from omni-search, the Markets panel and the pair
picker whether or not a broker is connected. The picker carries a **Stocks**
tab beside Crypto and Futures. A stock's route is `/stocks/alpaca/AAPL`: one
venue, one ticker, no third segment, because a share of Apple is a share of
Apple.

The **Equities** tab on Discovery is built around the calendar rather than the
tape, which is what a stock desk actually opens on:

**Session** leads the board. Where the trading day is right now, drawn from the
broker's own calendar: the phase, a countdown to the next boundary, a bar
showing the whole day with the pre-market and after-hours wings on it, and a
half-day badge when the venue publishes a short session. Beside it sit SPY,
QQQ, IWM and DIA with their move since the previous close. They are labelled by
their own tickers on purpose. The broker quotes SPY; it does not quote the S&P
500, and printing an index name over an ETF price would be a number from a
different instrument.

**Movers** ranks the broker's own bulk snapshot on this board rather than the
crypto one, and drops the tabs that snapshot cannot serve instead of showing
tabs that would always be empty.

**News** runs down the right.

The **Earnings Calendar** and the **Economic Calendar** are on the board as
frames with an honest body. No bundled connector serves either feed: a broker
publishes the schedule of its own venue, which is what Session reads, and knows
nothing about who reports on Thursday or when CPI prints. Both panes draw the
columns a provider must produce and name the kind of plugin that would fill
them, rather than presenting an empty table as a slow one.

## The trading day

Nothing in the terminal assumes 9:30 to 16:00. Every boundary comes from a
calendar entry Alpaca published, which is the whole reason the panel exists: on
Christmas Eve the bell rings at 13:00 and on Thanksgiving it does not ring at
all, and those are exactly the days a countdown to 16:00 is wrong on.

Four phases: **pre**, **open**, **after hours**, and **closed**, where closed
covers holidays and the overnight gap alike. The extended windows are the ones
the venue publishes, which for Alpaca run from 4:00am and through 8:00pm
Eastern.

The session arithmetic never constructs a date, never reads your host clock and
never names a timezone. The instants were converted once, in the connector,
where the venue's own timezone is known, so a laptop in Tokyo with a skewed
clock resolves the same phase as one in New York. When the calendar has not
arrived, the panes fall back to the broker's plain open or closed bit and say
so, rather than drawing an empty day bar.

The **Session Clock** is the one-row version of the same thing, and the default
stock layout puts it directly above the ticket. That placement is the point:
extended hours change what the ticket will accept, not just a label on it.

## The quote

**Level 1** takes the rail where a crypto workspace would put an order book:
bid and ask with their sizes, the spread in both price and basis points, the
day's range with the last print positioned on it, and the feed it came from.

The range is anchored on the session, so a thin overnight print cannot widen
"today", and without a published session the row is dropped rather than
quietly becoming a 24-hour range.

Under it, one line stating that there is no depth behind the quote. The
broker's free feed carries top of book only, and a one-row ladder dressed up as
a book would look broken rather than honest. There is no halt row either.
Alpaca publishes trading status on a separate channel the connector does not
subscribe to, and neither the quote frames nor the normalized book carry a halt
flag, so the pane omits the row rather than implying "not halted" from an
absence of evidence.

The pane opens no stream of its own. The pair route already streams this
venue's quotes for the chart, and a second subscription would double the socket
traffic to show the same two prices.

## The ticket

Select a stock and the Trade Entry panel picks up the session.

**Outside regular hours it goes limit-only.** The Market and Workflow tabs are
disabled rather than hidden, with one line under them saying why: those
sessions have no continuous auction for a market order to fill against. The
choice still exists, the session is what removed it, and a control that
vanishes teaches nobody that.

**Extended-hours routing turns itself on in pre and post.** An order entered at
07:40 is meant for the session you are looking at, and the older behaviour
queued it silently for the next open. It is one tap to clear, it clears itself
the moment you leave Limit, and it is never persisted or carried across a pair
change. Those sessions are thin and the spreads are wider, so routing into them
should be a choice you still remember making rather than one inherited from
last night.

**Fractional shares work**, and the percentage buttons produce them routinely:
selling 25% of a 7 share position is 1.75 shares. Alpaca accepts fractional
quantities on market and limit orders only, and only as day orders, so a
fractional limit order rests for the session instead of resting indefinitely.
Stops and take-profits need whole shares, because the fractional version could
only ever be a day order and a stop that quietly expires at the closing bell is
worse than no stop at all. The ticket says so and asks you to round rather than
placing one.

**You can size in dollars.** Switch the size field to USD to buy $500 of a
stock trading at $305.

The rest of the ticket behaves as it does everywhere else: the hold-to-confirm
submit gesture, the paper badge, the vault seal, and the
[risk guardrails](/docs/risk-guardrails) checked inside the order path. See
[place an order](/docs/place-an-order).

## Your position

**Positions** lists everything you hold across accounts, in the usual four
tabs. **Your Position** answers the narrower question a chart and a ticket
raise together: where am I on this one. Shares, average cost, the mark, market
value, and both profit figures the broker reports, the open one against your
cost basis and the day one since the previous close. They are different numbers
and both matter, so both are on the card.

One section per account, never a sum. Paper and live are two different books,
and a card that added them would show a position nobody holds. An account that
refused the read shows the error rather than being folded into "no position",
because hiding a failed read is the pane lying about a holding.

It opens no live mark subscription. The broker reports mark, market value and
both profit figures inside the positions payload, and the chart beside the pane
is already streaming the price.

## The company behind the ticker

The **Company** panel, and the **Company** board it leads, draw the identity
the installed connectors can stand behind: the ticker, the company name, the
market identifier code where the venue published one, and the venue. Then they
say plainly that valuation, growth, margins, the next catalyst and the analyst
range need a fundamentals provider.

A broker quotes and fills; it does not publish a P/E, a float or a revenue
trend, and nothing bundled serves fundamentals. The alternative was a grid of
eight labelled cells full of dashes, which reads as a pane that is still
loading and never stops.

## What is not here yet

Halt status, fundamentals, an earnings feed, a macro feed, market breadth on
the session strip, options, and market orders in extended hours (the venue does
not accept them). Depth beyond the touch is a data question rather than a UI
one: the entitlement behind the connector quotes top of book, so there is no
ladder to draw until a feed that carries one is connected.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Paper trading](/docs/paper-trading) for what a paper fill does and does not prove
- [Panels](/docs/panels) for everything else you can put beside the chart
