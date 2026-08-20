---
title: Market discovery
description: 'How Pairlens finds instruments: the local index, the three search waves, the cloud snapshot, new listings, watchlists, and the consent gate on server-side deep search.'
group: traders
parent: market-data
order: 5
eyebrow: For traders
updated: 20 AUG 2026
readTime: 8 min read
---

Twenty venues, tens of thousands of spot pairs, an unbounded tail of on-chain
tokens, and a rolling set of event contracts. Finding the instrument is its own
problem, and Pairlens solves it locally first.

## Where to search from

| Surface              | Best for                                                      |
| -------------------- | ------------------------------------------------------------- |
| **Omni-search**      | <kbd>⌘K</kbd> from anywhere. Pairs, pages, panels, actions    |
| **Markets panel**    | Browsing what your connectors reach, by venue and category    |
| **Pair picker**      | Switching the pair a single panel is bound to                 |
| **Watchlist**        | The pairs you already care about                              |
| **Events panel**     | Prediction-market events, by category and question            |
| **Discovery boards** | Ranking a whole asset class by what it is actually shopped on |

The first five sit on the same index and the same search, so a token you find
in one is findable in the others. The Discovery boards are the other half of
the problem: search answers "where is the thing I already named", and a board
answers "what should I be looking at". Each asset class gets its own, ranked by
what matters there, funding and basis on perps, turnover on pools, the calendar
on stocks, the clock and the odds move on event contracts. See
[workspaces](/docs/workspaces).

The **CEX Spot** board carries a venue button on its bar, left of **Panes**.
Spot rows are priced and opened on whichever exchange you last chose, and that
button is where you choose it without leaving the board.

The pair picker filters by asset class, and two classes get their own tab.
**Predictions** rows read as the question rather than the ticker, because a
Kalshi outcome key is not something you scan. **Futures** rows are perpetual
contracts, keyed with a third segment for the settle currency so
`BTC-USDT-USDT` can never be confused with the spot `BTC-USDT`. Contract lists
come from each futures venue's own market table rather than a catalog, so the
tab is empty until you have connected one. See
[prediction markets](/docs/prediction-markets) and
[perpetual futures](/docs/cex-futures).

## Search in three waves

Results arrive in stages, and the staging is deliberate.

**Wave 1 is synchronous and local.** It paints in the same frame as your
keystroke, from an in-memory index built from a curated catalog, the venue
tables your connectors have already cached, and the cloud snapshot if you have
one. No network, no spinner.

**Wave 2 fans out to the venues that hold their own catalog.** Jupiter on Solana
and the EVM chains are queried in parallel for long-tail tokens and memecoins
that no centralized venue lists, and Kalshi and Polymarket for the event
contracts open right now. A prediction venue is sent your raw text rather than a
normalized ticker, because what it matches on is the question.

**Wave 3 is server deep search**, and it only runs if you have allowed it. See
the consent gate below.

Later waves may only append below the wave-1 block, or annotate a row already
on screen. They never interleave and never re-sort. That rule exists because
the alternative is a list that reorders under a finger already descending it, or
under an arrow key already navigating it.

**Duplicates are resolved by asset identity, never by ticker.** For tokens that
means chain plus contract address. Two different assets that share a symbol are
two different rows, which is exactly what you want on-chain, where ticker
collisions are a deliberate tactic.

So the rows have to be tellable apart, not merely counted separately. Every
token row carries its chain and a short form of its contract, and selecting one
pins that exact address before anything else resolves the symbol. Search
"accounts" and eight rows come back on the same ticker: one token and seven
copies of it, and the contract is what says which is which.

## The cloud snapshot

The App Server compiles a listings index: which pairs each venue lists,
assembled from public, unauthenticated venue metadata. It covers the fourteen
spot exchanges and the five perpetual venues, so a contract can turn up in
search before you have ever loaded its venue's own table. Your terminal
downloads that as a single blob at idle and caches it locally.

Three properties are worth knowing.

**It is never on the boot path.** It downloads when the terminal is idle, and it
never blocks a picker. A failed or absent fetch leaves search exactly as
functional as it is in standalone mode.

**It is refreshed lazily.** A cached snapshot younger than six hours skips even
the version check.

**It carries no prices.** Listings metadata only: which pairs exist where. No
candles, no books, no trades, and never anything tied to your account. Market
data always comes straight from the venue to your machine. See
[architecture](/docs/architecture).

## The deep-search consent gate

Waves 1 and 2 never send your typed text anywhere: wave 1 is entirely local, and
wave 2 goes to the same DEX data providers your charts already use. Wave 3 sends
the query string to Pairlens Cloud.

That is a privacy decision, not a performance one, so it lives in
**Settings → Privacy** next to the analytics consent as _Deeper search via
Pairlens Cloud_, and it behaves accordingly:

- **On by default**, matching the lean-in cloud posture everywhere else
- **Device-local and never synced**, because it describes what this machine is
  willing to send
- **Hidden entirely in standalone builds**, where there is no server to consent
  to and the gate is closed regardless

The gate is one predicate, checked in one place, and both the wave-3 fan-out and
the intelligence plugin's own server-bound discovery paths pass through it. A
toggle that switched off the new call while an older plugin path kept shipping
queries would be a false promise, so there is only the one.

Turn it off and search stays on this device. You lose long-tail server results
and nothing else.

## What just started trading

The **Movers** panel carries a **New listings** tab beside the gainers and
losers, merging two sources that agree on nothing except a timestamp.

**CEX listings come from our own sweeper.** The Pairlens index stamps the first
time it saw a venue list a pair, and the row says exactly that: first seen by the
Pairlens index, with the date tracking began beside it. It is not the venue's
announcement date and never claims to be, so a pair listed before we started
watching never reads as brand new.

**DEX listings are newly created pools** from GeckoTerminal, which publish their
own creation block, so that half is exact. A pool has to hold more than $1,000
of measurable liquidity to appear at all. Without that floor the tab is dozens
of minutes-old deployments per chain per hour, and the two or three rows you
opened it for are buried under dust nobody can trade.

The two row shapes share one field, when, which is what the list is ordered by.
The tab fetches only while it is the tab on screen.

## The Markets panel

Every pair your installed connectors can reach, in a list or a grid, with a
category column, a search box, and your recent pairs pinned at the top. Star a
pair to add it to a watchlist without leaving the panel. Docked into a narrow
rail, the panel switches to a compact form: a search field that hands off to
the command palette, one scrollable chip row, dense quote rows, and a "Browse
all N pairs" footer, so the same pane earns its place at both widths.

## Watchlists

The Watchlist panel holds as many named lists as you want. Two ship populated,
Top Crypto and Top Equities, each holding the 30 largest assets of its class by
market cap, and you can create, rename, and delete your own.
Rows carry live prices and flash on change.

**A row saves the asset, not the ticker.** A crypto pair or an equity is stored
without a venue, so starring BTC-USDT while charting Binance stars it on OKX
too. A token is stored by its contract address and chain, which is what stops a
saved row from quietly becoming a different token: dozens of tokens share a
ticker, and the one you starred is the one you looked at. A prediction is
stored as the EVENT, with the venue that lists it: you watch the question, and
the row prices it with whichever answer is currently leading.

Watchlists sync across your devices when you are signed in and cloud sync is on
for workspaces. See [settings](/docs/settings#cloud-sync).

The [assistant](/docs/ai-copilot) can read and edit your watchlist, so "add
everything that broke out today" is a request it can act on.

## Availability, not just existence

A pair being in the index does not mean the venue you are charting carries it.
When a panel is pointed at a venue that does not list the pair, it says so and
offers the venues that do, rather than rendering an empty frame. That is the
same signal the [cross-venue board](/docs/cross-venue-pricing) uses for its
Not listed rows.

## Where to next

- [Cross-venue pricing](/docs/cross-venue-pricing) once you have found the pair
- [Connect an exchange](/docs/connect-an-exchange) to widen what discovery reaches
- [Settings](/docs/settings#privacy) for the consent gate itself
