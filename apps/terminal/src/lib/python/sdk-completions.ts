// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The indicator editor's knowledge of the Python SDK: what `pairlens` and
 * `pairlens.ta` export, what each thing takes, and what it does.
 *
 * This is the single source for both autocompletion and hover docs in
 * `components/indicators/code-editor.tsx`. It mirrors two Python files by
 * hand — `pairlens_sdk.py` and `pairlens_ta.py` — and
 * `__tests__/sdk-completions.test.ts` diffs every name here against those
 * sources so the docs cannot silently rot when the SDK moves.
 */

export type SdkCompletion = {
  label: string
  /** 'function' | 'property' | 'class' | 'namespace' | 'keyword' */
  type: string
  /** Short signature shown next to the label, e.g. '(key, default=0, min=None, ...)' */
  detail?: string
  /** One-paragraph docs shown in the completion tooltip and on hover. */
  info?: string
  /** Text inserted; defaults to `label`. */
  apply?: string
}

// ── pairlens ─────────────────────────────────────────────────────────────────

/** Completions offered after `pairlens.` / at top level after `from pairlens import`. */
export const PAIRLENS_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'indicator',
    type: 'function',
    detail:
      '(title, pane="overlay", inputs=None, series=None, hlines=None, markers=None, fills=None, alerts=None, requests=None, packages=None, min_bars=None, precision=None, format=None)',
    info: 'Declare a chart indicator and assign it to a top-level `meta`. `title` names it in the chart legend and picker; `pane` is "overlay" to draw on the price chart or "sub" for its own pane below. `inputs` are `input.*` specs that become the settings UI, `series` are `series.*` specs — one per key your `compute()` returns. `hlines` adds static reference levels, `markers` stamps signal shapes, `fills` shades between plots, `alerts` exposes conditions to the alert engine, and `requests` pulls extra candle series read back through `ctx.data(key)`. `packages` lists pip requirements to install before the script runs, `min_bars` the warm-up bars needed before anything is plotted, and `precision`/`format` control how values are rendered.',
  },
  {
    label: 'strategy',
    type: 'function',
    detail:
      '(title, pane="overlay", inputs=None, series=None, ..., initial_capital=10000.0, position_size=1.0, fee=0.001, slippage=0.0, allow_short=True)',
    info: 'Declare a backtested strategy. Takes everything `indicator(...)` takes, plus the simulation settings. `compute()` additionally returns an `entries`/`exits` pair (or a `position` array of -1/0/1) that the terminal replays into an equity curve and trade list. `initial_capital` is the starting balance, `position_size` the fraction of equity per trade, `fee` the per-side taker fee as a fraction (0.001 = 10 bps), `slippage` the extra fraction applied to each fill, and `allow_short=False` restricts the run to long-only.',
  },
  {
    label: 'input',
    type: 'namespace',
    detail: 'input.int | float | bool | choice | source',
    info: 'Builders for the `inputs=[...]` list. Each one declares a control in the indicator settings panel and a value readable in `compute()` as `ctx.params.<key>`.',
  },
  {
    label: 'series',
    type: 'namespace',
    detail:
      'series.line | stepline | histogram | columns | area | circles | cross | background',
    info: 'Builders for the `series=[...]` list — one entry per plotted output. The `key` of each spec must match a key of the dict your `compute()` returns.',
  },
  {
    label: 'marker',
    type: 'namespace',
    detail: 'marker.shape | buy | sell',
    info: 'Builders for the `markers=[...]` list — signal stamps drawn on individual bars wherever the named `compute()` output is nonzero.',
  },
  {
    label: 'fill',
    type: 'namespace',
    detail: 'fill.between | level',
    info: 'Builders for the `fills=[...]` list — shaded regions between two plotted series, or between a series and a constant level.',
  },
  {
    label: 'alert',
    type: 'namespace',
    detail: 'alert.condition',
    info: 'Builders for the `alerts=[...]` list — conditions the terminal watches on closing bars and turns into notifications.',
  },
  {
    label: 'request',
    type: 'namespace',
    detail: 'request.security',
    info: 'Builders for the `requests=[...]` list — extra candle series (another timeframe, pair or venue) that the host fetches and hands back through `ctx.data(key)`.',
  },
  {
    label: 'color',
    type: 'namespace',
    detail: 'color.primary | up | down | muted | accent',
    info: 'Semantic color tokens resolved against the active theme, so an indicator restyles itself when the user switches themes. Any raw CSS color string works too and passes through untouched.',
  },
  {
    label: 'log',
    type: 'namespace',
    detail: 'log.info | warning | error',
    info: 'Leveled output for the workbench console. `print()` already reaches the console; `log.*` adds a severity the console can color and filter.',
  },
  {
    label: 'ta',
    type: 'namespace',
    detail: 'from pairlens.ta import ema, rsi, crossover',
    info: 'The Pairlens technical-analysis standard library. Every function takes 1-D float64 arrays (the OHLCV arrays hanging off `ctx`) and returns an array of the same length, NaN-padded over the warm-up period so results map 1:1 onto chart bars. A leading NaN run is skipped rather than propagated, so `sma(ema(close, 50), 10)` warms up once and then produces values — but interior NaN holes are never interpolated, so run `fill_forward` or `nz` first if a source may have them. Degenerate arguments never raise: a non-positive or oversized `length`, an empty series or an all-NaN source all give back an all-NaN array of the right length. Boolean helpers (`crossover`, `cross`, `rising`, `falling`) return 0.0/1.0 floats, and 0.0 rather than NaN during warm-up.',
  },
  {
    label: 'hline',
    type: 'function',
    detail: '(value, color=None, label=None)',
    info: 'A static horizontal reference level for the `hlines=[...]` list — the 70/30 lines on an RSI, a zero line on a histogram. `value` is the price or oscillator level, `label` the text shown on the axis.',
  },
  {
    label: 'plot',
    type: 'function',
    detail: '(values, color=None)',
    info: "Pair a series' values with a per-bar color, returned from `compute()` in place of a plain array: `return {'trend': plot(line, color=np.where(up, color.up, color.down))}`. `color` may be one color, an array of colors (folded into a palette automatically), or an array of indices into the series' declared `palette=[...]`.",
  },
  {
    label: 'Plot',
    type: 'class',
    detail: 'Plot(values, color=None)',
    info: "The object `plot(...)` returns: a series' `values` plus its per-bar `color`. Construct it through `plot(...)` rather than directly.",
  },
  {
    label: 'Meta',
    type: 'class',
    detail: 'Meta(title, pane="overlay", ...)',
    info: 'The declaration object returned by `indicator(...)` and `strategy(...)`. The host reads it off your top-level `meta` to build the chart entry, the settings UI and the series presenter. Build it through `indicator(...)`, not directly.',
  },
  {
    label: 'Context',
    type: 'class',
    detail: 'the `ctx` argument of compute(ctx)',
    info: 'The per-call compute context: the OHLCV arrays, the resolved inputs, the chart pair and timeframe, and `data(key)` for extra series. `time/open/high/low/close/volume` are numpy float64 arrays when numpy is loaded and plain Python lists otherwise.',
  },
  {
    label: 'DataSeries',
    type: 'class',
    detail: 'ctx.data(key)',
    info: 'One extra candle series pulled in by `request.security(...)`. Its arrays sit on their own timeline (a 1d series is far shorter than a 1h chart), so run `align(values)` before returning anything computed from it.',
  },
  {
    label: 'Params',
    type: 'class',
    detail: 'ctx.params',
    info: 'A dict with attribute access, so `ctx.params.length` and `ctx.params["length"]` are the same thing. Keys are the `key` you gave each `input.*` spec.',
  },
  {
    label: 'PairlensScriptError',
    type: 'class',
    detail: 'PairlensScriptError(message)',
    info: 'Raised for indicator-script contract violations — a missing `meta`, a `compute()` that returns the wrong shape, a `ctx.data(key)` that was never requested. Raise it yourself to fail a script with a message the console shows verbatim.',
  },
]

// ── pairlens.input ───────────────────────────────────────────────────────────

const INPUT_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'int',
    type: 'function',
    detail: '(key, default=0, min=None, max=None, step=None, label=None)',
    info: 'A whole-number setting — lengths, lookbacks, smoothing periods. `key` is how you read it back (`ctx.params.<key>`), `min`/`max` clamp the control and `step` sets the increment. `label` overrides the humanized key in the settings panel.',
  },
  {
    label: 'float',
    type: 'function',
    detail: '(key, default=0.0, min=None, max=None, step=None, label=None)',
    info: 'A decimal setting — multipliers, thresholds, percentages. Same arguments as `input.int`; use `step` to make the control move in sensible increments (0.1, 0.25).',
  },
  {
    label: 'bool',
    type: 'function',
    detail: '(key, default=False, label=None)',
    info: 'An on/off switch rendered as a toggle. Read it back as a Python bool through `ctx.params.<key>`.',
  },
  {
    label: 'choice',
    type: 'function',
    detail: '(key, options=None, default=None, label=None)',
    info: 'A dropdown over a fixed list of strings. `options` is required and must be non-empty; `default` falls back to the first option. The chosen string arrives in `ctx.params.<key>`.',
  },
  {
    label: 'source',
    type: 'function',
    detail: '(key, default="close", label=None)',
    info: 'A price-source picker (close, open, high, low, hl2, hlc3, ohlc4). The chart resolves the choice for you and hands the array over as `ctx.source` — prefer that over hardcoding `ctx.close`.',
  },
]

// ── pairlens.series ──────────────────────────────────────────────────────────

const SERIES_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'line',
    type: 'function',
    detail:
      '(key, title=None, color=None, width=None, style=None, palette=None, hidden=None)',
    info: 'A connected polyline — the default plot. NaN values break the line into segments rather than interpolating. `style` is "solid" | "dashed" | "dotted", `palette` a color list your `compute()` can index into per bar, and `hidden=True` keeps the output off the chart while still exposing it to fills, markers and alerts.',
  },
  {
    label: 'stepline',
    type: 'function',
    detail:
      '(key, title=None, color=None, width=None, style=None, palette=None, hidden=None)',
    info: 'A step-and-hold line: the value stays flat until it changes. Right for levels that only move on events — pivots, support/resistance, a trailing stop.',
  },
  {
    label: 'histogram',
    type: 'function',
    detail:
      '(key, title=None, color=None, up_down=None, palette=None, opacity=None, hidden=None)',
    info: 'Thin vertical bars drawn from zero. `up_down=True` colors each bar by its sign using the theme up/down colors — the usual MACD histogram look.',
  },
  {
    label: 'columns',
    type: 'function',
    detail:
      '(key, title=None, color=None, up_down=None, palette=None, opacity=None, hidden=None)',
    info: "Wide bars from zero (Pine's `style_columns`) — volume-style plots. Same coloring options as `series.histogram`.",
  },
  {
    label: 'area',
    type: 'function',
    detail:
      '(key, title=None, color=None, width=None, style=None, palette=None, opacity=None, hidden=None)',
    info: 'A line with the region between it and zero filled. `opacity` (0..1) controls the fill strength; the line itself keeps `color`.',
  },
  {
    label: 'circles',
    type: 'function',
    detail:
      '(key, title=None, color=None, width=None, palette=None, hidden=None)',
    info: 'One unconnected dot per bar. Good for sparse outputs (pivots, fractals) where NaN gaps should stay gaps. `width` sets the dot radius.',
  },
  {
    label: 'cross',
    type: 'function',
    detail:
      '(key, title=None, color=None, width=None, palette=None, hidden=None)',
    info: 'One unconnected cross per bar — the same sparse plotting as `series.circles` with a different mark.',
  },
  {
    label: 'background',
    type: 'function',
    detail: '(key, title=None, color=None, palette=None, opacity=None)',
    info: "Per-bar tint across the whole pane (Pine's `bgcolor`). The values your `compute()` returns are indices into `palette`; NaN leaves that bar untinted.",
  },
]

// ── pairlens.marker ──────────────────────────────────────────────────────────

const MARKER_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'shape',
    type: 'function',
    detail:
      '(key, shape="circle", position="above", at=None, color=None, size=None, text=None, title=None)',
    info: 'Stamp `shape` on every bar where the `compute()` output named `key` is nonzero. `position` is "above" | "below" | "top" | "bottom" | "series" (riding the series named by `at`). `text` prints a short label next to the mark.',
  },
  {
    label: 'buy',
    type: 'function',
    detail: '(key, text="BUY", color=None, title=None)',
    info: 'Shorthand for an up triangle below the bar in the theme up color — the conventional long marker. Equivalent to `marker.shape(key, shape="triangle_up", position="below", ...)`.',
  },
  {
    label: 'sell',
    type: 'function',
    detail: '(key, text="SELL", color=None, title=None)',
    info: 'Shorthand for a down triangle above the bar in the theme down color — the conventional short marker.',
  },
]

// ── pairlens.fill ────────────────────────────────────────────────────────────

const FILL_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'between',
    type: 'function',
    detail: '(a, b, color=None, palette=None, opacity=None, title=None)',
    info: 'Shade the region between two plotted series, named by their series keys. Pass `palette=[above, below]` for a two-tone fill that flips when the series cross — the standard Ichimoku cloud or band fill.',
  },
  {
    label: 'level',
    type: 'function',
    detail: '(key, value, color=None, palette=None, opacity=None, title=None)',
    info: 'Shade between one series and a constant price or oscillator level — an RSI against its 50 line, price against a fixed support.',
  },
]

// ── pairlens.alert ───────────────────────────────────────────────────────────

const ALERT_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'condition',
    type: 'function',
    detail: '(key, title, message=None)',
    info: 'Expose the `compute()` output named `key` as an alert condition: the terminal fires when it turns nonzero on a closing bar. `title` is what the user picks in the alert dialog; `message` may interpolate {{pair}}, {{timeframe}}, {{title}}, {{value}} and {{price}}.',
  },
]

// ── pairlens.request ─────────────────────────────────────────────────────────

const REQUEST_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'security',
    type: 'function',
    detail: '(key, timeframe=None, pair=None, market=None)',
    info: "Ask the host for another candle series — a higher timeframe, another pair, another venue — read back in `compute()` as `ctx.data(key)`. Omit a field to inherit the chart's own. Project the result onto the chart's bars with `ctx.data(key).align(values)` before returning it, or it will not line up.",
  },
]

// ── pairlens.color ───────────────────────────────────────────────────────────

const COLOR_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'primary',
    type: 'property',
    detail: "'token:primary'",
    info: "The theme's accent hue — the default for a single-line indicator.",
  },
  {
    label: 'up',
    type: 'property',
    detail: "'token:up'",
    info: 'The bullish/positive color, matched to the candle up color of the active theme.',
  },
  {
    label: 'down',
    type: 'property',
    detail: "'token:down'",
    info: 'The bearish/negative color, matched to the candle down color of the active theme.',
  },
  {
    label: 'muted',
    type: 'property',
    detail: "'token:muted'",
    info: 'A low-contrast neutral for secondary lines, baselines and reference levels.',
  },
  {
    label: 'accent',
    type: 'property',
    detail: "'token:accent'",
    info: 'A secondary highlight hue, for the second series of a pair (a signal line against its MACD).',
  },
]

// ── pairlens.log ─────────────────────────────────────────────────────────────

const LOG_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'info',
    type: 'function',
    detail: '(*args, sep=" ")',
    info: 'Write an info-level line to the workbench console. Takes any number of values and joins them with `sep`, like `print()`.',
  },
  {
    label: 'warning',
    type: 'function',
    detail: '(*args, sep=" ")',
    info: 'Write a warning-level line to the workbench console — highlighted, and filterable by severity.',
  },
  {
    label: 'error',
    type: 'function',
    detail: '(*args, sep=" ")',
    info: 'Write an error-level line to the workbench console without raising. Raise `PairlensScriptError` instead when the script cannot continue.',
  },
]

// ── the `ctx` passed to compute(ctx) ─────────────────────────────────────────

const CTX_COMPLETIONS: Array<SdkCompletion> = [
  {
    label: 'time',
    type: 'property',
    detail: 'float64 array',
    info: 'Bar open times in milliseconds since the epoch, one entry per chart bar, ascending.',
  },
  {
    label: 'open',
    type: 'property',
    detail: 'float64 array',
    info: 'Open price of every bar on the chart.',
  },
  {
    label: 'high',
    type: 'property',
    detail: 'float64 array',
    info: 'High price of every bar on the chart.',
  },
  {
    label: 'low',
    type: 'property',
    detail: 'float64 array',
    info: 'Low price of every bar on the chart.',
  },
  {
    label: 'close',
    type: 'property',
    detail: 'float64 array',
    info: 'Close price of every bar. The last entry is the forming bar and moves while the candle is open.',
  },
  {
    label: 'volume',
    type: 'property',
    detail: 'float64 array',
    info: 'Base-asset volume traded in every bar.',
  },
  {
    label: 'source',
    type: 'property',
    detail: 'float64 array',
    info: 'The price series the user picked with `input.source(...)`, already resolved — one of close/open/high/low or a computed hl2, hlc3 or ohlc4. Prefer it over `ctx.close` so the indicator can be retargeted from the settings panel.',
  },
  {
    label: 'params',
    type: 'property',
    detail: 'Params',
    info: 'The resolved input values, keyed by the `key` of each `input.*` spec. Attribute access works: `ctx.params.length` is `ctx.params["length"]`.',
  },
  {
    label: 'pair',
    type: 'property',
    detail: 'str',
    info: 'The chart\'s pair symbol, e.g. "BTC-USDT". Useful for labels and alert messages.',
  },
  {
    label: 'timeframe',
    type: 'property',
    detail: 'str',
    info: 'The chart\'s timeframe id, e.g. "1h". Use it to scale lookbacks that should mean the same wall-clock span on every timeframe.',
  },
  {
    label: 'data',
    type: 'function',
    detail: '(key)',
    info: "Return the extra candle series declared as `request.security(key, ...)`: a `DataSeries` with its own `time/open/high/low/close/volume` arrays plus `align(values, lookahead=False)` to project a computed value onto the chart's bars. Raises `PairlensScriptError` if `key` was never requested.",
  },
]

// ── pairlens.ta ──────────────────────────────────────────────────────────────
// One list per section, alphabetical inside each section, mirroring the section
// order of `pairlens_ta.py`. When that file gains or loses a public `def`, edit
// the matching section here — the test in `__tests__/sdk-completions.test.ts`
// fails until the two agree. `TA_COMPLETIONS` is the flattening of the sections
// and `TA_SECTIONS` is what the reference panel groups by, so the two can never
// drift apart.

const TA_MOVING_AVERAGES: Array<SdkCompletion> = [
  {
    label: 'sma',
    type: 'function',
    detail: '(src, length)',
    info: 'Simple moving average of `src` over `length` bars — the unweighted mean of the window.',
  },
  {
    label: 'ema',
    type: 'function',
    detail: '(src, length)',
    info: 'Exponential moving average (alpha = 2/(length+1)), seeded on the SMA of the first `length` bars exactly like TradingView.',
  },
  {
    label: 'rma',
    type: 'function',
    detail: '(src, length)',
    info: "Wilder's smoothing (alpha = 1/length) — the average behind RSI, ATR and ADX. Reacts about half as fast as an EMA of the same length.",
  },
  {
    label: 'wma',
    type: 'function',
    detail: '(src, length)',
    info: 'Weighted moving average with weights 1..length, newest bar heaviest.',
  },
  {
    label: 'hma',
    type: 'function',
    detail: '(src, length)',
    info: 'Hull moving average — a WMA blend that cuts lag without adding much noise. Fast enough to overshoot on turns.',
  },
  {
    label: 'vwma',
    type: 'function',
    detail: '(src, volume, length)',
    info: 'Volume-weighted moving average: heavy bars pull the average further than quiet ones.',
  },
  {
    label: 'dema',
    type: 'function',
    detail: '(src, length)',
    info: 'Double exponential moving average — 2*EMA minus the EMA of that EMA, which cancels most of the EMA lag.',
  },
  {
    label: 'tema',
    type: 'function',
    detail: '(src, length)',
    info: 'Triple exponential moving average — even less lag than DEMA at the cost of more overshoot.',
  },
  {
    label: 'alma',
    type: 'function',
    detail: '(src, length, offset=0.85, sigma=6.0)',
    info: 'Arnaud Legoux moving average — a Gaussian window over the period. `offset` (0..1) slides the window toward the newest bar, trading smoothness for responsiveness; `sigma` controls how tight the bell is.',
  },
  {
    label: 'swma',
    type: 'function',
    detail: '(src)',
    info: 'Symmetrically weighted moving average of the last 4 bars (1/6, 2/6, 2/6, 1/6).',
  },
  {
    label: 'linreg',
    type: 'function',
    detail: '(src, length, offset=0)',
    info: 'Least-squares moving average: fit a line to the last `length` bars and take its value `offset` bars back from the end (0 = the current bar).',
  },
]

const TA_BANDS: Array<SdkCompletion> = [
  {
    label: 'bb',
    type: 'function',
    detail: '(src, length=20, mult=2.0) -> (middle, upper, lower)',
    info: 'Bollinger Bands — an SMA basis with bands `mult` standard deviations either side. Returns the three series as a tuple.',
  },
  {
    label: 'bbw',
    type: 'function',
    detail: '(src, length=20, mult=2.0)',
    info: 'Bollinger bandwidth — (upper - lower) / middle. A squeeze (low bandwidth) often precedes an expansion.',
  },
  {
    label: 'percent_b',
    type: 'function',
    detail: '(src, length=20, mult=2.0)',
    info: 'Bollinger %B — where price sits inside the bands: 0 at the lower band, 1 at the upper, outside that range on a break.',
  },
  {
    label: 'keltner',
    type: 'function',
    detail:
      '(high, low, close, length=20, mult=2.0, use_tr=True) -> (middle, upper, lower)',
    info: 'Keltner Channels — an EMA basis with bands `mult` average-ranges either side. `use_tr=False` sizes the bands on plain high-low instead of true range.',
  },
  {
    label: 'donchian',
    type: 'function',
    detail: '(high, low, length=20) -> (middle, upper, lower)',
    info: 'Donchian Channels — the highest high and lowest low of the last `length` bars, plus their midpoint. The classic breakout channel.',
  },
  {
    label: 'envelope',
    type: 'function',
    detail: '(src, length=20, percent=2.5) -> (middle, upper, lower)',
    info: 'Percent envelope around an SMA — bands set a fixed `percent` above and below the basis.',
  },
  {
    label: 'supertrend',
    type: 'function',
    detail:
      '(high, low, close, length=10, mult=3.0) -> (trend_line, direction)',
    info: "SuperTrend — an ATR-sized trailing stop that flips with the trend. Returns the stop level and a direction series, +1 uptrend and -1 downtrend. Note that the sign is inverted relative to Pine's `ta.supertrend`, which returns -1 for an uptrend: flip the comparison when porting a Pine script.",
  },
]

const TA_OSCILLATORS: Array<SdkCompletion> = [
  {
    label: 'rsi',
    type: 'function',
    detail: '(src, length=14)',
    info: 'Relative Strength Index (Wilder) — a 0..100 momentum oscillator; above 70 is conventionally overbought, below 30 oversold.',
  },
  {
    label: 'stoch',
    type: 'function',
    detail: '(high, low, close, length=14, smooth_k=1, smooth_d=3) -> (k, d)',
    info: 'Stochastic oscillator — where the close sits in the `length`-bar high/low range, 0..100. `smooth_k` smooths %K, `smooth_d` produces the %D signal line.',
  },
  {
    label: 'stoch_rsi',
    type: 'function',
    detail: '(src, length=14, rsi_length=14, smooth_k=3, smooth_d=3) -> (k, d)',
    info: 'Stochastic RSI — the stochastic applied to the RSI series rather than to price. Much faster and noisier than a plain RSI.',
  },
  {
    label: 'macd',
    type: 'function',
    detail: '(src, fast=12, slow=26, signal=9) -> (macd, signal, histogram)',
    info: 'MACD — the fast EMA minus the slow EMA, its signal EMA, and the histogram of the difference between the two.',
  },
  {
    label: 'cci',
    type: 'function',
    detail: '(high, low, close, length=20)',
    info: 'Commodity Channel Index — typical price against its own SMA, scaled by mean deviation. Roughly -100..100 in normal conditions.',
  },
  {
    label: 'mfi',
    type: 'function',
    detail: '(high, low, close, volume, length=14)',
    info: 'Money Flow Index — a volume-weighted RSI on typical price, 0..100.',
  },
  {
    label: 'willr',
    type: 'function',
    detail: '(high, low, close, length=14)',
    info: "Williams %R — -100 at the period low, 0 at the period high. The stochastic's %K on an inverted scale.",
  },
  {
    label: 'roc',
    type: 'function',
    detail: '(src, length=9)',
    info: 'Rate of change — the percent difference against the value `length` bars ago.',
  },
  {
    label: 'mom',
    type: 'function',
    detail: '(src, length=10)',
    info: 'Momentum — `src` minus its value `length` bars ago, in price units rather than percent.',
  },
  {
    label: 'tsi',
    type: 'function',
    detail: '(src, short_length=13, long_length=25)',
    info: 'True Strength Index — double-smoothed momentum normalized by double-smoothed absolute momentum, roughly -100..100.',
  },
  {
    label: 'cmo',
    type: 'function',
    detail: '(src, length=9)',
    info: 'Chande Momentum Oscillator — (ups - downs) / (ups + downs) over the window, as a percent.',
  },
  {
    label: 'uo',
    type: 'function',
    detail: '(high, low, close, fast=7, mid=14, slow=28)',
    info: 'Ultimate Oscillator — buying pressure blended across three lookbacks (weights 4/2/1), 0..100. Less prone to false divergences than a single-period oscillator.',
  },
  {
    label: 'ao',
    type: 'function',
    detail: '(high, low, fast=5, slow=34)',
    info: 'Awesome Oscillator — SMA(hl2, fast) minus SMA(hl2, slow). Usually plotted as an up/down colored histogram.',
  },
  {
    label: 'trix',
    type: 'function',
    detail: '(src, length=18)',
    info: 'TRIX — the percent rate of change of a triple-smoothed EMA. A slow, low-noise trend oscillator centred on zero.',
  },
  {
    label: 'ppo',
    type: 'function',
    detail: '(src, fast=12, slow=26, signal=9) -> (ppo, signal, histogram)',
    info: 'Percentage Price Oscillator — MACD expressed as a percentage of the slow EMA, so it is comparable across instruments and price levels.',
  },
  {
    label: 'cmf',
    type: 'function',
    detail: '(high, low, close, volume, length=20)',
    info: 'Chaikin Money Flow — money-flow volume over total volume across the window, roughly -1..1. Positive means closes are landing in the upper half of their bars on volume.',
  },
]

const TA_VOLATILITY: Array<SdkCompletion> = [
  {
    label: 'tr',
    type: 'function',
    detail: '(high, low, close, handle_na=True)',
    info: 'True range — the largest of high-low, |high - previous close| and |low - previous close|. The first bar falls back to high-low unless `handle_na=False`, which makes it NaN.',
  },
  {
    label: 'atr',
    type: 'function',
    detail: '(high, low, close, length=14)',
    info: 'Average true range — Wilder-smoothed true range. The standard volatility unit for stops and position sizing.',
  },
  {
    label: 'natr',
    type: 'function',
    detail: '(high, low, close, length=14)',
    info: 'Normalized ATR — the ATR as a percentage of close, so it is comparable across instruments.',
  },
  {
    label: 'variance',
    type: 'function',
    detail: '(src, length, biased=True)',
    info: "Rolling variance over `length` bars. Population variance by default, like Pine's `ta.variance`; pass `biased=False` for the sample estimator.",
  },
  {
    label: 'stdev',
    type: 'function',
    detail: '(src, length, biased=True)',
    info: "Rolling standard deviation over `length` bars — the square root of `variance`, and what sizes the Bollinger Bands. Population statistic by default (ddof=0), like Pine's `ta.stdev`; pass `biased=False` for the sample estimator.",
  },
  {
    label: 'dev',
    type: 'function',
    detail: '(src, length)',
    info: 'Mean absolute deviation from the SMA over `length` bars — the denominator of the CCI.',
  },
  {
    label: 'range_',
    type: 'function',
    detail: '(high, low, length=1)',
    info: 'The bar range high-low, or with `length > 1` the highest high minus the lowest low across the window. Trailing underscore because `range` is a Python builtin.',
  },
]

const TA_TREND: Array<SdkCompletion> = [
  {
    label: 'adx',
    type: 'function',
    detail:
      '(high, low, close, length=14, adx_length=14) -> (adx, plus_di, minus_di)',
    info: "Wilder's directional movement: trend strength (ADX, 0..100 — above ~25 is a trend) plus the +DI/-DI pair whose crossings give direction.",
  },
  {
    label: 'dmi',
    type: 'function',
    detail:
      '(high, low, close, length=14, adx_length=14) -> (adx, plus_di, minus_di)',
    info: 'Directional Movement Index — an alias of `adx` under its other common name.',
  },
  {
    label: 'aroon',
    type: 'function',
    detail: '(high, low, length=14) -> (up, down)',
    info: 'Aroon — how recently the window made its high and its low, each 0..100. 100 means the extreme sits on the current bar.',
  },
  {
    label: 'psar',
    type: 'function',
    detail: '(high, low, close, start=0.02, increment=0.02, maximum=0.2)',
    info: "Parabolic SAR — Wilder's stop-and-reverse level. `start` is the initial acceleration, `increment` how much it grows on each new extreme, `maximum` its ceiling. NaN on the first bar.",
  },
  {
    label: 'vortex',
    type: 'function',
    detail: '(high, low, close, length=14) -> (vi_plus, vi_minus)',
    info: 'Vortex Indicator — upward and downward movement each normalized by true range. The lines crossing marks a trend change.',
  },
  {
    label: 'chop',
    type: 'function',
    detail: '(high, low, close, length=14)',
    info: 'Choppiness Index — near 100 while the market ranges, near 0 while it trends. A regime filter rather than a signal.',
  },
]

const TA_VOLUME: Array<SdkCompletion> = [
  {
    label: 'obv',
    type: 'function',
    detail: '(close, volume)',
    info: 'On-Balance Volume — a running total of volume signed by the close-to-close change. Divergence against price is the usual read.',
  },
  {
    label: 'ad',
    type: 'function',
    detail: '(high, low, close, volume)',
    info: 'Accumulation/Distribution line — cumulative money-flow volume, weighting each bar by where its close sits inside its range.',
  },
  {
    label: 'vwap',
    type: 'function',
    detail: '(high, low, close, volume, anchor=None)',
    info: 'Session VWAP of typical price. `anchor` is a 0/1 series flagging session starts (a new day, a swing high); leave it None to run one session across the whole series.',
  },
  {
    label: 'pvt',
    type: 'function',
    detail: '(close, volume)',
    info: 'Price-Volume Trend — cumulative volume scaled by the percent price change of each bar. A smoother relative of OBV.',
  },
  {
    label: 'eom',
    type: 'function',
    detail: '(high, low, volume, length=14, divisor=10000.0)',
    info: 'Ease of Movement — how far price travelled per unit of volume, SMA-smoothed. High values mean price moved on little volume.',
  },
  {
    label: 'force_index',
    type: 'function',
    detail: '(close, volume, length=13)',
    info: 'Force Index — the EMA of the close-to-close change times volume; the size and conviction of each move in one series.',
  },
]

const TA_STATISTICS: Array<SdkCompletion> = [
  {
    label: 'sum_',
    type: 'function',
    detail: '(src, length)',
    info: "Rolling sum over `length` bars (Pine's `math.sum`). Trailing underscore because `sum` is a Python builtin.",
  },
  {
    label: 'highest',
    type: 'function',
    detail: '(src, length)',
    info: 'Highest value over the last `length` bars, including the current one.',
  },
  {
    label: 'lowest',
    type: 'function',
    detail: '(src, length)',
    info: 'Lowest value over the last `length` bars, including the current one.',
  },
  {
    label: 'highest_bars',
    type: 'function',
    detail: '(src, length)',
    info: 'Offset of the highest bar in the window: 0 when the high is the current bar, -k when it was k bars ago.',
  },
  {
    label: 'lowest_bars',
    type: 'function',
    detail: '(src, length)',
    info: 'Offset of the lowest bar in the window: 0 when the low is the current bar, -k when it was k bars ago.',
  },
  {
    label: 'change',
    type: 'function',
    detail: '(src, length=1)',
    info: 'Difference between the current value and the one `length` bars ago — the first difference of the series.',
  },
  {
    label: 'crossover',
    type: 'function',
    detail: '(a, b)',
    info: '1.0 on each bar where `a` crosses above `b`, else 0.0. Never fires on the first bar, since there is no previous relationship to compare against. Either argument may be a scalar.',
  },
  {
    label: 'crossunder',
    type: 'function',
    detail: '(a, b)',
    info: '1.0 on each bar where `a` crosses below `b`, else 0.0.',
  },
  {
    label: 'cross',
    type: 'function',
    detail: '(a, b)',
    info: '1.0 where `a` and `b` cross in either direction, else 0.0.',
  },
  {
    label: 'rising',
    type: 'function',
    detail: '(src, length)',
    info: '1.0 when `src` rose on each of the last `length` bars, else 0.0.',
  },
  {
    label: 'falling',
    type: 'function',
    detail: '(src, length)',
    info: '1.0 when `src` fell on each of the last `length` bars, else 0.0.',
  },
  {
    label: 'barssince',
    type: 'function',
    detail: '(condition)',
    info: 'Bars elapsed since `condition` (any nonzero series) was last true; NaN before the first occurrence.',
  },
  {
    label: 'valuewhen',
    type: 'function',
    detail: '(condition, src, occurrence=0)',
    info: 'The value of `src` at the bar where `condition` was true, `occurrence` hits back (0 = the most recent). NaN until that many hits exist.',
  },
  {
    label: 'cum',
    type: 'function',
    detail: '(src)',
    info: 'Running total of `src`; NaN and infinite values contribute nothing rather than poisoning the rest of the series.',
  },
  {
    label: 'correlation',
    type: 'function',
    detail: '(a, b, length)',
    info: 'Rolling Pearson correlation of two series over `length` bars, -1..1.',
  },
  {
    label: 'percentrank',
    type: 'function',
    detail: '(src, length)',
    info: 'Percent of the previous `length` values at or below the current one, 0..100 — a self-normalizing way to read any series.',
  },
  {
    label: 'median',
    type: 'function',
    detail: '(src, length)',
    info: 'Rolling median over `length` bars — an outlier-resistant alternative to `sma`.',
  },
  {
    label: 'mode_',
    type: 'function',
    detail: '(src, length)',
    info: 'Most frequent value over `length` bars; the smallest value wins ties. Trailing underscore to stay clear of Python naming.',
  },
  {
    label: 'pivot_high',
    type: 'function',
    detail: '(src, left=5, right=5)',
    info: 'Local high with strictly lower bars `left` before and `right` after it, placed on the pivot bar itself. Confirmed only `right` bars later, so plot it as sparse circles rather than a line.',
  },
  {
    label: 'pivot_low',
    type: 'function',
    detail: '(src, left=5, right=5)',
    info: 'Local low with strictly higher bars `left` before and `right` after it, placed on the pivot bar itself.',
  },
  {
    label: 'rescale',
    type: 'function',
    detail: '(src, old_min, old_max, new_min=0.0, new_max=1.0)',
    info: 'Linearly map `src` from a known [old_min, old_max] range onto [new_min, new_max] — for overlaying an oscillator on price, for example.',
  },
  {
    label: 'normalize',
    type: 'function',
    detail: '(src, length=0, new_min=0.0, new_max=1.0)',
    info: 'Scale `src` into [new_min, new_max] using its own extremes over `length` bars; `length=0` uses the whole series. Unlike `rescale` the range is measured, not declared.',
  },
  {
    label: 'nz',
    type: 'function',
    detail: '(src, replacement=0.0)',
    info: 'Replace every NaN and infinity with `replacement` (a scalar or a matching series). Run it before math that must not propagate holes.',
  },
  {
    label: 'fill_forward',
    type: 'function',
    detail: '(src)',
    info: 'Carry the last finite value forward across NaN holes. Interior gaps in a source series are never interpolated automatically — this is the opt-in.',
  },
]

const TA_PRICE: Array<SdkCompletion> = [
  {
    label: 'hl2',
    type: 'function',
    detail: '(high, low)',
    info: 'Midpoint of the bar — (high + low) / 2.',
  },
  {
    label: 'hlc3',
    type: 'function',
    detail: '(high, low, close)',
    info: 'Typical price — (high + low + close) / 3.',
  },
  {
    label: 'ohlc4',
    type: 'function',
    detail: '(open_, high, low, close)',
    info: 'Average price — (open + high + low + close) / 4. The first argument is `open_` because `open` is a Python builtin.',
  },
  {
    label: 'hlcc4',
    type: 'function',
    detail: '(high, low, close)',
    info: 'Close-weighted price — (high + low + close + close) / 4.',
  },
  {
    label: 'heikin_ashi',
    type: 'function',
    detail: '(open_, high, low, close) -> (ha_open, ha_high, ha_low, ha_close)',
    info: 'Heikin-Ashi candles — each bar averaged with the previous one to smooth the trend. Returns the four series as a tuple.',
  },
]

/** One section of `pairlens.ta`, in the order `pairlens_ta.py` declares them. */
export type TaSection = {
  /** Stable id, also the suffix of the section's i18n key. */
  id: string
  /** Translation key for the section heading (prose — the panel translates it). */
  labelKey: string
  entries: Array<SdkCompletion>
}

/**
 * The sections of `pairlens.ta`. This list — not the flat completion array —
 * is what the reference panel groups by, and `TA_COMPLETIONS` is derived from
 * it, so a function can never end up in the completion list without a group.
 */
export const TA_SECTIONS: Array<TaSection> = [
  {
    id: 'movingAverages',
    labelKey: 'indicatorsPage.sdkRefTaMovingAverages',
    entries: TA_MOVING_AVERAGES,
  },
  {
    id: 'bands',
    labelKey: 'indicatorsPage.sdkRefTaBands',
    entries: TA_BANDS,
  },
  {
    id: 'oscillators',
    labelKey: 'indicatorsPage.sdkRefTaOscillators',
    entries: TA_OSCILLATORS,
  },
  {
    id: 'volatility',
    labelKey: 'indicatorsPage.sdkRefTaVolatility',
    entries: TA_VOLATILITY,
  },
  {
    id: 'trend',
    labelKey: 'indicatorsPage.sdkRefTaTrend',
    entries: TA_TREND,
  },
  {
    id: 'volume',
    labelKey: 'indicatorsPage.sdkRefTaVolume',
    entries: TA_VOLUME,
  },
  {
    id: 'statistics',
    labelKey: 'indicatorsPage.sdkRefTaStatistics',
    entries: TA_STATISTICS,
  },
  {
    id: 'price',
    labelKey: 'indicatorsPage.sdkRefTaPrice',
    entries: TA_PRICE,
  },
]

/** Completions offered after `ta.` / `from pairlens.ta import`. */
export const TA_COMPLETIONS: Array<SdkCompletion> = TA_SECTIONS.flatMap(
  (section) => section.entries,
)

// ── Lookup surface ───────────────────────────────────────────────────────────

/**
 * Completions offered after a namespace object, keyed by object name:
 * 'input', 'series', 'marker', 'fill', 'alert', 'request', 'color', 'log',
 * 'ctx', 'ta'.
 */
export const MEMBER_COMPLETIONS: Record<string, Array<SdkCompletion>> = {
  input: INPUT_COMPLETIONS,
  series: SERIES_COMPLETIONS,
  marker: MARKER_COMPLETIONS,
  fill: FILL_COMPLETIONS,
  alert: ALERT_COMPLETIONS,
  request: REQUEST_COMPLETIONS,
  color: COLOR_COMPLETIONS,
  log: LOG_COMPLETIONS,
  ctx: CTX_COMPLETIONS,
  ta: TA_COMPLETIONS,
}

/** Namespace object names that own a member list. */
export const SDK_NAMESPACES: Array<string> = Object.keys(MEMBER_COMPLETIONS)

/**
 * Members of `pairlens.ta`, which `from pairlens.ta import x` completes against.
 * Kept separate from `PAIRLENS_COMPLETIONS` because they live in a submodule.
 */
export const TA_MODULE_NAME = 'pairlens.ta'

const BY_QUALIFIED_NAME = new Map<string, SdkCompletion>()
for (const entry of PAIRLENS_COMPLETIONS) {
  BY_QUALIFIED_NAME.set(entry.label, entry)
}
for (const [namespace, entries] of Object.entries(MEMBER_COMPLETIONS)) {
  for (const entry of entries) {
    BY_QUALIFIED_NAME.set(`${namespace}.${entry.label}`, entry)
  }
}
// Bare `ta` members resolve too — scripts commonly do `from pairlens.ta import ema`
// and then call `ema(...)` unqualified.
for (const entry of TA_COMPLETIONS) {
  if (!BY_QUALIFIED_NAME.has(entry.label)) {
    BY_QUALIFIED_NAME.set(entry.label, entry)
  }
}

/**
 * Resolve the docs for a symbol under the cursor. `qualifier` is the object it
 * was read off (`input` in `input.int`), if any; a qualified miss falls back to
 * the bare name so `ta.ema` and a bare `ema` both resolve.
 */
export function lookupSdkSymbol(
  name: string,
  qualifier?: string | null,
): SdkCompletion | null {
  if (qualifier) {
    const qualified = BY_QUALIFIED_NAME.get(`${qualifier}.${name}`)
    if (qualified) return qualified
    // `pairlens.indicator` / `pairlens.ta` read off the module itself.
    if (qualifier === 'pairlens') return BY_QUALIFIED_NAME.get(name) ?? null
    return null
  }
  return BY_QUALIFIED_NAME.get(name) ?? null
}

// ── Browsable reference ──────────────────────────────────────────────────────
// The same data, arranged for the reference panel: one group per thing a user
// would go looking under. Everything below is derived from the lists above —
// nothing here restates what the SDK exports.

/** One browsable group of the reference panel. */
export type SdkReferenceGroup = {
  /** Stable id: 'pairlens', a namespace name, or `ta.<section>`. */
  id: string
  kind: 'module' | 'namespace' | 'ta'
  /** Code name of the group — an identifier, shown verbatim, never translated. */
  name: string | null
  /** Translation key, for the groups whose heading is prose (the ta sections). */
  labelKey: string | null
  /** Qualifier its members are read off, e.g. `ta` in `ta.ema`. */
  namespace: string | null
  entries: Array<SdkCompletion>
}

/**
 * Every group the reference panel can show: the `pairlens` top level, one per
 * namespace in `MEMBER_COMPLETIONS`, then the `ta` sections. `ta` is skipped in
 * the namespace pass because `TA_SECTIONS` breaks it up into its own groups.
 */
export const SDK_REFERENCE_GROUPS: Array<SdkReferenceGroup> = [
  {
    id: 'pairlens',
    kind: 'module',
    name: 'pairlens',
    labelKey: null,
    namespace: null,
    entries: PAIRLENS_COMPLETIONS,
  },
  ...Object.entries(MEMBER_COMPLETIONS)
    .filter(([namespace]) => namespace !== 'ta')
    .map(([namespace, entries]) => ({
      id: namespace,
      kind: 'namespace' as const,
      name: namespace,
      labelKey: null,
      namespace,
      entries,
    })),
  ...TA_SECTIONS.map((section) => ({
    id: `ta.${section.id}`,
    kind: 'ta' as const,
    name: null,
    labelKey: section.labelKey,
    namespace: 'ta',
    entries: section.entries,
  })),
]

/** How a member is written in a script: `ta.ema`, `ctx.close`, `indicator`. */
export function sdkQualifiedName(
  group: SdkReferenceGroup,
  entry: SdkCompletion,
): string {
  return group.namespace ? `${group.namespace}.${entry.label}` : entry.label
}

/** Stand-in arguments, by parameter name, for a generated call snippet. */
const SNIPPET_ARGUMENTS: Record<string, string> = {
  src: 'ctx.close',
  open_: 'ctx.open',
  high: 'ctx.high',
  low: 'ctx.low',
  close: 'ctx.close',
  volume: 'ctx.volume',
  a: 'fast',
  b: 'slow',
  condition: 'signal',
  length: '20',
  old_min: '0',
  old_max: '100',
  key: "'value'",
  value: '0',
  title: "'Title'",
}

/**
 * Snippets for the entries whose signature does not make a good example on its
 * own — the ones with a pile of optional arguments, or where the interesting
 * call is not the bare one.
 */
const SNIPPET_OVERRIDES: Record<string, string> = {
  indicator: "indicator('My Indicator', series=[series.line('value')])",
  strategy: "strategy('My Strategy', series=[series.line('value')])",
  hline: "hline(70, label='Overbought')",
  plot: 'plot(values, color=color.up)',
  PairlensScriptError: "raise PairlensScriptError('not enough bars')",
  'input.int': "input.int('length', 14)",
  'input.float': "input.float('mult', 2.0)",
  'input.bool': "input.bool('show_signals', True)",
  'input.choice': "input.choice('mode', ['fast', 'slow'])",
  'input.source': "input.source('src')",
  'marker.shape': "marker.shape('signal', shape='triangle_up')",
  'marker.buy': "marker.buy('long')",
  'marker.sell': "marker.sell('short')",
  'fill.between': "fill.between('upper', 'lower')",
  'fill.level': "fill.level('rsi', 50)",
  'alert.condition': "alert.condition('cross', 'EMA crossed up')",
  'request.security': "request.security('htf', timeframe='1d')",
  'log.info': "log.info('bars', len(ctx.close))",
  'log.warning': "log.warning('not enough bars')",
  'log.error': "log.error('input out of range')",
  'ctx.data': "ctx.data('htf')",
  'ta.correlation': 'ta.correlation(ctx.close, ctx.volume, 20)',
}

type SignatureParam = { name: string; fallback: string | null }

/** Split a parameter list on its top-level commas. */
function splitParams(body: string): Array<string> {
  const parts: Array<string> = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') depth--
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/** Read `(src, length=14)` off a `detail` string, ignoring any `-> ...` part. */
function parseSignature(detail: string): Array<SignatureParam> {
  const head = detail.split('->')[0]
  const open = head.indexOf('(')
  const close = head.lastIndexOf(')')
  if (open === -1 || close <= open) return []
  return splitParams(head.slice(open + 1, close))
    .filter((part) => !part.startsWith('*'))
    .map((part) => {
      const eq = part.indexOf('=')
      return eq === -1
        ? { name: part, fallback: null }
        : {
            name: part.slice(0, eq).trim(),
            fallback: part.slice(eq + 1).trim(),
          }
    })
}

const NUMBER = /^-?\d+(\.\d+)?$/

/**
 * A ready-to-paste call for an entry, e.g. `ta.ema(ctx.close, 20)` or
 * `series.line('value')`. Derived from the signature in `detail`: required
 * parameters get a stand-in argument, and optional ones are filled in only when
 * they are a short run of plain numbers (so `ta.rsi(ctx.close, 14)` keeps its
 * length but `ta.macd(ctx.close)` does not spell out three periods). Returns
 * null for entries that are not called — classes and namespaces.
 */
export function sdkInsertSnippet(
  group: SdkReferenceGroup,
  entry: SdkCompletion,
): string | null {
  const qualified = sdkQualifiedName(group, entry)
  const override = SNIPPET_OVERRIDES[qualified]
  if (override) return override
  if (entry.type === 'property') return qualified
  if (entry.type !== 'function') return null

  const params = parseSignature(entry.detail ?? '')
  const args = params
    .filter((param) => param.fallback === null)
    .map((param) => SNIPPET_ARGUMENTS[param.name] ?? param.name)
  const optional = params.filter((param) => param.fallback !== null)
  if (
    optional.length > 0 &&
    optional.length <= 2 &&
    optional.every((param) => NUMBER.test(param.fallback!))
  ) {
    for (const param of optional) args.push(param.fallback!)
  }
  return `${qualified}(${args.join(', ')})`
}
