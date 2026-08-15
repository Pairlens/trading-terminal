// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The `pairlens` Python SDK, written down for a language model.
 *
 * Two tiers: `SDK_GUIDE_CORE` rides in every assistant system prompt and has
 * to stay terse — it is the difference between the model writing a script
 * that registers on the first try and one that guesses at an API that does
 * not exist. `SDK_REFERENCE_SECTIONS` backs the `get_sdk_reference` tool for
 * when the model wants the long form of one topic.
 *
 * Source of truth is `lib/python/pairlens_sdk.py` (and `pairlens_ta.py`);
 * update this file when the SDK surface changes.
 */
import { RSI_EXAMPLE, STRATEGY_EXAMPLE } from '@/lib/python/examples'

export const SDK_GUIDE_CORE = `## Pairlens Python script contract

Every script is Python (Pyodide, numpy available) with two required top-level names:
- \`meta\` — the result of \`indicator(...)\` or \`strategy(...)\` from the \`pairlens\` module.
- \`compute(ctx)\` — returns a dict mapping every declared series/marker/fill/signal key to a per-bar sequence (numpy array or list) the SAME LENGTH as \`ctx.close\`. Use \`float('nan')\`/\`np.nan\` for gaps.

Imports: \`from pairlens import indicator, strategy, input, series, marker, fill, alert, request, color, hline, plot, log\` and \`from pairlens.ta import ema, rsi, atr, ...\`.

### indicator(...) vs strategy(...)
\`indicator(title, pane='overlay'|'sub', inputs=[...], series=[...], hlines=None, markers=None, fills=None, alerts=None, requests=None, packages=None, min_bars=None, precision=None, format=None)\` — a chart study.
\`strategy(title, ..., initial_capital=10000.0, position_size=1.0, fee=0.001, slippage=0.0, allow_short=True, stop_loss=None, take_profit=None, trailing_stop=None, max_bars=None)\` — same drawing surface PLUS trade signals; only strategy scripts can be backtested and deployed as bots. stop_loss/take_profit/trailing_stop are fractions of entry price (0.03 = 3%), max_bars an integer.

### Inputs (user-tunable params)
\`input.int(key, default=0, min=None, max=None, step=None, label=None)\`, \`input.float(...)\`, \`input.bool(key, default=False)\`, \`input.choice(key, options=[...], default=...)\`, \`input.source(key, default='close')\`. Read them as \`ctx.params.key\` (cast with int()/float() before passing to ta functions).

### Series (drawn outputs)
\`series.line(key, title=None, color=None, width=None, style=None)\`, \`series.stepline\`, \`series.histogram(key, up_down=True)\`, \`series.columns\`, \`series.area\`, \`series.circles\`, \`series.cross\`, \`series.background\`. Colors: \`color.primary/.up/.down/.muted/.accent\` (theme tokens) or hex strings. Per-bar colors: wrap the array in \`plot(values, color=np.where(cond, color.up, color.down))\`.
Markers: \`marker.buy(key, text='BUY')\`, \`marker.sell(key)\`, \`marker.shape(key, shape='circle', position='above', color=None)\` — the compute dict value is a truthy/falsy per-bar array.
Also: \`fill.between(a, b, color=None, opacity=None)\`, \`fill.level(key, value, ...)\`, \`hline(value, color=None, label=None)\`, \`alert.condition(key, title, message=None)\`, \`request.security(key, timeframe=None, pair=None, market=None)\` read back via \`ctx.data(key)\`.

### compute(ctx)
\`ctx.time .open .high .low .close .volume\` — numpy float64 arrays, oldest first. \`ctx.params\` (attribute access), \`ctx.pair\`, \`ctx.timeframe\`, \`ctx.source\` (the resolved input.source series), \`ctx.data(key)\` for request.security series (has .close etc. and .align(values)).

### Strategy signals (any ONE of these shapes in the returned dict)
- \`position\`: per-bar target (-1 short, 0 flat, +1 long) — best for state-machine strategies.
- \`entries\` / \`exits\`: truthy pulses (long-only style).
- \`long\` / \`short\`: truthy pulses for each direction.
A signal on bar i fills at bar i+1's open. Protective exits (stop_loss etc.) are checked by the engine before the signal each bar; the same code runs in backtests and live bots.

### pairlens.ta (all take numpy arrays, return same-length arrays)
Moving averages: sma ema rma wma hma vwma dema tema alma linreg. Bands: bb bbw percent_b keltner donchian envelope supertrend. Oscillators: rsi stoch stoch_rsi macd cci mfi willr roc mom tsi cmo uo ao trix ppo cmf. Volatility: tr atr natr stdev variance dev. Trend: adx dmi aroon psar vortex chop. Volume: obv ad vwap pvt eom force_index. Series utils: highest lowest change crossover crossunder cross rising falling barssince valuewhen cum sum_ correlation percentrank median pivot_high pivot_low nz fill_forward rescale normalize. Price: hl2 hlc3 ohlc4 heikin_ashi.

### Rules that make scripts fail
- \`meta\` must exist at top level and \`compute\` must be a function; compute must return a dict.
- Every declared series/marker key must appear in the returned dict; arrays must match \`len(ctx.close)\`.
- compute is pure and vectorized over the whole candle window — it cannot see live position state, place orders, or do I/O. Position-dependent exits belong in the declarative stop_loss/take_profit/trailing_stop/max_bars.
- Extra pip packages go in \`packages=[...]\` in meta (pure-Python wheels from PyPI, plus the Pyodide compiled set: pandas, scipy, scikit-learn, statsmodels, polars...). numpy needs no declaration.
- \`min_bars=N\` warms up long lookbacks.`

const DECLARATIONS_REFERENCE = `# Declarations

\`indicator(title, pane='overlay'|'sub', inputs=None, series=None, hlines=None, markers=None, fills=None, alerts=None, requests=None, packages=None, min_bars=None, precision=None, format=None)\`
- pane 'overlay' draws on the price chart; 'sub' gets its own pane below.
- precision: decimal places for the data window. format: 'price' | 'percent' | 'volume'.

\`strategy(title, pane='overlay', inputs=None, series=None, hlines=None, markers=None, fills=None, alerts=None, requests=None, packages=None, min_bars=None, initial_capital=10000.0, position_size=1.0, fee=0.001, slippage=0.0, allow_short=True, stop_loss=None, take_profit=None, trailing_stop=None, max_bars=None)\`
- initial_capital: quote-currency starting equity for the backtest and paper bots.
- position_size: fraction of equity per backtest entry (0..1). Deployed bots replace this with their own sizing setting.
- fee: per-side fraction of notional (0.001 = 0.1%). slippage: per-side fraction of fill price.
- allow_short: when False, short signals flatten instead of reversing.
- stop_loss / take_profit / trailing_stop: fractions of entry price, active when > 0. max_bars: exit after N bars in position. These are enforced by the engine (backtest AND live bot) intrabar against high/low, before the strategy signal is read.
- strategy(...) does NOT accept precision/format.

A script is a "strategy" (deployable as a bot, backtestable) exactly when it calls strategy(...). indicator(...) scripts chart only.`

const SIGNALS_REFERENCE = `# Strategy signals and the backtest fill model

compute(ctx) for a strategy returns normal drawing keys PLUS trade signals. Recognised keys (use one shape):
- position: per-bar desired exposure. > 0 long, < 0 short (needs allow_short), 0 or NaN flat. The engine diffs consecutive values into enter/exit/flip intents.
- entries + exits: truthy pulses; long-only unless combined with allow_short semantics.
- long + short: truthy pulses per direction.

Fill discipline (identical in the Strategy Tester and live/paper bots):
- A signal on bar i fills at bar i+1's OPEN. A signal on the last bar never fills.
- One intent per bar; a reversal is a single flip.
- Protective exits (stop_loss, trailing_stop, take_profit, max_bars from meta) are evaluated each bar BEFORE the signal, intrabar against the bar's high/low, filling at the trigger level.
- After a protective exit the position is flat; if your position array still says 1, the engine re-enters at the next bar. Emit 0 when you want a fresh cross to be required.
- Fees/slippage from meta apply per side.

Backtest stats include win rate, profit factor, max drawdown, Sharpe, time in market, and the trade ledger.`

const CONTEXT_REFERENCE = `# The compute context

def compute(ctx): receives one Context per run, covering the whole visible candle window (oldest first):
- ctx.time, ctx.open, ctx.high, ctx.low, ctx.close, ctx.volume — numpy float64 arrays.
- ctx.params — declared inputs with attribute access (ctx.params.length). Values arrive as the declared type but cast defensively: int(ctx.params.length).
- ctx.pair (e.g. 'BTC-USDT'), ctx.timeframe (e.g. '1h').
- ctx.source — the array selected by an input.source (supports open/high/low/close/hl2/hlc3/ohlc4).
- ctx.data(key) — the series fetched by request.security(key, timeframe=..., pair=..., market=...): an object with .time/.open/.high/.low/.close/.volume, len(), and .align(values) to project its values onto the chart timeframe without lookahead.
- log.info/warning/error(...) and print(...) reach the script console.

compute must return a dict: every declared series key -> full-length array (NaN = gap), every marker/alert key -> truthy per-bar array, plus strategy signal keys. Wrap a series in plot(values, color=per_bar_colors) for conditional coloring.`

const LIBRARY_REFERENCE = `# pairlens.ta function library

All functions take/return numpy float64 arrays aligned to the input (NaN during warmup).

Moving averages: sma(x, n), ema(x, n), rma(x, n), wma(x, n), hma(x, n), vwma(x, vol, n), dema(x, n), tema(x, n), alma(x, n, offset=0.85, sigma=6), swma(x), linreg(x, n)
Bands/channels: bb(x, n, mult) -> (basis, upper, lower), bbw, percent_b, keltner(h, l, c, n, mult) -> (basis, upper, lower), donchian(h, l, n) -> (upper, lower, mid), envelope(x, n, pct), supertrend(h, l, c, n, mult) -> (line, direction)
Oscillators: rsi(x, n), stoch(h, l, c, n) -> k, stoch_rsi(x, n, k, d) -> (k, d), macd(x, fast, slow, signal) -> (macd, signal, hist), cci(h, l, c, n), mfi(h, l, c, v, n), willr(h, l, c, n), roc(x, n), mom(x, n), tsi(x, long, short), cmo(x, n), uo(h, l, c), ao(h, l), trix(x, n), ppo(x, fast, slow), cmf(h, l, c, v, n)
Volatility: tr(h, l, c), atr(h, l, c, n), natr(h, l, c, n), stdev(x, n), variance(x, n), dev(x, n)
Trend: adx(h, l, c, n), dmi(h, l, c, n) -> (plus, minus), aroon(h, l, n) -> (up, down), psar(h, l, accel=0.02, max_accel=0.2), vortex(h, l, c, n) -> (plus, minus), chop(h, l, c, n)
Volume: obv(c, v), ad(h, l, c, v), vwap(h, l, c, v), pvt(c, v), eom(h, l, v, n), force_index(c, v, n)
Series utilities: highest(x, n), lowest(x, n), highest_bars, lowest_bars, change(x, n=1), crossover(a, b), crossunder(a, b), cross(a, b), rising(x, n), falling(x, n), barssince(cond), valuewhen(cond, x, occurrence=0), cum(x), sum_(x, n), correlation(a, b, n), percentrank(x, n), median(x, n), mode_(x, n), pivot_high(x, left, right), pivot_low(x, left, right), nz(x, replacement=0), fill_forward(x), rescale(x, old_min, old_max, new_min, new_max), normalize(x, n)
Price helpers: hl2(h, l), hlc3(h, l, c), ohlc4(o, h, l, c), hlcc4, heikin_ashi(o, h, l, c) -> (o, h, l, c)

Beyond pairlens.ta: numpy is preloaded; pandas/scipy/scikit-learn/statsmodels/polars and ~280 other compiled packages load on demand; any pure-Python PyPI wheel installs via packages=[...] in meta.`

const EXAMPLES_REFERENCE = `# Reference scripts (registered and working)

## Sub-pane indicator (RSI)
\`\`\`python
${RSI_EXAMPLE.trim()}
\`\`\`

## Deployable strategy (EMA cross with protective exits)
\`\`\`python
${STRATEGY_EXAMPLE.trim()}
\`\`\``

const BOTS_REFERENCE = `# Bots (deployments of strategy scripts)

A bot = one strategy script + one venue + one pair + one timeframe + sizing + guards.
- New bots are ALWAYS paper mode and switched off. Going live requires the user to type ARM LIVE in the arm dialog; the assistant can never arm, enable, or set a bot live.
- Sizing (replaces the script's position_size): { kind: 'percent-equity', value: 0..1 } fraction of equity, { kind: 'fixed-quote', value } quote currency per entry, { kind: 'fixed-base', value } base units per entry.
- Guards (enforced outside the strategy, blank = no limit): maxDailyLossPercent (fraction, halts the bot), maxConsecutiveLosses (halts), maxTradesPerDay (skips signals), maxPositionQuote (skips oversized entries), cooldownBars (skips entries within N bars of a losing exit).
- params: the strategy's declared inputs, per deployment.
- Paper bots simulate fills locally with the script's fee/slippage, matching the backtest exactly; they need no exchange credentials.
- market/pair/timeframe/script cannot change after creation (delete and recreate instead); name, params, sizing and guards can.`

export const SDK_REFERENCE_TOPICS = [
  'declarations',
  'signals',
  'context',
  'library',
  'examples',
  'bots',
] as const

export type SdkReferenceTopic = (typeof SDK_REFERENCE_TOPICS)[number]

export const SDK_REFERENCE_SECTIONS: Record<SdkReferenceTopic, string> = {
  declarations: DECLARATIONS_REFERENCE,
  signals: SIGNALS_REFERENCE,
  context: CONTEXT_REFERENCE,
  library: LIBRARY_REFERENCE,
  examples: EXAMPLES_REFERENCE,
  bots: BOTS_REFERENCE,
}
