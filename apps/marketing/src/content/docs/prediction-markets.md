---
title: Prediction markets
description: Trade event contracts on Kalshi and Polymarket from the same terminal. A pair here is the question rather than one side of it, so opening an event puts every answer on screen, priced in cents and one click from the ticket, with a probability chart over the whole field, the resolution criteria in the venue's own words, an outcome ladder, a basket ticket that states its overround, and positions that settle. Includes Crypto Up/Down, a scanner for the recurring BTC, ETH and SOL up-or-down windows that prices each one against the spot market it settles on.
group: traders
parent: trading
order: 6
eyebrow: For traders
updated: 20 AUG 2026
readTime: 27 min read
---

An event contract is a market on something that either happens or does not.
Will the Fed cut in September, will this team win, will BTC close above 53k.
In Pairlens it behaves like any other instrument: it has a chart, an order
book, a tape, and the same guarded ticket. What changes is the unit. A contract
is priced between 0 and 1, shown in cents, and pays one unit of collateral if
its outcome resolves true.

## The pair is the question

This is the one thing worth reading before anything else, because it is where
predictions stop behaving like every other asset class.

Everywhere else in the terminal a pair is a thing you can buy: BTC-USDT, AAPL,
a perpetual, a token. A prediction is not shaped like that. "Who wins the 2028
Democratic nomination?" is one market with thirty answers, and no single one of
them is the instrument any more than the bid is the instrument on a spot pair.

So a prediction pair is the EVENT. `/prediction/polymarket/903193` is the
question, and the answers are inside it. Open one and the whole field is on
screen, priced, with the favourite already loaded in the ticket. Picking Yes,
picking No, or moving from one runner to the next is a selection, not a
navigation: the book, the tape and the ticket follow, nothing reloads, and the
back button still means the question you were on before this one.

What that changes in practice:

- **You never have to choose a side to see a market.** Clicking a question
  opens the question. It used to open whichever side was leading, which is a
  position taken on your behalf before you have read anything.
- **The watchlist and the recents strip hold questions.** A starred prediction
  is "Will the Fed cut in March?", not "Fed cut in March, No leg". The strip
  prices it with its favourite and names which answer that number belongs to,
  because a bare 63¢ under a question reads as the price of Yes whichever side
  is actually leading.
- **The phone works the same way.** The mobile shell focuses a question and
  streams one of its answers, exactly as a desktop board does, so a row starred
  on either one opens correctly on the other.
- **A link can still be specific.** `?o=` on the address names one leg, so a
  link to "this runner" arrives on that runner with the rest of the field
  around it. Older links that named an outcome directly still work: they
  resolve to the question that owns them and rewrite themselves.
- **Orders are unchanged.** The venue still trades one leg at a time, so an
  order is still for one answer at one price. The selection is what says which.

## Two venues

**Kalshi.** A CFTC-regulated event exchange in the US, connected with an API
key. It needs the [desktop app](/docs/desktop-app), because its API refuses any
request carrying a browser origin. Collateral is USD, and it issues demo
credentials so you can run the whole flow on paper first.

**Polymarket.** A CLOB settled in USDC on Polygon, connected with an Ethereum
wallet rather than an API key. It works in the hosted web terminal and on a
phone, because its APIs are open to browsers. Polymarket does not serve US
persons for trading: market data stays open everywhere, and an order from a US
country setting is refused before it is signed.

|               | Kalshi          | Polymarket       |
| ------------- | --------------- | ---------------- |
| Where it runs | Desktop app     | Anywhere         |
| Connects with | API key and PEM | Ethereum wallet  |
| Collateral    | USD             | USDC on Polygon  |
| Order types   | Limit only      | Market and limit |
| Paper mode    | Yes, demo keys  | No, live only    |
| Timeframes    | 1m, 1h, 1d      | 1m, 5m, 1h, 1d   |

Both venues stream candles, tickers, order books, and trades, and both report
your open contracts back to the terminal.

## Connecting Kalshi

**Accounts → Connect Account → Kalshi**, in the desktop app. Kalshi signs with
RSA rather than a shared secret, so the form asks for two things:

1. **API Key ID**, the identifier Kalshi shows next to the key.
2. **RSA Private Key (PEM)**, the file it downloads once when you create the
   key. Paste it whole, `BEGIN` line included. Pairlens accepts it with real
   line breaks or with escaped ones, so a copy out of a text editor and a copy
   out of a JSON blob both work.

Pick **Paper** and the credential signs against Kalshi's demo environment,
which is a genuinely separate venue rather than a simulation, so fills come
from a real matching engine with no real money behind them. **Live** points at
production. Either way the secret goes into your OS keychain and never to a
Pairlens server. See [connect an exchange](/docs/connect-an-exchange).

## Connecting Polymarket

**Accounts → Connect Account → Crypto Wallet**, with an Ethereum key, the same
entry the [EVM DEX](/docs/dex-trading) chains use. One key covers both, because
the address is the same everywhere on EVM.

That key does two jobs. It signs each CLOB order, and Polymarket derives your
API credentials from it on the first authenticated call, so there is nothing
else to paste. There is no paper mode: the contracts being signed against are
on Polygon mainnet. Fund a hot wallet with what you intend to trade and leave
the rest somewhere else.

## Finding an event

Start from the **Predictions** tab on Discovery, the board the predictions
plugin ships. It is built for questions rather than for pairs: a **Categories**
rail on the left with a live contract count per category, **Crypto Up/Down**
over the **Event Board** across the middle, and a right rail carrying **Odds
Movers** over **Resolving Soon**. The tab is its own workspace, so what you
arrange there stays there.
The Predictions filter in the Markets panel sends you to it rather than showing
an empty grid, because prediction outcomes are never in the pair catalog that
panel reads: they are listed and resolved daily.

**The Event Board** draws every live question as a card that prices both sides.
Clicking the card's heading opens the question with its whole field; clicking a
price chip opens the same question with that answer already loaded in the
ticket.
A binary question has one number worth reading, so the probability gets the
largest type on the board. A race has a hundred and none of them is the
headline, so its card widens, ranks the field, and says how much of the
probability mass the leaders hold, with a way through to the full field: one
reader listing every market in the event, built from the payload the board
already has. The probability is shown as a percentage and the tradeable prices
in cents on purpose: the percentage is the reading, the cents are the price.
Cents appear on the two chips that trade; the reading rails beside the board
state probabilities, because there a price is not what you pay, it is what the
market believes. No dollar figure appears beside either. The search box narrows
the venue's own board when it can and asks the venue when it cannot, because
the board holds a hundred events per venue and anything past that only exists
behind a venue-side query.

**Odds Movers** ranks by how much a contract's probability changed in the last
day, stated in points rather than percent. A contract going from 64 to 78
moved fourteen points; calling that "+21.9%" is arithmetically true and
useless, because probabilities are compared by subtraction. Rows lead with the
event, so a race contributes "Democratic Presidential Nominee 2028 · Gavin
Newsom" rather than a bare "Gavin Newsom". Contracts pegged at either end of
the range are dropped: a settled-but-listed market keeps publishing a move it
can no longer trade on. A venue that publishes no 24h move is excluded and
named in the footer, so a silent venue never looks like a quiet market.

**Resolving Soon** sorts by the clock alone. It is the one thing a
volume-ranked board cannot tell you: 60% a month out and 60% an hour out are
different bets, and the second one is nearly decided. Anything already settled
is dropped rather than shown as closed.

The category rail narrows all three at once, and it counts from the unfiltered
result, so picking a category never shrinks the rail that did the narrowing.
Counts are of the loaded board, which is what the rail can honestly narrow. The
top row is Trending: no category filter, and the venues' own ranking.

What Trending means differs by venue, because the venues rank differently.
Polymarket has one front page and the board opens on it, ordered by 24h volume.
Kalshi has no single trending endpoint, and its busiest markets are live sport
by a wide margin: the top 25 of its own ranked feed are 25 sports events. So the
board asks Kalshi for the busiest events in each of its categories and
interleaves them, which is the difference between a board that is all tennis and
a board you can browse. Nothing is invented: the order inside a category is
Kalshi's, and the rounds lead with the biggest markets.

There are sixteen categories and both venues are read into the same set:
Elections, Politics, Geopolitics, Economics, Financials, Commodities,
Companies, Crypto, Sports, Esports, Mentions, Tech & Science, Climate, Health,
Culture and Transport. That matters because the venues do not agree on what a
category is. Kalshi publishes one per event out of its own closed list, so its
'Entertainment' becomes Culture, its 'World' becomes Geopolitics and its
'Science and Technology' becomes Tech & Science. Polymarket publishes none at
all, only a tag array, so the category is read from the tags: the most specific
topic present wins, which is why an election tagged Politics files under
Elections and an esports match tagged Sports files under Esports. An event
whose tags name no topic this list knows stays uncategorised and sits under
Trending, because a wrong chip is worse than none.

Picking a chip sends each venue its own word for it. Kalshi is asked for
'World' when you click Geopolitics; Polymarket is asked for the gamma tags
behind it. Where a venue has no word at all (Kalshi files esports under
Sports), the chip filters the board that is already loaded instead of asking
for something the venue cannot answer.

While the venues are still answering, all four panes draw their own layout with
the numbers taken out: ghost cards on the board, ghost rows on both rails, a
category rail whose names and counts have not landed yet. Nothing moves when
the events arrive, they just fill in where they already are. Two things stay
real throughout, because they are known before any venue replies: the venue
block under the category rail, which is read from the connectors you have
installed, and the search box and sort chips, which work on whatever has
landed. A venue that cannot answer at all still says so in a line above the
board.

## Crypto up/down

Both venues run a permanent conveyor of short-dated crypto contracts that ask
one question: will the price be higher at the close than it was at the open.
Kalshi opens a fifteen-minute window on BTC, ETH, SOL, XRP and DOGE every
quarter hour. Polymarket runs an hourly and a daily one on BTC, ETH, SOL and
XRP. They are the busiest contracts either venue lists, and they are the one
prediction product a crypto terminal can price better than the venue's own
site, because the terminal already streams the spot market they settle against.

**Crypto Up/Down** has two shapes, because there are two questions and a table
only answers one. The toggle is top right, and the pane remembers which you
left it on.

### Focus

The default, and one window at a time. It answers the question people actually
open these contracts with: is BTC going to be above 71,860 in four minutes.

An asset switcher along the top swaps between BTC, ETH, SOL and XRP, or leaves
it on **Next**, which follows whatever settles soonest. Under it: the settlement
reference and the live price side by side with the gap between them signed in
both dollars and percent, and a countdown with a bar underneath showing how much
of the window has run, because "4:31 left" means one thing on a fifteen-minute
contract and another on a daily one.

The chart is the point. It draws the spot tape against the price the contract
settles on, as a line approaching a line, tinted green above the target and red
below. The target line is always in frame: a window whose price has run clear of
its reference would otherwise crop out the one distance the chart is about. It
is seeded from minute candles so it has a shape the moment it opens, then grows
a point a second off the live tape.

Both legs sit beside it as buttons, priced in cents with the payout multiple
under each ("59¢, pays 1.69x"), and clicking one opens the event with that side
already loaded in the ticket. The model and the edge keep their place in a strip
under the buttons rather than a column, and below that is the flow: the spot
prints that will decide the window, arriving one at a time.

That strip carries a side and an amount and deliberately no price. Every print
inside the last minute is within a few cents of the one before it, so a column of
prices there is five near-identical numbers dressed up as information, and the
settlement price is already on the card once, where it belongs. What varies, and
what bears on the contract, is which side is pushing and how much money is behind
it: a buy moves the tape toward Up settling, a sell toward Down. The bar at the
top of the strip is those two sides summed over the recent tape; each row below is
one push, sized against the largest on screen.

The focused asset is the only one that gets a live subscription. The board below
prices thirteen rows off bulk ticker snapshots on a sixty-second REST cadence,
which is right for ranking and useless in the last minute of a fifteen-minute
window, so swapping assets swaps a real ticker and a real trade feed with it.

### Board

The scanner. One row per live contract, sorted by what settles soonest, with
eight columns:

| Column        | What it is                                                         |
| ------------- | ------------------------------------------------------------------ |
| **Contract**  | Asset, horizon and venue                                           |
| **Closes**    | A live countdown in minutes and seconds, not rounded to the minute |
| **Reference** | The price the contract settles against                             |
| **Spot**      | The live price on the pair the venue settles on                    |
| **Dist**      | How far spot has moved from the reference, signed                  |
| **Market**    | What the venue pays for Up, in cents                               |
| **Model**     | What a plain diffusion model makes of the same window              |
| **Edge**      | Model minus market, in probability points                          |

Both shapes show the window that is trading, one per asset, horizon and venue.
The venues answer with a ladder of future windows and all but the first sit at
exactly 50 cents with no book, because nobody trades a contract that opens in
six hours. Listing them would push the live row off the top behind seven
placeholders quoting a coin flip. The horizon chips above the table narrow to
one of 15m, 1H or 1D.

Rows come from a thirty-second fetch, and the clock filters them on every
tick rather than on every fetch: a fifteen-minute window expires while the
board is on screen.

### Where the reference comes from

The two venues describe the settlement price differently, and the board says
which one it got.

Kalshi publishes the number. Every fifteen-minute market carries a target
("Target Price: $69,506.94") and settles on the average of the sixty CF
Benchmarks index prints before the close, measured against the same average
before the open. Nothing has to be derived, so the Reference column is exactly
what the contract pays on.

Polymarket names a candle instead. Its hourly contract resolves Up when the
close of the Binance BTC/USDT one-hour candle beginning at the titled hour is
at or above its open, so the reference is that candle's open and the terminal
reads it from your own Binance connector. Its daily contract compares one-minute
closes at noon ET on two consecutive days; the terminal reads the hour that
contains the reference minute, which is right to within a minute of tape rather
than exact. Those rows mark their reference with `≈` and the footnote says why.

If no connector you have installed carries the settlement pair, the row still
runs. You lose Spot, Dist and Model, and you keep the odds, the countdown and
whatever reference the venue published.

### What the model is, and is not

The Model column is `N(d2)`: the probability spot finishes above the reference
under a driftless lognormal walk at recent realized volatility, with volatility
estimated from the last day of five-minute closes on the settlement pair. It
is closed-form arithmetic over numbers on the same row, and it is there so the
venue's probability has something to be compared against.

Five-minute closes, not hourly ones, and the choice matters more than it looks.
Realized volatility depends on how often you sample: BTC measured hourly reads
around 30% annualised, measured every five minutes around 46%, and every minute
around 59%. The model scales whatever it is given down to a horizon of minutes,
so feeding it the hourly figure understates the volatility that actually decides
a fifteen-minute contract by roughly half, and pushes the answer that much harder
toward 0 or 100. Five minutes is the usual compromise: at one-minute sampling the
bid-ask bounce inflates the estimate with noise that is not volatility.

It is not a recommendation and it is not a fair value. It assumes zero drift,
constant volatility and a lognormal walk, and a fifteen-minute crypto window is
none of those. It knows nothing about fees, the spread, or how thin the book
is at the size you would trade. A four-point edge on a contract quoted two
cents wide is not four points of anything.

The column is blank rather than approximate when a leg is missing. No
reference, no live spot or too short a volatility sample means no model, on
that row, with the other columns still doing their job.

The Edge column is withheld, rather than shown, when the venue's odds have not
refreshed recently. Spot and the countdown come off a socket and never stop,
while the odds arrive on a thirty-second poll that a browser parks when the tab
is in the background. Subtracting a live model from a probability that stopped
updating ten minutes ago produces a number that looks like a large mispricing
and is really a comparison against a memory, so the pane says the odds are stale
instead.

Clicking any row opens that contract on the prediction terminal, with its
book, its tape and the same guarded ticket.

There is also a dedicated **Crypto Up/Down** board in the Discovery route menu
and the Workspace Store: the scanner across the left with a watchlist and Odds
Movers on the right, for when the recurring windows are the whole session.

## Sorting the board

The Event Board offers five orderings, and every one of them is derivable from
what the venues actually publish: **Trending**, which is the venue's own ranking
untouched, **New**, **Ending soon**, **Volume**, and **Biggest move**.

**New** deserves its own note, because a prediction event is not born once.
"Fed decision in December" opens with three strikes and grows to a dozen as the
range moves, and a nomination race gains a runner whenever someone declares. So
New ranks on the newest market in the event rather than the event's own birthday,
which is the difference between surfacing a race that gained four runners this
morning and burying it under a binary that opened yesterday and never changed
again. Under that sort each card carries a **Listed 4h ago** line, so the reading
that produced the ordering is on the card.

The **Events** browser gets the same orderings one short: **Venue order**,
**New**, **Ending soon** and **Volume**. Biggest move is missing there on
purpose, because the browser's cards show no move anywhere, and a sort whose
result the surface cannot explain reads as a shuffle. Venue order and Trending
are the same behaviour under two names: the board calls it trending because that
is what the venues rank by, the browser calls it the venue's order because it
lists per venue.

Rows a sort cannot rank go to the end rather than to the top, always. An event
with no volume figure is not the quietest event on the board, it is an event
nobody measured.

The **Events** panel also sits on the default prediction layout, beside the
chart; on a custom workspace, add it from the Add Pane dialog, under Discovery. It
queries every prediction venue you have connected and shows what is busy right
now: category chips across the top, a search box that matches question text, and
a card per event with its artwork, how long until it closes, its volume, and a
price for each outcome. Yes is green and No is red, the same two colours the
terminal uses for long and short everywhere else, because taking Yes is the long
side. Click an outcome and the event opens with that answer selected. A venue
that needs the desktop app says so in place of its results rather than returning
nothing.

Cards are deliberately short. An event like "Democratic Presidential Nominee
2028" carries thirty candidate markets with two sides each, and drawn in full it
would be four screens of buttons with the rest of the board stranded below it. A
card shows the first four questions and up to four outcomes each, and counts the
rest: **Show 26 more markets**.

Click that count, or the event's own title, and the **event dialog** opens with
everything: the artwork, the category, volume, liquidity, how many markets the
event has, when it closes, and then every question with every outcome priced.
Each one still opens its chart, so the dialog is the way in for a market that
did not fit on the card. It costs no extra request; the whole event was already
in the payload the board fetched.

On a phone the board is in **Discover**, under **Prediction markets**: a few
live events with their outcome prices, and **All events** for the full list
with the same search and venue filter. Tapping an outcome opens its chart, the
way clicking a card does on the desktop; tapping the event heading opens the
same full event as its own screen, with each question's resolution rules behind
a disclosure. The section is only there when a prediction connector is installed
and enabled.

**The phone works the same way.** A prediction pair is the question there too:
the address is the event, tapping a question opens the whole field, and picking
a side is a selection inside it. The Chart tab opens on the same Probability
Chart, laid out for 402px: the plot, a legend under it that prices each runner
and hides its line on a tap, and the spans in the band the drawing toolbar
leaves. Drag a finger across the plot and a card reads the whole field at that
instant. A chip in the corner switches to candles, which brings back the
interval picker, the drawing toolbar and the draggable limit line for the answer
you are on.

The field is one tap from both screens. The chart's strip carries the question,
the resolution date and the price of the selected answer, with a ladder button
beside it on every prediction rather than only on a race; the ladder lists every
answer with a Yes and a No chip, both tappable, and the sum of every Yes price
at the top. The ticket carries the same field as a scrolling row of chips above
the Buy/Sell toggle, the one you are trading ringed. It sizes in dollars with
the same presets, the same payout card and the same conversion to whole
contracts; what it does not carry is the preset editor and the basket. See
[Mobile terminal](/docs/mobile-terminal).

Search works from the pair picker too. It grows a **Predictions** tab beside
Crypto and Stocks, and prediction rows are rendered as the question rather than
as a ticker, because `KXBTCD-26AUG15-T53` is not something you scan.

## What a prediction is called

A prediction's routing key is a venue event id, and nothing in the terminal
shows you one. Wherever a ticker would go, a prediction renders as its
question: **Who wins the 2028 Democratic nomination?**, elided to whatever the
row has space for, with the whole sentence on hover.

The recents strip carries one extra reading, because a chip there has to print
a number and a question has no single price. It prints the favourite: the
answer the market currently rates highest, its label, and what it costs. "Fed
cuts in March · No 63¢" is honest in a way a bare 63¢ under the question is
not.

A single answer still renders as a subject and a side where one legitimately
turns up on its own, on a position row or in a fill: **Gavin Newsom · Yes**.
The subject is the venue's own short label for that market inside its event,
which is the one thing that separates two candidates in the same race; where a
venue publishes none, it falls back to the question, then to the event heading.

That reading is what the recent-pairs strip, the pair switcher in the top bar,
the watchlist, the chart watermark, the order ticket and the phone's pair chip
and pair picker all show. It is also why a prediction never breaks a row built
for six characters.

## Reading a price in cents

A price of 53¢ means the market puts the outcome at roughly 53%. One contract
costs 53 cents and pays a dollar if it resolves true, nothing if it does not.
The chart, the order book, the depth curve, the tape, and the mobile shell all
switch to cents for a prediction instrument, so nothing on screen quotes the
underlying 0.53.

Each answer has its own book. Yes and No are two separate contracts on the same
question, and you can buy or sell either one from the same page: pick the
answer, then pick the side. Selling Yes at 53¢ and buying No at 47¢ are close
cousins, not the same order, and the book will tell you which is cheaper.

**A one-sided book is normal here.** Nobody offers to sell a contract that has
already been decided, and nobody bids for one that has already lost, so a leg
at 99.9¢ shows bids and no asks and a leg at 0.1¢ shows asks and no bids. The
panel says **No asks** or **No bids** where the missing ladder would be rather
than leaving half of itself blank. It matters most on the board's opening
selection, which is the favourite: on an event the news has already settled,
the favourite is exactly the leg nobody is selling.

The two books are also mirrors of each other, so there is nothing to recover by
switching legs. A 225-contract Yes ask at 21.7¢ is the same resting order as
the 225-contract No bid at 78.3¢. When a side is empty, it is empty.

## The Probability Chart

Prediction markets get their own chart, and it is deliberately smaller than the
one the rest of the terminal uses. A contract trades between 0 and 1, so there
is no meaningful wick at four decimal places, a trendline drawn on a
probability is numerology, and a GPU context per pane is a lot of machinery for
a line that moves a few times an hour. What the price chart also cannot do is
the thing an event market most needs: it draws one instrument, and a race is a
question with a field.

So the prediction boards open on **Probability Chart** instead. It draws every
outcome it can on one time axis, in the colours the outcome ladder and the
basket already use for the same runners.

**The legend is the chart.** Every drawn runner gets a chip with its
probability and its move over the window, and clicking one hides or shows its
line. Eight colours and a hover is not enough to answer "which one is that",
so the answer is printed. The chip for the outcome you are on is outlined, and
its line is drawn heavier; the caret beside any other chip moves the whole page
to that outcome, which is how you go from spotting a crossover to trading it.

**The crosshair reads the whole field.** Hover anywhere and every visible
runner is listed at that instant, sorted by probability, with the percentage
and the price in cents, plus the rest of the field when bands are drawn. The
order re-sorts as you move, so a crossover is something you watch happen rather
than infer from two lines that got close. A runner the venue has no price for
at that instant is left out rather than read back at 0%.

**The axis is fixed at 0 to 100%.** Never scaled to the field. A race whose leader
sits at 12% would otherwise fill the pane and read as a certainty, and two
runners two points apart would look like a chasm. In the line view the empty
top of the chart is part of the reading: nobody here is close to winning.

**Lines or bands.** A fixed axis has one bad failure mode and races hit it
constantly. When the favourite is at 22%, all eight lines share the bottom
fifth of the pane and the gap between second and third is two pixels. So a race
can also be drawn stacked: the same runners as bands laid end to end, in the
same colours, filling the axis by construction. Each band's thickness is that
runner's probability, so second against third stops being two lines a pixel
apart and becomes two heights. The field is ordered the way you read it,
favourite at the top and the longest shots along the axis, so the runner higher
up the chart is the runner in front. The switch sits in the footer beside the
spans, and like the span it is remembered across contracts and across devices.

Stacked bands are the default where they apply. Two rules keep them honest.

They stack the raw probabilities and never normalize to 100%. The obvious
implementation divides each runner by the sum of the drawn ones, which fills
the axis perfectly and reports a 22% favourite as a 30% favourite. Instead the
leftover goes to a grey **Rest of field** band above the runners, which is
exactly the probability mass the chart is not drawing: the runners past the cap,
the ones you toggled off, the ones the venue has no history for, and whatever
the book's overround leaves on the table. Every band measures true and the grey
says how much of the question is off-screen.

And only a field that is genuinely a partition can be stacked at all. A Kalshi
strike ladder is nested rather than exclusive: "above 60k" is true whenever
"above 70k" is, and its Yes prices sum to several dollars, so laying them end
to end would draw a quantity that does not exist. The switch checks what the
field sums to and simply does not appear on markets that fail it, binaries
included, where a stack of two is one boundary line the price chart draws
better.

**Five spans**: 1H, 6H, 1D, 1W, 1M, drawn from the minute, hour and day candles
both venues serve. The span is remembered across contracts, because it is a
reading habit rather than a property of any one question.

Two limits, both stated on the chart rather than left to be discovered. A field
larger than eight runners draws its leaders and the footer says how many are
not on it, with the outcome ladder as the place they all are; and a span that
holds more buckets than the pane has points is strided down, with the footer
naming the stride. The outcome you are on is always drawn, however it is
priced.

Between prints the line carries the last price forward rather than breaking:
the price was 34¢ until it was 41¢. A runner that listed halfway through the
window starts where its data starts, because a flat line reaching back to the
left edge would claim the market priced a candidate that did not exist yet.

On a binary question the two sides are green and red, the same colours the
terminal uses for long and short everywhere else, because taking Yes is the
long side.

### When you want candles anyway

The price chart is still there. Add a **Chart** pane from the Add Pane dialog,
or drop one into your own workspace, and a prediction outcome renders as a
**step line of close** on the cents axis with every chart type and the whole
drawing toolbar available. Buckets that never traded carry the last price
forward there too, with three limits on the fill:

- **It stops at the last real print.** A quiet market ends where its tape ends
  rather than growing a flat line out to now.
- **Volume stays at zero** on a carried bucket, so the volume pane leaves it
  empty and a quiet stretch is still visible as one.
- **Nothing else sees it.** The fill is drawn, not recorded. Signals, the CSV
  export, alerts, and anything the assistant reads work off the real bars, and
  a connector will never invent a candle.

Whichever chart type you pick there is remembered for prediction charts on
their own, so switching to candles here leaves your crypto charts alone. See
[the chart](/docs/chart-panel) for the rest of the toolbar.

## The event page

Open a question and the pair page loads the prediction layout, which leads with
the question rather than with the chart, and puts the whole field a glance away.
The **Race** board is the variant for an event with a hundred answers rather
than two: the same chart and header over the outcome ladder, with the basket
beside it.

**Event Header.** A contract's identity is a sentence, and the route carries an
event id. This is where the sentence goes, with the two facts that change what
the price means: when it resolves, and what the venue says decides it, with the
venue's rules text behind a chip. The full criteria live in the **Event Brief**
below, open rather than behind a hover.

Under the question is **the field**: a strip of chips, one per answer, each with
its price. The chip you are trading is outlined, and clicking any other one
points the chart, the book, the tape and the ticket at it without leaving the
page. A field larger than six chips keeps the rest behind **All N**, in the same
order, never hidden.

The reading on the right depends on the shape of the question. On a binary it
shows one probability large, with the day's move and the split between the two
sides. On a race the field has no single probability, so the headline number is
the sum of every Yes price, with the basis it was summed from: over 100% is the
vig, under 100% is a field the book has not finished quoting.

**Probability Chart.** Every outcome on one axis, directly under the header.
See [the Probability Chart](#the-probability-chart) above for what it draws and
what it refuses to draw.

**Event Brief.** What the contract actually pays on, open on the page rather
than behind a hover. Neither Kalshi nor Polymarket publishes a rules URL, so
there is nothing to link to and the pane carries the prose itself: the venue's
resolution criteria verbatim, with the settlement date and countdown, the
volume, the liquidity and the open interest above it. On a race the criteria
are per runner, not per event, so a picker at the top of the pane chooses which
market's rules you are reading and follows the page when you switch outcomes.

This pane exists because it was possible to read a probability, size a stake
and submit an order without ever seeing the sentence that decides whether you
win. "BTC above $120,000 on August 15" is four different bets depending on
whose print at whose cutoff settles it, and the difference is worth more than
any edge on the chart. The event header still carries the same text behind its
Resolution rules chip, for a workspace that has no room for the pane.

**What Moved It.** The question's own history as a timeline, each row a date, a
signed move in cents, the levels it moved between, and the contracts that
traded while it did. Headlines attach where the question names an instrument
the news feed indexes, matched by time, which the pane states as a correlation
rather than a cause.

**Outcome Ladder.** Every answer in the field priced in cents, sortable and
searchable, with Yes and No chips that point the whole page at that contract.
Clicking a row anywhere else takes Yes on that runner, so reaching a contract is
a whole-row target rather than a name to hit; the No chip and the basket button
keep their own meanings. It opens the data strip on both boards, because "every
way to take a side on this question, with a price and a trade button on each" is
what a prediction board is for, whether the question has two answers or a hundred
and twenty-eight.
This is also the fix for "show 26 more markets": the ninetieth runner is a
filter box away instead of four pages deep. Prices come off a 60-second timer
rather than the tick, so rows hold still while you read them, and the footer
states what the current page is leaving out rather than hiding the tail. The row
you are trading is highlighted, whichever of its two sides you are on.

**Basket Ticket.** Beside the ladder, a way to stake several outcomes in one
submit. It prints three numbers, in the order you need them: **coverage**, the
summed probability of the staked legs, so a basket can say it covers 59% of the
field; **max payout**, which is the largest single leg's payout and never the
sum, because the legs are mutually exclusive and at most one of them pays; and
**max loss**, which is the whole stake, since every leg is a buy. Both figures
are on screen before you commit.

Basket orders go out one leg at a time through the same guarded `placeOrder`
path as a single-outcome ticket, so the risk limits, the vault gate and the
lock screen are all in front of every one of them. They stop at the first
refusal, and every leg that did fill is removed from the basket, so retrying
after a rejection cannot place the same order twice. Legs are always limit
priced at the ask: Kalshi refuses market orders outright, and on a thin race a
five-leg sweep is exactly the order that walks a book.

## The ticket

Select a prediction outcome and the Trade Entry panel switches modes on its
own. What you get:

**The question, not the ticker.** It sits at the top of the ticket, so the last
thing you read before committing is what you are actually trading, with the
resolution date beside it. A 68¢ price a month out and the same price an hour
out are different bets, and the pair key carries neither date.

**An outcome switch.** Every other answer to the same question, listed with its
price, right above the Buy/Sell toggle. Pick one and the ticket, the chart and
the book follow to that contract without leaving the page. Two answers or a
hundred, it is the same control: the favourites inline, the rest behind
**All N**. On a venue this build cannot reach, where there is no field to list,
it falls back to a plain Yes/No toggle.

**Dollars, not contracts.** Size is an amount of collateral, with **$25**,
**$50**, **$100** and **Max** as presets and the dollar amounts configurable.
You decide how much to risk, not how many contracts that buys, and the ticket
does the conversion. Max is the whole balance floored to cents, so the chip can
never ask for more than the account holds. There is no base and quote toggle
and no sell percentage slider, because selling here opens the opposite exposure
rather than disposing of a holding.

**Prices in cents.** The limit field takes 53 for 53¢ and prefills from the
live book, the same as anywhere else in the terminal.

**A payout card.** Above the submit button: **If Yes wins, $147**, with a bar
splitting what the order costs from what it returns, and the stake, profit and
return underneath. A hundred dollars at 68¢ returns $147, and working that out
in your head under a live quote is the one arithmetic step nobody should be
doing. A sold contract is quoted the same way, on the whole dollar it may have
to pay out rather than on the premium it keeps, so a 212% return is never
printed as 68%.

**Max payout, max loss, average fill.** Three rows under the card. Max loss is
what is committed: the stake for a buy, and for a sell the rest of the dollar
the contract may settle at. Both figures come from the same calculation as the
card, so they can never disagree about what is at risk. When the price is not
usable, every one of them shows a dash rather than the last valid number, which
would read as this order's.

Kalshi has no market orders at all, so the ticket offers Limit only there
rather than letting you find out from a rejection. Neither venue offers the
Workflow tab: bracket orders need exchange-native trigger orders, and neither
prediction venue has them.

## Positions and settlement

The **Prediction Positions** panel rides the default prediction layout's data
strip, behind the outcome ladder; on a custom workspace, add it from the Add
Pane dialog, under Trading.
It lists what you hold across your connected prediction venues: the market, the
outcome, the number of contracts, your average price in cents, what it cost,
and how long until it resolves. Once a market settles, the row reads
**Resolved** and shows the payout.

Prediction positions are their own panel rather than a tab in
[Positions](/docs/positions-and-portfolio), because a contract that expires
against a real-world event has different columns than a spot position with a
mark price and an unrealized P&L.

## Ask the assistant about the field

The [assistant](/docs/agent-interfaces) reads prediction markets the same way it
reads a chart. On an event board it already knows the question you have open, the
outcome your ticket is pointed at, and the price of each answer, so "which of
these is the market actually favouring" is a complete question with nothing
pasted in.

Two tools sit behind that. `get_prediction_event` pulls a whole event: every
outcome with its probability, bid, ask and 24h move, the resolution criteria in
the venue's own words, and on a race the sum of every Yes price. That last number
is the one worth asking for out loud, because it says whether the field is priced
over or under a fair 100%. `search_prediction_events` finds an event across both
venues by text or one of the sixteen categories, so "is there a market on the
next Fed cut" is answered rather than delegated. The category is a closed list
rather than free text, and each venue is sent its own word for it, so asking
for Geopolitics returns Kalshi's World book too.

The assistant prepares prediction orders like any other: `place_order` returns a
proposal on a confirm card, priced in collateral units, and it is yours to
approve or throw away. It never places one.

A venue that refuses is reported as refusing. Ask about a Kalshi event from a
browser and you are told Kalshi needs the desktop app, rather than told the event
does not exist.

## Guardrails still apply

Every prediction order goes down the same guarded path as a spot order or a
swap, and your [risk guardrails](/docs/risk-guardrails) are checked there.
Position caps, trade caps, and loss caps size on notional, which for a bought
contract is the premium at risk. The hold-to-confirm submit gesture and the
paper badge behave exactly as they do on a CEX.

## Next

- [Connect an exchange](/docs/connect-an-exchange) for where credentials live
- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Panels](/docs/panels) for everything else you can put beside the chart
