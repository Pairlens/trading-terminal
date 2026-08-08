---
title: Python API reference
description: The full Python API for custom trading indicators in Pairlens, covering every builder, the compute context, and the 82 functions in pairlens.ta.
group: traders
parent: python-scripts
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 9 min read
---

Everything importable from `pairlens` and `pairlens.ta`, as it exists in the
runtime today.

```python
from pairlens import (
    indicator, strategy,          # declarations
    input, series, marker, fill,  # builders
    alert, request, hline, plot,
    color, log,
)
from pairlens.ta import ema, atr, crossover   # the function library
```

## Declarations

### `indicator(...)`

| Field       | Type                   | Meaning                                                  |
| ----------- | ---------------------- | -------------------------------------------------------- |
| `title`     | str                    | Display name in the picker and the chart legend          |
| `pane`      | `'overlay'` \| `'sub'` | Draw over price, or in its own sub-pane                  |
| `inputs`    | list of `input.*`      | User-tunable parameters, rendered as the settings dialog |
| `series`    | list of `series.*`     | The plotted outputs                                      |
| `hlines`    | list of `hline(...)`   | Static horizontal reference levels                       |
| `markers`   | list of `marker.*`     | Per-bar signal stamps                                    |
| `fills`     | list of `fill.*`       | Shaded regions                                           |
| `alerts`    | list of `alert.*`      | Outputs exposed as alert conditions                      |
| `requests`  | list of `request.*`    | Extra candle series to fetch                             |
| `packages`  | list of str            | PyPI requirements to install first (`['ta==0.11.0']`)    |
| `min_bars`  | int                    | Minimum candles before output is meaningful              |
| `precision` | int                    | Decimal places for the legend readout                    |
| `format`    | str                    | Value formatting hint                                    |

### `strategy(...)`

Everything `indicator(...)` takes, plus the backtest and execution spec:

| Field             | Default | Meaning                                                          |
| ----------------- | ------- | ---------------------------------------------------------------- |
| `initial_capital` | 10000.0 | Starting equity for the backtest                                 |
| `position_size`   | 1.0     | Fraction of equity committed per entry, in `(0, 1]`              |
| `fee`             | 0.001   | Per-side fee as a fraction                                       |
| `slippage`        | 0.0     | Per-side slippage as a fraction                                  |
| `allow_short`     | True    | Whether short entries are taken                                  |
| `stop_loss`       | None    | Protective stop as a fraction of entry price (0.02 is 2%)        |
| `take_profit`     | None    | Protective target as a fraction of entry price                   |
| `trailing_stop`   | None    | Trailing stop as a fraction, tracked from the best price reached |
| `max_bars`        | None    | Force an exit after this many bars in a position                 |

The four risk fields are checked per bar against the held position rather than
inside `compute()`. That is what lets a bot trading this strategy apply the
exact same exits the backtest did, from the same code. See
[strategies and backtesting](/docs/strategies-and-backtests).

## Inputs

```python
input.int(key, default=0, min=None, max=None, step=None, label=None)
input.float(key, default=0.0, min=None, max=None, step=None, label=None)
input.bool(key, default=False, label=None)
input.choice(key, options=[...], default=None, label=None)
input.source(key, default='close', label=None)
```

`input.choice` defaults to the first option when `default` is omitted, and
raises if `options` is empty. `input.source` accepts `open`, `high`, `low`,
`close`, `hl2`, `hlc3`, and `ohlc4`, and wires `ctx.source` to the choice.

## Series

```python
series.line(key, title=, color=, width=, style=, palette=, hidden=)
series.stepline(key, title=, color=, width=, style=, palette=, hidden=)
series.area(key, title=, color=, width=, style=, palette=, opacity=, hidden=)
series.histogram(key, title=, color=, up_down=, palette=, opacity=, hidden=)
series.columns(key, title=, color=, up_down=, palette=, opacity=, hidden=)
series.circles(key, title=, color=, width=, palette=, hidden=)
series.cross(key, title=, color=, width=, palette=, hidden=)
series.background(key, title=, color=, palette=, opacity=)
```

| Style        | What it draws                                           |
| ------------ | ------------------------------------------------------- |
| `line`       | A connected polyline; `NaN` breaks it into segments     |
| `stepline`   | Step and hold, for levels that only change on events    |
| `area`       | A line with the region down to zero filled              |
| `histogram`  | Vertical bars from zero; `up_down=True` colours by sign |
| `columns`    | Wide bars from zero, Pine's `style_columns`             |
| `circles`    | One dot per bar, unconnected                            |
| `cross`      | One small cross per bar, unconnected                    |
| `background` | Per-bar tint across the pane, Pine's `bgcolor`          |

`style` is `'solid'`, `'dashed'`, or `'dotted'`. `hidden=True` computes the
series without drawing it, which is useful when a fill or an alert needs a
value the user does not want to see.

`series.background` takes palette indices rather than prices: return `0.0` for
the first palette colour, `1.0` for the second, and `NaN` to leave the bar
untinted.

## Per-bar colour with `plot()`

```python
plot(values, color=None)
```

Wrap a returned array to give it per-bar colours. Pass an array of colour
values the same length as the data:

```python
return {'trend': plot(line, color=np.where(up, color.up, color.down))}
```

## Markers

```python
marker.shape(key, shape='circle', position='above', at=None,
             color=None, size=None, text=None, title=None)
marker.buy(key, text='BUY', color=None, title=None)
marker.sell(key, text='SELL', color=None, title=None)
```

A marker stamps every bar where `compute()`'s `key` output is nonzero.
`position` is `'above'`, `'below'`, `'top'`, `'bottom'`, or `'series'`, and
`'series'` requires `at=` naming the series to ride.

`marker.buy` and `marker.sell` are the conventional shorthands: an up triangle
below the bar in the theme's up colour, and a down triangle above the bar in
the down colour.

## Fills

```python
fill.between(a, b, color=None, palette=None, opacity=None, title=None)
fill.level(key, value, color=None, palette=None, opacity=None, title=None)
```

`fill.between` shades between two series. Pass `palette=[above, below]` for a
two-tone fill that flips when they cross, which is how a cloud reads at a
glance. `fill.level` shades between a series and a constant.

## Reference levels

```python
hline(value, color=None, label=None)
```

## Alerts

```python
alert.condition(key, title, message=None)
```

Exposes an output as an alert condition. It fires when the value turns nonzero
on a closing bar. `message` supports `{{pair}}`, `{{timeframe}}`, `{{title}}`,
`{{value}}`, and `{{price}}`.

## Extra data series

```python
request.security(key, timeframe=None, pair=None, market=None)
```

Asks the host for another candle series. Omit a field to inherit the chart's
own. Read it back in `compute()` with `ctx.data(key)`, which returns a
`DataSeries`:

| Member                                                 | What it is                                   |
| ------------------------------------------------------ | -------------------------------------------- |
| `.time`, `.open`, `.high`, `.low`, `.close`, `.volume` | That series' own arrays, on its own timeline |
| `len(series)`                                          | Its bar count                                |
| `.align(values, lookahead=False)`                      | Project values onto the chart's bars         |

`align()` holds each value until the next one arrives. By default a chart bar
sees only the last **closed** bar of the requested series, which is what stops
a higher-timeframe value from repainting. Pass `lookahead=True` to use the
in-progress bar instead, and understand that any backtest you run afterwards is
using information the bar did not have.

## Colours and logging

```python
color.primary, color.accent, color.up, color.down, color.muted
```

Semantic tokens that resolve against the active theme. Raw CSS colour strings
pass through untouched.

```python
log.info(*args, sep=' ')
log.warning(*args, sep=' ')
log.error(*args, sep=' ')
```

Leveled output for the editor console. Plain `print()` works too and lands in
the same place; `log.*` adds a severity the console colours and filters.

## The compute context

| Field                                                                    | What it is                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `ctx.time`, `ctx.open`, `ctx.high`, `ctx.low`, `ctx.close`, `ctx.volume` | numpy `float64` arrays, one element per candle; `ctx.time` is epoch ms |
| `ctx.source`                                                             | The array chosen by the user's `input.source`                          |
| `ctx.params`                                                             | Resolved inputs, attribute access: `ctx.params.length`                 |
| `ctx.pair`, `ctx.timeframe`                                              | `'BTC-USDT'`, `'1h'`                                                   |
| `ctx.data(key)`                                                          | A requested `DataSeries`                                               |
| `len(ctx)`                                                               | Candle count in the window                                             |

## The `ta` library

Eighty-two functions in `pairlens.ta`, all numpy-array in, numpy-array out, all
NaN-padded through their warm-up period so they align to the candles without
you shifting anything.

**Moving averages (11).** `sma`, `ema`, `rma`, `wma`, `hma`, `vwma`, `dema`,
`tema`, `alma`, `swma`, `linreg`

**Bands and channels (7).** `bb`, `bbw`, `percent_b`, `keltner`, `donchian`,
`envelope`, `supertrend`

**Oscillators and momentum (16).** `rsi`, `stoch`, `stoch_rsi`, `macd`, `cci`,
`mfi`, `willr`, `roc`, `mom`, `tsi`, `cmo`, `uo`, `ao`, `trix`, `ppo`, `cmf`

**Volatility (7).** `tr`, `atr`, `natr`, `variance`, `stdev`, `dev`, `range_`

**Trend (6).** `adx`, `dmi`, `aroon`, `psar`, `vortex`, `chop`

**Volume (6).** `obv`, `ad`, `vwap`, `pvt`, `eom`, `force_index`

**Series helpers (14).** `sum_`, `highest`, `lowest`, `highest_bars`,
`lowest_bars`, `change`, `crossover`, `crossunder`, `cross`, `rising`,
`falling`, `barssince`, `valuewhen`, `cum`

**Statistics (6).** `correlation`, `percentrank`, `median`, `mode_`,
`pivot_high`, `pivot_low`

**Transforms and sources (9).** `rescale`, `normalize`, `nz`, `fill_forward`,
`hl2`, `hlc3`, `ohlc4`, `hlcc4`, `heikin_ashi`

Functions with a trailing underscore (`sum_`, `range_`, `mode_`) avoid
shadowing Python builtins. Multi-output functions return tuples:
`bb()` gives basis, upper, lower; `macd()` gives macd, signal, histogram;
`supertrend()` gives line and direction.

```python
from pairlens.ta import bb, macd, supertrend

basis, upper, lower = bb(ctx.close, 20, 2.0)
macd_line, signal, hist = macd(ctx.close)
line, direction = supertrend(ctx.high, ctx.low, ctx.close, 10, 3.0)
```

## Multi-file scripts

A script is a directory. `main.py` holds `meta` and `compute`; anything else
next to it imports by module name:

```python
# main.py
from bands import compute_bands
```

Each script's directory is what `sys.path[0]` points at while it runs, so two
scripts can each ship a `helpers.py` without colliding.

## Errors

Raise anything, or let Python raise. The traceback surfaces in the editor
trimmed to your own frames. `PairlensScriptError` is what the SDK itself raises
for contract violations, such as an empty `input.choice` options list or a
`ctx.data()` key you never requested.
