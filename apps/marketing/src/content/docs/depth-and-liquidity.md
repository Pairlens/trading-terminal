---
title: Depth and liquidity
description: 'The market depth curve and the liquidity heatmap: slippage before you pay it, where resting liquidity has actually persisted, and how to read the colour scale.'
group: traders
parent: market-data
order: 3
eyebrow: For traders
updated: AUG 2026
readTime: 6 min read
---

Two panels turn the order book into a picture. **Market Depth** shows the book
as it is right now. **Liquidity Heatmap** shows where it has been, which is the
more useful of the two and the one people miss.

## Market Depth

The depth curve plots cumulative resting size against price: bids climbing away
to the left, asks climbing away to the right, the spread in the middle. The
height at any price is everything you would have to consume to trade through
that price.

**What to read off it.** The steepness near the touch is your slippage. A wall
that rises almost vertically means a market order of any normal size fills
within a tick or two. A long flat shelf means the next order of size walks a
long way before it finds anything, and your fill will be nowhere near the price
on the ticker.

Asymmetry is the second reading. A curve that climbs fast on the bid side and
crawls on the ask side means it is cheap to sell into support and expensive to
buy through resistance.

**The range is trimmed on purpose.** Venues publish wildly asymmetric books, and
one with 400 bid levels against 50 ask levels would render as a chart that looks
heavily bid regardless of the market. The panel takes a symmetric window around
the mid price, sized from the narrower side, capped at 2% of mid and floored at
0.2%. The cap stops stale deep levels from stretching the curve into
uselessness; the floor stops a very tight book from zooming in so far that noise
fills the frame.

That trimming is why the panel is a reading of tradeable depth rather than a
census of the book.

## Liquidity Heatmap

The heatmap renders the same order book over time, behind the candles. Price
runs up the vertical axis, time runs across, and the colour of each cell is how
much liquidity was resting at that price at that moment.

This is the panel that shows you which levels the book keeps defending, as
opposed to the ones you drew on the chart.

### The colour scale

Dark purple through blue, cyan, green, and up to yellow. Dark is empty, yellow
is heavy. A legend sits in the top-left corner of the pane with the scale and
its endpoints.

Two things about that scale determine how you read it.

**It is normalized to a rolling 95th percentile, not the maximum.** If it were
scaled to the largest bin ever seen, one enormous wall would flatten every other
level to near black and the panel would be a picture of that one wall. Scaling
to p95 means the top 5% of bins clip at yellow and everything below stays
legible. A solid band of yellow is not one order; it is a price region that has
been consistently among the heaviest on screen.

**It is logarithmic.** Resting liquidity is heavily skewed, and a linear ramp
would leave everything but the walls indistinguishable.

### What the picture means

A **horizontal bright band that persists across many candles** is a level with
standing size. If price approaches it and the band survives, somebody is
refreshing. If the band thins as price arrives, the size was pulled and the
level will not hold.

A **band that vanishes just before price reaches it** is the most useful thing
the panel shows, and it is invisible in a live order book, which only ever shows
you now.

**Bands that migrate with price** are market makers requoting around mid, not
conviction at a price. Ignore them.

### What it samples

Snapshots are taken about once a second, independently of candle timestamps, and
up to 2000 of them are kept, so the panel holds roughly half an hour of history.
Each snapshot is bucketed into 150 price bins, and each bin remembers the price
range it was computed against, so an older sample is never re-projected onto a
newer, wider grid at the wrong prices.

Two consequences follow from this.

**History starts when you open the panel.** It is not fetched. Add the panel and
give it a few minutes before drawing conclusions from it.

**It matches your chart's timeframe.** The candles behind the heatmap are the
same series the chart pane is on, so switching timeframe changes how much wall
clock is on screen. On a 1m chart the sample history covers most of the visible
window; on a 1h chart the heatmap covers only the newest few bars, and the rest
is candle with nothing behind it.

The area to the right of the newest real sample is projected from the latest
snapshot and fades out as it goes, so the current book stays visible without
pretending to be history.

## Which one to use

| You want to know                              | Use                                    |
| --------------------------------------------- | -------------------------------------- |
| What a market order will cost me right now    | Market Depth                           |
| Whether this level has actually been defended | Liquidity Heatmap                      |
| Which side is heavier at the touch            | [Order book](/docs/order-book)         |
| Whether anyone is trading through it          | [Time and sales](/docs/time-and-sales) |

Both panels are singletons: one per workspace. Both follow the workspace's
active pair unless you pin them.

## Where to next

- [Cross-venue pricing](/docs/cross-venue-pricing) to compare depth across venues
- [The chart](/docs/chart-panel) for indicators drawn over the same candles
- [Risk guardrails](/docs/risk-guardrails) for caps that survive a bad fill
