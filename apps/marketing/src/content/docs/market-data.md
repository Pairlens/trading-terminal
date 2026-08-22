---
title: Reading the market
description: Underneath the chart is a live market of people buying and selling. These panels show you who is offering what, who is actually trading, and what a market order would really cost you.
group: traders
order: 2
eyebrow: For traders
updated: 22 AUG 2026
readTime: 4 min read
---

A chart is a summary. It compresses thousands of individual trades into one
candle and throws away everything about how they happened.

The panels in this section put that back. They show you the live machinery of a
market: who is waiting to buy and sell, at what prices, in what size, and who is
crossing over to get filled right now. This is the difference between knowing
that price is at $70,100 and knowing whether you can actually get $70,100.

Everything here streams from the exchange to your machine directly. Nothing is
delayed, aggregated by a data vendor, or resold to you.

## The five readings

| Panel                                            | The question it answers                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| [Order book](/docs/order-book)                   | Who is waiting to trade, at what price, and how much         |
| [Time and sales](/docs/time-and-sales)           | Who is actually trading right now, and in which direction    |
| [Depth and liquidity](/docs/depth-and-liquidity) | What a market order would really cost, and which levels hold |
| [Cross-venue pricing](/docs/cross-venue-pricing) | Where this asset is cheapest across every exchange           |
| [Market discovery](/docs/market-discovery)       | How to find something to trade in the first place            |

If you read one, read [the order book](/docs/order-book). Everything else builds
on it.

## Intent versus action

There is one distinction worth getting right, because traders routinely read one
of these as if it were the other.

**The order book and the depth curve show intent.** Every level on them is an
order somebody has placed and not yet been filled on, and they can cancel it in
a millisecond. A big wall on the book is a claim, not a commitment. Some traders
place large orders they never intend to fill, purely to make a market look
one-sided.

**The tape shows action.** Every row on it is a trade that already happened at a
price somebody accepted. It cannot be withdrawn, edited, or faked.

**The liquidity heatmap bridges the two.** It records where intent has actually
persisted over time, which is far more informative than any single snapshot. A
level that stays bright across twenty minutes is being genuinely defended. One
that flashed and vanished was somebody testing the water.

## Things every panel does

**Each one can carry its own pair and venue.** Panels follow your active market
by default, but you can pin one to a different pair or exchange. Four order books
for four exchanges, side by side, is a perfectly normal layout. See
[workspace variables](/docs/workspaces#variables).

**A venue that does not list the pair says so.** Rather than spinning forever,
the panel tells you and offers the exchanges that do carry it.

**Switching exchange keeps the old data on screen**, dimmed, until the new one's
first snapshot lands. No blank flash.

**Update frequency is yours to set.** [Data Rate](/docs/settings#data-rate)
trades freshness for battery life. Performance takes every update the exchange
sends; Energy Saver drops the book and price to one update a second. On a laptop
watching six pairs that is the difference between a hot chassis and a quiet one.

## Where to next

- [The order book](/docs/order-book), where most reading starts
- [The chart](/docs/chart-panel) for chart types, indicators and drawings
- [Panels](/docs/panels) for the full catalogue, including news and research
