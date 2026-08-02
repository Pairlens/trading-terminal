// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Example indicator scripts — editor templates and integration-test fixtures.
 * Each script must be valid against the `pairlens` Python SDK
 * (pairlens_sdk.py): a top-level `meta = indicator(...)` plus `compute(ctx)`.
 *
 * Between them the templates exercise the whole surface — the `pairlens.ta`
 * standard library, per-bar colors, fills, markers, background tints, alert
 * conditions, higher-timeframe requests, multi-file scripts, and a backtested
 * strategy — so the set doubles as the documentation people actually read.
 */

export const SMA_EXAMPLE = `from pairlens import indicator, input, series, color
from pairlens.ta import sma

meta = indicator(
    title='Simple Moving Average',
    pane='overlay',
    inputs=[
        input.int('length', default=20, min=1, max=500),
        input.source('src', default='close'),
    ],
    series=[series.line('sma', title='SMA', color=color.primary, width=2)],
    min_bars=1,
)


def compute(ctx):
    return {'sma': sma(ctx.source, int(ctx.params.length))}
`

/**
 * Shows the two things that turn a plot into a tool: a background tint for
 * the zone you care about, and alert conditions the notification engine can
 * fire on.
 */
export const RSI_EXAMPLE = `import numpy as np

from pairlens import alert, color, hline, indicator, input, series
from pairlens.ta import crossover, crossunder, rsi

meta = indicator(
    title='RSI',
    pane='sub',
    inputs=[
        input.int('length', default=14, min=2, max=200),
        input.int('upper', default=70, min=50, max=95),
        input.int('lower', default=30, min=5, max=50),
        input.source('src', default='close'),
    ],
    series=[
        series.line('rsi', title='RSI', color=color.accent, width=2),
        # Background reads its palette index straight from the value:
        # 0 -> overbought, 1 -> oversold, NaN -> untinted.
        series.background('zone', palette=[color.down, color.up]),
    ],
    hlines=[hline(70, color=color.down), hline(30, color=color.up)],
    alerts=[
        alert.condition(
            'crossed_up',
            title='RSI overbought',
            message='{{pair}} RSI crossed above {{value}} on {{timeframe}}',
        ),
        alert.condition('crossed_down', title='RSI oversold'),
    ],
    min_bars=15,
)


def compute(ctx):
    upper = float(ctx.params.upper)
    lower = float(ctx.params.lower)
    value = rsi(ctx.source, int(ctx.params.length))

    zone = np.where(value >= upper, 0.0, np.where(value <= lower, 1.0, np.nan))
    return {
        'rsi': value,
        'zone': zone,
        'crossed_up': crossover(value, np.full_like(value, upper)),
        'crossed_down': crossunder(value, np.full_like(value, lower)),
    }
`

/** Per-bar coloring: the histogram tracks its own momentum, not just its sign. */
export const MACD_EXAMPLE = `import numpy as np

from pairlens import color, indicator, input, plot, series
from pairlens.ta import macd

meta = indicator(
    title='MACD',
    pane='sub',
    inputs=[
        input.int('fast', default=12, min=2, max=100),
        input.int('slow', default=26, min=2, max=200),
        input.int('signal', default=9, min=1, max=100),
    ],
    series=[
        series.line('macd', title='MACD', color=color.primary, width=2),
        series.line('signal', title='Signal', color=color.muted, style='dashed'),
        series.histogram('hist', title='Histogram'),
    ],
    hlines=[0],
    min_bars=35,
)


def compute(ctx):
    line, signal, hist = macd(
        ctx.close,
        int(ctx.params.fast),
        int(ctx.params.slow),
        int(ctx.params.signal),
    )
    # Four-state histogram, the way TradingView shades it: above/below zero,
    # each dimmed while it is shrinking back toward the line.
    rising = np.append(True, np.diff(hist) > 0)
    hist_color = np.where(
        hist >= 0,
        np.where(rising, color.up, color.muted),
        np.where(rising, color.muted, color.down),
    )
    return {
        'macd': line,
        'signal': signal,
        'hist': plot(hist, color=hist_color),
    }
`

/**
 * Multi-file example: the entry keeps the indicator declaration and hands the
 * maths to a helper module it imports by name, the way a folder of Python
 * scripts works. Also the simplest use of `fill.between`.
 */
export const BOLLINGER_EXAMPLE = `from pairlens import color, fill, indicator, input, series

from bands import bollinger

meta = indicator(
    title='Bollinger Bands',
    pane='overlay',
    inputs=[
        input.int('length', default=20, min=2, max=500),
        input.float('mult', default=2.0, min=0.1, max=10.0, step=0.1),
        input.source('src', default='close'),
    ],
    series=[
        series.line('upper', title='Upper', color=color.muted),
        series.line('basis', title='Basis', color=color.primary, width=2),
        series.line('lower', title='Lower', color=color.muted),
    ],
    fills=[fill.between('upper', 'lower', color=color.primary, opacity=0.08)],
    min_bars=20,
)


def compute(ctx):
    basis, upper, lower = bollinger(
        ctx.source,
        int(ctx.params.length),
        float(ctx.params.mult),
    )
    return {'basis': basis, 'upper': upper, 'lower': lower}
`

export const BOLLINGER_BANDS_MODULE = `"""Band maths for the Bollinger Bands indicator.

Any .py file next to main.py is importable by its name — this one is
\`import bands\` / \`from bands import bollinger\`.
"""

from pairlens.ta import bb


def bollinger(src, length, mult):
    """(basis, upper, lower) — a thin wrapper so main.py stays declarative."""
    return bb(src, length, mult)
`

/**
 * The plot vocabulary at full stretch: a line that changes color mid-flight
 * plus entry/exit markers stamped on the bars where the trend flips.
 */
export const SUPERTREND_EXAMPLE = `import numpy as np

from pairlens import color, indicator, input, marker, plot, series
from pairlens.ta import supertrend

meta = indicator(
    title='SuperTrend',
    pane='overlay',
    inputs=[
        input.int('length', default=10, min=1, max=100),
        input.float('mult', default=3.0, min=0.5, max=10.0, step=0.1),
    ],
    series=[series.line('trend', title='SuperTrend', width=2)],
    markers=[
        marker.buy('flip_up', text='LONG'),
        marker.sell('flip_down', text='SHORT'),
    ],
    min_bars=15,
)


def compute(ctx):
    line, direction = supertrend(
        ctx.high,
        ctx.low,
        ctx.close,
        int(ctx.params.length),
        float(ctx.params.mult),
    )
    # +1 is an uptrend, so the line rides below price and paints green.
    previous = np.append(np.nan, direction[:-1])
    return {
        'trend': plot(
            line,
            color=np.where(direction > 0, color.up, color.down),
        ),
        'flip_up': (direction > 0) & (previous <= 0),
        'flip_down': (direction < 0) & (previous >= 0),
    }
`

/**
 * `request.security` — a daily trend filter drawn on whatever timeframe the
 * chart is showing, without the repainting that catches people out.
 */
export const HTF_TREND_EXAMPLE = `import numpy as np

from pairlens import color, indicator, input, plot, request, series
from pairlens.ta import ema

meta = indicator(
    title='Higher-Timeframe Trend',
    pane='overlay',
    inputs=[
        input.int('length', default=50, min=2, max=400),
        input.choice('htf', options=['4h', '1d', '1w'], default='1d'),
    ],
    series=[
        series.stepline('htf_ema', title='HTF EMA', width=2),
        series.background('bias', palette=[color.up, color.down], opacity=0.06),
    ],
    # One request per declared timeframe; the host fetches and caches them.
    requests=[
        request.security('h4', timeframe='4h'),
        request.security('d1', timeframe='1d'),
        request.security('w1', timeframe='1w'),
    ],
    min_bars=5,
)


def compute(ctx):
    source = ctx.data({'4h': 'h4', '1d': 'd1', '1w': 'w1'}[ctx.params.htf])
    htf_ema = ema(source.close, int(ctx.params.length))

    # align() holds each higher-timeframe value until the next one CLOSES, so
    # the plot never uses a candle that had not finished when the bar printed.
    projected = source.align(htf_ema)
    above = np.asarray(ctx.close) > projected

    return {
        'htf_ema': plot(
            projected,
            color=np.where(above, color.up, color.down),
        ),
        'bias': np.where(np.isnan(projected), np.nan, np.where(above, 0.0, 1.0)),
    }
`

/**
 * `strategy(...)` instead of `indicator(...)`: compute() returns a position
 * and the terminal replays it into an equity curve, filling at the next bar's
 * open and charging the declared fees.
 *
 * It also declares protective exits. They are here rather than in a "risk"
 * example of their own because they are the part of a strategy that carries
 * over unchanged when it is deployed as a bot — a script that has never seen
 * `stop_loss=` is a script whose author will meet stops for the first time
 * with real money on the table.
 */
export const STRATEGY_EXAMPLE = `import numpy as np

from pairlens import color, input, marker, plot, series, strategy
from pairlens.ta import atr, crossover, crossunder, ema

meta = strategy(
    title='EMA Cross Strategy',
    pane='overlay',
    inputs=[
        input.int('fast', default=21, min=2, max=200),
        input.int('slow', default=55, min=3, max=400),
        input.float('atr_stop', default=2.0, min=0.5, max=10.0, step=0.5),
    ],
    series=[
        series.line('fast_ema', title='Fast', color=color.primary),
        series.line('slow_ema', title='Slow', color=color.muted),
        series.line('stop', title='Stop', color=color.down, style='dotted'),
    ],
    markers=[
        marker.buy('enter_long'),
        marker.sell('enter_short'),
    ],
    initial_capital=10000.0,
    position_size=1.0,
    fee=0.001,
    allow_short=True,
    # Protective exits, as fractions of the entry price. The backtester checks
    # these against every bar's high/low before it looks at the position below,
    # and a bot deployed from this script runs the exact same check on the same
    # code — so what you see the stop do here is what it will do live.
    stop_loss=0.03,
    take_profit=0.06,
    min_bars=60,
)


def compute(ctx):
    fast = ema(ctx.close, int(ctx.params.fast))
    slow = ema(ctx.close, int(ctx.params.slow))

    long_entry = crossover(fast, slow)
    short_entry = crossunder(fast, slow)

    # Hold the last cross's direction: +1 long, -1 short, 0 before the first.
    position = np.zeros(len(ctx.close))
    state = 0.0
    for i in range(len(position)):
        if long_entry[i]:
            state = 1.0
        elif short_entry[i]:
            state = -1.0
        position[i] = state

    # Drawn for context only. The exits that actually fire are the
    # stop_loss / take_profit declared in meta.
    band = float(ctx.params.atr_stop) * atr(ctx.high, ctx.low, ctx.close, 14)
    stop = np.where(position > 0, slow - band, slow + band)

    return {
        'fast_ema': plot(
            fast,
            color=np.where(position > 0, color.up, color.down),
        ),
        'slow_ema': slow,
        'stop': np.where(position == 0, np.nan, stop),
        'enter_long': long_entry,
        'enter_short': short_entry,
        # The backtester reads any of position / long / short / entries+exits.
        # Note this array has no idea a stop was hit: after one fires, the
        # position stays flat for that bar and re-enters on the next one this
        # still calls for. Return 0 here if you want a cross to be required.
        'position': position,
    }
`

/**
 * Long-only mean reversion. Uses `entries`/`exits` pulses rather than a
 * `position` array, which is the shape most readable when entry and exit are
 * two independent conditions.
 */
export const RSI_REVERSION_STRATEGY = `import numpy as np

from pairlens import color, hline, input, marker, plot, series, strategy
from pairlens.ta import crossover, crossunder, ema, rsi

meta = strategy(
    title='RSI Reversion Bot',
    pane='sub',
    inputs=[
        input.int('length', default=14, min=2, max=100),
        input.int('oversold', default=30, min=5, max=50),
        input.int('overbought', default=70, min=50, max=95),
        input.int('trend', default=200, min=20, max=400),
    ],
    series=[series.line('rsi', title='RSI', color=color.primary)],
    hlines=[hline(70, color=color.down), hline(30, color=color.up)],
    markers=[marker.buy('entries'), marker.sell('exits')],
    initial_capital=10000.0,
    # A tenth of equity per trade. Mean reversion buys falling knives by
    # design, so the position size is where that gets survivable.
    position_size=0.1,
    fee=0.001,
    # Long only: buying dips in a downtrend is a different (worse) strategy.
    allow_short=False,
    stop_loss=0.04,
    take_profit=0.08,
    # Nothing to reason about until the trend filter has data.
    min_bars=220,
)


def compute(ctx):
    value = rsi(ctx.close, int(ctx.params.length))
    trend = ema(ctx.close, int(ctx.params.trend))

    # Only buy dips that happen ABOVE the long trend. Without this filter the
    # strategy buys every step of a downtrend, which is how mean reversion
    # usually dies.
    uptrend = ctx.close > trend

    # ta crossings come back as 1.0/0.0 floats, not booleans, so combine them
    # with a mask by multiplying — \`&\` would raise on a float array.
    entries = crossover(value, float(ctx.params.oversold)) * uptrend
    exits = crossunder(value, float(ctx.params.overbought))

    return {
        'rsi': plot(
            value,
            color=np.where(uptrend, color.up, color.muted),
        ),
        'entries': entries,
        'exits': exits,
    }
`

/**
 * Donchian breakout with a trailing stop — the trend-following counterpart to
 * the reversion template, and the clearest demonstration of why the trailing
 * stop belongs in meta rather than in compute().
 */
export const BREAKOUT_STRATEGY = `import numpy as np

from pairlens import color, input, marker, plot, series, strategy
from pairlens.ta import highest, lowest, sma

meta = strategy(
    title='Breakout Bot',
    pane='overlay',
    inputs=[
        input.int('entry_len', default=20, min=5, max=200),
        input.int('exit_len', default=10, min=3, max=100),
        input.float('vol_mult', default=1.2, min=0.5, max=5.0, step=0.1),
    ],
    series=[
        series.line('upper', title='Breakout', color=color.up),
        series.line('lower', title='Exit', color=color.down),
    ],
    markers=[marker.buy('entries'), marker.sell('exits')],
    initial_capital=10000.0,
    position_size=0.25,
    fee=0.001,
    allow_short=False,
    # No fixed take-profit: the whole point of a breakout is that you don't
    # know how far it runs. The trailing stop rides the move up and closes it
    # once price gives back 5% from the best price since entry — and because
    # it lives here, the bot applies it bar by bar exactly as the tester did.
    trailing_stop=0.05,
    stop_loss=0.03,
    min_bars=60,
)


def compute(ctx):
    entry_len = int(ctx.params.entry_len)
    exit_len = int(ctx.params.exit_len)

    # Prior bar's channel: comparing today's close to a high that includes
    # today's own bar would make every new high a breakout.
    upper = highest(ctx.high, entry_len)
    lower = lowest(ctx.low, exit_len)
    prior_upper = np.roll(upper, 1)
    prior_upper[0] = np.nan
    prior_lower = np.roll(lower, 1)
    prior_lower[0] = np.nan

    # Breakouts on thin volume are usually noise.
    vol_ok = ctx.volume > sma(ctx.volume, 20) * float(ctx.params.vol_mult)

    entries = (ctx.close > prior_upper) & vol_ok
    exits = ctx.close < prior_lower

    return {
        'upper': plot(prior_upper, color=np.where(entries, color.up, color.muted)),
        'lower': prior_lower,
        'entries': entries,
        'exits': exits,
    }
`

/** "Start from scratch" — the smallest script that runs and plots. */
export const BLANK_SCRIPT = `from pairlens import indicator, series

meta = indicator(
    title='My Indicator',
    pane='overlay',
    inputs=[],
    series=[series.line('value')],
)


def compute(ctx):
    return {'value': ctx.close}
`

/**
 * Which of the two things a script is.
 *
 * Not a cosmetic label: only a `strategy(...)` script can be deployed as a bot,
 * because only it declares entries, exits and position sizing. Templates carry
 * the distinction so the picker can group them, rather than leaving the user to
 * infer it from a name.
 */
export type ExampleKind = 'indicator' | 'strategy'

export type ExampleScript = {
  name: string
  source: string
  kind: ExampleKind
  /** One line on what it demonstrates, shown under the name in the picker. */
  hint: string
  /** Helper modules created alongside main.py. */
  modules?: Array<{ path: string; source: string }>
}

export const EXAMPLE_SCRIPTS: Array<ExampleScript> = [
  {
    name: 'Simple Moving Average',
    source: SMA_EXAMPLE,
    kind: 'indicator',
    hint: 'The smallest useful script',
  },
  {
    name: 'RSI',
    source: RSI_EXAMPLE,
    kind: 'indicator',
    hint: 'Sub-pane, levels and zone fill',
  },
  {
    name: 'MACD',
    source: MACD_EXAMPLE,
    kind: 'indicator',
    hint: 'Histogram with up/down colouring',
  },
  {
    name: 'Bollinger Bands',
    source: BOLLINGER_EXAMPLE,
    kind: 'indicator',
    hint: 'Split across two files',
    modules: [{ path: 'bands.py', source: BOLLINGER_BANDS_MODULE }],
  },
  {
    name: 'SuperTrend',
    source: SUPERTREND_EXAMPLE,
    kind: 'indicator',
    hint: 'Per-bar colour and markers',
  },
  {
    name: 'Higher-Timeframe Trend',
    source: HTF_TREND_EXAMPLE,
    kind: 'indicator',
    hint: 'Pulls a second timeframe',
  },
  {
    name: 'EMA Cross Strategy',
    source: STRATEGY_EXAMPLE,
    kind: 'strategy',
    hint: 'Trend following, long and short',
  },
  {
    name: 'RSI Reversion Bot',
    source: RSI_REVERSION_STRATEGY,
    kind: 'strategy',
    hint: 'Buys dips inside an uptrend',
  },
  {
    name: 'Breakout Bot',
    source: BREAKOUT_STRATEGY,
    kind: 'strategy',
    hint: 'Channel break with a trailing stop',
  },
]
