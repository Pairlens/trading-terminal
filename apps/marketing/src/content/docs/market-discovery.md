---
title: Market discovery
description: 'How Pairlens finds instruments: the local index, the three search waves, the cloud snapshot, watchlists, and the consent gate on server-side deep search.'
group: traders
parent: market-data
order: 5
eyebrow: For traders
updated: AUG 2026
readTime: 7 min read
---

Seventeen venues, tens of thousands of spot pairs, an unbounded tail of
on-chain tokens, and a rolling set of event contracts. Finding the instrument is
its own problem, and Pairlens solves it locally first.

## Where to search from

| Surface           | Best for                                                   |
| ----------------- | ---------------------------------------------------------- |
| **Omni-search**   | <kbd>⌘K</kbd> from anywhere. Pairs, pages, panels, actions |
| **Markets panel** | Browsing what your connectors reach, by venue and category |
| **Pair picker**   | Switching the pair a single panel is bound to              |
| **Watchlist**     | The pairs you already care about                           |
| **Events panel**  | Prediction-market events, by category and question         |

They all sit on the same index and the same search, so a token you find in one
is findable in the others.

The pair picker filters by asset class, and prediction outcomes get their own
**Predictions** tab. Those rows read as the question rather than the ticker,
because a Kalshi outcome key is not something you scan. See
[prediction markets](/docs/prediction-markets).

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

## The cloud snapshot

The App Server compiles a listings index: which pairs each venue lists,
assembled from public, unauthenticated venue metadata. Your terminal downloads
that as a single blob at idle and caches it locally.

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

## The Markets panel

Every pair your installed connectors can reach, in a list or a grid, with a
category column, a search box, and your recent pairs pinned at the top. Star a
pair to add it to a watchlist without leaving the panel.

## Watchlists

The Watchlist panel holds as many named lists as you want. Two ship populated,
Top Crypto and Top Equities, and you can create, rename, and delete your own.
Rows carry live prices and flash on change.

**A row saves the asset, not the ticker.** A crypto pair or an equity is stored
without a venue, so starring BTC-USDT while charting Binance stars it on OKX
too. A token is stored by its contract address and chain, which is what stops a
saved row from quietly becoming a different token: dozens of tokens share a
ticker, and the one you starred is the one you looked at. A prediction outcome
keeps the venue that lists it for the same reason.

Watchlists sync across your devices when you are signed in and cloud sync is on
for workspaces. See [settings](/docs/settings#cloud-sync).

The [co-pilot](/docs/ai-copilot) can read and edit your watchlist, so "add
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
