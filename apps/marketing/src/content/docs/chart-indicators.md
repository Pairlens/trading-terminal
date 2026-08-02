---
title: Indicators
description: 90 built-in indicators across seven categories, tuned from a generated settings dialog, saved as reusable templates, and extended with your own Python.
group: traders
parent: chart-panel
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 4 min read
---

Press <kbd>⌘I</kbd> anywhere in the app, or hit **Indicators** in the chart
toolbar, and the picker opens. Search by name, filter to overlay or separate
pane, and click to add.

## What ships built in

Ninety indicators, computed off the main thread in a Web Worker so a busy chart
never stutters.

| Category                 | Count | Examples                                                           |
| ------------------------ | ----- | ------------------------------------------------------------------ |
| Moving Averages          | 17    | EMA, SMA, WMA, HMA, VWAP, VWMA, ALMA, KAMA, LSMA, Guppy MMA        |
| Oscillators and Momentum | 35    | RSI, MACD, Stochastic, Stoch RSI, Williams %R, CCI, MFI, ADX, TRIX |
| Bands and Channels       | 5     | Bollinger Bands, Keltner, Donchian, Envelope                       |
| Trend                    | 10    | Ichimoku, SuperTrend, Parabolic SAR, ZigZag                        |
| Volume                   | 9     | OBV, Accumulation/Distribution, Chaikin Money Flow, Volume Profile |
| Volatility               | 7     | ATR, Standard Deviation, Historical Volatility                     |
| Statistical              | 7     | Linear Regression, Correlation, Standard Error bands               |

Coverage is tracked against TradingView's 146 built-ins. The full list with
type ids, pane placement, and default parameters lives in
[INDICATORS.md](https://github.com/Pairlens/fast-financial-charts/blob/main/INDICATORS.md)
in the charts repository.

## Overlay or sub-pane

Each indicator declares where it belongs. Moving averages and bands draw over
price. Oscillators get their own pane below, with a resizable separator and its
own price scale. Filter the picker by **Overlay** or **Separate** when you know
which half you are looking for.

## Tuning parameters

Click an indicator in the chart legend to open its settings. The dialog is
generated from the indicator's declared parameters, so an RSI shows a period
field and a MACD shows fast, slow, and signal. **Reset to defaults** puts it
back.

Parameters are saved with the chart, per pair. An RSI(21) on ETH stays RSI(21)
on ETH without affecting your BTC chart.

## Templates

Got a set-up you use on every chart? Add the indicators, tune them, then
**Save current as template**. Applying a template drops the whole set onto any
chart in one click. Templates are yours across every pair and every workspace.

## Managing what is on the chart

The **Active** section at the top of the picker lists what is currently
applied. Remove one, or use the toolbar **Clear** menu to remove all
indicators, all drawings, or both. Undo covers all of it.

## Custom indicators

The **Custom** category holds anything you wrote in Python, plus indicators
that arrived with an installed plugin. They behave exactly like built-ins: same
picker entry, same generated settings dialog, same persistence.

Writing one takes about ten lines. See
[custom Python indicators](/docs/custom-python-indicators).

## Alerts from indicators

A Python indicator can declare alert conditions, which then show up as
triggers in [notification rules](/docs/alerts-notifications). That is how you
get "tell me when my own oscillator crosses 80" without leaving the app.

## Related

- [The chart](/docs/chart-panel)
- [Custom Python indicators](/docs/custom-python-indicators)
- [Python API reference](/docs/python-api)
