---
title: Terminal tour
description: A guided walk around the screen. What the left nav does, what a workspace is, how to read the pair header, and the one keyboard shortcut worth learning first.
group: get-started
order: 3
eyebrow: Get started
updated: 26 AUG 2026
readTime: 8 min read
---

Pairlens opens on a live chart. Everything else is one click or one keystroke
away. Here is the map, along with the handful of words the terminal uses in a
specific way.

## Four words to know first

**Pair.** A market. Always two assets: what you are buying and what you are
paying with. `BTC-USDT` is Bitcoin priced in Tether. `AAPL` is Apple priced in
dollars. Traders say "pair" even for a stock, out of habit.

**Venue.** The exchange or broker a price came from. Bitcoin does not have one
price, it has a price on Binance, another on Coinbase, another on Kraken. They
are close but never identical, and you can only trade at the venue you are
connected to.

**Panel.** One box on screen doing one job: a chart, an order book, a list of
your positions.

**Workspace.** A saved arrangement of panels. You will build a few, one per way
you trade.

## The left nav

The rail down the left edge is how you move between the big surfaces. Each
section keeps its own colour, so after a week you stop reading labels and just
look at where the colour is.

| Entry                       | What lives there                                                             |
| --------------------------- | ---------------------------------------------------------------------------- |
| **Pairs**                   | Every market your connectors can reach, plus the ones you looked at recently |
| **Charts**                  | Your workspaces and workspace folders                                        |
| **Accounts**                | Exchange keys, broker keys, and wallets, plus a portfolio overview           |
| **Notifications**           | Your alerts, what they delivered, and the builder for the complex ones       |
| **Workflows**               | The order-automation canvas                                                  |
| **Indicators & Strategies** | The Python workbench, if you write your own                                  |
| **Bots**                    | Strategies deployed to a market, running on paper or live                    |
| **Plugins**                 | The Plugin Store and everything you have installed                           |

Below those sit your workspaces, your recent pairs, and the Workspace Store.

## The workspace grid

The middle of the window is your workspace: panels tiled into a grid you
arrange. Drag a separator to resize. Use the menu on a panel's header to split
it, replace it, or close it.

Sixty-eight panels ship in the box. You will use six of them daily. Broadly:

**Finding something to trade.** Scanner, watchlist, movers, heatmaps, the
funding and basis scanners for perps, the launchpad columns for memecoins, the
event board for predictions, the earnings and economic calendars for stocks.

**Reading a market.** Chart, order book, market depth, liquidity heatmap,
multi-price, plus the ones specific to a market type: funding on a perp, pool
stats on-chain, the session clock on a stock, the probability chart on an event.

**Trading it.** Trade entry, positions, portfolio, risk, and the class-specific
tickets like the NFT sweep ticket or the prediction basket.

**Context.** News, symbol news, social, and What Moved It.

Full catalogue in [panels](/docs/panels); the layout model in
[workspaces](/docs/workspaces).

Each market type keeps its own layout, with a default built for what it trades.
Rearranging your perpetuals desk leaves your spot desk alone. Beyond the
default, each type carries named boards in the <kbd>⌘⇧L</kbd> menu: Research on
spot, Carry and Risk on perps, Liquidity and Cross-Chain on-chain, Company on
stocks, Race on predictions.

## Discovery: where to look when you do not know what to trade

The Discovery page is the market-wide view, and it changes completely depending
on which tab you pick. Only one of them is a plain list of pairs. Futures opens
on funding and basis, on-chain opens on chains and pools, memecoins on four
columns of launchpad tokens, NFTs on collections, equities on the session and
the calendars, predictions on the event board.

That is deliberate. What you want to see first is different for each market:
on a perp it is who is paying whom to hold a position, on a stock it is whether
the market is even open.

## The pair header

The strip above the grid names what you are looking at: the symbol, the current
price, the 24-hour change, and the venue streaming it. Click the symbol to
switch markets. A connection dot shows stream health on a scale rather than a
switch: **Live** while data is arriving, **Delayed** once a feed falls behind
the rhythm it had been keeping with its socket still open, **Reconnecting**
once it goes quiet altogether. Hover it for the reason and for how long it has
been since anything arrived. Delayed is the one worth knowing about, because a
weak connection does not fail cleanly. It keeps trickling frames in late, and a
green dot over a tape running seconds behind is the reading that costs you.

Beside the symbol sits a coloured badge naming the market type: **SPOT**,
**PERP**, **DEX**, **MEME**, **STOCK** or **EVENT**. This matters more than it
looks. Buying $100 of a spot pair and buying $100 of a perpetual are different
trades with different ways to lose, so the badge says which one you are on
rather than leaving you to decode the ticker. Three of them add the detail that
changes the answer: a pool names its chain, a stock names the session when you
are outside regular hours, an event says whether it is a yes-or-no question or a
field of several answers. Hover for a one-line explanation.

The venue button next to it lists only the venues that can serve what you are
looking at. Spot exchanges under a spot pair, perpetual venues under a perp,
your broker under a stock. Tokens and event contracts carry their venue inside
their own identity, so there the button is a label rather than a menu: a
Polymarket contract does not exist on Kalshi, and the same address on a
different chain is a different asset.

That same button sits on the **CEX Spot** Discovery board, so you can change
exchange while browsing rather than opening a pair you did not want. It is one
choice across the app: pick Binance there and the scanner, the movers table, the
heatmap and every watchlist row price on Binance from then on.

Want a running strip of live prices for pairs you have been watching? Turn on
the marquee in **Settings → Appearance**.

## The assistant

An orb sits in the nav rail with a line of text that changes with the page:
**Analyze the chart of BTC/USDT** on a chart, **Build a workflow** on the
workflows page. Click it, or press <kbd>⌘/</kbd>, and a chat opens over the
terminal.

Ask it what a panel is telling you, to add an indicator, to research an asset,
or to draft an order. It reads what is on your screen, so "why is this moving?"
is a complete question. It can propose a trade but never place one: those arrive
as a card you approve or reject.

Prefer it in the corner? **Settings → Assistant** moves the orb to the bottom
right. The chat window drags anywhere by its header and stays where you drop
it. It sits outside the workspace grid, so it takes no layout space and
minimizing it never stops work already running. See
[the AI assistant](/docs/ai-copilot).

## What the address bar says

A chart's web address names three things: the market type, the venue, and the
instrument.

```
/spot/okx/BTC-USDT        a crypto spot pair on OKX
/spot/gate/BTC-USDT       the same pair, Gate's book
/stocks/alpaca/AAPL       a US stock through your broker
/dex/base/0x532f…-WETH    a token on Base, addressed by contract
```

The venue is in the address because a price without its exchange is not a fact.
Switching venue changes the address, so the back button returns you to the
previous venue with the drawings you made there, and a link you send someone
opens the exact market you were looking at.

Tokens are addressed by contract rather than ticker, because dozens of tokens
share a symbol and a link built from a ticker can open the wrong asset. Older
`/pair/BTC-USDT` links still work and redirect to the full form.

## Search everything

Press <kbd>⌘K</kbd> (<kbd>Ctrl</kbd>+<kbd>K</kbd> on Windows and Linux). This is
the shortcut to learn. It searches:

- Pairs, including ones you have never opened
- Venues, which switches the chart on a pair page and sets your default
  elsewhere
- Pages, workspaces, workflows, and alert rules
- Panels you can add to the current layout
- Plugins
- Actions such as switching theme, opening settings, or opening a new window

## Multiple windows

On the desktop app you can pull any view into its own window with <kbd>⌘N</kbd>,
from the titlebar button, or from search. Windows stay in sync, and a
notification fires once rather than once per window.

## Signed in or not

Everything above works with no account. Signing in with your email adds
cross-device sync for workspaces, chart layouts, alerts, workflows and your
trade journal, and offers it for your assistant conversations, which stay on the
device that made them until you say otherwise.

Signing in never changes where your keys live. Exchange credentials stay on your
device either way.

## Where to next

- [Reading the market](/docs/market-data) for the book, the tape, and depth
- [The chart](/docs/chart-panel) for chart types, drawings, and indicators
- [Trading](/docs/trading) to connect a venue and place your first order
- [Keyboard shortcuts](/docs/keyboard-shortcuts) for the full list
- [Glossary](/docs/glossary) if a term here was new
