---
title: Indicators
description: What an indicator actually is, which ones are worth your time as a beginner, and how the Pairlens picker, settings dialog and templates work across 90 built-ins.
group: traders
parent: chart-panel
order: 2
eyebrow: For traders
updated: 22 AUG 2026
readTime: 5 min read
---

## What an indicator is

An indicator is a calculation over price history, drawn on your chart so you can
see it.

That is the whole idea. A 20-period moving average is literally the average of
the last 20 closing prices, redrawn each bar. RSI is a formula that compares how
much price rose against how much it fell, scaled to a number between 0 and 100.
Nothing mystical is happening.

Two things follow from that, and both are worth internalising early.

**Every indicator lags.** It is computed from bars that already closed, so it
can only ever describe what already happened. A moving average crossing upward
means price rose a while ago, not that it will rise next.

**More indicators is not more information.** Ten momentum oscillators are ten
views of the same price data, and they will mostly agree with each other, which
feels like confirmation and is not. Most experienced traders run two or three.

Used well, an indicator saves you eyeballing something you could in principle
see yourself: the trend direction, whether the move is unusually large, whether
volume backed it up.

## Where to start

If you are new, add these three and nothing else for a while:

**A moving average (EMA or SMA), period 50 or 200.** Price above it is an uptrend
by the simplest definition available. That is genuinely most of what a trend
indicator gives you.

**RSI, period 14.** A 0 to 100 reading of how stretched the recent move is. Above
70 traditionally reads as overbought, below 30 as oversold. Be careful: a strong
trend can hold above 70 for weeks, and "overbought" has bankrupted a lot of
people who read it as "sell".

**Volume.** Not really an indicator, just the amount traded per bar. A big move
on low volume convinces fewer people than a big move on high volume.

## Adding one

Press <kbd>⌘I</kbd> anywhere in the app, or hit **Indicators** in the chart
toolbar. Search by name, filter to overlay or separate pane, click to add.

## What ships built in

Ninety indicators, computed off the main thread so a busy chart never stutters.

| Category                 | Count | Examples                                                           |
| ------------------------ | ----- | ------------------------------------------------------------------ |
| Moving Averages          | 17    | EMA, SMA, WMA, HMA, VWAP, VWMA, ALMA, KAMA, LSMA, Guppy MMA        |
| Oscillators and Momentum | 35    | RSI, MACD, Stochastic, Stoch RSI, Williams %R, CCI, MFI, ADX, TRIX |
| Bands and Channels       | 5     | Bollinger Bands, Keltner, Donchian, Envelope                       |
| Trend                    | 10    | Ichimoku, SuperTrend, Parabolic SAR, ZigZag                        |
| Volume                   | 9     | OBV, Accumulation/Distribution, Chaikin Money Flow, Volume Profile |
| Volatility               | 7     | ATR, Standard Deviation, Historical Volatility                     |
| Statistical              | 7     | Linear Regression, Correlation, Standard Error bands               |

The full list with default settings lives in
[INDICATORS.md](https://github.com/Pairlens/fast-financial-charts/blob/main/INDICATORS.md).

## Overlay or its own pane

Some indicators belong on top of price, because they are measured in price:
moving averages, Bollinger Bands, VWAP. Others are on a different scale
entirely, like RSI's 0 to 100, so they get their own pane underneath with its
own axis and a resizable divider.

Filter the picker by **Overlay** or **Separate** when you know which half you
want.

## Tuning settings

Click an indicator in the chart legend to open its settings. The dialog shows
that indicator's own parameters, so an RSI offers a period and a MACD offers
fast, slow and signal. **Reset to defaults** puts it back.

A word on periods: shorter reacts faster and gives more false signals, longer
reacts slower and misses the start of moves. There is no setting that avoids
both. If you find yourself tuning a number until the past looks perfect, you
have found a number that fits the past.

Settings are saved with the chart, per pair. An RSI(21) on Ethereum stays
RSI(21) on Ethereum without touching your Bitcoin chart.

## Templates

Got a setup you use on every chart? Add the indicators, tune them, then **Save
current as template**. Applying it drops the whole set onto any chart in one
click, on any pair, in any workspace.

## Managing what is on the chart

The **Active** section at the top of the picker lists what is currently applied.
Remove one there, or use the toolbar **Clear** menu to remove all indicators,
all drawings, or both.

## Your own indicators

The **Custom** category holds anything you wrote in Python, plus indicators that
arrived with a plugin. They behave exactly like built-ins: same picker entry,
same settings dialog, same persistence.

Writing one takes about ten lines. See
[custom Python indicators](/docs/custom-python-indicators).

## Alerts from indicators

A Python indicator can declare its own alert conditions, which then appear as
triggers in [notification rules](/docs/alerts-notifications). That is how you get
"tell me when my own oscillator crosses 80" without watching a screen.

## Related

- [The chart](/docs/chart-panel)
- [Custom Python indicators](/docs/custom-python-indicators)
- [Strategies and backtesting](/docs/strategies-and-backtests) to test whether
  an idea actually worked
