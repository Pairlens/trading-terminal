---
title: Time and sales
description: 'Reading the trade tape: aggressor side, size intensity, notional, sortable columns, and what the print record tells you that the order book cannot.'
group: traders
parent: market-data
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

The Trades panel is the tape: every execution the venue publishes, newest at
the top. Unlike the order book, nothing on it can be withdrawn. Each row is a
trade that cleared.

## The four columns

| Column    | What it holds                                         |
| --------- | ----------------------------------------------------- |
| **Side**  | Which side crossed the spread, as an arrow and a word |
| **Price** | The execution price                                   |
| **Size**  | Amount in the base asset                              |
| **Value** | The same trade in quote notional, so price times size |

The panel is width-aware. Below roughly 17rem the side column carries the arrow
alone, because the widest translation of "sell" (Polish `Sprzedaż`) would squeeze
the price out of its track. The value column appears at around 24rem, where a
fourth column fits without any of the other three dropping below what their
widest content needs. These are hard thresholds, not English-only guesses.

## Sorting

Every heading sorts. Click once for that column's natural direction, click again
to flip it.

| Column    | Opens                                                     |
| --------- | --------------------------------------------------------- |
| **Time**  | Descending, which is the tape's own order and the default |
| **Price** | Descending                                                |
| **Size**  | Descending                                                |
| **Value** | Descending                                                |
| **Side**  | Ascending, so buys group first                            |

Quantities open descending because the question behind clicking Size or Value is
"what were the big prints", not "what were the dust ones". Equal rows never
shuffle, so a re-sort on a tape reprinting ten times a second stays readable.

Your choice persists across a reload.

## Size intensity

Rows are tinted by how large the print is relative to the tape currently on
screen: roughly the median size times six. "Big" therefore means big for this
pair on this venue, not big in absolute units, which is the only comparison that
survives switching from BTC to a micro-cap.

Two consequences worth knowing. A quiet pair will still show bright rows,
because the reference falls with it. And the reference is computed over the
retained buffer rather than the sorted view, so sorting by size does not change
which rows are bright.

## What the tape tells you

**Aggressor side, not maker side.** The side column names who crossed the spread
to get filled. A green row is a buyer lifting the offer. This is the direction
that moved price, which is why it is the one worth reading.

Venues do not agree on this. Coinbase publishes the maker's side, which is the
opposite convention, so its connector inverts the field before the print reaches
the panel. Every venue's tape reads the same way in Pairlens.

**Prints against the touch.** The reading that pays is comparing execution
prices to the best bid and ask sitting in the [order book](/docs/order-book)
next to it. A run of green prints landing at the ask, while the ask keeps
stepping up, is real demand consuming supply. The same green prints landing
repeatedly at the same level, with the level never lifting, is somebody being
absorbed by a seller who is refilling.

**Size clusters.** One large print is a trade. Twenty medium prints in the same
second at rising prices is usually one order walking the book, and the walk is
the information.

## Cross-checking the book

The order book and the tape disagree constantly, and the disagreement is the
signal. A heavy bid stack under a tape printing sell after sell means the stack
is not being defended, it is being fed. A thin book under aggressive buying
means the next print can gap.

This is the specific reason the two panels ship side by side in the default
chart workspaces.

## Venue coverage

Thirteen of the fourteen bundled centralized exchanges publish a trade feed.
MEXC does not, and the panel says so plainly rather than spinning: it names the
venue and suggests switching. See [connectors](/docs/connectors).

If the pair itself is not listed on the pinned venue, the panel says that
instead, which is a different problem with a different fix.

## Performance

Prints arrive faster than they are worth re-rendering. A busy pair can burst
dozens of executions a second, so arrivals land in a buffer and publish on a
100ms interval, and rows are virtualized so a publish costs the viewport rather
than the whole 200-print buffer. The tape still reads as live.

[Data Rate](/docs/settings#data-rate) throttles candles, the ticker, and the
book. The tape is deliberately not on that list: a decimated tape is a different
instrument, not a cheaper one.

## Where to next

- [The order book](/docs/order-book) for the resting side of the same market
- [Depth and liquidity](/docs/depth-and-liquidity) for where walls persist
- [Place an order](/docs/place-an-order) to act on what the tape is showing
