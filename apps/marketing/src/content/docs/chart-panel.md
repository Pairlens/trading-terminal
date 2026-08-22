---
title: The chart
description: 'How to read a candle, what a timeframe really changes, and everything the Pairlens chart panel does: 16 chart types, log and percentage scales, bar replay, symbol comparison, screenshots and CSV export.'
group: traders
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 9 min read
---

## How to read a candle

A price chart draws time across the bottom and price up the side. Each mark on
it covers one slice of time, and the standard mark is a **candle**, which packs
four numbers into one shape:

```
        │  ← the highest price reached in this slice
      ┌─┴─┐
      │   │  ← the body: from the opening price to the closing price
      └─┬─┘
        │  ← the lowest price reached
```

Green (or hollow) means it closed higher than it opened. Red means it closed
lower. The body shows where most of the action settled; the thin wicks show how
far price got pushed before coming back.

That last part is the reason candles beat a plain line. A long upper wick means
buyers pushed price up and got rejected. A line chart would just show you the
close and hide the whole fight.

## What a timeframe changes

Pick 1m and each candle covers one minute. Pick 1D and each covers a day. Same
market, same data, completely different picture.

There is no correct timeframe. There is only the one that matches how long you
intend to hold. If you plan to be out by lunch, a daily chart tells you almost
nothing about today. If you plan to hold for months, a 1-minute chart is noise
that will talk you out of a good position.

Most traders keep two open: a slower one for direction, a faster one for timing.

## The toolbar

### Symbol

The first chip is what this chart is showing. Clicking it points **this chart**
somewhere else, leaving the rest of the board where it is. The pair switcher in
the top bar is the other half: that one moves everything, book and ticket
included.

A chart holding its own symbol is badged **Pinned**, so on a four-chart board
you can see at a glance which panels still follow the top bar. **Follow the
board** at the bottom of the picker hands one back.

### Timeframes

Eleven of them, ten with a single-key shortcut. Press the digit anywhere in the
app and the active chart switches.

| Key | Timeframe | Key | Timeframe |
| --- | --------- | --- | --------- |
| 1   | 1m        | 6   | 2h        |
| 2   | 5m        | 7   | 4h        |
| 3   | 15m       | 8   | 1D        |
| 4   | 30m       | 9   | 1W        |
| 5   | 1h        | 0   | 3D        |

Monthly is in the menu without a shortcut.

**Not every exchange offers every interval.** Kalshi has three, Polymarket four,
and each futures exchange publishes its own list. The picker shows only what is
actually available.

Your choice is remembered rather than overwritten. Point a chart pinned to 15m
at an exchange that does not have it and you get the nearest shorter interval,
because a finer bar still covers the window you asked for. Go back to an
exchange with 15m and you are on 15m again.

### Chart types

Sixteen, all drawn on the GPU so they stay smooth with a year of history loaded.

**Candle family.** Candles, Heikin-Ashi, Hollow Candles, Bar, High-Low.

**Line family.** Line, Step Line, Area, HLC Area, Baseline.

**Bar family.** Histogram, Column.

**Alternative.** Renko, Line Break, Kagi, Point and Figure.

Start with candles. **Heikin-Ashi** is worth knowing about too: it averages
neighbouring candles to smooth out the chop, which makes a trend easier to see
and a reversal harder to catch early. The four alternative types drop the fixed
time axis entirely and draw a new mark only when price moves a set amount, which
filters noise out of a trend at the cost of knowing when anything happened.

**Prediction markets open on Step Line.** A contract's price is a probability
that trades in occasional jumps, so candles come out as a row of tiny ticks with
nothing between them, which looks like a flat market when the market is only
quiet. See [prediction markets](/docs/prediction-markets).

### Crosshair

**Normal** follows your pointer freely. **Magnet** snaps to the nearest high,
low, open or close, which is what you want when you are drawing a level off a
wick and want it exactly on the wick. **Hidden** removes it for a clean
screenshot.

On a phone there is no pointer, so you touch and hold the chart and a crosshair
appears under your finger. See
[the mobile terminal](/docs/mobile-terminal#the-chart).

### Price scale

Four modes, and the second one matters more than people expect:

| Mode               | What it shows                                        |
| ------------------ | ---------------------------------------------------- |
| **Linear**         | Absolute price, evenly spaced                        |
| **Logarithmic**    | Equal percentage moves take equal vertical space     |
| **Percentage**     | Everything relative to the first visible bar         |
| **Indexed to 100** | All series start at 100, ideal for comparing symbols |

**Use logarithmic on anything with a long history.** On a linear scale, a move
from $1 to $2 (a doubling) looks like a tiny wiggle next to a move from $60,000
to $61,000 (under 2%). Log scale fixes that: the same percentage move is the
same distance anywhere on the chart, so a trendline drawn across years actually
means something.

**Invert scale** flips the axis upside down. Traders use it to check whether a
setup still looks convincing from the other side of the trade, which is a
surprisingly effective way to catch your own bias.

### Bid and ask lines

Toggle **Bid/Ask** to draw the live best buy and sell prices across the chart.
On a thin market the gap between them is what a market order will actually cost
you, and seeing it drawn to scale changes how you size. See
[the order book](/docs/order-book).

### Screenshots

The camera menu gives you **Copy image** and **Download image**. On desktop the
file lands in a real folder and the toast tells you which. Everything on screen
comes with it, drawings and indicators included.

### Export data

The spreadsheet button saves the chart's bars as a CSV. Take **Visible bars** or
**All loaded bars**, and choose how timestamps are written.

One row per bar with time, open, high, low, close and volume. Indicators on your
chart come along as extra columns, one per line they draw, so a MACD arrives as
three. Bars from before an indicator had enough history to compute leave the cell
empty rather than borrowing the next value, which keeps a spreadsheet honest.

### Fullscreen

Expands the chart over the whole workspace. <kbd>Esc</kbd> leaves. If you are
not in fullscreen, <kbd>Esc</kbd> drops the active drawing tool instead.

## Bar replay

This is the single best practice tool in the terminal, and almost nobody finds
it.

Replay hides the future and steps historical bars forward one at a time. You see
exactly what you would have seen live, make your decision, then advance the bar
and find out if you were right. Pan left first to load deeper history, then open
**Replay** and use play, pause and next bar.

Indicators recompute as replay advances, so an EMA crossover looks the way it
looked at the time rather than the way hindsight paints it. If you want to know
whether a setup works, this is how you find out without paying for the lesson.

## Compare symbols

Add up to five symbols to one chart. Three modes decide how they are drawn
together:

**Percentage (indexed).** Every series rebased to its first visible bar. This is
the right choice for "which of these outran the other", and the one you want
almost always.

**Price overlay.** Raw prices on one axis. Only readable when the symbols trade
in a similar range.

**Dual axis.** Each series keeps its own scale. Good for pairing an asset
against something on a completely different order of magnitude.

A prediction contract starts on dual axis, because a contract priced at 47¢ next
to Bitcoin at 64,000 would otherwise be a flat line along the bottom.

## Right-click menu

The fast path to what you do most:

- Add indicator
- Horizontal line at the clicked price
- Trend line, ray, arrow, Fibonacci retracement
- Add alert at the clicked price, which creates a real
  [notification rule](/docs/alerts-notifications) with the level filled in
- Fit content, scroll to latest
- Delete drawing, when you right-clicked one

## What is remembered

Chart state is saved per pair: chart type, timeframe, scale, indicators and
their settings, and your drawings. Reopen a pair next week and it looks the way
you left it. Local by default, synced across devices when you are signed in.

Two things are saved per market type instead of per pair: chart type and compare
mode. So candles on Bitcoin and a step line on an election contract hold at the
same time, and choosing Line on a stock does not turn your crypto charts into
lines.

## Multiple charts

Add more than one chart panel and each keeps its own symbol, exchange,
timeframe, type and indicators.

**Dual Charts**, **Triple Charts** and **Quad Charts** in the Workspaces menu
are the ready-made versions. The first panel follows the pair you were already
on, the rest arrive with their own, and every one is changeable from its symbol
chip.

Keyboard shortcuts go to the chart you last pointed at, so digits and tool
chords land where you expect.

## Related

- [Drawing tools](/docs/drawing-tools)
- [Indicators](/docs/chart-indicators)
- [Reading the market](/docs/market-data) for the book, tape and depth panels
- [Keyboard shortcuts](/docs/keyboard-shortcuts)
