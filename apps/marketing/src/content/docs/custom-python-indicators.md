---
title: Custom Python indicators
description: Write chart indicators in real Python, numpy included, that run entirely on your machine and drop into any chart's indicator picker.
group: traders
parent: python-scripts
order: 1
eyebrow: For traders
updated: AUG 2026
readTime: 9 min read
---

Custom indicators in Pairlens work the way Pine Script does on TradingView, a
declaration plus a compute function, except the language is real Python with
real dependencies. Scripts run 100% locally: the terminal embeds a Python
runtime (Pyodide, CPython compiled to WebAssembly) in a dedicated Web Worker,
on desktop and in the browser alike. Your code and your candles never touch a
server.

## Quickstart

1. Open **Indicators & Strategies** in the left nav.
2. Click **New script** and start from the **RSI** template.
3. Hit **Run**. The first run boots the Python runtime, which takes a few
   seconds, then the indicator renders on a live preview chart.
4. That is it. The indicator now appears in every chart's indicator picker
   under **Custom**.

The RSI template in full:

```python
import numpy as np

from pairlens import indicator, input, series, hline, color

meta = indicator(
    title='RSI',
    pane='sub',
    inputs=[
        input.int('length', default=14, min=2, max=200),
        input.source('src', default='close'),
    ],
    series=[series.line('rsi', title='RSI', color=color.accent, width=2)],
    hlines=[hline(70, color=color.down), hline(30, color=color.up)],
    packages=['numpy'],
    min_bars=15,
)


def compute(ctx):
    length = int(ctx.params.length)
    src = np.asarray(ctx.source, dtype=np.float64)
    n = len(src)
    rsi = np.full(n, np.nan)
    if n <= length:
        return {'rsi': rsi}

    delta = np.diff(src)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    avg_gain = gain[:length].mean()
    avg_loss = loss[:length].mean()
    for i in range(length, n - 1):
        if avg_loss == 0:
            rsi[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[i + 1] = 100.0 - 100.0 / (1.0 + rs)
        # Wilder smoothing
        avg_gain = (avg_gain * (length - 1) + gain[i]) / length
        avg_loss = (avg_loss * (length - 1) + loss[i]) / length
    return {'rsi': rsi}
```

You would not normally write that by hand. `pairlens.ta` ships an `rsi()`, along
with 81 other functions. The template spells it out because seeing
the loop once makes everything else make sense.

## Anatomy of a script

Every script defines exactly two top-level things: a `meta = indicator(...)`
declaration and a `compute(ctx)` function.

`meta` is the contract. It tells the terminal what to put in the settings
dialog, what to draw, and what to warm up before your code is trusted.
`compute(ctx)` receives the candles and returns one array per declared output.

The full signature of every builder is in the
[Python API reference](/docs/python-api). Here is what you reach for first.

### Inputs

Each input becomes a field in the generated settings dialog, and its current
value arrives in `ctx.params` under its key.

| Builder                                        | Renders as                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `input.int(key, default, min=, max=, step=)`   | Integer stepper, clamped to `min` and `max`                                 |
| `input.float(key, default, min=, max=, step=)` | Decimal field, clamped to `min` and `max`                                   |
| `input.bool(key, default=False)`               | Toggle                                                                      |
| `input.choice(key, options=[...], default=)`   | Dropdown over `options`, defaulting to the first                            |
| `input.source(key, default='close')`           | Price-source picker: `open`, `high`, `low`, `close`, `hl2`, `hlc3`, `ohlc4` |

Declaring an `input.source` wires `ctx.source` to whatever the user picks.

### Series

`compute()` returns one array per declared series, keyed by the series key.
Eight styles: `line`, `stepline`, `area`, `histogram`, `columns`, `circles`,
`cross`, and `background`.

### Markers, fills, and levels

Beyond plotting values, a script can stamp signals and shade regions:

- `markers=[marker.buy('long_signal'), marker.sell('short_signal')]` stamps a
  triangle on every bar where that output is nonzero.
- `fills=[fill.between('upper', 'lower')]` shades between two series, and
  `fill.level('rsi', 50)` shades between a series and a constant.
- `hlines=[hline(70), hline(30)]` draws static reference levels.

### Per-bar colour

`plot(values, color=...)` lets a single series change colour bar by bar. Pass
an array of colours the same length as your values:

```python
return {
    'trend': plot(line, color=np.where(direction > 0, color.up, color.down)),
}
```

That is how the SuperTrend template paints one line green while it rides below
price and red while it rides above.

### Colours

Semantic tokens resolve against the active theme, so an indicator looks right
in all 18 themes: `color.primary`, `color.accent`, `color.up`, `color.down`,
`color.muted`. Raw CSS colours (`'#e0b34d'`) pass through untouched.

## The compute context

`compute(ctx)` receives one `ctx` object per run:

| Field                                                                    | What it is                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `ctx.time`, `ctx.open`, `ctx.high`, `ctx.low`, `ctx.close`, `ctx.volume` | numpy `float64` arrays, one element per candle (`ctx.time` is epoch milliseconds) |
| `ctx.source`                                                             | The array selected by the user's `input.source` choice, defaulting to close       |
| `ctx.params`                                                             | Resolved input values, with attribute access: `ctx.params.length`                 |
| `ctx.pair`, `ctx.timeframe`                                              | Strings like `'BTC-USDT'` and `'1h'`                                              |
| `ctx.data(key)`                                                          | An extra candle series declared with `request.security(...)`                      |
| `len(ctx)`                                                               | Number of candles in the window                                                   |

Return a dict mapping each output key to its values. The contract is forgiving:

- **Arrays align to the candles.** Element `i` belongs to candle `i`.
- **`NaN` or `None` is a gap.** Nothing is drawn for that bar, which is how
  warm-up periods work.
- **Scalars broadcast** to every bar.
- **Short arrays right-align.** The last element maps to the latest candle and
  missing leading bars become gaps. Longer arrays keep only the trailing
  window.

```python
def compute(ctx):
    mid = (ctx.high + ctx.low) / 2.0   # numpy all the way down
    return {'mid': mid}
```

## The function library

`pairlens.ta` covers the ground Pine's `ta.*` namespace covers: 82
functions across moving averages, oscillators, bands, volatility, volume, and
the comparison helpers (`crossover`, `crossunder`, `barssince`, `valuewhen`).

```python
from pairlens.ta import ema, atr, crossover

def compute(ctx):
    fast, slow = ema(ctx.close, 21), ema(ctx.close, 55)
    return {'fast': fast, 'slow': slow, 'cross': crossover(fast, slow)}
```

Full list in the [API reference](/docs/python-api#the-ta-library).

## Higher timeframes

`request.security(...)` pulls a second candle series, and `DataSeries.align()`
projects it back onto the chart's bars without repainting. By default a bar
sees only the last closed higher-timeframe bar, which is the difference between
a daily filter that would have worked and one that only looks like it would.

```python
requests=[request.security('d1', timeframe='1d')]

def compute(ctx):
    daily = ctx.data('d1')
    return {'d_ema': daily.align(ema(daily.close, 50))}
```

## Alert conditions

Declare `alerts=[alert.condition('cross', 'EMA cross')]` and that output becomes
a trigger you can pick in [notification rules](/docs/alerts-notifications). It
fires when the value turns nonzero on a closing bar. Messages support
`{{pair}}`, `{{timeframe}}`, `{{title}}`, `{{value}}`, and `{{price}}`.

## Using packages

Libraries come in three tiers, from most to least guaranteed:

1. **Preloaded.** numpy. It is warmed while the runtime boots, because nearly
   every script wants it. Import it and go.
2. **Built into the runtime.** Several hundred compiled scientific packages
   ship with the Python runtime itself: pandas, scipy, scikit-learn,
   statsmodels, polars, sympy, and friends. Import one at module level and it
   downloads on registration, no declaration needed. The **Libraries** button
   in the editor opens the full catalog, with versions and one-click import
   inserts. The list comes straight from the runtime's own package lockfile,
   so what you see is exactly what installs.
3. **Anything pure Python on PyPI.** If a package publishes a
   `py3-none-any` wheel, it works. Import it and the runtime installs it on
   the first failed import, or declare it to be explicit:

```python
meta = indicator(
    title='My indicator',
    ...
    packages=['ta'],
)
```

`packages=[...]` takes PyPI requirement strings, so it is also how you pin a
version of a pure-Python package: `packages=['ta==0.11.0']`. Runtime-built
packages always install at the version the runtime ships (the catalog shows
it).

The one hard limit: compiled packages that are not part of the runtime
distribution (TA-Lib is the classic) cannot install, because there is no C
compiler in a browser. The error will say so. Almost always there is a
pure-Python or runtime-built equivalent; the `ta` package covers most of
TA-Lib, and `pairlens.ta` ships 82 indicator functions with zero installs.

A few packages import under a different name than they install
(`scikit-learn` imports as `sklearn`). The runtime knows the common cases and
resolves them; for anything obscure, put the PyPI distribution name in
`packages=[...]` and import whatever the package documents.

The first install of any package needs a network connection; wheels are served
from the browser HTTP cache after that. All of this works identically in the
desktop app and in the browser build, because scripts run in your own local
Python runtime either way. Nothing about your code or its dependencies
touches a Pairlens server.

### Scripts cannot reach the network themselves

Package installs are the only network the Python runtime does. A script that
calls out on its own, through `js.fetch` or any other route into the browser's
APIs, is refused with a message naming the reason, and the runtime's own
allowlist holds three hosts: the pyodide CDN and PyPI's two.

This is not about your own scripts, which can already read your candles by
design. It is about the ones you did not write. Indicators travel: a plugin can
contribute them, and any script exported from the workbench is a plugin zip
somebody can install. Without the boundary, one of those could quietly ship
your market data, your parameters, or anything else it can see to a server of
its choosing, from inside a runtime that looks local.

So there is no way to widen it from a script, and no setting that opens it. If
you need outside data in an indicator, fetch it into a workspace variable or a
workflow and pass it in.

## On the chart

Once a script runs successfully, it is a first-class indicator:

- It appears in the chart's indicator picker under the **Custom** category.
- Its settings dialog is generated from the declared `inputs`, the same UX as
  built-in indicators.
- It recomputes when a candle closes. The forming bar refreshes at most once
  per second, and everything else is cached.
- Indicators you add to a chart persist with that pair's chart state, params
  included. Locally by default, synced across devices when you are signed in.

## Share it as a plugin

**Export as plugin** in the indicator editor packages the script as a
standalone plugin zip: a manifest plus a self-contained module that embeds the
Python source and declares the `chart:indicator` capability. Pick a plugin name
and id, download the zip, and send it to anyone. They install it via
**Plugins → Import plugin**, and the indicator shows up in their picker exactly
like one they wrote themselves.

Exported indicator plugins are sandbox-safe by construction: no imports, no
network hosts, nothing beyond the embedded script running in the same local
Python runtime.

### Publish to the community registry

To distribute an indicator through the in-app Plugin Store, submit it to the
community tier: open a pull request that adds a folder under
[`apps/registry/community/`](https://github.com/Pairlens/trading-terminal/tree/main/apps/registry/community)
in the Pairlens repo. CI validates the submission, and once merged the registry
builds your source itself and signs it with the community key. Community
plugins install with one click, badged **Community**, and run permanently
sandboxed. See the `pairlens-example-indicators` folder there for a reference
submission, and [publish to the registry](/docs/publish-to-registry) for the
full trust model.

## Limits and troubleshooting

**Compute times out at 10 seconds.** Python runs synchronously in its worker,
so a runaway loop cannot be interrupted. The runtime is terminated and
respawned on the next call, and your scripts re-register transparently. Package
installs get 60 seconds.

**Errors show real tracebacks.** Script failures surface in the editor with the
Python traceback trimmed to your own frames.

**The first run is the slow one.** Booting Pyodide takes a few seconds. You
will see "Starting Python", then "Installing packages" if the script declares
any. After that, registration and compute are fast.

**Desktop and browser behave identically.** The same runtime, timeouts, and
package sources apply in both, so indicators you write in one work unchanged in
the other.

## Next

- [Python API reference](/docs/python-api) for every builder and the `ta`
  library
- [Strategies and backtesting](/docs/strategies-and-backtests) to turn an
  indicator into something that trades
