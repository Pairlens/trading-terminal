---
title: Prediction markets
description: Trade event contracts on Kalshi and Polymarket from the same terminal, with prices in cents, an event board, an outcome ladder, a basket ticket that states its overround, and positions that settle.
group: traders
parent: trading
order: 6
eyebrow: For traders
updated: 17 AUG 2026
readTime: 12 min read
---

An event contract is a market on something that either happens or does not.
Will the Fed cut in September, will this team win, will BTC close above 53k.
In Pairlens it behaves like any other instrument: it has a chart, an order
book, a tape, and the same guarded ticket. What changes is the unit. A contract
is priced between 0 and 1, shown in cents, and pays one unit of collateral if
its outcome resolves true.

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
rail on the left with a live contract count per category, the **Event Board**
across the middle, and a right rail carrying **Odds Movers** over **Resolving
Soon**. The tab is its own workspace, so what you arrange there stays there.
The Predictions filter in the Markets panel sends you to it rather than showing
an empty grid, because prediction outcomes are never in the pair catalog that
panel reads: they are listed and resolved daily.

**The Event Board** draws every live question as a card that prices both sides.
A binary question has one number worth reading, so the probability gets the
largest type on the board. A race has a hundred and none of them is the
headline, so its card widens, ranks the field, and says how much of the
probability mass the leaders hold, with a way through to the full ladder. The
probability is shown as a percentage and the tradeable prices in cents on
purpose: the percentage is the reading, the cents are the price. No dollar
figure appears beside either. The search box narrows the venue's own board when
it can and asks the venue when it cannot, because the board holds thirty events
per venue and anything past that only exists behind a venue-side query.

**Odds Movers** ranks by how much a contract's probability changed in the last
day, stated in points rather than percent. A contract going from 64¢ to 78¢
moved fourteen points; calling that "+21.9%" is arithmetically true and
useless, because probabilities are compared by subtraction. A venue that
publishes no 24h move is excluded and named in the footer, so a silent venue
never looks like a quiet market.

**Resolving Soon** sorts by the clock alone. It is the one thing a
volume-ranked board cannot tell you: 60¢ a month out and 60¢ an hour out are
different bets, and the second one is nearly decided. Anything already settled
is dropped rather than shown as closed.

The category rail narrows all three at once, and it counts from the unfiltered
result, so picking a category never shrinks the rail that did the narrowing.

The **Events** panel also sits on the default prediction layout, beside the
chart; on a custom workspace, add it from the Add Pane dialog, under Discovery. It
queries every prediction venue you have connected and shows what is busy right
now: category chips across the top, a search box that matches question text, and
a card per event with its artwork, how long until it closes, its volume, and a
price for each outcome. Yes is green and No is red, the same two colours the
terminal uses for long and short everywhere else, because taking Yes is the long
side. Click an outcome and it opens in the chart terminal. A venue that needs the
desktop app says so in place of its results rather than returning nothing.

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
same full event as its own screen. The section is only there when a prediction
connector is installed and enabled. The phone's ticket sizes in dollars too,
with the same presets, the same payout card and the same conversion to whole
contracts; what it does not carry is the preset editor, the outcome and race
switches, and the basket. See [Mobile terminal](/docs/mobile-terminal).

Search works from the pair picker too. It grows a **Predictions** tab beside
Crypto and Stocks, and prediction rows are rendered as the question rather than
as a ticker, because `KXBTCD-26AUG15-T53` is not something you scan.

## What a prediction is called

An outcome's routing key can be a hundred characters of event slug. Nothing in
the terminal shows you one. Wherever a ticker would go, a prediction renders as
a subject and a side instead: **Gavin Newsom · Yes**, with the whole question on
hover. The subject is the venue's own short label for that market inside its
event, which is the one thing that separates two candidates in the same race;
where a venue publishes none, it falls back to the question, then to the event
heading.

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

Each outcome is its own instrument. Yes and No are two separate contracts on
the same question, and you can buy or sell either one. Selling Yes at 53¢ and
buying No at 47¢ are close cousins, not the same order, and the book will tell
you which is cheaper.

## The event page

Open an outcome and the pair page loads the prediction layout, which leads with
the question rather than with the chart.

**Event Header.** A contract's identity is a sentence, and the route carries
`KXBTCD-26AUG15-T53`. This is where the sentence goes, with the two facts that
change what the price means: when it resolves, and what the venue says decides
it. Neither Kalshi nor Polymarket publishes a link to its rules, so the header
carries the rules text itself in a popover rather than pointing at a page that
does not exist. On a binary question it shows one probability large, with the
day's move and the split between the two sides. On a race the field has no
single probability, so the headline number is the sum of every Yes price, with
the basis it was summed from: over 100% is the vig, under 100% is a field the
book has not finished quoting.

**What Moved It.** The question's own history as a timeline, each row a date, a
signed move in cents, the levels it moved between, and the contracts that
traded while it did. Headlines attach where the question names an instrument
the news feed indexes, matched by time, which the pane states as a correlation
rather than a cause.

**Outcome Ladder.** On the **Race** board, every runner in the field priced in
cents, sortable and searchable, with Yes and No chips that pin the outcome and
switch the whole page to it. This is the fix for "show 26 more markets": the
ninetieth runner is a filter box away instead of four pages deep. Prices come
off a 60-second timer rather than the tick, so rows hold still while you read
them, and the footer states what the current page is leaving out rather than
hiding the tail.

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

**An outcome switch.** When the question has exactly one other side, a
segmented control names it. Tap it and the ticket, the chart, and the book
follow to that contract. A market with several outcomes has no single sibling,
so in its place a race switch lists the other runners, and picking one moves
the whole page to it.

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
strip; on a custom workspace, add it from the Add Pane dialog, under Trading.
It lists what you hold across your connected prediction venues: the market, the
outcome, the number of contracts, your average price in cents, what it cost,
and how long until it resolves. Once a market settles, the row reads
**Resolved** and shows the payout.

Prediction positions are their own panel rather than a tab in
[Positions](/docs/positions-and-portfolio), because a contract that expires
against a real-world event has different columns than a spot position with a
mark price and an unrealized P&L.

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
