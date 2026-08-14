---
title: The order book
description: 'Reading the Pairlens order book panel: price grouping, size versus notional, cumulative depth bars, the spread row, and the buy-sell pressure gauge.'
group: traders
parent: market-data
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 6 min read
---

The Order Book panel shows resting limit orders on both sides of the market,
maintained locally from the venue's incremental websocket updates. Asks run
above the spread, bids below it, best prices meeting in the middle.

## The three columns

| Column           | What it holds                                            |
| ---------------- | -------------------------------------------------------- |
| **Price**        | The price level, green for bids and red for asks         |
| **Size / Value** | The amount resting at that level, in your chosen reading |
| **Total**        | Cumulative amount from the best price down to this level |

The middle heading is also a switch. Click it and the whole book flips between
**Size** (the base asset, so BTC on BTC-USDT) and **Value** (the quote notional,
so dollars). The heading names only the reading in force rather than both,
because the panel routinely renders at 200 pixels wide and two labels would
paint over the price column in half the languages the terminal ships in.

**Value is the reading most people want and few switch to.** Size lets a level
in a cheap asset look enormous next to a level in an expensive one. Value puts
both in dollars, which is the only way to compare a wall on DOGE against a wall
on BTC. The notional is computed from each displayed row's own price times its
size, so it is the money that row actually represents.

The choice is a reading preference, not a property of one book: it persists
across a reload, and a second panel, a second window, and the phone all follow
it.

## Price grouping

Raw venue books quote in the exchange's tick size, which for BTC-USDT means
levels a cent apart. Twenty rows of that covers twenty cents of a sixty
thousand dollar asset, which tells you nothing. Grouping buckets adjacent levels
together so the panel spans a price range you would actually trade through.

The selector in the top right offers a 1-2-5 series built up from the venue's
own tick size. Values are always clean decimals, so you get 0.01, 0.02, 0.05,
0.1 and so on rather than accumulated float drift.

**Auto is the default and it re-fits itself.** It picks the largest tick that
still produces enough buckets to fill the visible rows, capped so one side of
the book can never span more than 6% of the price. The cap matters on degenerate
books: a venue that pushes its entire ladder (Binance's SHIB/USDT reaches around
260 levels, most of the way to zero) would satisfy a bucket count at a tick two
decades too coarse, and the panel would end up quoting a price range nobody
trades in.

Auto re-fits when you switch venue, when you resize the panel, and when you
change pair, and it waits for the new venue's first snapshot before measuring,
so it fits the book you are actually looking at rather than the one you left.

Picking a tick by hand pins it until the pair changes.

## Reading the bars

Every row carries a horizontal bar behind it, and the bar encodes two separate
things.

**Bar length is cumulative depth.** It grows as you move away from the spread,
because it represents everything resting between the best price and this level.
A long bar near the spread means there is a lot of size between here and the
touch.

**Bar colour intensity is that level's own amount.** A single bright row in a
run of dim ones is a level holding much more than its neighbours. This is the
wall, and it is what your eye should catch.

Both sides are scaled against one shared reference, so a bid and an ask of equal
amount paint identically. Without that, the panel would quietly misreport which
side is heavier. The reference follows the metric on screen, because a cheap
venue's raw sizes are the wrong yardstick for notionals.

## The spread row

Between the two sides sits the spread: the absolute gap between best bid and
best ask, and the same gap as a percentage of the bid.

The percentage is the number to watch. It is the immediate cost of changing your
mind, and it is how you compare one venue's liquidity to another's without
knowing anything about the asset. A pair quoting 0.005% is deep. The same pair
quoting 0.4% on a thin venue will cost you the difference on entry and again on
exit, which is usually more than any fee schedule you were optimising.

## The buy-sell pressure gauge

The bar across the bottom splits total displayed bid depth against total
displayed ask depth, as percentages. Green is bids, red is asks.

Read it with two caveats or it will mislead you.

**It only counts what is on screen.** It sums the rows the panel is currently
rendering, which is a function of your grouping and how tall you dragged the
panel. Widen the grouping and the ratio changes, because you are now measuring a
wider slice of the book. It is a reading of near-touch pressure, not a reading of
the whole book.

**Resting orders are not commitments.** Spoofing is a real behaviour on spot
venues, and the pressure gauge is exactly the thing it is designed to move. A
lopsided book that never trades in the direction it is leaning is telling you
something, but not what it appears to be telling you. Cross-check against
[the tape](/docs/time-and-sales), which cannot be faked because it is a record
of trades that already cleared.

## Venue and pair binding

The panel follows the workspace's active pair unless you pin it. When it is
quoting a venue other than the charted one, a footer names that venue, so a
layout with four books does not require you to remember which pane is which.

Stream health is deliberately not shown per panel. The connection dot in the
pair header owns that, because it is the only place that can distinguish
"streaming" from "stalled" and say so. See
[troubleshooting](/docs/troubleshooting#market-data-looks-frozen).

## Order books on mobile

The [mobile terminal](/docs/mobile-terminal) carries the same book. The Trade
tab shows a compact strip above the ticket, and the full ladder is its own
screen with the same grouping and the same size and value switch.

## Where to next

- [Time and sales](/docs/time-and-sales) for the other half of the reading
- [Depth and liquidity](/docs/depth-and-liquidity) for the cumulative curve
- [Place an order](/docs/place-an-order) to act on what you are seeing
