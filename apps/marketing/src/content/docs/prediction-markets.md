---
title: Prediction markets
description: Trade event contracts on Kalshi and Polymarket from the same terminal, with prices in cents, a Yes and No ticket, an event browser, and positions that settle.
group: traders
parent: trading
order: 6
eyebrow: For traders
updated: 15 AUG 2026
readTime: 8 min read
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
plugin ships: the event browser takes the wide column, the news wire runs
beside it, and a light rail carries your watchlist over the sentiment gauge.
The tab is its own workspace, so what you arrange there stays there. The
Predictions filter in the Markets panel sends you to it rather than showing an
empty grid. Prediction
outcomes are never in the pair catalog that panel reads, because they are
listed and resolved daily.

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
connector is installed and enabled. See
[Mobile terminal](/docs/mobile-terminal).

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
the watchlist, the chart watermark, the order ticket and the phone's pair
chip all show. It is also why a prediction never breaks a row built for six
characters.

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

## The ticket

Select a prediction outcome and the Trade Entry panel switches modes on its
own. What you get:

**The question, not the ticker.** It sits at the top of the ticket, so the last
thing you read before committing is what you are actually trading.

**An outcome switch.** When the question has exactly one other side, a
segmented control names it. Tap it and the ticket, the chart, and the book
follow to that contract. A market with several outcomes has no single sibling,
so the switch is left off rather than guessing.

**Contracts, not amounts.** Size is a whole number of contracts with a stepper
and a configurable preset row. There is no base and quote toggle, and no sell
percentage slider, because selling here opens the opposite exposure rather than
disposing of a holding.

**Prices in cents.** The limit field takes 53 for 53¢ and prefills from the
live book, the same as anywhere else in the terminal.

**A max loss line.** Above the submit button, the worst case in dollars:
contracts multiplied by price when you buy, contracts multiplied by one minus
price when you sell, because a sold contract can settle at a dollar.

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
