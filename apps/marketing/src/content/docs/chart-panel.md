---
title: The chart
description: 16 chart types, 11 timeframes, four price-scale modes, bar replay, symbol comparison, and screenshots. Everything the chart panel can do.
group: traders
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 6 min read
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

### Timeframes

Eleven timeframes, ten with a single-key shortcut. Press the digit anywhere in
the app and the active chart switches.

| Key | Timeframe | Key | Timeframe |
| --- | --------- | --- | --------- |
| 1   | 1m        | 6   | 2h        |
| 2   | 5m        | 7   | 4h        |
| 3   | 15m       | 8   | 1D        |
| 4   | 30m       | 9   | 1W        |
| 5   | 1h        | 0   | 3D        |

Monthly (1M) is in the menu without a shortcut.

### Chart types

Sixteen of them, all GPU-rendered:

**Candle family.** Candles, Heikin-Ashi, Hollow Candles, Bar, High-Low.

**Line family.** Line, Step Line, Area, HLC Area, Baseline.

**Bar family.** Histogram, Column.

**Alternative.** Renko, Line Break, Kagi, Point and Figure.

Renko, Kagi, Line Break, and Point and Figure redraw price without a fixed time
axis, which is what makes them useful for filtering noise out of a trend.

### Crosshair

Three modes. **Normal** follows the pointer freely. **Magnet** snaps to the
nearest OHLC value, which is what you want while drawing levels off wicks.
**Hidden** removes it entirely for a clean screenshot.

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

## Multiple charts

Add more than one chart panel to a workspace and each keeps its own timeframe,
type, and indicator set. Keyboard shortcuts go to the chart you last pointed at
or focused, so digits and tool chords always land where you expect.

## Related

- [Drawing tools](/docs/drawing-tools)
- [Indicators](/docs/chart-indicators)
- [Custom Python indicators](/docs/custom-python-indicators)
- [Keyboard shortcuts](/docs/keyboard-shortcuts)
