---
title: Depth and liquidity
description: Two panels that turn the order book into a picture. The depth curve tells you what a market order will really cost. The heatmap tells you which levels have actually been defended.
group: traders
parent: market-data
order: 3
eyebrow: For traders
updated: 22 AUG 2026
readTime: 6 min read
---

## Liquidity, in one paragraph

Liquidity is how much you can trade without moving the price. In a liquid
market, a big order barely registers. In an illiquid one, your own order is the
news: you buy, the price jumps, and you paid for the jump yourself.

The difference between the price you expected and the price you got is called
**slippage**, and it is one of the largest hidden costs in trading. Two panels
exist to show it to you before you pay it.

**Market Depth** shows the book as it is right now. **Liquidity Heatmap** shows
where it has been, which is the more useful of the two and the one most people
never open.

## Market Depth

The depth curve stacks up everything waiting in the book. Bids climb away to the
left, asks climb away to the right, the current price sits in the middle. The
height of the curve at any price is everything you would have to buy or sell
through to get there.

**Steepness near the middle is your slippage.** A curve that rises almost
vertically means a normal-sized market order fills within a tick or two of the
displayed price. A long flat shelf means the next order of any real size walks a
long way before finding anything, and your fill will be nowhere near the number
on the ticker.

**Asymmetry is the second reading.** A curve that climbs fast on the bid side
and crawls on the ask side tells you it is cheap to sell into support and
expensive to buy through resistance. That is a market where the easy trade is
down.

The panel shows a window around the current price rather than the entire book.
Exchanges publish wildly lopsided books, and drawing the whole thing would make
every market look heavily one-sided regardless of what is happening near the
price you would actually trade at. What you see is tradeable depth, not a census.

## Liquidity Heatmap

The heatmap draws the order book over time, behind your candles. Price runs up
the vertical axis, time runs across, and colour is how much was resting at that
price at that moment.

Dark purple through blue, cyan, green, up to yellow. Dark is empty, yellow is
heavy. A legend in the corner names the scale.

This is the panel that shows which levels a market actually defends, as opposed
to the ones you drew on the chart and hoped for.

### What the picture means

**A bright horizontal band across many candles** is a level with standing size.
Somebody keeps putting real money there.

**A band that survives price arriving at it** means somebody is refilling it as
it gets eaten. That is genuine defence, and it is the level worth trading
against.

**A band that thins as price approaches** means the size is being pulled. The
level will not hold. This is the single most useful thing the heatmap shows, and
it is completely invisible in a live order book, which only ever shows you the
present moment.

**Bands that drift along with price** are market makers requoting around the
middle rather than conviction at a level. Ignore them.

### Two things to know about it

**History starts when you open the panel.** It is built from what your machine
observes, not fetched from anywhere, so add the panel and give it a few minutes
before drawing conclusions. It holds roughly half an hour of observation.

**It matches your chart's timeframe.** On a 1-minute chart, that half hour
covers most of the visible window. On a 1-hour chart it covers only the newest
few bars, and the rest of the screen is candles with nothing behind them. That
is not a fault, it is the panel refusing to invent history it does not have.

The strip to the right of the newest sample is the current book projected
forward, fading out as it goes, so you can see the live shape without mistaking
it for observed history.

## Which one to use

| You want to know                              | Use                                    |
| --------------------------------------------- | -------------------------------------- |
| What a market order will cost me right now    | Market Depth                           |
| Whether this level has actually been defended | Liquidity Heatmap                      |
| Which side is heavier right at the price      | [Order book](/docs/order-book)         |
| Whether anyone is trading through it          | [Time and sales](/docs/time-and-sales) |

Both panels appear once per workspace, and both follow your active pair unless
you pin them to something else.

## Where to next

- [Cross-venue pricing](/docs/cross-venue-pricing) to compare exchanges
- [The chart](/docs/chart-panel) for indicators over the same candles
- [Risk guardrails](/docs/risk-guardrails) for caps that survive a bad fill
