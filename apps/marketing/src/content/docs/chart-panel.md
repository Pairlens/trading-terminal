---
title: The chart
description: 16 chart types, up to 11 timeframes, four price-scale modes, bar replay, symbol comparison, screenshots, and CSV export. Everything the chart panel can do.
group: traders
order: 1
eyebrow: For traders
updated: 22 AUG 2026
readTime: 8 min read
---

The chart is the centre of the terminal. It is rendered by
[Fast Financial Charts](/docs/charts), our own WebGL2 engine, which means
panning a year of candles with a dozen indicators on top stays smooth.

This page covers the chart panel itself. Drawings and indicators have their own
pages:

- [Drawing tools](/docs/drawing-tools) for the 45 tools and their shortcuts
- [Indicators](/docs/chart-indicators) for the 90 built-ins and how to tune them

## The toolbar

Everything below lives in the toolbar strip along the top of the chart panel.

### Symbol

The first chip on the strip is what this chart is of, and clicking it points
**this** chart somewhere else: search any instrument, pick a venue from the row
above the results, and the chart moves while the rest of the board stays where
it is. The pair switcher in the top bar is the other half of that: it moves the
whole board, book and ticket included.

A chart holding a symbol of its own is badged **Pinned**, and its panel header
repeats the symbol beside the panel name, so a four-chart board says at a glance
which panels still follow the top bar. **Follow the board** at the bottom of the
picker hands one back.

On a saved workspace, a chart bound to a
[pair variable](/docs/workspaces#variables) sets that variable instead, so every
panel bound to it moves together. The chip says which variable it is reading.

### Timeframes

Eleven timeframes, ten with a single-key shortcut. Press the digit anywhere in
the app and the active chart switches. Every centralized exchange serves all
eleven.

| Key | Timeframe | Key | Timeframe |
| --- | --------- | --- | --------- |
| 1   | 1m        | 6   | 2h        |
| 2   | 5m        | 7   | 4h        |
| 3   | 15m       | 8   | 1D        |
| 4   | 30m       | 9   | 1W        |
| 5   | 1h        | 0   | 3D        |

Monthly (1M) is in the menu without a shortcut.

**Not every venue serves every interval.** A connector declares the intervals
it has, and the picker shows only those. Kalshi has three (1m, 1h, 1D) and
Polymarket four (1m, 5m, 1h, 1D), because that is what their OHLCV endpoints
accept, and the futures venues each publish their own shorter list. See
[prediction markets](/docs/prediction-markets) and
[perpetual futures](/docs/cex-futures).

Your choice is remembered rather than rewritten. Point a chart pinned to 15m at
a venue without it and you get the nearest shorter interval that venue does
serve, because a finer bar still shows you the window you asked for. Switch
back to an exchange that has 15m and the chart is on 15m again.

### Chart types

Sixteen of them, all GPU-rendered:

**Candle family.** Candles, Heikin-Ashi, Hollow Candles, Bar, High-Low.

**Line family.** Line, Step Line, Area, HLC Area, Baseline.

**Bar family.** Histogram, Column.

**Alternative.** Renko, Line Break, Kagi, Point and Figure.

Renko, Kagi, Line Break, and Point and Figure redraw price without a fixed time
axis, which is what makes them useful for filtering noise out of a trend.

**Predictions open on Step Line.** A prediction outcome is a probability, and it
trades sparsely: candles come out as a row of doji ticks with nothing between
them, which reads as a flat market when the market is only quiet. So a
[prediction outcome](/docs/prediction-markets) opens as a step line of close on
the cents axis, and the menu puts Step Line and Line at the top. All sixteen
types are still there, one scroll down, and whichever you pick is remembered.

### Crosshair

Three modes. **Normal** follows the pointer freely. **Magnet** snaps to the
nearest OHLC value, which is what you want while drawing levels off wicks.
**Hidden** removes it entirely for a clean screenshot.

**On a phone the crosshair is something you ask for.** There is no pointer to
follow, so you touch and hold the plot and one comes up under your finger, with
the bar's OHLC in place of the live price. Magnet and Normal mean the same
thing there as here. Hidden does not apply: a crosshair you held a finger down
for did not arrive by accident. See
[the mobile terminal](/docs/mobile-terminal#the-chart).

### Price scale

Four modes:

| Mode               | What it shows                                        |
| ------------------ | ---------------------------------------------------- |
| **Linear**         | Absolute price, evenly spaced                        |
| **Logarithmic**    | Equal percentage moves take equal vertical space     |
| **Percentage**     | Everything relative to the first visible bar         |
| **Indexed to 100** | All series start at 100, ideal for comparing symbols |

There is also **Invert scale**, which flips the vertical axis. Traders use it
to sanity-check whether a setup still looks good from the other side of the
trade.

### Bid and ask lines

Toggle **Bid/Ask** to draw the live best bid and best ask as horizontal lines
across the chart. On thin books, the gap between them is the real cost of a
market order, and seeing it drawn to scale changes how you size.

### Screenshots

The camera menu gives you **Copy image** (straight to your clipboard) and
**Download image**. On desktop the file lands in a real folder and the toast
tells you which one. Screenshots capture the chart exactly as rendered,
drawings and indicators included.

### Export data

The spreadsheet button next to the camera saves the chart's bars as a CSV.
Pick **Visible bars** to take only what is on screen, or **All loaded bars**
for everything the chart has pulled in, and choose how timestamps are written:
ISO 8601, a plain UTC date and time, or a Unix timestamp in seconds or
milliseconds.

Every row is one bar, with time, open, high, low, close and volume. Indicators
you have on the chart come along as extra columns, one per plot, so a MACD
arrives as three. Compare symbols add a close column each. Bars from before an
indicator had enough history leave the cell empty rather than borrowing the
next value.

### Fullscreen

Expands the chart over the whole workspace. <kbd>Esc</kbd> leaves fullscreen,
and if you are not in fullscreen it clears the active drawing tool instead.

## Bar replay

Replay steps historical bars forward one at a time so you can rehearse a setup
without knowing what happened next. Pan left first to load deeper history, then
open **Replay** and use play, pause, and next bar.

Indicators recompute bar by bar as replay advances, so an EMA cross looks
exactly as it would have looked live rather than as hindsight paints it.

## Compare symbols

Add a second (or fifth) symbol to the same chart from the compare menu. Three
scale modes decide how they are drawn together:

**Percentage (indexed).** Every series normalised to its first visible bar. The
right choice for "which of these outran the other".

**Price overlay.** Raw prices on one axis. Only readable when the symbols trade
in a similar range.

**Dual axis.** Each series gets its own scale. Good for pairing an asset
against something on a different order of magnitude.

A prediction outcome starts on Dual axis rather than Percentage, because it is
already the extreme case of a different order of magnitude: a contract priced at
47¢ next to BTC at 64,000 on one axis leaves the outcome as a flat line along
the bottom, and rebasing both to 100 puts an index number through the cents
formatter. On dual axis the outcome keeps its own cents axis whatever is drawn
over it. Switch it if you want the other reading.

## Right-click menu

Right-clicking the chart gives you the fast path to the things you do most:

- Add indicator
- Horizontal line at the clicked price
- Trend line, ray, arrow, Fibonacci retracement
- Add alert at the clicked price, which creates a real
  [notification rule](/docs/alerts-notifications) with the level prefilled
- Fit content, scroll to latest
- Delete drawing, when you right-clicked one

## What persists

Chart state is saved per pair: chart type, timeframe, scale mode, indicators
and their parameters, and your drawings. Reopen a pair a week later and it
looks the way you left it. Locally by default, synced across devices when you
are signed in.

Chart type and compare scale mode are saved per asset class, not per pair.
Candles on BTC and a step line on an election outcome hold at the same time, and
picking Line on a stock does not turn your crypto charts into lines. Everything
else stays per pair.

## Multiple charts

Add more than one chart panel to a workspace and each keeps its own symbol,
venue, timeframe, type, and indicator set.

**Dual Charts**, **Triple Charts** and **Quad Charts** in the Workspaces menu
are the ready-made versions. They open with a different instrument per panel:
the first panel follows the pair you were already looking at, the rest arrive on
their own, and every one of them is changeable from its symbol chip. Venues
follow the page you opened them from, so a board opened on Binance is a board of
Binance tapes.

Keyboard shortcuts go to the chart you last pointed at or focused, so digits and
tool chords always land where you expect.

## Related

- [Drawing tools](/docs/drawing-tools)
- [Indicators](/docs/chart-indicators)
- [Custom Python indicators](/docs/custom-python-indicators)
- [Reading the market](/docs/market-data) for the book, tape, and depth panels
- [Keyboard shortcuts](/docs/keyboard-shortcuts)
