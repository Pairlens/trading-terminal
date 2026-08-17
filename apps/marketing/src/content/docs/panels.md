---
title: Panels
description: Every panel in the Pairlens crypto trading terminal, from charts and order books to funding scanners, liquidation clusters, LP and bridge panes, calendars and event boards, what each shows, and which plugin provides it.
group: traders
parent: workspaces
order: 1
eyebrow: For traders
updated: 17 AUG 2026
readTime: 10 min read
---

Panels are contributed by plugins, which is why the catalogue grows when you
install one. Sixty-eight ship in the box, from **Pairlens Core**, **Pairlens
Intelligence**, and the four asset-class families: **Pairlens Futures**,
**Pairlens DEX**, **Pairlens Equities**, and **Pairlens Predictions**.

Uninstall a family from the Plugins page and its panels leave the Add Pane
dialog with it. That is the user-level way to drop a whole asset class. See
[plugins](/docs/plugins-for-traders).

## Charting and data

| Panel                 | What it shows                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Chart**             | The main chart: 16 types, 90 indicators, 45 drawing tools. See [the chart](/docs/chart-panel)                                        |
| **Order Book**        | Live bids and asks. See [the order book](/docs/order-book)                                                                           |
| **Trades**            | The live tape. See [time and sales](/docs/time-and-sales)                                                                            |
| **Market Depth**      | The cumulative depth curve. See [depth and liquidity](/docs/depth-and-liquidity)                                                     |
| **Liquidity Heatmap** | Resting liquidity over time. See [depth and liquidity](/docs/depth-and-liquidity)                                                    |
| **Multi-Price**       | Every venue at once. See [cross-venue pricing](/docs/cross-venue-pricing)                                                            |
| **Venue Ladder**      | Every connected venue's best bid and ask for this pair, ranked so the cheapest fill is the top row                                   |
| **Pair Info**         | Key stats and metadata for the active pair                                                                                           |
| **Pair Dossier**      | The stats that decide a size: range, volume, liquidity within one percent, and where the pair trades best                            |
| **Data Log**          | The raw signal and event feed                                                                                                        |
| **Funding Belt**      | The countdown to the next funding stamp, the current and predicted rate, and what your size pays or earns                            |
| **Liquidation Map**   | A time-by-price heatmap of measured liquidations, painted behind the contract's candles, with your own liquidation levels over it    |
| **Pool Stats**        | Reserves, value locked, a day's volume, the fee tier, and quoted price impact at $1k, $10k and $100k                                 |
| **On-chain Trades**   | Every swap through the pool as it confirms, with the signing address and a link to the transaction                                   |
| **Chain Ladder**      | The same token priced on every chain with gas folded in, so the best total wins rather than the best quote                           |
| **Session Clock**     | A one-line clock for the trading day, so an out-of-hours ticket is never a surprise                                                  |
| **Level 1**           | Bid and ask with their sizes, the spread in price and basis points, where the last print sits, and a halt row when the venue says so |
| **Company**           | The ticker as a business: next report, valuation, growth, margins, the range and the analyst split                                   |
| **Insider Activity**  | Form 4 buys and sells for this ticker: date, insider, role, shares, price, value, and a buys-versus-sells summary                    |
| **Event Header**      | The question, when and how it resolves, and the probability the market is paying right now                                           |

The Liquidity Heatmap is the one people miss. It renders where resting
liquidity has actually sat over the last few hours, which shows you the levels
the book keeps defending rather than the ones you drew.

Multi-Price answers a question a single chart cannot: where is this pair
cheapest right now. It quotes the active pair on every venue that lists it and
sorts by price, so the top row is the answer. The Venue Ladder is the compact
version of the same idea, sized for a rail above the book, and it leads the
spot pair default.

Level 1 stands in for an order book on a stock, and says so in the pane. The
broker's feed carries top of book only, so there is no depth behind the quote
and none is drawn. It also carries a halt row, and that row appears only when
the venue has actually said something: a ticker with no status means the venue
has not spoken, which is not the same as trading normally, so an absent status
draws no row rather than a reassuring green one. Pool Stats does the same job on
an AMM: the on-chain pair layout ships with no book and no depth pane, because a
data provider's bid and ask are synthesized around the pool price, and the impact
rows are live aggregator quotes at three real sizes rather than curve math.

The Liquidation Map is a heatmap over time and price, and every cell in it is a
print. It hosts its own candles of the contract and paints the venue's force-order
history behind them: a column per candle, a row per price bucket, coloured by the
side that was liquidated and darkened by the notional. Your own liquidation levels
ride over the cells as dashed lines from each venue's position payload. Chips pick
1h, 6h, 24h or 72h and the candle interval follows, from 1m up to 1h. A source
control switches between the collectors that answer for the contract and never
blends them, because a sampled feed and a complete one are not comparable by
magnitude. See [perpetual futures](/docs/cex-futures#reading-the-risk).

## Trading

| Panel                    | What it shows                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Trade Entry**          | The order ticket. See [place an order](/docs/place-an-order)                                                          |
| **Positions**            | Positions, orders, fills, and balances, in four tabs                                                                  |
| **Portfolio**            | Account holdings with an allocation breakdown                                                                         |
| **Risk**                 | Current window P&L, trade count, and guardrail state                                                                  |
| **Futures Positions**    | Open perpetuals with entry, mark, liquidation and P&L. See [perpetual futures](/docs/cex-futures)                     |
| **Margin Health**        | Margin ratio and maintenance against available, one section per connected futures account                             |
| **Risk Controls**        | Your daily loss cap, trade count, position size and kill switch, editable where the trade happens                     |
| **Prediction Positions** | Event contracts you hold, their cost, and when they resolve. See [prediction markets](/docs/prediction-markets)       |
| **Outcome Ladder**       | Every runner in the event priced in cents, sortable and searchable, with a stake button on each row                   |
| **Basket Ticket**        | Stake several outcomes at once, with the total cost, the stated overround and your worst case before you submit       |
| **Your Position**        | What you hold in this symbol: shares, average cost, mark, market value, and both the open and the day figure          |
| **Route**                | How the aggregator would split a swap across pools, so the slippage on the ticket has a stated cause                  |
| **Fee Accrual**          | What your positions are owed in fees, both legs, per position and in total. See [DEX and wallets](/docs/dex-trading)  |
| **LP Position**          | Your concentrated-liquidity band against the live pool price, the two amounts behind it, and fees not yet collected   |
| **Manage Liquidity**     | Collect fees, remove part of a range or add to it, each behind a card that states exactly what will be signed         |
| **Bridge Route**         | A live cross-chain quote: what lands, the floor under it, the bridge fee, the source gas, and which bridge carries it |
| **In Flight**            | Transfers still crossing, each with the stage it is waiting on and both transactions linked                           |

Trading panels get their own page: see
[positions and portfolio](/docs/positions-and-portfolio).

The Risk panel is compact by design. It sits in a corner and reads **All
clear**, **Caution**, or **Limit hit**, which is all you need to know at a
glance. Risk Controls is the same limits made editable in place: it writes the
store the guarded order path reads before every placement, so the two can never
disagree and a cap set there is live on the next order without a save button.
See [risk guardrails](/docs/risk-guardrails).

The five on-chain panels all sign or read with the wallet you already connected,
and each is careful about what it will not claim. Manage Liquidity offers
collect, remove and add, and deliberately offers no range editor: moving a band
burns the position and mints a new one, which is a replacement rather than an
edit. Bridge Route re-quotes at signing time and refuses a route worse than the
one you confirmed. In Flight shows a stage rather than a progress bar, because
the aggregator publishes a stage and a bar drawn from that would advance smoothly
on a transfer that is stuck. The LP panels read live chain state, and the figures
chain state cannot carry (cost basis, fee APR, time in range, loss versus
holding) are called out in their own footnotes rather than estimated. See
[DEX and wallets](/docs/dex-trading).

## Discovery

| Panel                 | What it shows                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Markets**           | Every pair your connectors reach. See [discovery](/docs/market-discovery)                                       |
| **Watchlist**         | Tracked pairs, starting with Top Crypto and Top Equities                                                        |
| **Recent Tickers**    | Recently viewed pairs with live prices, for quick switching                                                     |
| **Top Coins**         | Coins ranked by volume, market cap, and price change                                                            |
| **Heatmap**           | Market performance across sectors at a glance                                                                   |
| **Fear & Greed**      | The market sentiment gauge                                                                                      |
| **Market Pulse**      | Three numbers for the whole market, with one line on what moved and why                                         |
| **Movers**            | The day's gainers and losers with the volume behind each, plus a New listings tab for what just started trading |
| **Sector Tape**       | Every sector as a chip with its move and a breadth bar, so rotation reads in one glance                         |
| **Sector Peers**      | How the rest of this pair's sector traded today, with the pair itself pinned on top                             |
| **Web**               | Any website, embedded as a panel (desktop app only)                                                             |
| **Funding Matrix**    | Funding for every perp on every venue you connected, annualised, in a grid you can sort by any column           |
| **Basis Monitor**     | Perp against spot in basis points and annualised, so carry reads as a yield instead of a gap                    |
| **Open Interest**     | Open interest per contract with its 24h change, each row naming the venue that measured it                      |
| **Funding Extremes**  | The most positive and most negative rates right now, one entry per contract per venue                           |
| **Chains**            | Every chain the terminal knows, with gas, liquidity and a day's volume beside it                                |
| **Pool Map**          | The chain's pools ranked by volume against liquidity, so the ones actually trading come first                   |
| **Liquidity Flow**    | Net taker flow through the pool in five-minute buckets, with the biggest single swaps beside it                 |
| **Pool Detail**       | The selected pool at a glance, one click from its chart and a swap                                              |
| **Session**           | Where the trading day is right now, from the broker's own calendar, holidays and half days included             |
| **Earnings Calendar** | Who reports and when, with the consensus estimate, a watchlist scope, and an IPO tab for the forward pipeline   |
| **Economic Calendar** | Forward US macro releases by the clock, compiled from the agencies' own publication schedules                   |
| **Events**            | Prediction-market events by category. See [prediction markets](/docs/prediction-markets)                        |
| **Categories**        | Every event category with a live contract count, so the board narrows in one click                              |
| **Event Board**       | Live event markets as cards: the question, Yes and No in cents, volume, and when it resolves                    |
| **Odds Movers**       | The contracts whose probability moved most today, with the move stated in points                                |
| **Resolving Soon**    | Contracts closest to settlement, sorted by the clock rather than by volume                                      |

Everything from Funding Matrix down arrives with an asset-class family, so a
terminal with Pairlens DEX uninstalled has no Chains panel to add. These are
also the panels the per-class [Discovery boards](/docs/workspaces) are built
from.

The Web panel is a genuine escape hatch. Put your exchange's own page, a
TradingView idea, a Dune dashboard, or your notes app next to your chart.

It runs in the desktop app only. Embedding a site takes a native window the app
places over the panel, and a browser tab has nothing but an iframe, which most
sites refuse to load in. In the browser the panel is offered but marked Desktop
only, and a layout that already has one says the same thing in place of the
site.

The two calendars read from the App Server rather than from a broker, because a
broker publishes the schedule of its own venue and knows nothing about who
reports on Thursday or when CPI prints. Earnings carries a source toggle for the
IPO pipeline. Economic compiles its window from the agencies' own publication
schedules, and carries no consensus, actual or prior column: no agency forecasts
itself and none of them publish the street's number, so three columns of dashes
would be the pane pretending to a feed it does not have.

Liquidity Flow is named carefully. Neither data provider has a liquidity-flow
endpoint, so nothing on it measures deposits or withdrawals. What it measures
is the money that crossed the pool: buy notional minus sell notional per
bucket, off the same swap feed the tape shows.

## News and sentiment

| Panel             | What it shows                                                                    |
| ----------------- | -------------------------------------------------------------------------------- |
| **News**          | Crypto news aggregated from top sources                                          |
| **Symbol News**   | News and sentiment filtered to the active pair                                   |
| **Social**        | Social sentiment and community activity for a pair                               |
| **What Moved It** | A prediction's history as a timeline, each row stamped with the move it recorded |

What Moved It always draws the moves, because they come from the probability
history the chart is already streaming: a date, a signed move in cents, the
levels it moved between, and the contracts that traded while it did. The
headline column is the honest half. The news feed is keyed by ticker and most
questions name none, so headlines attach only where the question names an
instrument the feed indexes, and the match is by time rather than by any claim
about cause. The pane says exactly that in its footer, so an empty column is
never read as a quiet week.

## The AI is not a panel

There is no AI Lens panel and no Research panel to add. The
[assistant](/docs/ai-copilot) is docked outside the workspace grid, at the
bottom right or in the left nav rail depending on what you set, so it costs you
no layout space and stays with you when you change workspace, page or pair. Research is one of its tools
rather than a pane. See [research reports](/docs/research-reports).

## Requirements

Panels declare what they need to render:

- Nearly every charting panel needs an **active pair**, Level 1, Company,
  Insider Activity, Pool Stats, On-chain Trades, Chain Ladder, Funding Belt,
  Liquidation Map and Event Header included. So do Route, Outcome Ladder and
  Sector Peers. Session Clock is the exception: the market is open or closed
  whatever pair is on screen, which is exactly why it sits above the ticket
- Positions, Portfolio, Margin Health and In Flight need an **active wallet**,
  which is one of your connected accounts. Trade Entry, Your Position, Basket
  Ticket, Bridge Route and the three LP panels need a pair **and** a wallet
- Futures Positions, Prediction Positions, Risk Controls and the scanner
  panels need neither. A futures or prediction account is an API credential
  rather than a workspace wallet, so those panels read across every connected
  account and say themselves what is missing
- News reads from the App Server, so it is empty when the terminal runs
  [standalone](/docs/self-hosting#standalone-mode). So do both calendars,
  Insider Activity, the Movers listings tab and the Liquidation Map's measured
  clusters, and each says so rather than reading as an empty week. Top Coins,
  Heatmap and Fear and Greed fall back to keyless public sources instead, and
  Market Pulse, Movers and Sector Tape ride the same snapshot Top Coins does
- Session, Session Clock and Your Position need a connected broker, because the
  trading calendar is the broker's
- Web needs the desktop app

When a requirement is unmet, the panel says what to pick rather than rendering
blank. Bind them once through
[workspace variables](/docs/workspaces#variables) and every panel in the layout
follows.

## Singletons

Sixteen panels are singletons, one per workspace: Chart, Trade Entry,
Portfolio, Risk, Markets, Liquidity Heatmap, Recent Tickers, News, Top Coins,
Heatmap, Chains, Pool Map, Events, Categories, Event Board, and Basket Ticket.

Everything else can appear as many times as you like, which is how you get four
order books for four venues side by side.

## Panels from plugins

Any installed plugin can contribute panels through the plugin system, and they
appear in the add-panel dialog next to the built-ins with their own category.
See [plugins](/docs/plugins-for-traders).
