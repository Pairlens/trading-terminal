---
title: Panels
description: Every panel in the Pairlens crypto trading terminal, from charts and order books to news and sentiment, what each shows, and which plugin provides it.
group: traders
parent: workspaces
order: 1
eyebrow: For traders
updated: 16 AUG 2026
readTime: 4 min read
---

Panels are contributed by plugins, which is why the catalogue grows when you
install one. Everything below ships in the box, from **Pairlens Core**,
**Pairlens Intelligence**, or **Pairlens Predictions**.

## Charting and data

| Panel                 | What it shows                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- |
| **Chart**             | The main chart: 16 types, 90 indicators, 45 drawing tools. See [the chart](/docs/chart-panel) |
| **Order Book**        | Live bids and asks. See [the order book](/docs/order-book)                                    |
| **Trades**            | The live tape. See [time and sales](/docs/time-and-sales)                                     |
| **Market Depth**      | The cumulative depth curve. See [depth and liquidity](/docs/depth-and-liquidity)              |
| **Liquidity Heatmap** | Resting liquidity over time. See [depth and liquidity](/docs/depth-and-liquidity)             |
| **Multi-Price**       | Every venue at once. See [cross-venue pricing](/docs/cross-venue-pricing)                     |
| **Pair Info**         | Key stats and metadata for the active pair                                                    |
| **Data Log**          | The raw signal and event feed                                                                 |

The Liquidity Heatmap is the one people miss. It renders where resting
liquidity has actually sat over the last few hours, which shows you the levels
the book keeps defending rather than the ones you drew.

Multi-Price answers a question a single chart cannot: where is this pair
cheapest right now. It quotes the active pair on every venue that lists it and
sorts by price, so the top row is the answer. The
[Cross-Venue Desk](/docs/workspaces#the-workspace-store) template is built
around it.

## Trading

| Panel                    | What it shows                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Trade Entry**          | The order ticket. See [place an order](/docs/place-an-order)                                                    |
| **Positions**            | Positions, orders, fills, and balances, in four tabs                                                            |
| **Portfolio**            | Account holdings with an allocation breakdown                                                                   |
| **Risk**                 | Current window P&L, trade count, and guardrail state                                                            |
| **Prediction Positions** | Event contracts you hold, their cost, and when they resolve. See [prediction markets](/docs/prediction-markets) |
| **Futures Positions**    | Open perpetuals with entry, mark, liquidation and P&L. See [perpetual futures](/docs/cex-futures)               |

Trading panels get their own page: see
[positions and portfolio](/docs/positions-and-portfolio).

The Risk panel is compact by design. It sits in a corner and reads **All
clear**, **Caution**, or **Limit hit**, which is all you need to know at a
glance. See [risk guardrails](/docs/risk-guardrails).

## Discovery

| Panel              | What it shows                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Markets**        | Every pair your connectors reach. See [discovery](/docs/market-discovery)                |
| **Events**         | Prediction-market events by category. See [prediction markets](/docs/prediction-markets) |
| **Watchlist**      | Tracked pairs, starting with Top Crypto and Top Equities                                 |
| **Recent Tickers** | Recently viewed pairs with live prices, for quick switching                              |
| **Top Coins**      | Coins ranked by volume, market cap, and price change                                     |
| **Heatmap**        | Market performance across sectors at a glance                                            |
| **Web**            | Any website, embedded as a panel (desktop app only)                                      |

The Web panel is a genuine escape hatch. Put your exchange's own page, a
TradingView idea, a Dune dashboard, or your notes app next to your chart.

It runs in the desktop app only. Embedding a site takes a native window the app
places over the panel, and a browser tab has nothing but an iframe, which most
sites refuse to load in. In the browser the panel is offered but marked Desktop
only, and a layout that already has one says the same thing in place of the
site.

## News and sentiment

| Panel            | What it shows                                      |
| ---------------- | -------------------------------------------------- |
| **News**         | Crypto news aggregated from top sources            |
| **Symbol News**  | News and sentiment filtered to the active pair     |
| **Social**       | Social sentiment and community activity for a pair |
| **Fear & Greed** | The market sentiment gauge                         |

## The AI is not a panel

There is no AI Lens panel and no Research panel to add. The
[assistant](/docs/ai-copilot) is docked outside the workspace grid, at the
bottom right or in the left nav rail depending on what you set, so it costs you
no layout space and stays with you when you change workspace, page or pair. Research is one of its tools
rather than a pane. See [research reports](/docs/research-reports).

## Requirements

Panels declare what they need to render:

- Most charting panels need an **active pair**
- Trading panels need an **active wallet**, which is one of your connected
  accounts
- News, Top Coins, Heatmap, and Fear and Greed read from the App Server, so
  they are hidden when the terminal runs
  [standalone](/docs/self-hosting#standalone-mode)

When a requirement is unmet, the panel says what to pick rather than rendering
blank. Bind them once through
[workspace variables](/docs/workspaces#variables) and every panel in the layout
follows.

## Singletons

Chart, Trade Entry, Portfolio, Risk, Markets, Events, Liquidity Heatmap, and
Recent Tickers are singletons: one per workspace. Everything else can appear as
many times as you like, which is how you get four order books for four venues
side by side.

## Panels from plugins

Any installed plugin can contribute panels through the plugin system, and they
appear in the add-panel dialog next to the built-ins with their own category.
See [plugins](/docs/plugins-for-traders).
