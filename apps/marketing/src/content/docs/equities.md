---
title: US equities
description: Trade US stocks and ETFs through Alpaca from the same terminal, with a session clock off the broker's own calendar, Level 1 quotes with a halt row, an out-of-hours ticket that goes limit-only, insider filings, an earnings calendar split before the bell and after the close, and a macro calendar carrying actual, prior and the market-implied figure.
group: traders
parent: trading
order: 9
eyebrow: For traders
updated: 19 AUG 2026
readTime: 15 min read
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

It is a strip, not a panel, and it is sized as one: it takes the single row it
draws and the two calendars below it split everything else, on a laptop and on
a 4K screen alike.

**Movers** ranks the broker's own bulk snapshot on this board rather than the
crypto one, and drops the tabs that snapshot cannot serve instead of showing
tabs that would always be empty. It carries a Volume tab priced in dollars
traded, not shares, and each row wears a reason line when there is one worth
stating: "Reports tonight" off the earnings calendar, or the name's sector when
the calendar is silent. Without broker keys the pane asks for them in one
compact line instead of a full-pane prompt, and the session strip does the
same, because a board of connect heroes reads as broken rather than as new.

**News** runs down the right, scoped to the listed names, with Earnings and
Macro chips instead of the crypto board's watchlist scope.

The **Earnings Calendar** and the **Economic Calendar** finish the board. Both
read from the App Server rather than from the broker, because a broker publishes
the schedule of its own venue, which is what Session reads, and knows nothing
about who reports on Thursday or when CPI prints. Each gets its own section
below.

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
stock layout puts it at the top of the chart column. That placement is the
point: extended hours change what the ticket will accept, not just a label on
it. It sizes to its row the same way Session does, including when it is waiting
for broker keys, so it never banks chart height it cannot spend.

## The quote

**Level 1** takes the rail where a crypto workspace would put an order book:
bid and ask with their sizes, the spread in both price and basis points, the
day's range with the last print positioned on it, and the feed it came from.

The range is anchored on the session, so a thin overnight print cannot widen
"today", and without a published session the row is dropped rather than
quietly becoming a 24-hour range.

Under it, one line stating that there is no depth behind the quote. The
broker's free feed carries top of book only, and a one-row ladder dressed up as
a book would look broken rather than honest.

**The halt row appears only when the venue has said something.** The connector
subscribes Alpaca's `statuses` channel and puts what it hears on the ticker, so a
halt shows as a halt and a resumption shows as one. A ticker carrying no status
means the venue has not spoken, which is not the same as trading normally, so an
absent status draws no row at all. The absence of evidence is never rendered as a
reassuring green line.

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

The **Company** panel, and the **Company** board it leads, open with the
identity the connectors can stand behind: the ticker, the company name, the
market identifier code where the venue published one, and the venue. Under that
sits the business, from the App Server's fundamentals provider.

**Next report first**, because a print three days out changes what every other
number on the panel is worth: the date, how long there is, and the consensus EPS
the street is looking for. Then **valuation** (market cap, trailing and forward
P/E, PEG, EPS, revenue, EBITDA), **growth** (revenue and earnings against the
same quarter last year, coloured by direction), **margins** (profit, operating,
return on equity), **context** (dividend yield, beta, the 52-week range, shares
outstanding) and the **analysts** (target price, and the buy/hold/sell split as
a bar with its counts).

A figure the provider did not publish takes its cell with it, and a section with
no cells left disappears too. That is deliberate: the alternative was a grid of
eight labelled cells full of dashes, which reads as a pane still loading and
never stopping. So a name with no analyst coverage shows no analyst row rather
than three zeros, and an ETF with no filings behind it says so in a sentence.

Two figures a US mockup would show are absent because no provider here publishes
them: free float (the panel labels what it has as shares outstanding, which is a
larger number) and short interest.

A broker quotes and fills; it does not publish a P/E. So a build with nowhere to
ask keeps the old honest seam: a standalone terminal, a self-hosted App Server
with no provider key, or one older than the route all say that fundamentals need
a provider instead of drawing an empty grid.

## Who is buying it from the inside

**Insider Activity** sits on the Company board beside the panel above, and lists
the company's own Form 4 filings: the date, the insider, their role, whether it
was a buy, a sell or a grant, the share count, the price and the value, with a
buys-versus-sells line on top.

The direction is stated in trader language, Buy and Sell, rather than in the
filing's own acquisition and disposal. That is not simplification: the reason to
open this pane is to compare it against your own position, and nobody puts
"disposal" next to a short.

**The summary leads with the span the counts cover**, because counts alone lie.
A company files nothing for two years and then eleven sales in a week, and "2
buys, 40 sells" with no span reads like this month either way. The span quoted is
the range actually loaded, never a window we claim to have asked for.

Value is shares times price, and it is blank on a grant. A grant has no price,
and a $0 in a column of dollars reads as a worthless trade rather than as one
that was never a purchase.

## The earnings calendar

**Earnings** answers who reports and when, grouped by day and split within the
day into **Before the bell** and **After the close** sections, with a third
section for names whose slot no source states. Each row carries the symbol and
its logo, the company with the quarter it is reporting ("NVIDIA · quarter to
Jul 2026"), the consensus EPS where the street published one, and the day's
move where the broker tape has it. Rows link straight to the chart.

Three scopes: **Today** (the default), **This week**, and **My watchlist**,
which looks a quarter ahead and shows the next report for each stock you watch.
The whole market reports a few hundred times a week, so beyond a cap the pane
stops drawing rows and says how many it left out.

A row lands in a slot section only when a source states the slot, and in the
unstated section when none does. Two sources feed it, and neither guesses. The
provider's calendar states a time of day for reports inside about thirty days,
which covers most of the names you would trade the print on. Past that it states
nothing, so the App Server reads the company's own habit off its SEC filings
instead: an earnings release is an 8-K under Item 2.02, the SEC publishes the
exact moment it received each one, and a company that has filed after the close
for the last eight quarters will do it again. That classification is
date-aligned, which matters more than it sounds: Tesla files its production and
delivery numbers under the same item, in the morning, weeks before its
after-close earnings, so a plain "most common time" reading of its filings is a
coin flip. Matching each filing to the quarter it belongs to picks the earnings
one.

A company whose timing genuinely moves, or that files as a foreign private
issuer (a 6-K carries no item codes at all), stays in the unstated section.
There is no during-market-hours state either: that is real but rare, and it is
not something this schedule can say, so those rows stay unstated too.

**A source toggle switches the pane to IPOs**: the forward pipeline, with the
symbol, the company, the exchange it will list on, the expected date and the
price range where one has been filed. The IPO view carries no scopes, because
the whole pipeline is a few dozen rows and a Today filter over it would usually
be empty. Rows do not link to a chart either: there is no tape to link to until
the thing trades.

## The economic calendar

**Economic** is the forward US macro calendar, and it comes from the agencies
themselves rather than from a vendor's copy of them. The App Server compiles it
from the BLS and BEA published iCalendar feeds, the Fed's FOMC calendar, and the
Census indicator schedule.

Each row is a day, a clock, who publishes it, and how hard it usually hits.
Importance is high, medium or low, and a **High impact** filter cuts to the rows
worth repositioning on: two thirds of a federal calendar is county employment
tables. Three windows: the week, two weeks, or the month.

**Times are Eastern and are labelled Eastern**, because 08:30 ET is how every
headline quotes CPI. Your own clock rides in the row's tooltip rather than
replacing it. Some rows carry no clock at all, which is the feed rather than a
gap: FOMC minutes and the Census indicators are published as a date, and those
rows say so instead of inheriting a plausible time nobody can check.

### Actual, prior, and what the market implies

Rows for the releases a desk stops for carry figures, and each column is exactly
what it says.

**Actual and prior come from the agencies' own APIs**, filled within minutes of
the print by a poller that starts watching when a row's clock passes. CPI, PPI
and payrolls come from the BLS public API, which needs no key at all; the FOMC
target range comes from the New York Fed's markets API, which carries the range
as a field rather than as prose to parse; core PCE and retail sales come from
FRED, and GDP from BEA's own percent-change table. Two details worth knowing
because they are where this usually goes wrong elsewhere: a month-over-month
figure is computed from the seasonally adjusted series and a year-over-year one
from the unadjusted series, which is the convention the agencies publish under,
and payrolls is the first difference of a level in thousands. Get either wrong
and the number looks plausible while being an order of magnitude off.

**A figure appears only when the period it belongs to has actually been
published.** The clock passing is not enough. Reading "the latest observation"
the moment 08:30 ticks over would republish last month's print as this month's,
which would be a completely believable wrong number, so the row waits for the
period it is about. Until then the next timed release counts down in its own
Actual cell ("in 41m") on a highlighted row, and a figure no source publishes
renders as a dash glyph rather than as an empty cell, so absent and not-loaded
never look alike.

**The middle figure column is Implied, and it names Kalshi.** It sits between
Actual and Prior because it is where a reader expects the expectation, and the
columns read print, expectation, baseline. The venue rides the column head
beside the label, and a pane too narrow to carry both words keeps the label and
drops the venue; hovering the head or any implied figure still names it. It is not a consensus and
is never labelled as one. Kalshi runs regulated markets on these exact releases,
its market data needs no authentication, and reading the ladder of "above X"
contracts gives a live distribution: the strike where the market prices even odds
is the implied figure. For the FOMC row it is simpler, because the contracts are
already a probability distribution over outcomes, so the row shows the target
range the market favours and how strongly. A thin book produces a confident
number out of three stale quotes, so a ladder has to clear a minimum open
interest and be quoted tightly before anything is shown.

**There is still no consensus column.** The street's forecast is a licensed
product and no free source publishes one, so PPI and retail sales, which have no
Kalshi market either, carry no expectation at all. An empty cell is empty: no
dash, no zero, no placeholder. And if your App Server cannot fill any figures,
the columns do not appear, which is the schedule this pane shipped as.

## What is not here yet

Market breadth on the session strip, options, free float and short interest, and
market orders in extended hours (the venue does not accept them). Depth beyond
the touch is a data question rather than a UI one: the entitlement behind the
connector quotes top of book, so there is no ladder to draw until a feed that
carries one is connected. The macro calendar covers US federal releases; other
jurisdictions and the street's consensus both need a provider nobody here
subscribes to. A rate decision shows its prior range and the implied outcome but
not its own actual, because the new range takes effect the day after the meeting
and the row has left the window by then.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Paper trading](/docs/paper-trading) for what a paper fill does and does not prove
- [Panels](/docs/panels) for everything else you can put beside the chart
