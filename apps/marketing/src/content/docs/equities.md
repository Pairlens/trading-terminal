---
title: US equities
description: Stocks trade on a clock, and that changes everything. Market hours, extended sessions, earnings and macro releases explained, then how to trade US stocks and ETFs through Alpaca in Pairlens.
group: traders
parent: trading
order: 9
eyebrow: For traders
updated: 22 AUG 2026
readTime: 12 min read
---

## Stocks are different, and the difference is the clock

Crypto never closes. Stocks do, and almost everything unusual about trading them
follows from that.

**Regular hours** are 9:30am to 4:00pm US Eastern time, Monday to Friday, minus
holidays and the occasional half day. This is when the market is deep, spreads
are tight, and almost all volume happens.

**Extended hours** are the thin sessions either side: pre-market from 4:00am and
after-hours until 8:00pm Eastern. You can trade, but far fewer people are there,
spreads are wide, and prices can move dramatically on very little volume. This is
where earnings reactions happen, and where inexperienced traders get poor fills.

**Overnight and weekends** the market is closed entirely. Orders you place are
queued for the next open, not filled.

That gap matters. News does not wait for the bell, so a stock can close at $100
and open at $85 the next morning with nothing traded in between. That is a
**gap**, and it is the one risk a stop-loss cannot protect you from: your stop at
$95 does not fill at $95, it fills at whatever the market opens at.

### Two things that move stocks on a schedule

**Earnings.** Every listed company reports its results four times a year, either
before the market opens or after it closes, never during. It is the single
largest scheduled source of movement in an individual stock, and a 10% overnight
move on a report is completely routine. Knowing whether a name you hold reports
tonight is basic hygiene.

**Macro releases.** Inflation figures, employment numbers and Federal Reserve
decisions move the whole market at once, on a published schedule, usually at
8:30am Eastern. CPI day feels different from an ordinary Tuesday, and everyone
who trades stocks knows when it is.

Pairlens ships a calendar for each of these, covered below.

## One venue

**Alpaca.** US stocks and ETFs, connected with an API Key ID and a Secret Key.
It works in the browser and on the desktop, and it hands out free practice keys
that trade against a real brokerage simulation.

|                | Alpaca                                         |
| -------------- | ---------------------------------------------- |
| Where it runs  | Anywhere                                       |
| Connects with  | API Key ID and Secret Key                      |
| Instruments    | US stocks and ETFs                             |
| Market data    | Requires your keys, unlike every crypto venue  |
| Order types    | Market, limit, and workflow brackets           |
| Extended hours | Limit orders only                              |
| Fractional     | Yes, on market and limit orders, same-day only |
| Practice mode  | Yes, Alpaca's own paper account                |
| Timeframes     | 1m through 1M                                  |

**One thing to know before you start.** Unlike every crypto exchange, Alpaca
requires your keys just to show prices. US market data is not free, so there is
no public feed to fall back on, and a stock chart stays blank until a credential
reaches the connector.

In a browser this means unlocking your vault after each reload. The panels say so
and carry the unlock button, and they resubscribe the moment you unlock rather
than spinning for the rest of the session. Setting up a passkey makes it one
touch. See [connect an exchange](/docs/connect-an-exchange).

## Connecting

**Accounts → Connect Account → Alpaca.** Paste the Key ID and Secret Key, and
pick **Paper** or **Live**.

Paper points at Alpaca's practice account, which is a real brokerage simulation
rather than a local fake. Orders route, rest, fill and appear in your positions
exactly as live ones do. It is the best free rehearsal in the product, and it
takes about three minutes to set up.

## Finding a stock

Stocks are searchable from anywhere, whether or not a broker is connected. The
pair picker has a **Stocks** tab, and a stock's address is simply
`/stocks/alpaca/AAPL`: one venue, one ticker, because a share of Apple is a share
of Apple.

## The Equities Discovery board

It opens on the calendar rather than on a price scanner, because that is what a
stock desk actually opens on.

**Session** leads: where the trading day is right now, a countdown to the next
boundary, and a bar showing the whole day with the pre-market and after-hours
wings on it. Beside it, SPY, QQQ, IWM and DIA with their move since the previous
close.

Those four are labelled by their own tickers on purpose. Your broker quotes SPY,
the ETF; it does not quote the S&P 500 index. Printing an index name over an ETF
price would be a number from a different instrument.

**Movers** ranks the broker's own data, with a Volume tab priced in dollars
traded rather than shares (a million shares of a $2 stock is not the same event
as a million shares of a $400 one). Rows carry a reason line where there is one:
"Reports tonight" off the earnings calendar, or the name's sector.

**News**, scoped to the listed names, with Earnings and Macro filters.

**The Earnings Calendar** and **Economic Calendar** finish the board, each
covered below.

## The trading day

Nothing in the terminal assumes 9:30 to 16:00. Every boundary comes from a
calendar the broker publishes, which is the whole point: on Christmas Eve the
bell rings at 13:00 and on Thanksgiving it does not ring at all, and those are
exactly the days a hardcoded countdown is wrong on.

Four phases: **pre**, **open**, **after hours** and **closed**.

The **Session Clock** is the one-row version, and the default stock layout puts
it at the top of the chart column. That placement is deliberate, because extended
hours change what the ticket will accept, not just a label on it.

## The quote

**Level 1** takes the space where a crypto workspace would put an order book:
best bid and ask with their sizes, the spread in price and in basis points, the
day's range with the last trade positioned on it, and which feed it came from.

Under it, one line explaining that there is no depth behind the quote. Alpaca's
free data plan carries only the single best bid and offer, so there is no ladder
to draw. A one-row book dressed up as a full one would look broken rather than
honest. See [the order book](/docs/order-book#why-us-stock-books-are-one-row-deep).

**A halt row appears only when the exchange has actually said something.** Stocks
get halted, for news or for extreme moves, and when that happens the row says so.
A ticker with no status published means the exchange has not spoken, which is
not the same as "trading normally", so no row is drawn at all. Absence of
evidence is never rendered as a reassuring green line.

## The ticket

Select a stock and the order ticket picks up the session.

**Outside regular hours it goes limit-only.** Market and Workflow are disabled
with a line saying why: those sessions have no continuous auction for a market
order to fill against. The options are shown as disabled rather than hidden,
because a control that vanishes teaches nobody anything.

**Extended-hours routing turns itself on in pre-market and after-hours.** An
order entered at 07:40 is meant for the session you are looking at. It is one tap
to clear, it clears itself when you leave Limit, and it never carries over to
another pair or another day. Those sessions are thin and the spreads are wide, so
trading them should be a choice you remember making.

**Fractional shares work.** The percentage buttons produce them routinely:
selling 25% of a 7-share position is 1.75 shares. You can also size in dollars
instead of shares, which is how you buy $500 of a stock trading at $305.

One exception: stops and take-profits need whole shares, because a fractional one
could only ever be a same-day order, and a stop that quietly expires at the
closing bell is worse than no stop at all. The ticket asks you to round.

Everything else behaves as it does elsewhere: hold-to-confirm, the paper badge,
and your [risk guardrails](/docs/risk-guardrails) checked before anything leaves.
See [place an order](/docs/place-an-order).

## Your position

**Positions** lists everything across your accounts. **Your Position** answers
the narrower question a chart and a ticket raise together: where am I on this
one?

Shares, average cost, current price, market value, and **both** profit figures
your broker reports. Those two are different numbers and both matter: the open
profit is measured against what you paid, the day profit against yesterday's
close. A position can be up 40% overall and down 3% today.

One section per account, never a total. Paper and live are two different books,
and adding them would show a position nobody holds.

## The company behind the ticker

The **Company** panel opens with the next earnings date, because a report three
days out changes what every other number is worth. Then valuation (market cap,
P/E, PEG, EPS, revenue), growth against the same quarter last year, margins,
context (dividend yield, beta, the 52-week range) and analyst ratings.

If you have not met these before, two are worth knowing:

**P/E ratio** is the share price divided by earnings per share. Roughly, how many
years of current profits you are paying for. High means the market expects growth;
low means it does not, or that something is wrong.

**Beta** is how much the stock moves relative to the whole market. Above 1 means
it amplifies market moves, below 1 means it damps them.

A figure the data provider does not publish takes its cell with it, rather than
showing a dash. A grid of eight labelled cells full of dashes reads as a panel
still loading and never stopping, so a name with no analyst coverage simply shows
no analyst row.

## Who is buying it from the inside

**Insider Activity** lists the company's own Form 4 filings: when, who, their
role, whether it was a buy, a sell or a grant, how many shares and at what price.

Company executives must publicly disclose their own trades in their own stock,
which is why this data exists at all. Read it carefully: insiders sell for a
hundred reasons (taxes, diversification, a house) and buy for essentially one.
Cluster buying by several executives is the signal worth noticing.

**The summary leads with the time span the counts cover**, because counts alone
mislead. "2 buys, 40 sells" reads like this month whether it covers a month or
three years.

Grants show no value, because a grant has no price, and a $0 in a column of
dollars reads as a worthless trade rather than as one that was never a purchase.

## The earnings calendar

Who reports and when, grouped by day and split into **Before the bell** and
**After the close**, with a third section for names whose slot nobody has stated.

Each row carries the ticker, the company and the quarter it is reporting, the
consensus earnings estimate where one is published, and the day's move. Rows link
straight to the chart.

Three scopes: **Today**, **This week**, and **My watchlist**, which looks a
quarter ahead and shows the next report for each stock you follow. If you own
individual stocks, check this one weekly.

A row only lands in a slot section when a source actually states the slot. Where
no calendar states it, Pairlens reads the company's own filing history instead: a
company that has released after the close for eight straight quarters will do it
again. Where its timing genuinely moves, the row stays in the unstated section
rather than guessing.

**A source toggle switches to IPOs**: the forward pipeline with the company, the
exchange it will list on, the expected date and the filed price range. No chart
links, because there is no tape to link to until the thing trades.

## The economic calendar

The forward US macro calendar, compiled from the agencies themselves rather than
from a vendor's copy: the Bureau of Labor Statistics, the Bureau of Economic
Analysis, the Federal Reserve and the Census Bureau.

Each row is a date, a time, who publishes it, and how hard it usually hits.
A **High impact** filter cuts to the rows worth repositioning for, because two
thirds of a federal calendar is county employment tables. Windows of a week, two
weeks or a month.

**Times are Eastern and labelled Eastern**, because that is how every headline
quotes CPI. Your own clock is in the tooltip. Some rows carry no time at all,
which is the source rather than a gap: FOMC minutes are published as a date, and
those rows say so instead of inheriting a plausible time nobody can check.

### Actual, implied, and prior

Rows for the releases a desk stops for carry three figures.

**Actual and prior come from the agencies' own data**, filled in within minutes
of the release. A figure appears only once the period it belongs to has actually
been published, so the row never republishes last month's number as this month's
the moment the clock ticks over. Until then the next release counts down in its
own cell.

**The middle column is Implied, and it names Kalshi.** This is not an analyst
consensus and is never labelled as one. Kalshi runs regulated
[prediction markets](/docs/prediction-markets) on these exact releases, so the
price of its contracts is a live, money-backed distribution of what traders
expect. The strike where the market prices even odds is the implied figure. Thin
markets are excluded, because three stale quotes produce a confident number that
means nothing.

**There is no analyst consensus column.** The street's forecast is a licensed
product no free source publishes, so releases with no Kalshi market carry no
expectation at all. An empty cell is empty: no dash, no zero, no placeholder.

## What is not here yet

Options. Market breadth on the session strip. Free float and short interest.
Market orders in extended hours, which the venue does not accept. Order book
depth beyond the top quote, which needs a paid data feed. The macro calendar
covers US federal releases only.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Paper trading](/docs/paper-trading), which is unusually good on Alpaca
- [Panels](/docs/panels) for everything else you can put beside the chart
