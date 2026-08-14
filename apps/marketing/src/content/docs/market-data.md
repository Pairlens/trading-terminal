---
title: Reading the market
description: The order book, the tape, the depth curve, the liquidity heatmap, and cross-venue pricing. What each panel measures, and what it is actually telling you.
group: traders
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 3 min read
---

The chart tells you where price has been. The panels in this section tell you
what is holding it up right now: who is resting size where, who is crossing the
spread to get filled, and what the same pair costs on every other venue.

They all read the same streams your chart reads, straight from the venue to
your machine. Nothing here is delayed, aggregated by a vendor, or resold.

## The five readings

| Panel                                            | The question it answers                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [Order book](/docs/order-book)                   | Where is size resting, and which side is heavier                |
| [Time and sales](/docs/time-and-sales)           | Who is actually trading, at what size, and in which direction   |
| [Depth and liquidity](/docs/depth-and-liquidity) | How far a market order would walk, and where walls keep forming |
| [Cross-venue pricing](/docs/cross-venue-pricing) | Where this pair is cheapest right now                           |
| [Market discovery](/docs/market-discovery)       | How to find the instrument in the first place                   |

## Intent versus action

Two of these panels measure different things and it is worth being blunt about
which is which, because traders routinely read one as if it were the other.

The **order book** and the **depth curve** show resting intent. Every level on
them is an order somebody has not yet been filled on, and can cancel in a
millisecond. A wall on the book is a claim, not a commitment.

The **tape** shows completed action. Every print is a trade that happened at a
price somebody accepted. It cannot be withdrawn.

The **liquidity heatmap** is the bridge: it records where intent has actually
persisted over time, which is a far better signal than any single snapshot of
the book. A level that shows up bright across twenty minutes of history is
being defended. A level that flashed once was somebody testing.

## Panel behaviour they all share

**Every panel can carry its own pair and venue.** Panels bind to the workspace's
active pair by default, but the pane menu lets you pin one to a different pair
or a different venue. Four order books for four venues, side by side, is a
normal layout. See [workspace variables](/docs/workspaces#variables).

**A venue that does not list the pair says so.** Rather than spinning forever or
rendering an empty frame, the panel tells you the pair is not on that venue and
offers the ones that carry it.

**Switching venues keeps the old data on screen.** The previous book or tape
stays visible and dimmed until the new venue's first snapshot lands, so a switch
never flashes an empty pane at you.

**Update frequency is yours to set.** [Data Rate](/docs/settings#data-rate) in
settings trades freshness for battery. Performance is the raw venue rate,
Energy Saver drops the book and ticker to one update per second. On a laptop
watching six pairs, that is the difference between a warm chassis and a quiet
one.

## Where to next

- [The order book](/docs/order-book), which is where most reading starts
- [The chart](/docs/chart-panel) for chart types, indicators, and drawings
- [Panels](/docs/panels) for the full catalogue, including news and research
