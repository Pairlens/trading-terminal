---
title: Market discovery
description: How to find something to trade among tens of thousands of markets. Search, watchlists, the per-asset-class Discovery boards, new listings, and the one privacy switch worth knowing about.
group: traders
parent: market-data
order: 5
eyebrow: For traders
updated: 22 AUG 2026
readTime: 7 min read
---

Twenty-three exchanges, tens of thousands of crypto pairs, an endless tail of
on-chain tokens, a rolling set of prediction contracts, and NFT collections on
six chains. Finding the thing is its own problem, and it splits into two
different questions.

**"Where is the thing I already named?"** That is search.

**"What should I even be looking at?"** That is a Discovery board.

## Search

| Surface           | Best for                                                   |
| ----------------- | ---------------------------------------------------------- |
| **Omni-search**   | <kbd>⌘K</kbd> from anywhere. Pairs, pages, panels, actions |
| **Markets panel** | Browsing what your exchanges carry, by venue and category  |
| **Pair picker**   | Switching the pair one panel is bound to                   |
| **Watchlist**     | The markets you already care about                         |
| **Events panel**  | Prediction markets, by category and by question            |

All five read the same index, so anything you can find in one you can find in
the others.

Results arrive in stages. The first batch appears instantly from an index
already on your machine, with no network and no spinner. A moment later,
on-chain tokens and live prediction contracts join from the venues that hold
those catalogues themselves. Later results only ever append below or annotate
what is already there, never reshuffle, so the list does not reorder under a
finger already moving down it.

### Why tokens show a contract address

Two different tokens can use the same ticker, and on-chain that is a deliberate
tactic rather than an accident. Search "accounts" and eight rows come back on
one ticker: one real token and seven copies hoping you click the wrong one.

So every token row carries its chain and a short form of its contract address,
and selecting one pins that exact address. The ticker is a label. The address is
the identity.

### Two tabs that read differently

**Predictions** rows show the question rather than a ticker, because nobody
scans a contract key looking for "will the Fed cut rates in March".

**Futures** rows are perpetual contracts, written with a third segment so
`BTC-USDT-USDT` can never be mistaken for the ordinary spot `BTC-USDT`. That tab
stays empty until you connect a futures exchange, because the contract list
comes from the exchange itself.

## Discovery boards

Search assumes you know what you want. Discovery is for when you do not.

Each kind of market gets its own board, ranked by whatever actually decides
things there. Only one of them is a plain list of pairs:

| Board           | What it opens on                                   |
| --------------- | -------------------------------------------------- |
| **CEX Spot**    | Movers, heatmaps and the scanner                   |
| **Futures**     | Funding rates and basis across all five venues     |
| **On-chain**    | Chains and pools, ranked by turnover               |
| **Memecoins**   | Four launchpad columns by curve progress           |
| **Equities**    | The session clock and the earnings calendar        |
| **Predictions** | The event board, by category and time to resolve   |
| **NFTs**        | Collections by floor and how much supply is listed |

The reasoning is simple: what you want to see first is genuinely different per
market. On a perpetual it is who is paying whom to hold a position. On a stock
it is whether the market is even open.

The **CEX Spot** board carries an exchange button on its bar. Spot rows are
priced and opened on whichever exchange you last picked there.

## Watchlists

The Watchlist panel holds as many named lists as you want. Two ship populated,
Top Crypto and Top Equities, each with the 30 largest assets of its kind. Rows
carry live prices and flash on change.

**A row saves the asset, not the exchange.** Star BTC-USDT while charting
Binance and it is starred on OKX too, because you care about Bitcoin rather than
about Binance's copy of it.

Tokens are the exception, and for the reason above: a token row saves the
contract address and chain, so the row you starred can never quietly become a
different token with the same ticker.

A prediction saves the **event**, not one answer. You are watching the question,
and the row prices it with whichever answer is currently leading.

Watchlists sync across devices when you are signed in with cloud sync on. See
[settings](/docs/settings#cloud-sync).

The [assistant](/docs/ai-copilot) can read and edit your watchlist, so "add
everything that broke out today" is a request it can actually act on.

## What just started trading

The **Movers** panel carries a **New listings** tab, and it merges two sources
that measure "new" differently. The tab is honest about which is which.

**Crypto exchange listings** are stamped with the first time Pairlens saw that
exchange list the pair. That is not the exchange's own announcement date and the
row never claims it is, so a pair that was listed before we started watching
never reads as brand new.

**On-chain listings** are newly created pools, which publish their own creation
time, so that half is exact. A pool needs more than $1,000 of real liquidity to
appear at all. Without that floor the tab is dozens of minutes-old deployments
per chain per hour and the two rows you actually wanted are buried.

## The Markets panel

Every market your connectors can reach, as a list or a grid, with categories, a
search box and your recent pairs pinned at the top. Star a pair to add it to a
watchlist without leaving the panel. Docked into a narrow column it switches to a
compact form so it still earns its space.

## One privacy switch

Most of search never leaves your machine. The instant local results are entirely
local, and the on-chain and prediction results go to the same data providers
your charts already use.

One optional stage sends your typed text to Pairlens Cloud to find long-tail
results the local index does not have. Because that is a privacy decision rather
than a performance one, it lives in **Settings → Privacy** as
_Deeper search via Pairlens Cloud_:

- On by default
- Stored on this device only, never synced, because it describes what this
  machine is willing to send
- Absent entirely if you run without an App Server

Turn it off and search stays on your device. You lose some long-tail results and
nothing else.

## The cloud listings index

Separately from search, your terminal downloads a compiled index of which pairs
each exchange lists. That is how a market can turn up in search before you have
ever connected its exchange.

It carries listings only. No prices, no candles, no order books, nothing tied to
your account. It downloads while the terminal is idle, never blocks anything, and
works exactly as well if it fails. Market data always comes to you from the
exchange directly. See [how Pairlens works](/docs/architecture).

## Listed is not the same as available

A pair being in the index does not mean the exchange you are charting carries
it. When a panel is pointed at an exchange that does not list the pair, it says
so and offers the ones that do, rather than showing you an empty frame.

## Where to next

- [Cross-venue pricing](/docs/cross-venue-pricing) once you have found the pair
- [Connect an exchange](/docs/connect-an-exchange) to widen what you can reach
- [Settings](/docs/settings#privacy) for the consent switch
