# Copyright (c) 2026 Juan Ignacio Molina Estrada
# SPDX-License-Identifier: FSL-1.1-Apache-2.0
"""Pairlens technical-analysis library — the `pairlens.ta` standard library.

Every function takes 1-D float64 arrays (the OHLCV arrays hanging off `ctx`)
and returns a numpy array of the *same length*, left-padded with `nan` over the
warm-up period, so results map 1:1 onto chart bars::

    from pairlens import indicator, series, color
    from pairlens.ta import ema, rsi, crossover

    meta = indicator(
        title='RSI with EMA-cross marks',
        pane='sub',
        series=[
            series.line('rsi', color=color.accent),
            series.histogram('cross', color=color.up),
        ],
        hlines=[70, 30],
    )

    def compute(ctx):
        fast, slow = ema(ctx.close, 12), ema(ctx.close, 26)
        return {
            'rsi': rsi(ctx.close, 14),
            'cross': 100.0 * crossover(fast, slow),
        }

Conventions
-----------
* Degenerate arguments never raise: a non-positive `length`, a `length` longer
  than the series, an empty series or an all-`nan` source all give back an
  all-`nan` array of the right length.
* A leading `nan` run — the warm-up of a chained indicator — is skipped rather
  than propagated, so `sma(ema(close, 50), 10)` warms up once and then produces
  values. Interior `nan` holes are *not* interpolated; run `fill_forward` or
  `nz` first if a source may have them.
* Boolean results (`crossover`, `rising`, `falling`, ...) come back as 0.0/1.0
  float arrays so they survive the float64 transport to the chart.
* Smoothing follows TradingView: `ema` seeds on the SMA of the first `length`
  bars, and `rsi`/`atr`/`adx` smooth with Wilder's `rma` (alpha = 1/length).
"""

import numpy as np

_NAN = float('nan')


# ── Internals ────────────────────────────────────────────────────────────────


def _arr(src):
    """Coerce any input to a 1-D float64 numpy array."""
    a = np.asarray(src, dtype=np.float64)
    return a if a.ndim == 1 else a.reshape(-1)


def _nan(n):
    """All-`nan` float64 array of length `n`."""
    return np.full(int(n), np.nan, dtype=np.float64)


def _int(value, default=0):
    """int(value), falling back to `default` for nan/None/garbage."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _lead(a):
    """Index of the first finite value (`a.size` when the array is all-nan)."""
    if a.size == 0:
        return 0
    if np.isfinite(a[0]):
        return 0
    finite = np.flatnonzero(np.isfinite(a))
    return int(finite[0]) if finite.size else a.size


def _prep(src, length):
    """Shared guard: (values, out, lead, length, ok) for windowed math."""
    a = _arr(src)
    out = _nan(a.size)
    length = _int(length, 0)
    lead = _lead(a)
    return a, out, lead, length, length > 0 and lead + length <= a.size


def _pair(a, b):
    """Two float64 arrays of equal length, broadcasting scalar arguments."""
    x = _arr(a)
    y = _arr(b)
    if x.size == 1 and y.size != 1:
        x = np.full(y.size, x[0], dtype=np.float64)
    elif y.size == 1 and x.size != 1:
        y = np.full(x.size, y[0], dtype=np.float64)
    return x, y


def _windows(a, length):
    """Rolling-window view of shape (a.size - length + 1, length) — no copy."""
    return np.lib.stride_tricks.sliding_window_view(a, length)


def _rolling_sum(a, length):
    """Rolling sum, one value per full window (size a.size - length + 1)."""
    cumulative = np.cumsum(a)
    out = np.empty(a.size - length + 1, dtype=np.float64)
    out[0] = cumulative[length - 1]
    if out.size > 1:
        out[1:] = cumulative[length:] - cumulative[:-length]
    return out


def _safe_div(num, den, fallback=np.nan):
    """Element-wise division, substituting `fallback` where the divisor is 0."""
    num = np.asarray(num, dtype=np.float64)
    den = np.asarray(den, dtype=np.float64)
    out = np.full(np.broadcast(num, den).shape, float(fallback), dtype=np.float64)
    np.divide(num, den, out=out, where=den != 0.0)
    return out


def _shift(a, k):
    """`a` delayed by `k` bars (out[i] = a[i - k]), nan-filled at the front."""
    out = _nan(a.size)
    if k == 0:
        out[:] = a
    elif 0 < k < a.size:
        out[k:] = a[:-k]
    return out


def _ewm(a, alpha, seed):
    """Exponential recurrence over the whole of `a`, seeded at index 0."""
    out = _nan(a.size)
    values = a.tolist()
    if not values:
        return out
    smoothed = [0.0] * len(values)
    previous = float(seed)
    smoothed[0] = previous
    keep = 1.0 - alpha
    for i in range(1, len(values)):
        previous = alpha * values[i] + keep * previous
        smoothed[i] = previous
    out[:] = smoothed
    return out


def _smoothed(src, length, alpha_of):
    """SMA-seeded exponential average — the shared body of `ema` and `rma`."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    start = lead + length - 1
    seed = a[lead : start + 1].mean()
    out[start:] = _ewm(a[start:], alpha_of(length), seed)
    return out


def _money_flow_volume(high, low, close, volume):
    """Volume weighted by where the close sits inside the bar's range."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    location = _safe_div((cl - lo) - (hi - cl), hi - lo, 0.0)
    return location * _arr(volume)


# ── Moving averages & smoothing ──────────────────────────────────────────────


def sma(src, length):
    """Simple moving average of `src` over `length` bars."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    out[lead + length - 1 :] = _rolling_sum(a[lead:], length) / length
    return out


def ema(src, length):
    """Exponential moving average (alpha = 2/(length+1), seeded on the SMA)."""
    return _smoothed(src, length, lambda n: 2.0 / (n + 1.0))


def rma(src, length):
    """Wilder's smoothing (alpha = 1/length) — the average behind RSI and ATR."""
    return _smoothed(src, length, lambda n: 1.0 / n)


def wma(src, length):
    """Weighted moving average — weights 1..length, newest bar heaviest."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    weights = np.arange(length, 0, -1, dtype=np.float64)
    out[lead + length - 1 :] = (
        np.convolve(a[lead:], weights, mode='valid') / weights.sum()
    )
    return out


def hma(src, length):
    """Hull moving average — WMA blend that cuts lag without adding noise."""
    a = _arr(src)
    length = _int(length, 0)
    if length <= 0:
        return _nan(a.size)
    half = max(1, length // 2)
    root = max(1, int(round(float(np.sqrt(length)))))
    return wma(2.0 * wma(a, half) - wma(a, length), root)


def vwma(src, volume, length):
    """Volume-weighted moving average of `src` over `length` bars."""
    a, v = _arr(src), _arr(volume)
    return _safe_div(sma(a * v, length), sma(v, length))


def dema(src, length):
    """Double exponential moving average — 2*EMA minus EMA of the EMA."""
    first = ema(src, length)
    return 2.0 * first - ema(first, length)


def tema(src, length):
    """Triple exponential moving average — 3*EMA - 3*EMA² + EMA³."""
    first = ema(src, length)
    second = ema(first, length)
    return 3.0 * first - 3.0 * second + ema(second, length)


def alma(src, length, offset=0.85, sigma=6.0):
    """Arnaud Legoux MA — Gaussian window; `offset` trades lag for smoothness."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    sig = float(sigma)
    spread = length / sig if sig != 0.0 else float(length)
    centre = float(offset) * (length - 1)
    positions = np.arange(length, dtype=np.float64)
    weights = np.exp(-((positions - centre) ** 2) / (2.0 * spread * spread))
    total = weights.sum()
    if total == 0.0:
        return out
    out[lead + length - 1 :] = (
        np.convolve(a[lead:], weights[::-1], mode='valid') / total
    )
    return out


def swma(src):
    """Symmetrically weighted MA of the last 4 bars (1/6, 2/6, 2/6, 1/6)."""
    a, out, lead, length, ok = _prep(src, 4)
    if not ok:
        return out
    weights = np.array([1.0, 2.0, 2.0, 1.0], dtype=np.float64) / 6.0
    out[lead + length - 1 :] = np.convolve(a[lead:], weights[::-1], mode='valid')
    return out


def linreg(src, length, offset=0):
    """Least-squares moving average — the fitted value `offset` bars ahead."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    if length == 1:
        out[lead:] = a[lead:]
        return out
    x = np.arange(length, dtype=np.float64)
    sum_x = x.sum()
    sum_xx = float((x * x).sum())
    sum_y = _rolling_sum(a[lead:], length)
    sum_xy = np.convolve(a[lead:], x[::-1], mode='valid')
    slope = (length * sum_xy - sum_x * sum_y) / (length * sum_xx - sum_x * sum_x)
    intercept = (sum_y - slope * sum_x) / length
    out[lead + length - 1 :] = intercept + slope * (length - 1 - float(offset))
    return out


# ── Bands & channels ─────────────────────────────────────────────────────────


def bb(src, length=20, mult=2.0):
    """Bollinger Bands → (middle, upper, lower); middle is an SMA."""
    basis = sma(src, length)
    spread = float(mult) * stdev(src, length)
    return basis, basis + spread, basis - spread


def bbw(src, length=20, mult=2.0):
    """Bollinger bandwidth — (upper - lower) / middle."""
    basis, upper, lower = bb(src, length, mult)
    return _safe_div(upper - lower, basis)


def percent_b(src, length=20, mult=2.0):
    """Bollinger %B — where price sits in the band (0 = lower, 1 = upper)."""
    _, upper, lower = bb(src, length, mult)
    return _safe_div(_arr(src) - lower, upper - lower)


def keltner(high, low, close, length=20, mult=2.0, use_tr=True):
    """Keltner Channels → (middle, upper, lower); EMA basis, range-sized bands."""
    basis = ema(close, length)
    span = tr(high, low, close) if use_tr else _arr(high) - _arr(low)
    band = float(mult) * ema(span, length)
    return basis, basis + band, basis - band


def donchian(high, low, length=20):
    """Donchian Channels → (middle, upper, lower) over `length` bars."""
    upper = highest(high, length)
    lower = lowest(low, length)
    return (upper + lower) / 2.0, upper, lower


def envelope(src, length=20, percent=2.5):
    """Percent envelope around an SMA → (middle, upper, lower)."""
    basis = sma(src, length)
    factor = float(percent) / 100.0
    return basis, basis * (1.0 + factor), basis * (1.0 - factor)


def supertrend(high, low, close, length=10, mult=3.0):
    """SuperTrend → (trend_line, direction); +1 uptrend, -1 downtrend."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    n = cl.size
    line = _nan(n)
    trend = _nan(n)
    average_range = atr(hi, lo, cl, length)
    start = _lead(average_range)
    if start >= n:
        return line, trend
    middle = (hi + lo) / 2.0
    factor = float(mult)
    upper_band = (middle + factor * average_range).tolist()
    lower_band = (middle - factor * average_range).tolist()
    closes = cl.tolist()
    line_values = [_NAN] * (n - start)
    trend_values = [_NAN] * (n - start)
    # Seeded long on the first bar with a valid ATR; the bands converge on the
    # real trend within a few bars either way.
    previous_upper = upper_band[start]
    previous_lower = lower_band[start]
    previous_line = previous_lower
    line_values[0] = previous_line
    trend_values[0] = 1.0
    for i in range(start + 1, n):
        upper = upper_band[i]
        lower = lower_band[i]
        # Bands only ever tighten toward price until price breaks through.
        if not (lower > previous_lower or closes[i - 1] < previous_lower):
            lower = previous_lower
        if not (upper < previous_upper or closes[i - 1] > previous_upper):
            upper = previous_upper
        if previous_line == previous_upper:
            direction = 1.0 if closes[i] > upper else -1.0
        else:
            direction = -1.0 if closes[i] < lower else 1.0
        previous_line = lower if direction > 0.0 else upper
        previous_upper = upper
        previous_lower = lower
        line_values[i - start] = previous_line
        trend_values[i - start] = direction
    line[start:] = line_values
    trend[start:] = trend_values
    return line, trend


# ── Oscillators ──────────────────────────────────────────────────────────────


def rsi(src, length=14):
    """Relative Strength Index (Wilder) — 0..100 momentum oscillator."""
    delta = change(src, 1)
    gain = rma(np.maximum(delta, 0.0), length)
    loss = rma(np.maximum(-delta, 0.0), length)
    return 100.0 - 100.0 / (1.0 + _safe_div(gain, loss, np.inf))


def stoch(high, low, close, length=14, smooth_k=1, smooth_d=3):
    """Stochastic oscillator → (%K, %D) over `length` bars."""
    top = highest(high, length)
    bottom = lowest(low, length)
    raw = _safe_div(100.0 * (_arr(close) - bottom), top - bottom, 50.0)
    k = sma(raw, smooth_k)
    return k, sma(k, smooth_d)


def stoch_rsi(src, length=14, rsi_length=14, smooth_k=3, smooth_d=3):
    """Stochastic RSI → (%K, %D) — the stochastic of the RSI series."""
    strength = rsi(src, rsi_length)
    top = highest(strength, length)
    bottom = lowest(strength, length)
    raw = _safe_div(100.0 * (strength - bottom), top - bottom, 50.0)
    k = sma(raw, smooth_k)
    return k, sma(k, smooth_d)


def macd(src, fast=12, slow=26, signal=9):
    """MACD → (macd, signal, histogram)."""
    line = ema(src, fast) - ema(src, slow)
    signal_line = ema(line, signal)
    return line, signal_line, line - signal_line


def cci(high, low, close, length=20):
    """Commodity Channel Index — typical price against its own SMA."""
    typical = hlc3(high, low, close)
    return _safe_div(typical - sma(typical, length), 0.015 * dev(typical, length))


def mfi(high, low, close, volume, length=14):
    """Money Flow Index — a volume-weighted RSI on typical price (0..100)."""
    typical = hlc3(high, low, close)
    flow = typical * _arr(volume)
    moved = change(typical, 1)
    rising_flow = np.where(np.isnan(moved), np.nan, np.where(moved > 0.0, flow, 0.0))
    falling_flow = np.where(np.isnan(moved), np.nan, np.where(moved < 0.0, flow, 0.0))
    inflow = sum_(rising_flow, length)
    outflow = sum_(falling_flow, length)
    return 100.0 - 100.0 / (1.0 + _safe_div(inflow, outflow, np.inf))


def willr(high, low, close, length=14):
    """Williams %R — -100 at the period low, 0 at the period high."""
    top = highest(high, length)
    bottom = lowest(low, length)
    return _safe_div(-100.0 * (top - _arr(close)), top - bottom, -50.0)


def roc(src, length=9):
    """Rate of change — percent difference against `length` bars ago."""
    a = _arr(src)
    previous = _shift(a, _int(length, 1))
    return _safe_div(100.0 * (a - previous), previous)


def mom(src, length=10):
    """Momentum — `src` minus its value `length` bars ago."""
    return change(src, length)


def tsi(src, short_length=13, long_length=25):
    """True Strength Index — double-smoothed momentum, roughly -100..100."""
    moved = change(src, 1)
    smoothed = ema(ema(moved, long_length), short_length)
    magnitude = ema(ema(np.abs(moved), long_length), short_length)
    return 100.0 * _safe_div(smoothed, magnitude)


def cmo(src, length=9):
    """Chande Momentum Oscillator — (ups - downs) / (ups + downs) as a percent."""
    moved = change(src, 1)
    ups = sum_(np.maximum(moved, 0.0), length)
    downs = sum_(np.maximum(-moved, 0.0), length)
    return 100.0 * _safe_div(ups - downs, ups + downs, 0.0)


def uo(high, low, close, fast=7, mid=14, slow=28):
    """Ultimate Oscillator — buying pressure across three lookbacks (0..100)."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    previous_close = _shift(cl, 1)
    true_low = np.minimum(lo, previous_close)
    true_high = np.maximum(hi, previous_close)
    bought = cl - true_low
    spanned = true_high - true_low
    short = _safe_div(sum_(bought, fast), sum_(spanned, fast))
    middle = _safe_div(sum_(bought, mid), sum_(spanned, mid))
    long = _safe_div(sum_(bought, slow), sum_(spanned, slow))
    return 100.0 * (4.0 * short + 2.0 * middle + long) / 7.0


def ao(high, low, fast=5, slow=34):
    """Awesome Oscillator — SMA(hl2, fast) minus SMA(hl2, slow)."""
    median_price = hl2(high, low)
    return sma(median_price, fast) - sma(median_price, slow)


def trix(src, length=18):
    """TRIX — percent rate of change of a triple-smoothed EMA."""
    smoothed = ema(ema(ema(src, length), length), length)
    positive = np.where(smoothed > 0.0, smoothed, np.nan)
    return 100.0 * change(np.log(positive), 1)


def ppo(src, fast=12, slow=26, signal=9):
    """Percentage Price Oscillator → (ppo, signal, histogram)."""
    quick = ema(src, fast)
    slowly = ema(src, slow)
    line = 100.0 * _safe_div(quick - slowly, slowly)
    signal_line = ema(line, signal)
    return line, signal_line, line - signal_line


def cmf(high, low, close, volume, length=20):
    """Chaikin Money Flow — money-flow volume over total volume."""
    flow = _money_flow_volume(high, low, close, volume)
    return _safe_div(sum_(flow, length), sum_(volume, length))


# ── Volatility & range ───────────────────────────────────────────────────────


def tr(high, low, close, handle_na=True):
    """True range — the first bar falls back to high-low when `handle_na`."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    previous_close = _shift(cl, 1)
    out = np.maximum(
        hi - lo, np.maximum(np.abs(hi - previous_close), np.abs(lo - previous_close))
    )
    # The first bar has no previous close; fall back to the bar's own range.
    first = max(_lead(hi), _lead(lo), _lead(cl))
    if first < out.size:
        out[first] = hi[first] - lo[first] if handle_na else np.nan
    return out


def atr(high, low, close, length=14):
    """Average true range — Wilder-smoothed true range."""
    return rma(tr(high, low, close), length)


def natr(high, low, close, length=14):
    """Normalized ATR — the ATR as a percentage of close."""
    return 100.0 * _safe_div(atr(high, low, close, length), _arr(close))


def variance(src, length, biased=True):
    """Rolling variance — population by default, like Pine's `ta.variance`."""
    a, out, lead, length, ok = _prep(src, length)
    ddof = 0 if biased else 1
    if not ok or length - ddof <= 0:
        return out
    out[lead + length - 1 :] = _windows(a[lead:], length).var(axis=-1, ddof=ddof)
    return out


def stdev(src, length, biased=True):
    """Rolling standard deviation — population by default, like Pine's `ta.stdev`."""
    return np.sqrt(variance(src, length, biased))


def dev(src, length):
    """Mean absolute deviation from the SMA over `length` bars."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    window = _windows(a[lead:], length)
    means = window.mean(axis=-1)
    out[lead + length - 1 :] = np.abs(window - means[:, None]).mean(axis=-1)
    return out


def range_(high, low, length=1):
    """Bar range high-low, or highest-high minus lowest-low over `length`."""
    if _int(length, 1) > 1:
        return highest(high, length) - lowest(low, length)
    return _arr(high) - _arr(low)


# ── Trend & directional ──────────────────────────────────────────────────────


def adx(high, low, close, length=14, adx_length=14):
    """Directional movement → (adx, +di, -di), all Wilder-smoothed."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    up = change(hi, 1)
    down = -change(lo, 1)
    unknown = np.isnan(up) | np.isnan(down)
    plus_dm = np.where(unknown, np.nan, np.where((up > down) & (up > 0.0), up, 0.0))
    minus_dm = np.where(
        unknown, np.nan, np.where((down > up) & (down > 0.0), down, 0.0)
    )
    smoothed_range = rma(tr(hi, lo, cl, handle_na=False), length)
    plus_di = 100.0 * _safe_div(rma(plus_dm, length), smoothed_range)
    minus_di = 100.0 * _safe_div(rma(minus_dm, length), smoothed_range)
    total = plus_di + minus_di
    strength = 100.0 * _safe_div(
        np.abs(plus_di - minus_di), np.where(total == 0.0, 1.0, total)
    )
    return rma(strength, adx_length), plus_di, minus_di


def dmi(high, low, close, length=14, adx_length=14):
    """Directional Movement Index — alias of `adx` → (adx, +di, -di)."""
    return adx(high, low, close, length, adx_length)


def aroon(high, low, length=14):
    """Aroon → (up, down); 100 when the extreme sits on the current bar."""
    length = _int(length, 0)
    if length <= 0:
        return _nan(_arr(high).size), _nan(_arr(low).size)
    span = float(length)
    up = 100.0 * (highest_bars(high, length + 1) + span) / span
    down = 100.0 * (lowest_bars(low, length + 1) + span) / span
    return up, down


def psar(high, low, close, start=0.02, increment=0.02, maximum=0.2):
    """Parabolic SAR — Wilder's stop-and-reverse level (nan on the first bar)."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    n = cl.size
    out = _nan(n)
    lead = max(_lead(hi), _lead(lo), _lead(cl))
    if lead + 2 > n:
        return out
    highs, lows, closes = hi.tolist(), lo.tolist(), cl.tolist()
    values = [_NAN] * (n - lead - 1)
    acceleration = float(start)
    step = float(increment)
    ceiling = float(maximum)
    below = closes[lead + 1] > closes[lead]
    extreme = highs[lead + 1] if below else lows[lead + 1]
    stop = lows[lead] if below else highs[lead]
    for i in range(lead + 1, n):
        first_trend_bar = i == lead + 1
        stop = stop + acceleration * (extreme - stop)
        if below and stop > lows[i]:
            first_trend_bar = True
            below = False
            stop = max(highs[i], extreme)
            extreme = lows[i]
            acceleration = float(start)
        elif not below and stop < highs[i]:
            first_trend_bar = True
            below = True
            stop = min(lows[i], extreme)
            extreme = highs[i]
            acceleration = float(start)
        if not first_trend_bar:
            if below and highs[i] > extreme:
                extreme = highs[i]
                acceleration = min(acceleration + step, ceiling)
            elif not below and lows[i] < extreme:
                extreme = lows[i]
                acceleration = min(acceleration + step, ceiling)
        # The stop may never sit inside the previous two bars' range.
        if below:
            stop = min(stop, lows[i - 1])
            if i > lead + 1:
                stop = min(stop, lows[i - 2])
        else:
            stop = max(stop, highs[i - 1])
            if i > lead + 1:
                stop = max(stop, highs[i - 2])
        values[i - lead - 1] = stop
    out[lead + 1 :] = values
    return out


def vortex(high, low, close, length=14):
    """Vortex Indicator → (VI+, VI-)."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    upward = sum_(np.abs(hi - _shift(lo, 1)), length)
    downward = sum_(np.abs(lo - _shift(hi, 1)), length)
    total = sum_(tr(hi, lo, cl, handle_na=False), length)
    return _safe_div(upward, total), _safe_div(downward, total)


def chop(high, low, close, length=14):
    """Choppiness Index — near 100 while ranging, near 0 while trending."""
    hi, lo, cl = _arr(high), _arr(low), _arr(close)
    length = _int(length, 0)
    if length <= 1:
        return _nan(cl.size)
    ratio = _safe_div(
        sum_(tr(hi, lo, cl), length), highest(hi, length) - lowest(lo, length)
    )
    positive = np.where(ratio > 0.0, ratio, np.nan)
    return 100.0 * np.log10(positive) / float(np.log10(length))


# ── Volume ───────────────────────────────────────────────────────────────────


def obv(close, volume):
    """On-Balance Volume — volume signed by the close-to-close change."""
    signed = np.sign(change(close, 1)) * _arr(volume)
    return cum(signed)


def ad(high, low, close, volume):
    """Accumulation/Distribution line — cumulative money-flow volume."""
    return cum(_money_flow_volume(high, low, close, volume))


def vwap(high, low, close, volume, anchor=None):
    """Session VWAP of hlc3; `anchor` flags session starts (one session if None)."""
    typical = hlc3(high, low, close)
    v = _arr(volume)
    n = typical.size
    if n == 0:
        return _nan(0)
    weighted = typical * v
    usable = np.isfinite(weighted) & np.isfinite(v)
    total_weighted = np.cumsum(np.where(usable, weighted, 0.0))
    total_volume = np.cumsum(np.where(usable, v, 0.0))
    if anchor is None:
        starts = np.zeros(n, dtype=np.int64)
    else:
        bars = np.arange(n, dtype=np.int64)
        starts = np.maximum.accumulate(np.where(_arr(anchor) > 0.0, bars, 0))
    opened = starts > 0
    base_weighted = np.where(opened, total_weighted[starts - 1], 0.0)
    base_volume = np.where(opened, total_volume[starts - 1], 0.0)
    return _safe_div(total_weighted - base_weighted, total_volume - base_volume)


def pvt(close, volume):
    """Price-Volume Trend — cumulative volume scaled by percent price change."""
    c = _arr(close)
    previous = _shift(c, 1)
    return cum(_safe_div(c - previous, previous, 0.0) * _arr(volume))


def eom(high, low, volume, length=14, divisor=10000.0):
    """Ease of Movement — price travel per unit of volume, SMA-smoothed."""
    hi, lo = _arr(high), _arr(low)
    raw = float(divisor) * change(hl2(hi, lo), 1) * _safe_div(hi - lo, _arr(volume))
    return sma(raw, length)


def force_index(close, volume, length=13):
    """Force Index — EMA of the close-to-close change times volume."""
    return ema(change(close, 1) * _arr(volume), length)


# ── Statistics & series helpers ──────────────────────────────────────────────


def sum_(src, length):
    """Rolling sum over `length` bars (Pine's `math.sum`)."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    out[lead + length - 1 :] = _rolling_sum(a[lead:], length)
    return out


def highest(src, length):
    """Highest value over the last `length` bars."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    out[lead + length - 1 :] = _windows(a[lead:], length).max(axis=-1)
    return out


def lowest(src, length):
    """Lowest value over the last `length` bars."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    out[lead + length - 1 :] = _windows(a[lead:], length).min(axis=-1)
    return out


def highest_bars(src, length):
    """Offset of the highest bar in the window (0 = current, -k = k bars ago)."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    window = _windows(a[lead:], length)
    out[lead + length - 1 :] = -np.argmax(window[:, ::-1], axis=-1)
    return out


def lowest_bars(src, length):
    """Offset of the lowest bar in the window (0 = current, -k = k bars ago)."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    window = _windows(a[lead:], length)
    out[lead + length - 1 :] = -np.argmin(window[:, ::-1], axis=-1)
    return out


def change(src, length=1):
    """Difference between the current value and the one `length` bars ago."""
    a = _arr(src)
    return a - _shift(a, _int(length, 1))


def crossover(a, b):
    """1.0 where `a` crosses above `b`, else 0.0 — never on the first bar."""
    x, y = _pair(a, b)
    n = min(x.size, y.size)
    out = np.zeros(n, dtype=np.float64)
    if n < 2:
        return out
    above = x[:n] > y[:n]
    at_or_below = x[:n] <= y[:n]
    out[1:] = (above[1:] & at_or_below[:-1]).astype(np.float64)
    return out


def crossunder(a, b):
    """1.0 where `a` crosses below `b`, else 0.0 — never on the first bar."""
    return crossover(b, a)


def cross(a, b):
    """1.0 where `a` and `b` cross in either direction, else 0.0."""
    return np.maximum(crossover(a, b), crossunder(a, b))


def rising(src, length):
    """1.0 when `src` rose on each of the last `length` bars, else 0.0."""
    a = _arr(src)
    out = np.zeros(a.size, dtype=np.float64)
    length = _int(length, 0)
    if length <= 0 or length >= a.size:
        return out
    out[length:] = _windows(np.diff(a) > 0.0, length).all(axis=-1)
    return out


def falling(src, length):
    """1.0 when `src` fell on each of the last `length` bars, else 0.0."""
    a = _arr(src)
    out = np.zeros(a.size, dtype=np.float64)
    length = _int(length, 0)
    if length <= 0 or length >= a.size:
        return out
    out[length:] = _windows(np.diff(a) < 0.0, length).all(axis=-1)
    return out


def barssince(condition):
    """Bars elapsed since `condition` was last true (nan before the first one)."""
    flags = _arr(condition) > 0.0
    out = _nan(flags.size)
    if flags.size == 0:
        return out
    bars = np.arange(flags.size)
    last = np.maximum.accumulate(np.where(flags, bars, -1))
    seen = last >= 0
    out[seen] = (bars - last)[seen]
    return out


def valuewhen(condition, src, occurrence=0):
    """Value of `src` when `condition` was true, `occurrence` hits back (0 = last)."""
    flags = _arr(condition) > 0.0
    a = _arr(src)
    out = _nan(a.size)
    hits = np.flatnonzero(flags)
    occurrence = _int(occurrence, 0)
    if hits.size == 0 or occurrence < 0:
        return out
    seen = np.searchsorted(hits, np.arange(a.size), side='right')
    picks = seen - 1 - occurrence
    valid = picks >= 0
    out[valid] = a[hits[picks[valid]]]
    return out


def cum(src):
    """Running total of `src`; nan values contribute nothing."""
    a = _arr(src)
    return np.cumsum(np.where(np.isfinite(a), a, 0.0))


def correlation(a, b, length):
    """Rolling Pearson correlation of two series over `length` bars (-1..1)."""
    x, y = _pair(a, b)
    n = min(x.size, y.size)
    out = _nan(n)
    length = _int(length, 0)
    lead = max(_lead(x[:n]), _lead(y[:n]))
    if length <= 1 or lead + length > n:
        return out
    wx = _windows(x[lead:n], length)
    wy = _windows(y[lead:n], length)
    dx = wx - wx.mean(axis=-1, keepdims=True)
    dy = wy - wy.mean(axis=-1, keepdims=True)
    covariance = (dx * dy).sum(axis=-1)
    spread = np.sqrt((dx * dx).sum(axis=-1) * (dy * dy).sum(axis=-1))
    out[lead + length - 1 :] = _safe_div(covariance, spread)
    return out


def percentrank(src, length):
    """Percent of the previous `length` values at or below the current one."""
    a = _arr(src)
    out = _nan(a.size)
    length = _int(length, 0)
    lead = _lead(a)
    if length <= 0 or lead + length + 1 > a.size:
        return out
    window = _windows(a[lead:], length + 1)
    current = window[:, -1]
    earlier = window[:, :-1]
    ranked = (earlier <= current[:, None]).sum(axis=-1) * (100.0 / length)
    out[lead + length :] = np.where(np.isfinite(current), ranked, np.nan)
    return out


def median(src, length):
    """Rolling median over `length` bars."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    out[lead + length - 1 :] = np.median(_windows(a[lead:], length), axis=-1)
    return out


def mode_(src, length):
    """Most frequent value over `length` bars; the smallest value wins ties."""
    a, out, lead, length, ok = _prep(src, length)
    if not ok:
        return out
    window = np.sort(_windows(a[lead:], length), axis=-1)
    rows, cols = window.shape
    positions = np.arange(cols, dtype=np.int32)
    opens_run = np.empty((rows, cols), dtype=bool)
    opens_run[:, 0] = True
    opens_run[:, 1:] = window[:, 1:] != window[:, :-1]
    closes_run = np.empty((rows, cols), dtype=bool)
    closes_run[:, -1] = True
    closes_run[:, :-1] = opens_run[:, 1:]
    run_start = np.maximum.accumulate(np.where(opens_run, positions, 0), axis=1)
    run_end = np.minimum.accumulate(
        np.where(closes_run, positions, cols - 1)[:, ::-1], axis=1
    )[:, ::-1]
    winners = np.argmax(run_end - run_start, axis=1)
    out[lead + length - 1 :] = window[np.arange(rows), winners]
    return out


def pivot_high(src, left=5, right=5):
    """Local high with lower bars either side, placed on the pivot bar itself."""
    return _pivot(src, left, right, True)


def pivot_low(src, left=5, right=5):
    """Local low with higher bars either side, placed on the pivot bar itself."""
    return _pivot(src, left, right, False)


def _pivot(src, left, right, want_high):
    """Shared pivot scan; `want_high` picks maxima, otherwise minima."""
    a = _arr(src)
    out = _nan(a.size)
    left = _int(left, -1)
    right = _int(right, -1)
    span = left + right + 1
    if left < 0 or right < 0 or span > a.size:
        return out
    window = _windows(a, span)
    centre = window[:, left]
    ok = np.isfinite(centre)
    sides = [window[:, :left], window[:, left + 1 :]]
    for side in sides:
        if side.shape[1] == 0:
            continue
        beaten = (
            side < centre[:, None] if want_high else side > centre[:, None]
        )
        ok &= beaten.all(axis=-1)
    out[np.flatnonzero(ok) + left] = centre[ok]
    return out


def rescale(src, old_min, old_max, new_min=0.0, new_max=1.0):
    """Linearly map `src` from [old_min, old_max] onto [new_min, new_max]."""
    a = _arr(src)
    span = float(old_max) - float(old_min)
    if span == 0.0:
        return _nan(a.size)
    scale = (float(new_max) - float(new_min)) / span
    return float(new_min) + (a - float(old_min)) * scale


def normalize(src, length=0, new_min=0.0, new_max=1.0):
    """Scale `src` into [new_min, new_max] over `length` bars (0 = whole series)."""
    a = _arr(src)
    length = _int(length, 0)
    if length > 1:
        bottom, top = lowest(a, length), highest(a, length)
    else:
        finite = a[np.isfinite(a)]
        if finite.size == 0:
            return _nan(a.size)
        bottom = np.full(a.size, finite.min(), dtype=np.float64)
        top = np.full(a.size, finite.max(), dtype=np.float64)
    scaled = _safe_div(a - bottom, top - bottom, 0.0)
    return float(new_min) + (float(new_max) - float(new_min)) * scaled


def nz(src, replacement=0.0):
    """Replace every nan (and infinity) with `replacement`."""
    a = _arr(src)
    fill = _arr(replacement)
    return np.where(np.isfinite(a), a, fill[0] if fill.size == 1 else fill)


def fill_forward(src):
    """Carry the last finite value forward across nan holes."""
    a = _arr(src)
    if a.size == 0:
        return a.copy()
    bars = np.arange(a.size)
    return a[np.maximum.accumulate(np.where(np.isfinite(a), bars, 0))]


# ── Candle & price helpers ───────────────────────────────────────────────────


def hl2(high, low):
    """Midpoint of the bar — (high + low) / 2."""
    return (_arr(high) + _arr(low)) / 2.0


def hlc3(high, low, close):
    """Typical price — (high + low + close) / 3."""
    return (_arr(high) + _arr(low) + _arr(close)) / 3.0


def ohlc4(open_, high, low, close):
    """Average price — (open + high + low + close) / 4."""
    return (_arr(open_) + _arr(high) + _arr(low) + _arr(close)) / 4.0


def hlcc4(high, low, close):
    """Close-weighted price — (high + low + close + close) / 4."""
    return (_arr(high) + _arr(low) + 2.0 * _arr(close)) / 4.0


def heikin_ashi(open_, high, low, close):
    """Heikin-Ashi candles → (ha_open, ha_high, ha_low, ha_close)."""
    o, hi, lo, cl = _arr(open_), _arr(high), _arr(low), _arr(close)
    n = cl.size
    ha_close = (o + hi + lo + cl) / 4.0
    ha_open = _nan(n)
    lead = _lead(ha_close)
    if lead >= n:
        return ha_open, _nan(n), _nan(n), ha_close
    # ha_open is the running average of the previous ha_open/ha_close pair.
    previous = np.empty(n - lead, dtype=np.float64)
    previous[0] = (o[lead] + cl[lead]) / 2.0
    if previous.size > 1:
        previous[1:] = ha_close[lead:-1]
    ha_open[lead:] = _ewm(previous, 0.5, previous[0])
    ha_high = np.maximum(hi, np.maximum(ha_open, ha_close))
    ha_low = np.minimum(lo, np.minimum(ha_open, ha_close))
    return ha_open, ha_high, ha_low, ha_close
