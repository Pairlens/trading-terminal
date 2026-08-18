---
title: Terminal tour
description: The left nav, the workspace grid, the pair header, and the search palette. Learn where everything lives before you start trading.
group: get-started
order: 3
eyebrow: Get started
updated: 19 AUG 2026
readTime: 7 min read
---

Pairlens opens on a live chart. Everything else is one click or one keystroke
away. Here is the map.

## The left nav

The rail down the left side is how you move between the big surfaces.

| Entry                       | What lives there                                                             |
| --------------------------- | ---------------------------------------------------------------------------- |
| **Pairs**                   | Every instrument your installed connectors can reach, plus your recent pairs |
| **Charts**                  | Your workspaces and workspace folders                                        |
| **Accounts**                | Exchange keys, broker keys, and on-chain wallets, plus a portfolio overview  |
| **Notifications**           | Your alerts, what they delivered, and the flow builder for the complex ones  |
| **Workflows**               | The order-automation canvas                                                  |
| **Indicators & Strategies** | The Python workbench for chart indicators and bot strategies                 |
| **Bots**                    | Strategies deployed to a market, running on paper or live                    |
| **Plugins**                 | The Plugin Store and everything you have installed                           |

Below those sit your workspaces, your recent pairs, and the Workspace Store.

## The workspace grid

A workspace is a saved arrangement of panels. Every panel is contributed by a
plugin, which is why the catalogue grows when you install one. Sixty-eight ship
in the box, in four categories:

**Discovery.** The scanner and the watchlist, the crypto context panes (Market
Pulse, Movers, Sector Tape, Top Coins, Heatmap, Fear and Greed), the perp
scanners (Funding Matrix, Basis Monitor, Open Interest, Funding Extremes), the
on-chain rails (Chains, Pool Map, Liquidity Flow, Pool Detail), the stock
calendars (Session, Earnings, Economic), the event surfaces (Events,
Categories, Event Board, Odds Movers, Resolving Soon), and Web.

**Charting and data.** Chart, Order Book, Market Depth, Liquidity Heatmap,
Multi-Price, Venue Ladder, Pair Info, Pair Dossier, Data Log, plus the
class-specific ones: Funding Belt and Liquidation Map on a perp, Pool Stats,
On-chain Trades and Chain Ladder on a pool, Session Clock, Level 1, Company and
Insider Activity on a stock, Event Header, Probability Chart and Event Brief
on a contract.

**Trading.** Trade Entry, Positions, Portfolio, Risk, Futures Positions, Margin
Health, Risk Controls, Prediction Positions, Outcome Ladder, Basket Ticket,
Your Position, Route, and the LP and bridge panels.

**News and sentiment.** News, Symbol News, Social, What Moved It.

Drag a separator to resize. Use the pane menu to split, replace, or close.
Sixteen panels are singletons and appear once per workspace. Both the pair page
and Discovery keep a separate layout per asset class, each with a default built
for what it trades: rearranging your perps desk leaves your spot desk alone.
Beyond that default, each class carries its own named boards in the
<kbd>⌘⇧L</kbd> menu, Research on spot, Carry and Risk on perps, Liquidity and
Cross-Chain on-chain, Company on stocks, Race on predictions.

On Discovery those layouts are the tabs beside the title, and you can drag them
into the order you work in. Only one of the five boards is a list of pairs:
futures opens on funding and basis, DEX on chains and pools, equities on the
session and the calendars, predictions on the event board. Full details in
[panels](/docs/panels), and the layout model in
[workspaces](/docs/workspaces).

## The pair header

Above the grid sits the active pair: its price, 24-hour change, and the venue
it is streaming from. Click the symbol to switch markets. A connection dot
shows stream health, and turns to **Reconnecting** if a socket goes quiet, for
instance after your laptop wakes from sleep.

The venue button beside it lists only the venues that can serve what you are
looking at: spot exchanges under a spot pair, perpetual venues under a perp,
your broker under a stock. Tokens and event contracts carry their venue inside
their own identity, so there the button is a label rather than a menu. A
Polymarket outcome does not exist on Kalshi, and the same address on another
chain is a different asset, so there is nothing to switch to.

Turn on the recent-tickers marquee in **Settings → Appearance** if you want a
running strip of live prices for the pairs you have been looking at.

## The assistant

An orb sits in the left nav rail, under the charts icon, and it has a line of
text that is contextual: **Analyze the chart of BTC/USDT** on a chart, **Build a
workflow** on the workflows page, **Write an indicator** in the workbench. The
line flies out when you hover the orb, and on its own while the assistant is
working. Click the orb, or press <kbd>⌘/</kbd>, and the chat opens over the
terminal.

If you would rather have it in the corner with its suggestion always readable,
**Settings → Assistant** moves the orb to the bottom right, either in a strip
below the workspace or floating over it. The chat window itself drags anywhere
you like by its header, and stays where you drop it.

It lives outside the workspace grid, so it takes no layout space and it does not
reset when you change page, pair or workspace. Minimizing it does not stop a run
either: the line beside the orb turns into **Thinking...** or **Using tools...**
and keeps you posted while you work. See
[the AI assistant](/docs/ai-copilot).

## What the address bar says

A chart's URL names three things, in order: the market type, the venue, and the
instrument.

```
/spot/okx/BTC-USDT        a crypto spot pair on OKX
/spot/gate/BTC-USDT       the same pair, Gate's book
/stocks/alpaca/AAPL       a US equity through your broker
/dex/base/0x532f…-WETH    a token on Base, addressed by contract
```

The venue is in the address because a price is only meaningful with the book it
came from. Switching venue changes the URL, so the back button returns you to
the previous venue along with the drawings you made on it, and a link you send
someone opens the exact tape you were looking at rather than whichever venue
they happen to prefer.

Tokens are addressed by contract, never by ticker. Dozens of tokens share a
symbol, so a link built from a ticker can open a different asset than the one
the sender meant; a link built from an address cannot.

Older `/pair/BTC-USDT` links still work. They resolve once and redirect to the
canonical form, so old bookmarks keep opening and start reproducing.

## Search everything

Press <kbd>⌘K</kbd> (<kbd>Ctrl</kbd>+<kbd>K</kbd> on Windows and Linux) to open
the omni-search palette. It searches across:

- Pairs, including ones you have never opened
- Venues. On a pair page picking one moves the chart to that venue, the same
  switch the header dropdown makes; anywhere else it sets the venue new pairs
  open on, and says so
- Pages, workspaces, workflows, and notification rules
- Panels you can add to the current layout
- Plugins
- Actions such as switching theme, opening settings, toggling light and dark, or
  opening a new window

It is the fastest route to almost anything. If you learn one shortcut, learn
this one.

## Multiple windows

On desktop you can pull any view into its own window with <kbd>⌘N</kbd>, from
the titlebar button, or from the omni-search **New window** action. Windows
stay in sync through a shared channel, and exactly one is elected leader so a
notification fires once rather than once per window.

## Signed in or not

Everything above works with no account. Signing in with your email adds
cross-device sync for workspaces, chart layouts, alerts, workflows, and your
trade journal, and offers it for your assistant conversations, which stay on the
device that made them until you accept. It never adds anything to the credential
path: exchange keys stay on your device either way, in the OS keychain on desktop
or the encrypted vault in a browser.

## Where to next

- [The chart](/docs/chart-panel) for chart types, drawings, and indicators
- [Reading the market](/docs/market-data) for the book, the tape, and depth
- [Trading](/docs/trading) to connect a venue and place your first order
- [Keyboard shortcuts](/docs/keyboard-shortcuts) for the full chord list
- [Settings](/docs/settings) for themes, language, region routing, and privacy
- [Glossary](/docs/glossary) if a term here was new, and
  [troubleshooting](/docs/troubleshooting) if something is not behaving
